from datetime import datetime, timedelta, timezone
import sqlite3
import tempfile
from pathlib import Path
import unittest

from db_support import ROOT, migrate, check_history
from refresh_support import access_valid, digest, revoke_family, rotate, stamp, start_session


class RefreshTokenTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)/'auth.db'
        self.db = sqlite3.connect(self.path)
        self.db.executescript((ROOT/'schema.sql').read_text())
        self.db.executescript((ROOT/'sample-data.sql').read_text())
        self.now = datetime(2030,1,1,tzinfo=timezone.utc)  # Relógio simulado, não data real.

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_rotation_preserves_only_hashes_and_new_access(self):
        family, access, refresh = start_session(self.db,1,self.now)
        self.assertTrue(access_valid(self.db,access,self.now))
        new_access,new_refresh = rotate(self.db,refresh,self.now+timedelta(minutes=10))
        self.assertFalse(access_valid(self.db,access,self.now+timedelta(minutes=10)))
        self.assertTrue(access_valid(self.db,new_access,self.now+timedelta(minutes=10)))
        parent = self.db.execute('SELECT id,used_at FROM refresh_token WHERE token_hash=?',(digest(refresh),)).fetchone()
        child = self.db.execute('SELECT parent_token_id FROM refresh_token WHERE token_hash=?',(digest(new_refresh),)).fetchone()
        self.assertIsNotNone(parent[1])
        self.assertEqual(child,(parent[0],))
        hashes=repr(self.db.execute('SELECT token_hash FROM refresh_token').fetchall())
        for raw in (access,refresh,new_access,new_refresh):
            self.assertNotIn(raw,hashes)
        self.assertEqual(self.db.execute('SELECT count(*) FROM refresh_token WHERE session_id=? AND used_at IS NULL AND revoked_at IS NULL',(family,)).fetchone(),(1,))

    def test_replay_revocation_is_committed_and_isolated(self):
        family,access,refresh=start_session(self.db,1,self.now)
        other,other_access,other_refresh=start_session(self.db,1,self.now)
        new_access,new_refresh=rotate(self.db,refresh,self.now+timedelta(minutes=1))
        # Outro pedido/conexão apresentando o mesmo token depois de consumido.
        second=sqlite3.connect(self.path)
        try:
            second.execute('PRAGMA foreign_keys=ON')
            with self.assertRaisesRegex(ValueError,'Reutilização'):
                rotate(second,refresh,self.now+timedelta(minutes=2))
        finally:
            second.close()
        self.assertIsNotNone(self.db.execute('SELECT revoked_at FROM session WHERE id=?',(family,)).fetchone()[0])
        self.assertFalse(access_valid(self.db,new_access,self.now+timedelta(minutes=2)))
        with self.assertRaises(ValueError):
            rotate(self.db,new_refresh,self.now+timedelta(minutes=2))
        self.assertTrue(access_valid(self.db,other_access,self.now+timedelta(minutes=2)))
        rotate(self.db,other_refresh,self.now+timedelta(minutes=2))

    def test_expiration_unknown_token_and_account_block(self):
        family,access,refresh=start_session(self.db,1,self.now)
        self.assertFalse(access_valid(self.db,access,self.now+timedelta(minutes=16)))
        rotate(self.db,refresh,self.now+timedelta(minutes=16))  # Access expirado não impede refresh válido.
        with self.assertRaisesRegex(ValueError,'inválido'):
            rotate(self.db,'unknown-test-token',self.now)
        _,access2,refresh2=start_session(self.db,1,self.now)
        with self.assertRaises(ValueError):
            rotate(self.db,refresh2,self.now+timedelta(days=30))
        self.db.execute('UPDATE app_user SET is_active=0 WHERE id=1');self.db.commit()
        self.assertFalse(access_valid(self.db,access2,self.now))
        with self.assertRaises(ValueError):
            rotate(self.db,refresh2,self.now)

    def test_logout_and_parent_constraints(self):
        family,access,refresh=start_session(self.db,1,self.now)
        parent=self.db.execute('SELECT id FROM refresh_token WHERE token_hash=?',(digest(refresh),)).fetchone()[0]
        other,_,_=start_session(self.db,1,self.now)
        # Marcar o token de outra família como consumido para testar especificamente a FK de parentesco.
        self.db.execute('UPDATE refresh_token SET used_at=? WHERE session_id=?',(stamp(self.now),other));self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO refresh_token(session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(?,?,?,?,?)',(other,'f'*64,parent,stamp(self.now),stamp(self.now+timedelta(days=1))))
        self.db.rollback()
        access,refresh=rotate(self.db,refresh,self.now)
        revoke_family(self.db,family,self.now);self.db.commit()
        self.assertFalse(access_valid(self.db,access,self.now))
        with self.assertRaises(ValueError):
            rotate(self.db,refresh,self.now)
        self.db.execute('DELETE FROM session WHERE id=?',(family,));self.db.commit()
        self.assertEqual(self.db.execute('SELECT count(*) FROM refresh_token WHERE session_id=?',(family,)).fetchone(),(0,))

    def test_failed_rotation_rolls_back_consumption(self):
        family,_,refresh=start_session(self.db,1,self.now)
        parent=self.db.execute('SELECT id FROM refresh_token WHERE token_hash=?',(digest(refresh),)).fetchone()[0]
        self.db.execute('BEGIN IMMEDIATE')
        self.db.execute('UPDATE refresh_token SET used_at=? WHERE id=?',(stamp(self.now),parent))
        try:
            # Hash duplicado força uma falha depois de marcar o pai como consumido.
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute('INSERT INTO refresh_token(session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(?,?,?,?,?)',(family,digest(refresh),parent,stamp(self.now),stamp(self.now+timedelta(days=1))))
        finally:
            self.db.rollback()
        self.assertEqual(self.db.execute('SELECT used_at FROM refresh_token WHERE id=?',(parent,)).fetchone(),(None,))
        rotate(self.db,refresh,self.now)

    def test_root_single_successor_and_self_parent_constraints(self):
        family,_,refresh=start_session(self.db,1,self.now)
        parent=self.db.execute('SELECT id FROM refresh_token WHERE token_hash=?',(digest(refresh),)).fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO refresh_token(session_id,token_hash,created_at,expires_at) VALUES(?,?,?,?)',(family,'c'*64,stamp(self.now),stamp(self.now+timedelta(days=1))))
        self.db.rollback()
        _,child=rotate(self.db,refresh,self.now)
        self.db.execute('UPDATE refresh_token SET used_at=? WHERE token_hash=?',(stamp(self.now),digest(child)))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO refresh_token(session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(?,?,?,?,?)',(family,'c'*64,parent,stamp(self.now),stamp(self.now+timedelta(days=1))))
        self.db.rollback()
        self.db.execute('UPDATE refresh_token SET used_at=? WHERE token_hash=?',(stamp(self.now),digest(child)))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO refresh_token(id,session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(999999,?,?,999999,?,?)',(family,'c'*64,stamp(self.now),stamp(self.now+timedelta(days=1))))
        self.db.rollback()

    def test_migration_revokes_legacy_sessions_and_keeps_baseline(self):
        legacy=sqlite3.connect(Path(self.temp.name)/'legacy.db')
        try:
            legacy.execute('PRAGMA foreign_keys=ON')
            initial=ROOT/'migrations/0001_initial.sql'
            from hashlib import sha256
            legacy.executescript(initial.read_text())
            legacy.execute('INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(1,?,?)',(initial.name,sha256(initial.read_bytes()).hexdigest()))
            legacy.execute('PRAGMA user_version=1')
            legacy.execute("INSERT INTO app_user(id,email,username,password_hash) VALUES(1,'test@example.invalid','tester','disabled')")
            legacy.execute("INSERT INTO session(user_id,token_hash,expires_at) VALUES(1,'legacy-hash','2031-01-01T00:00:00.000Z')")
            legacy.commit()
            self.assertEqual(migrate(legacy,ROOT/'migrations'),[2,3,4])
            self.assertIsNotNone(legacy.execute('SELECT revoked_at FROM session').fetchone()[0])
            self.assertEqual(legacy.execute('SELECT count(*) FROM refresh_token').fetchone(),(0,))
            self.assertEqual(check_history(legacy,ROOT/'migrations')[0],4)
            with self.assertRaises(sqlite3.IntegrityError):
                legacy.execute('UPDATE session SET revoked_at=NULL')
        finally:
            legacy.close()

if __name__=='__main__':
    unittest.main()
