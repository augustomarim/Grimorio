from datetime import datetime,timedelta,timezone
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest

from db_support import ROOT,migrate
from refresh_support import access_valid,start_session,rotate
from account_support import allowed,consume_token,issue_token,login_attempt,moderate,publish,request_public_response

class AccountPolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'policies.db'
        self.db=sqlite3.connect(self.path);self.db.executescript((ROOT/'schema.sql').read_text());self.db.executescript((ROOT/'sample-data.sql').read_text())
        self.db.execute("INSERT INTO app_user(id,email,username,password_hash,role) VALUES(2,'admin@example.invalid','administrator','disabled','admin'),(3,'other@example.invalid','otheruser','disabled','user')")
        self.db.commit();self.now=datetime(2030,1,1,tzinfo=timezone.utc)

    def tearDown(self):
        self.db.close();self.temp.cleanup()

    def test_visibility_owner_admin_and_blocked_account(self):
        self.assertTrue(allowed(self.db,None,'read',1))
        self.assertFalse(allowed(self.db,None,'read',2))
        self.assertTrue(allowed(self.db,1,'read',2))
        self.assertTrue(allowed(self.db,2,'read',2))
        self.assertFalse(allowed(self.db,3,'read',2))
        self.assertTrue(allowed(self.db,1,'edit',1))
        self.assertFalse(allowed(self.db,2,'edit',1))
        self.assertFalse(allowed(self.db,3,'delete',1))
        self.db.execute('UPDATE app_user SET is_active=0 WHERE id=1');self.db.commit()
        self.assertFalse(allowed(self.db,1,'read',1))
        self.assertFalse(allowed(self.db,None,'read',1))
        self.assertTrue(allowed(self.db,2,'read',1))

    def test_unverified_owner_and_email_confirmation(self):
        self.db.execute('UPDATE app_user SET email_verified_at=NULL WHERE id=1');self.db.commit()
        self.assertTrue(allowed(self.db,1,'create'))
        self.assertTrue(allowed(self.db,1,'edit',1))
        self.assertFalse(allowed(self.db,1,'publish',1))
        self.assertFalse(allowed(self.db,None,'read',1))
        raw=issue_token(self.db,'example@example.invalid','email_verification',self.now)
        consume_token(self.db,raw,'email_verification',self.now)
        publish(self.db,1,2,self.now)
        self.assertTrue(allowed(self.db,None,'read',2))
        with self.assertRaises(ValueError):consume_token(self.db,raw,'email_verification',self.now)

    def test_moderation_cannot_be_bypassed_by_republish(self):
        with self.assertRaises(PermissionError):moderate(self.db,3,1,self.now)
        moderate(self.db,2,1,self.now)
        self.assertFalse(allowed(self.db,None,'read',1))
        with self.assertRaises(PermissionError):publish(self.db,1,1,self.now)
        moderate(self.db,2,1,self.now,unblock=True)
        self.assertFalse(allowed(self.db,None,'read',1))  # Desbloquear não republica automaticamente.
        publish(self.db,1,1,self.now)
        self.assertTrue(allowed(self.db,None,'read',1))
        self.assertEqual(self.db.execute("SELECT count(*) FROM audit_log WHERE action IN ('character.hide','character.unblock_publication','character.publish')").fetchone(),(3,))

    def test_reset_revokes_all_sessions_but_not_other_users(self):
        self.db.execute('UPDATE app_user SET email_verified_at=NULL WHERE id=1');self.db.commit()
        _,access1,refresh1=start_session(self.db,1,self.now)
        _,access2,refresh2=start_session(self.db,1,self.now)
        _,admin_access,_=start_session(self.db,2,self.now)
        raw=issue_token(self.db,'example@example.invalid','password_reset',self.now)
        consume_token(self.db,raw,'password_reset',self.now,new_password_hash='test-only-disabled-password-hash')
        for access,refresh in [(access1,refresh1),(access2,refresh2)]:
            self.assertFalse(access_valid(self.db,access,self.now))
            with self.assertRaises(ValueError):rotate(self.db,refresh,self.now)
        self.assertTrue(access_valid(self.db,admin_access,self.now))
        self.assertEqual(self.db.execute('SELECT email_verified_at,role FROM app_user WHERE id=1').fetchone(),(None,'user'))
        with self.assertRaises(ValueError):consume_token(self.db,raw,'password_reset',self.now,new_password_hash='other')

    def test_expired_replaced_wrong_purpose_and_changed_email(self):
        raw=issue_token(self.db,'example@example.invalid','password_reset',self.now)
        with self.assertRaises(ValueError):consume_token(self.db,raw,'email_verification',self.now)
        with self.assertRaises(ValueError):consume_token(self.db,raw,'password_reset',self.now+timedelta(minutes=31),new_password_hash='test-only')
        fresh=issue_token(self.db,'example@example.invalid','password_reset',self.now)
        with self.assertRaises(ValueError):consume_token(self.db,raw,'password_reset',self.now,new_password_hash='test-only')
        self.db.execute("UPDATE app_user SET email='changed@example.invalid',email_verified_at=NULL WHERE id=1");self.db.commit()
        with self.assertRaises(ValueError):consume_token(self.db,fresh,'password_reset',self.now,new_password_hash='test-only')

    def test_reset_failure_is_atomic(self):
        _,access,_=start_session(self.db,1,self.now)
        raw=issue_token(self.db,'example@example.invalid','password_reset',self.now)
        with self.assertRaises(sqlite3.IntegrityError):consume_token(self.db,raw,'password_reset',self.now,new_password_hash=None)
        self.assertTrue(access_valid(self.db,access,self.now))
        consume_token(self.db,raw,'password_reset',self.now,new_password_hash='test-only')
        self.assertFalse(access_valid(self.db,access,self.now))

    def test_unknown_email_response_and_temporary_lock(self):
        key=secrets.token_bytes(32)
        known=login_attempt(self.db,'example@example.invalid','192.0.2.1',False,self.now,key)
        unknown=login_attempt(self.db,'unknown@example.invalid','192.0.2.1',False,self.now,key)
        self.assertEqual(known,unknown)
        self.assertIsNone(issue_token(self.db,'unknown@example.invalid','password_reset',self.now))
        self.assertEqual(request_public_response(self.db,'example@example.invalid','password_reset',self.now),request_public_response(self.db,'unknown@example.invalid','password_reset',self.now))
        for _ in range(4):login_attempt(self.db,'example@example.invalid','192.0.2.1',False,self.now,key)
        self.assertEqual(login_attempt(self.db,'example@example.invalid','192.0.2.1',True,self.now,key),known)
        self.assertTrue(login_attempt(self.db,'example@example.invalid','192.0.2.1',True,self.now+timedelta(minutes=16),key)[0])
        self.assertEqual(self.db.execute('SELECT is_active FROM app_user WHERE id=1').fetchone(),(1,))
        values=repr(self.db.execute('SELECT key_hash FROM login_throttle').fetchall())
        self.assertNotIn('example@example.invalid',values);self.assertNotIn('192.0.2.1',values)

    def test_network_throttle_across_unknown_emails(self):
        key=secrets.token_bytes(32)
        for i in range(50):login_attempt(self.db,f'unknown-{i}@example.invalid','192.0.2.10',False,self.now,key)
        self.assertFalse(login_attempt(self.db,'example@example.invalid','192.0.2.10',True,self.now,key)[0])
        self.assertTrue(login_attempt(self.db,'example@example.invalid','192.0.2.11',True,self.now,key)[0])

    def test_migration_withdraws_unverified_publication_and_legacy_tokens(self):
        import shutil
        old_files=Path(self.temp.name)/'old_migrations';old_files.mkdir()
        for name in ['0001_initial.sql','0002_refresh_tokens.sql']:
            shutil.copyfile(ROOT/'migrations'/name,old_files/name)
        old=sqlite3.connect(Path(self.temp.name)/'old.db')
        try:
            self.assertEqual(migrate(old,old_files),[1,2])
            old.execute("INSERT INTO app_user(id,email,username,password_hash) VALUES(1,'legacy@example.invalid','legacy','disabled')")
            old.execute("INSERT INTO rpg_system(id,code,name,edition,is_enabled) VALUES(1,'dnd-2024','D&D','2024',1)")
            old.execute("INSERT INTO character(id,owner_id,system_id,name,is_public) VALUES(1,1,1,'Ficha antiga',1)")
            old.execute("INSERT INTO auth_token(user_id,purpose,token_hash,expires_at) VALUES(1,'password_reset','legacy','2031-01-01T00:00:00.000Z')")
            old.commit()
            before=old.execute('SELECT version,name,checksum_sha256 FROM schema_migration ORDER BY version').fetchall()
            self.assertEqual(migrate(old,ROOT/'migrations'),[3,4])
            self.assertEqual(old.execute('SELECT is_public FROM character WHERE id=1').fetchone(),(0,))
            self.assertEqual(old.execute('SELECT count(*) FROM auth_token').fetchone(),(0,))
            self.assertEqual(old.execute('SELECT version,name,checksum_sha256 FROM schema_migration WHERE version<=2 ORDER BY version').fetchall(),before)
            with self.assertRaises(sqlite3.IntegrityError):
                old.execute("INSERT INTO auth_token(user_id,purpose,token_hash,expires_at) VALUES(1,'password_reset','new-no-binding','2031-01-01T00:00:00.000Z')")
        finally:
            old.close()

if __name__=='__main__':unittest.main()
