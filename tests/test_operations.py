"""Migrações e recuperação reais em bancos temporários; sem infraestrutura externa."""
from pathlib import Path
import hashlib
import shutil
import sqlite3
import tempfile
import unittest

from db_support import ROOT, backup, check_history, migrate, snapshot, validate


class OperationsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.source_path = self.path / 'live.db'
        self.db = sqlite3.connect(self.source_path)
        self.db.executescript((ROOT / 'schema.sql').read_text())
        self.db.executescript((ROOT / 'sample-data.sql').read_text())
        self.migrations = self.path / 'migrations'
        shutil.copytree(ROOT / 'migrations', self.migrations)

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_baseline_snapshot_equals_numbered_migration(self):
        other = sqlite3.connect(self.path / 'migrated.db')
        try:
            self.assertEqual(migrate(other, self.migrations), [1, 2, 3, 4, 5, 6])
            self.assertEqual(migrate(other, self.migrations), [])
            self.assertEqual(other.execute('PRAGMA user_version').fetchone(), (6,))
            self.assertEqual(snapshot(self.db)[0], snapshot(other)[0])
            record = other.execute('SELECT version,name,checksum_sha256 FROM schema_migration WHERE version=1').fetchone()
            initial = self.migrations / '0001_initial.sql'
            self.assertEqual(record, (1, initial.name, hashlib.sha256(initial.read_bytes()).hexdigest()))
            other.executescript((ROOT / 'sample-data.sql').read_text())
            first, second = snapshot(self.db), snapshot(other)
            # Hora de aplicação é gerada independentemente, não pertence aos dados da ficha.
            first[1]['schema_migration'] = [row[:3] for row in first[1]['schema_migration']]
            second[1]['schema_migration'] = [row[:3] for row in second[1]['schema_migration']]
            self.assertEqual(first, second)
        finally:
            other.close()

    def test_effects_migration_preserves_existing_base_and_does_not_guess_bonuses(self):
        legacy = self.path / 'legacy_migrations'
        legacy.mkdir()
        for version in range(1, 6):
            source = next(self.migrations.glob(f'{version:04d}_*.sql'))
            shutil.copy(source, legacy / source.name)
        other = sqlite3.connect(self.path / 'v5.db')
        try:
            migrate(other, legacy)
            other.executescript((ROOT / 'sample-data.sql').read_text().split('-- Migração 0006:')[0])
            before = other.execute('SELECT character_id,strength,dexterity,constitution,intelligence,wisdom,charisma FROM dnd_character ORDER BY character_id').fetchall()
            self.assertEqual(migrate(other, self.migrations), [6])
            after = other.execute('SELECT character_id,strength,dexterity,constitution,intelligence,wisdom,charisma FROM character_effective_attributes ORDER BY character_id').fetchall()
            self.assertEqual(before, after)
            self.assertEqual(other.execute('SELECT count(*) FROM character_ability_boost').fetchone(), (0,))
            validate(other)
        finally:
            other.close()

    def test_successful_migration_records_and_preserves_data(self):
        (self.migrations / '0007_test_only.sql').write_text('CREATE TABLE operational_test(id INTEGER PRIMARY KEY, note TEXT) STRICT;\n')
        before = self.db.execute('SELECT name,total_level FROM character_summary ORDER BY id').fetchall()
        self.assertEqual(migrate(self.db, self.migrations), [7])
        self.assertEqual(migrate(self.db, self.migrations), [])
        self.assertEqual(check_history(self.db, self.migrations)[0], 7)
        self.assertEqual(self.db.execute('SELECT name,total_level FROM character_summary ORDER BY id').fetchall(), before)
        self.assertEqual(self.db.execute('SELECT count(*) FROM schema_migration').fetchone(), (7,))

    def test_failed_migration_rolls_back_ddl_and_history(self):
        (self.migrations / '0007_failure_test.sql').write_text('CREATE TABLE must_disappear(id INTEGER PRIMARY KEY);\nINSERT INTO nonexistent_table VALUES(1);\n')
        before = snapshot(self.db)
        with self.assertRaises(sqlite3.OperationalError):
            migrate(self.db, self.migrations)
        self.assertEqual(snapshot(self.db), before)
        self.assertEqual(self.db.execute("SELECT name FROM sqlite_master WHERE name='must_disappear'").fetchall(), [])

    def test_migration_cannot_commit_outside_its_contract(self):
        (self.migrations / '0007_bad_transaction.sql').write_text('CREATE TABLE must_disappear(id INTEGER);\nCOMMIT;\n')
        before = snapshot(self.db)
        with self.assertRaisesRegex(ValueError, 'Controle transacional'):
            migrate(self.db, self.migrations)
        self.assertEqual(snapshot(self.db), before)

    def test_nested_spell_migration_preserves_legacy_rows_and_sequence(self):
        previous = self.path / 'previous'; previous.mkdir()
        for migration in sorted((ROOT / 'migrations').glob('*.sql')):
            if int(migration.name[:4]) <= 4:
                shutil.copyfile(migration, previous / migration.name)
        old = sqlite3.connect(self.path / 'v4.db')
        try:
            self.assertEqual(migrate(old, previous), [1,2,3,4])
            old.executescript((ROOT / 'sample-data.sql').read_text())
            columns = [row[1] for row in old.execute('PRAGMA table_info(character_spell)')]
            before = old.execute('SELECT * FROM character_spell ORDER BY id').fetchall()
            old.execute("UPDATE sqlite_sequence SET seq=10000 WHERE name='character_spell'")
            old.commit()
            self.assertEqual(migrate(old, ROOT / 'migrations'), [5,6])
            self.assertEqual(old.execute('SELECT ' + ','.join(columns) + ' FROM character_spell ORDER BY id').fetchall(), before)
            self.assertEqual(old.execute('SELECT count(*) FROM character_spell WHERE choice_instance_id IS NOT NULL OR nested_choice_key IS NOT NULL').fetchone(), (0,))
            self.assertEqual(old.execute("SELECT seq FROM sqlite_sequence WHERE name='character_spell'").fetchone(), (10000,))
            self.assertEqual(old.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally:
            old.close()

    def test_modified_applied_migration_rejected(self):
        initial = self.migrations / '0001_initial.sql'
        initial.write_text(initial.read_text() + '\n-- alteração indevida de teste\n')
        with self.assertRaisesRegex(ValueError, 'modificada'):
            migrate(self.db, self.migrations)
        self.assertEqual(self.db.execute('PRAGMA user_version').fetchone(), (6,))

    def test_gap_and_unmanaged_database_rejected(self):
        (self.migrations / '0008_gap_test.sql').write_text('SELECT 1;\n')
        with self.assertRaisesRegex(ValueError, 'Sequência'):
            migrate(self.db, self.migrations)
        (self.migrations / '0008_gap_test.sql').unlink()
        unmanaged = sqlite3.connect(self.path / 'unmanaged.db')
        try:
            unmanaged.execute('CREATE TABLE old_data(id INTEGER)')
            with self.assertRaisesRegex(ValueError, 'sem histórico'):
                migrate(unmanaged, self.migrations)
        finally:
            unmanaged.close()

    def test_wal_backup_restore_preserves_every_table(self):
        self.db.execute('PRAGMA wal_autocheckpoint=0')
        self.db.execute("UPDATE character SET name='Alteração confirmada no WAL' WHERE id=1")
        self.db.commit()
        self.assertGreater(Path(str(self.source_path) + '-wal').stat().st_size, 0)
        # Outra conexão mantém escrita não confirmada enquanto a API faz uma leitura consistente.
        writer = sqlite3.connect(self.source_path)
        writer.execute("UPDATE character SET name='Não confirmado: não deve entrar' WHERE id=1")
        expected = snapshot(self.db)
        target = self.path / 'backup.db'
        try:
            backup(self.source_path, target)
        finally:
            writer.rollback()
            writer.close()
        with self.assertRaises(FileExistsError):
            backup(self.source_path, target)
        with sqlite3.connect(target) as saved:
            validate(saved)
            self.assertEqual(snapshot(saved), expected)
        # Banco de origem segue evoluindo, sem mudar o snapshot já salvo.
        self.db.execute("UPDATE character SET name='Depois do backup' WHERE id=1")
        self.db.commit()
        restored_path = self.path / 'restored.db'
        backup(target, restored_path)
        with sqlite3.connect(restored_path) as restored:
            restored.execute('PRAGMA journal_mode=WAL')
            validate(restored)
            self.assertEqual(snapshot(restored), expected)
            self.assertEqual(restored.execute('SELECT total_level FROM character_summary ORDER BY id').fetchall(), [(10,), (1,)])
            self.assertEqual(restored.execute('SELECT base_hit_points FROM character_hp_base ORDER BY character_id').fetchall(), [(66,), (9,)])
            self.assertEqual(restored.execute('PRAGMA foreign_keys').fetchone(), (1,))
            self.assertEqual(restored.execute('PRAGMA journal_mode').fetchone(), ('wal',))

    def test_backup_failure_rejects_corruption_and_fk_violation(self):
        target = self.path / 'valid.db'
        backup(self.source_path, target)
        broken = self.path / 'truncated.db'
        broken.write_bytes(target.read_bytes()[:100])
        with self.assertRaises((sqlite3.DatabaseError, ValueError)):
            with sqlite3.connect(broken) as db:
                validate(db)
        # Integridade física OK não basta quando FKs foram desabilitadas numa escrita indevida.
        invalid = self.path / 'fk_invalid.db'
        shutil.copyfile(target, invalid)
        with sqlite3.connect(invalid) as db:
            db.execute('PRAGMA foreign_keys=OFF')
            db.execute('DELETE FROM lib_spell WHERE id IN (SELECT lib_spell_id FROM character_spell)')
            db.commit()
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(), ('ok',))
            with self.assertRaisesRegex(ValueError, 'foreign_key_check'):
                validate(db)
        with self.assertRaises(ValueError):
            backup(invalid, self.path / 'rejected.db')
        self.assertFalse((self.path / 'rejected.db').exists())


if __name__ == '__main__':
    unittest.main()
