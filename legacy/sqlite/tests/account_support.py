"""Consultas/protocolos de teste. Não implementa endpoints, senha ou envio de e-mail."""
from datetime import timedelta
import hmac
import secrets

from refresh_support import digest, stamp


def email_key(email):
    return digest(email.strip().casefold())


def allowed(db, actor_id, action, character_id=None):
    actor = db.execute('SELECT role,is_active,email_verified_at FROM app_user WHERE id=?',(actor_id,)).fetchone() if actor_id is not None else None
    if actor_id is not None and (not actor or not actor[1]):
        return False
    if action=='create':
        return bool(actor)
    row=db.execute('''SELECT c.owner_id,c.is_public,c.publication_blocked_at,u.is_active,u.email_verified_at
        FROM character c JOIN app_user u ON u.id=c.owner_id WHERE c.id=?''',(character_id,)).fetchone()
    if not row:
        return False
    owner,public,blocked,owner_active,owner_verified=row
    if action=='read':
        return bool((actor and (actor_id==owner or actor[0]=='admin')) or (public and not blocked and owner_active and owner_verified))
    if action in ('edit','delete'):
        return bool(actor and actor_id==owner)
    if action=='publish':
        return bool(actor and actor_id==owner and actor[2] and not blocked)
    if action in ('moderate','unblock_publication'):
        return bool(actor and actor[0]=='admin')
    return False


def publish(db,actor_id,character_id,now):
    db.execute('BEGIN IMMEDIATE')
    try:
        if not allowed(db,actor_id,'publish',character_id):
            raise PermissionError('Publicação não permitida')
        db.execute('UPDATE character SET is_public=1,updated_at=? WHERE id=?',(stamp(now),character_id))
        db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,created_at) VALUES(?,'character.publish','character',?,?)",(actor_id,character_id,stamp(now)))
        db.commit()
    except Exception:
        db.rollback();raise


def moderate(db,actor_id,character_id,now,unblock=False):
    db.execute('BEGIN IMMEDIATE')
    try:
        if not allowed(db,actor_id,'unblock_publication' if unblock else 'moderate',character_id):
            raise PermissionError('Moderação não permitida')
        db.execute('UPDATE character SET is_public=0,publication_blocked_at=?,updated_at=? WHERE id=?',(None if unblock else stamp(now),stamp(now),character_id))
        db.execute('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)',
                   (actor_id,'character.unblock_publication' if unblock else 'character.hide','character',character_id,stamp(now)))
        db.commit()
    except Exception:
        db.rollback();raise


def issue_token(db,email,purpose,now):
    if purpose not in ('password_reset','email_verification'):
        raise ValueError('Finalidade inválida')
    db.execute('BEGIN IMMEDIATE')
    try:
        user=db.execute('SELECT id,email,is_active FROM app_user WHERE email=? COLLATE NOCASE',(email.strip(),)).fetchone()
        if not user or not user[2]:
            db.rollback();return None
        raw=secrets.token_urlsafe(32)
        db.execute('UPDATE auth_token SET revoked_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL',(stamp(now),user[0],purpose))
        ttl=timedelta(minutes=30) if purpose=='password_reset' else timedelta(hours=24)
        db.execute('INSERT INTO auth_token(user_id,purpose,token_hash,created_at,expires_at,issued_email_hash) VALUES(?,?,?,?,?,?)',
                   (user[0],purpose,digest(raw),stamp(now),stamp(now+ttl),email_key(user[1])))
        db.commit();return raw  # Só para simular a entrega privada no teste, nunca resposta HTTP.
    except Exception:
        db.rollback();raise


def request_public_response(db,email,purpose,now):
    # Teste de contrato: a resposta nunca expõe o token nem a existência da conta.
    issue_token(db,email,purpose,now)  # Entrega por e-mail não implementada.
    return 'Se o endereço estiver elegível, enviaremos as instruções.'


def consume_token(db,raw,purpose,now,new_password_hash=None):
    db.execute('BEGIN IMMEDIATE')
    try:
        row=db.execute('''SELECT t.id,t.user_id,t.issued_email_hash,u.email,u.is_active
            FROM auth_token t JOIN app_user u ON u.id=t.user_id
            WHERE t.token_hash=? AND t.purpose=? AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>?''',
            (digest(raw),purpose,stamp(now))).fetchone()
        if not row or not row[4] or row[2]!=email_key(row[3]):
            raise ValueError('Token inválido ou expirado')
        updated=db.execute('UPDATE auth_token SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL',(stamp(now),row[0]))
        if updated.rowcount!=1:
            raise ValueError('Token inválido ou expirado')
        if purpose=='email_verification':
            db.execute('UPDATE app_user SET email_verified_at=?,updated_at=? WHERE id=?',(stamp(now),stamp(now),row[1]))
        elif purpose=='password_reset':
            db.execute('UPDATE app_user SET password_hash=?,updated_at=? WHERE id=?',(new_password_hash,stamp(now),row[1]))
            db.execute('UPDATE session SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=?',(stamp(now),row[1]))
            db.execute('UPDATE refresh_token SET revoked_at=COALESCE(revoked_at,?) WHERE session_id IN (SELECT id FROM session WHERE user_id=?)',(stamp(now),row[1]))
            db.execute("UPDATE auth_token SET revoked_at=? WHERE user_id=? AND purpose='password_reset' AND used_at IS NULL AND revoked_at IS NULL",(stamp(now),row[1]))
        db.commit()
    except Exception:
        db.rollback();raise


def login_attempt(db,email,network,valid_credentials,now,key_secret):
    """valid_credentials simula comparação de senha: não é validador de senha real."""
    keys=[('email',email.strip().casefold(),5),('network',network,50)]
    hashed=[(scope,hmac.digest(key_secret,(scope+':'+value).encode(),'sha256').hex(),limit) for scope,value,limit in keys]
    failure=(False,'Não foi possível entrar. Confira as credenciais ou tente mais tarde.')
    db.execute('BEGIN IMMEDIATE')
    try:
        for scope,key,_ in hashed:
            row=db.execute('SELECT blocked_until FROM login_throttle WHERE scope=? AND key_hash=?',(scope,key)).fetchone()
            if row and row[0] and row[0]>stamp(now):
                db.rollback();return failure
        user=db.execute('SELECT id,is_active FROM app_user WHERE email=? COLLATE NOCASE',(email.strip(),)).fetchone()
        if valid_credentials and user and user[1]:
            db.execute("DELETE FROM login_throttle WHERE scope='email' AND key_hash=?",(hashed[0][1],))
            db.commit();return True,'Autenticado no protocolo de teste'
        for scope,key,limit in hashed:
            row=db.execute('SELECT window_started_at,failure_count FROM login_throttle WHERE scope=? AND key_hash=?',(scope,key)).fetchone()
            fresh=not row or row[0]<=stamp(now-timedelta(minutes=15))
            started=stamp(now) if fresh else row[0]
            failures=1 if fresh else row[1]+1
            blocked=stamp(now+timedelta(minutes=15)) if failures>=limit else None
            db.execute('''INSERT INTO login_throttle(scope,key_hash,window_started_at,failure_count,blocked_until,expires_at,updated_at)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,key_hash) DO UPDATE SET
                window_started_at=excluded.window_started_at,failure_count=excluded.failure_count,blocked_until=excluded.blocked_until,
                expires_at=excluded.expires_at,updated_at=excluded.updated_at''',
                (scope,key,started,failures,blocked,stamp(now+timedelta(hours=24)),stamp(now)))
        db.commit();return failure
    except Exception:
        db.rollback();raise
