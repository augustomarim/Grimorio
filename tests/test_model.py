"""Testes de integridade do modelo; não constituem motor de regras D&D."""
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ModelTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(str(Path(self.temp.name) / 'test.db'))
        self.db.executescript((ROOT / 'schema.sql').read_text())
        self.db.executescript((ROOT / 'sample-data.sql').read_text())

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def reject(self, sql, args=()):
        self.db.execute('SAVEPOINT invalid')
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql, args)
        finally:
            self.db.execute('ROLLBACK TO invalid')
            self.db.execute('RELEASE invalid')

    def test_fixture_and_integrity(self):
        self.assertEqual(self.db.execute('PRAGMA journal_mode').fetchone(), ('wal',))
        self.assertEqual(self.db.execute('PRAGMA foreign_keys').fetchone(), (1,))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone(), ('ok',))
        self.assertEqual(self.db.execute('SELECT total_level FROM character_summary WHERE id=1').fetchone(), (10,))
        self.assertEqual(self.db.execute('SELECT count(*) FROM lib_skill').fetchone(), (18,))
        self.assertEqual(self.db.execute('SELECT count(*) FROM lib_weapon_property').fetchone(), (10,))
        self.assertEqual(self.db.execute('SELECT count(*) FROM lib_weapon_mastery').fetchone(), (8,))

    def test_expertise_does_not_stack(self):
        self.assertEqual(self.db.execute('SELECT proficiency_rank FROM character_skill_summary WHERE character_id=2').fetchall(), [(2,)])
        self.assertEqual(self.db.execute('SELECT count(*) FROM character_skill WHERE character_id=2').fetchone(), (2,))
        self.reject('UPDATE character_skill SET proficiency_rank=3')
        self.reject('INSERT INTO character_skill(character_id,grant_id,selection_kind,choice_key,skill_id,proficiency_rank) SELECT character_id,grant_id,selection_kind,choice_key,skill_id,proficiency_rank FROM character_skill LIMIT 1')

    def test_choices_and_ownership(self):
        self.reject("UPDATE character_skill SET selection_kind='chosen',choice_key=NULL")
        self.reject("UPDATE character_skill SET selection_kind='fixed',choice_key='unexpected'")
        self.reject('UPDATE character_skill SET character_id=1 WHERE character_id=2')
        self.reject('UPDATE character_ability SET character_id=2 WHERE character_id=1')
        self.reject('UPDATE character_rule_grant SET origin_character_class_id=999999 WHERE id=1')
        self.reject("UPDATE character_rule_grant SET origin_species_id=(SELECT species_id FROM dnd_character WHERE character_id=1) WHERE id=1")
        self.reject("UPDATE character_rule_grant SET acquisition_context='multiclass_entry' WHERE id=1")
        self.reject("UPDATE character_rule_grant SET acquisition_context='initial_class' WHERE id=2")

    def test_typed_targets(self):
        self.reject("UPDATE character_saving_throw SET ability='luck'")
        self.reject("UPDATE character_armor_training SET armor_kind='cloth'")
        self.reject('UPDATE character_weapon_training SET weapon_item_id=(SELECT item_id FROM lib_weapon_definition LIMIT 1) WHERE category IS NOT NULL')
        self.reject('UPDATE character_weapon_mastery SET weapon_item_id=999999')
        self.reject('UPDATE character_weapon_training_property SET property_id=999999')
        self.reject("UPDATE character_weapon_training_property SET predicate='unknown'")
        self.reject('UPDATE character_ability SET proficiency_rank=2 WHERE lib_language_id IS NOT NULL')
        self.reject('UPDATE character_ability SET proficiency_rank=NULL WHERE lib_tool_id IS NOT NULL')

    def test_weapon_property_filters(self):
        dagger = self.db.execute("SELECT d.id FROM lib_item d JOIN catalog_entry e ON e.id=d.catalog_entry_id WHERE e.slug='dagger'").fetchone()[0]
        # Casos sintéticos isolados: testar OR entre Finesse/Light, não mudar catálogo salvo.
        self.db.execute("UPDATE lib_weapon_definition SET category='Martial' WHERE item_id=?", (dagger,))
        def covered():
            return self.db.execute('SELECT item_id FROM character_weapon_proficiency WHERE character_id=2').fetchall()
        self.assertEqual(covered(), [(dagger,)])
        self.db.execute("DELETE FROM lib_weapon_property_link WHERE item_id=? AND property_id=(SELECT d.id FROM lib_weapon_property d JOIN catalog_entry e ON e.id=d.catalog_entry_id WHERE e.slug='finesse')", (dagger,))
        self.assertEqual(covered(), [(dagger,)])  # Light satisfaz sozinha.
        self.db.execute("DELETE FROM lib_weapon_property_link WHERE item_id=? AND property_id=(SELECT d.id FROM lib_weapon_property d JOIN catalog_entry e ON e.id=d.catalog_entry_id WHERE e.slug='light')", (dagger,))
        self.assertEqual(covered(), [])
        self.db.execute("INSERT INTO lib_weapon_property_link SELECT ?,p.id FROM lib_weapon_property p JOIN catalog_entry pe ON pe.id=p.catalog_entry_id WHERE pe.slug='finesse'", (dagger,))
        self.assertEqual(covered(), [(dagger,)])
        self.db.execute("INSERT INTO character_weapon_training_property SELECT t.id,p.id,'exclude' FROM character_weapon_training t CROSS JOIN lib_weapon_property p JOIN catalog_entry pe ON pe.id=p.catalog_entry_id WHERE t.clause_key='martial-finesse-or-light' AND pe.slug='thrown'")
        self.assertEqual(covered(), [])

    def test_spell_regressions(self):
        self.assertEqual(self.db.execute("SELECT count(*) FROM character_spell cs JOIN lib_spell s ON s.id=cs.lib_spell_id JOIN catalog_entry se ON se.id=s.catalog_entry_id WHERE se.slug='light'").fetchone(), (2,))
        self.reject('UPDATE character_spell SET character_id=2 WHERE id=1')
        self.reject('UPDATE character_spell SET is_prepared=1 WHERE id=1')
        self.reject('INSERT INTO character_spell(character_id,lib_spell_id,origin_kind,origin_character_class_id,preparation_mode) SELECT character_id,lib_spell_id,origin_kind,origin_character_class_id,preparation_mode FROM character_spell WHERE id=1')
        self.db.execute('UPDATE character_spell SET is_prepared=0 WHERE id=3')
        self.assertEqual(self.db.execute('SELECT count(*) FROM character_spellbook_entry').fetchone(), (1,))

    def test_hit_points_and_history(self):
        self.assertEqual(self.db.execute('SELECT base_hit_points FROM character_hp_base ORDER BY character_id').fetchall(), [(66,), (9,)])
        self.assertEqual(self.db.execute('SELECT MAX(class_level) FROM character_level_history WHERE character_id=1 GROUP BY character_class_id ORDER BY character_class_id').fetchall(), [(3,), (4,), (3,)])
        self.db.execute('UPDATE dnd_character SET constitution=16 WHERE character_id=1')
        self.assertEqual(self.db.execute('SELECT base_hit_points FROM character_hp_base WHERE character_id=1').fetchone(), (76,))
        self.db.execute('UPDATE dnd_character SET constitution=1 WHERE character_id=2')
        self.assertEqual(self.db.execute('SELECT base_hit_points FROM character_hp_base WHERE character_id=2').fetchone(), (3,))
        self.reject("UPDATE character_level_entry SET hp_method='first_max' WHERE sequence_no=2")
        self.reject('UPDATE character_level_entry SET sequence_no=21 WHERE id=1')
        self.reject('UPDATE character_level_entry SET hp_roll=6 WHERE id=1')
        self.reject("UPDATE character_level_entry SET hp_method='roll',hp_roll=NULL WHERE id=2")
        self.reject("UPDATE character_level_entry SET hp_method='roll',hp_roll=0 WHERE id=2")
        self.reject('UPDATE character_level_entry SET character_class_id=(SELECT id FROM character_class WHERE character_id=2) WHERE character_id=1')
        self.reject('INSERT INTO character_level_entry(character_id,character_class_id,sequence_no,hp_method) SELECT character_id,character_class_id,sequence_no,hp_method FROM character_level_entry LIMIT 1')
        self.db.execute("UPDATE character_level_entry SET hp_method='roll',hp_roll=1 WHERE character_id=1 AND sequence_no>1")
        self.db.execute('UPDATE dnd_character SET constitution=1 WHERE character_id=1')
        self.assertEqual(self.db.execute('SELECT base_hit_points FROM character_hp_base WHERE character_id=1').fetchone(), (10,))

    def test_hp_bonus_and_duplicate(self):
        self.db.execute("INSERT INTO character_hit_point_bonus(character_id,grant_id,selection_kind,bonus_kind,amount) VALUES(1,1,'fixed','per_character_level',2)")
        self.assertEqual(self.db.execute('SELECT modeled_max_hit_points FROM character_hit_point_summary WHERE character_id=1').fetchone(), (86,))
        self.reject("INSERT INTO character_hit_point_bonus(character_id,grant_id,selection_kind,bonus_kind,amount) VALUES(1,1,'fixed','per_character_level',2)")
        self.reject("INSERT INTO character_hit_point_bonus(character_id,grant_id,selection_kind,bonus_kind,amount) VALUES(1,1,'fixed','per_class_level',2)")
        self.db.execute("INSERT INTO character_hit_point_bonus(character_id,grant_id,selection_kind,bonus_kind,amount,target_character_class_id) VALUES(1,1,'fixed','per_class_level',1,1)")
        self.assertEqual(self.db.execute('SELECT modeled_max_hit_points FROM character_hit_point_summary WHERE character_id=1').fetchone(), (89,))

    def test_source_links(self):
        spell = self.db.execute('SELECT catalog_entry_id FROM lib_spell LIMIT 1').fetchone()[0]
        for i in (9001, 9002):
            self.db.execute("INSERT INTO rules_source(id,slug,name,source_type,edition) VALUES(?,?,?,'supplement','test-only')", (i,str(i),'Teste fictício'))
            self.db.execute('INSERT INTO catalog_entry_source VALUES(?,?)',(spell,i))
        self.assertEqual(self.db.execute('SELECT count(*) FROM catalog_entry_source WHERE catalog_entry_id=?',(spell,)).fetchone(),(2,))
        self.reject('INSERT INTO catalog_entry_source VALUES(?,9001)',(spell,))
        self.reject('DELETE FROM rules_source WHERE id=9001')

    def test_common_identity_without_dnd_attributes(self):
        self.db.execute("INSERT INTO rpg_system(id,code,name,edition,is_enabled) VALUES(99,'test-system','Sistema fictício de teste','test-only',0)")
        self.db.execute("INSERT INTO character(id,owner_id,system_id,name) VALUES(99,1,99,'Ficha de outro sistema')")
        self.db.execute("INSERT INTO character_narrative(character_id,backstory) VALUES(99,'Narrativa comum')")
        self.assertEqual(self.db.execute('SELECT name FROM character WHERE id=99').fetchone(),('Ficha de outro sistema',))
        self.assertEqual(self.db.execute('SELECT * FROM character_summary WHERE id=99').fetchall(),[])
        self.assertEqual(self.db.execute('SELECT * FROM character_hp_base WHERE character_id=99').fetchall(),[])
        cols={r[1] for r in self.db.execute('PRAGMA table_info(character)')}
        self.assertTrue({'strength','species_id','class_id','level','ruleset_revision_id'}.isdisjoint(cols))
        # O sistema futuro não está implementado: existe apenas a identidade comum.
        self.reject("INSERT INTO character_class(character_id,class_id,level) SELECT 99,class_id,1 FROM character_class LIMIT 1")
        self.reject("INSERT INTO dnd_character(character_id,system_id,strength,dexterity,constitution,intelligence,wisdom,charisma,species_id,ruleset_revision_id) SELECT 99,1,strength,dexterity,constitution,intelligence,wisdom,charisma,species_id,ruleset_revision_id FROM dnd_character WHERE character_id=1")
        self.reject("INSERT INTO dnd_character(character_id,system_id,strength,dexterity,constitution,intelligence,wisdom,charisma,species_id,ruleset_revision_id) SELECT 99,99,strength,dexterity,constitution,intelligence,wisdom,charisma,species_id,ruleset_revision_id FROM dnd_character WHERE character_id=1")
        self.reject("UPDATE dnd_character SET system_code='test-system' WHERE character_id=1")
        self.reject('UPDATE character SET system_id=99 WHERE id=1')
        self.db.execute('DELETE FROM character WHERE id=99')
        self.assertEqual(self.db.execute('SELECT count(*) FROM character_narrative WHERE character_id=99').fetchone(),(0,))

    def test_dnd_profile_matches_system_without_fixed_id(self):
        # Garantir que o módulo identifica o código, não um id mágico igual a 1.
        self.db.execute("INSERT INTO rpg_system(id,code,name,edition) VALUES(101,'test-other','Teste','test-only')")
        self.reject('UPDATE dnd_character SET system_id=101 WHERE character_id=1')
        self.reject('DELETE FROM rpg_system WHERE id=1')
        self.db.execute('UPDATE rpg_system SET is_enabled=0 WHERE id=1')
        self.assertEqual(self.db.execute('SELECT count(*) FROM dnd_character').fetchone(),(2,))
        self.db.commit()
        self.db.execute('BEGIN')
        self.db.execute('PRAGMA defer_foreign_keys=ON')
        self.db.execute('UPDATE rpg_system SET id=7 WHERE id=1')
        self.db.execute('UPDATE character SET system_id=7 WHERE system_id=1')
        self.db.execute('UPDATE dnd_character SET system_id=7 WHERE system_id=1')
        self.db.commit()
        self.assertEqual(self.db.execute('SELECT system_id FROM dnd_character WHERE character_id=1').fetchone(),(7,))
        self.assertEqual(self.db.execute('SELECT total_level FROM character_summary WHERE id=1').fetchone(),(10,))

    def test_catalog_kind_and_identity(self):
        spell = self.db.execute('SELECT id,catalog_entry_id FROM lib_spell LIMIT 1').fetchone()
        cls = self.db.execute('SELECT catalog_entry_id FROM lib_class LIMIT 1').fetchone()[0]
        self.reject('UPDATE lib_spell SET catalog_entry_id=? WHERE id=?', (cls,spell[0]))
        self.reject("UPDATE lib_spell SET catalog_kind='class' WHERE id=?",(spell[0],))
        self.reject('UPDATE lib_spell SET catalog_entry_id=999999 WHERE id=?',(spell[0],))
        self.reject('INSERT INTO catalog_entry(kind,slug,name) SELECT kind,slug,name FROM catalog_entry WHERE id=?',(spell[1],))
        self.db.execute("INSERT INTO catalog_entry(kind,slug,name) VALUES('spell','shared-test-slug','Teste')")
        self.db.execute("INSERT INTO catalog_entry(kind,slug,name) VALUES('class','shared-test-slug','Teste')")
        self.db.execute("UPDATE catalog_entry SET name='Nome atualizado',deprecated_at='2026-11-04T00:00:00Z' WHERE id=?",(spell[1],))
        self.assertEqual(self.db.execute('SELECT name FROM lib_spell s JOIN catalog_entry e ON e.id=s.catalog_entry_id WHERE s.id=?',(spell[0],)).fetchone(),('Nome atualizado',))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_catalog_delete_restricts_used_option(self):
        spell = self.db.execute('SELECT s.catalog_entry_id FROM lib_spell s JOIN character_spell cs ON cs.lib_spell_id=s.id LIMIT 1').fetchone()[0]
        self.reject('DELETE FROM catalog_entry WHERE id=?',(spell,))
        entry = self.db.execute('SELECT catalog_entry_id FROM lib_rule LIMIT 1').fetchone()[0]
        self.db.execute('DELETE FROM catalog_entry WHERE id=?',(entry,))
        self.assertEqual(self.db.execute('SELECT count(*) FROM lib_rule WHERE catalog_entry_id=?',(entry,)).fetchone(),(0,))

    def test_removing_grant_and_character(self):
        self.db.execute('DELETE FROM character_rule_grant WHERE id=11')
        self.assertEqual(self.db.execute('SELECT proficiency_rank FROM character_skill_summary WHERE character_id=2').fetchall(),[(1,)])
        self.db.rollback()
        before = self.db.execute('SELECT count(*) FROM lib_spell').fetchone()
        self.db.execute('DELETE FROM character WHERE id=1')
        for table in ('character_rule_grant','character_ability','character_class','character_spell','character_spellbook_entry','character_level_entry','character_skill'):
            self.assertEqual(self.db.execute('SELECT count(*) FROM '+table+' WHERE character_id=1').fetchone(),(0,))
        self.assertEqual(self.db.execute('SELECT count(*) FROM lib_spell').fetchone(),before)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.db.rollback()
        self.assertEqual(self.db.execute('SELECT count(*) FROM character_level_entry WHERE character_id=1').fetchone(),(10,))

if __name__ == '__main__':
    unittest.main()
