"""Protocolo SQL de teste, não autenticação de produção nem endpoint HTTP."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets


def stamp(time):
    return time.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def digest(token):
    return sha256(token.encode()).hexdigest()


def start_session(db, user_id, now):
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    family_expiry = stamp(now + timedelta(days=30))
    db.execute('BEGIN IMMEDIATE')
    try:
        if db.execute('SELECT is_active FROM app_user WHERE id=?', (user_id,)).fetchone() != (1,):
            raise ValueError('Conta inativa')
        cursor = db.execute('INSERT INTO session(user_id,token_hash,created_at,expires_at,access_expires_at) VALUES(?,?,?,?,?)',
                            (user_id,digest(access),stamp(now),family_expiry,stamp(now+timedelta(minutes=15))))
        session_id = cursor.lastrowid
        db.execute('INSERT INTO refresh_token(session_id,token_hash,created_at,expires_at) VALUES(?,?,?,?)',
                   (session_id,digest(refresh),stamp(now),family_expiry))
        db.commit()
        return session_id, access, refresh
    except Exception:
        db.rollback()
        raise


def access_valid(db, access, now):
    return bool(db.execute('''SELECT 1 FROM session s JOIN app_user u ON u.id=s.user_id
        WHERE s.token_hash=? AND s.revoked_at IS NULL AND u.is_active=1
        AND s.access_expires_at>? AND s.expires_at>?''', (digest(access),stamp(now),stamp(now))).fetchone())


def revoke_family(db, session_id, now):
    db.execute('UPDATE session SET revoked_at=COALESCE(revoked_at,?) WHERE id=?', (stamp(now),session_id))
    db.execute('UPDATE refresh_token SET revoked_at=COALESCE(revoked_at,?) WHERE session_id=?', (stamp(now),session_id))


def rotate(db, presented_token, now):
    """Uma chamada simulada, sob lock; reutilização revoga e CONFIRMA antes do erro."""
    db.execute('BEGIN IMMEDIATE')
    try:
        row = db.execute('''SELECT r.id,r.session_id,r.used_at,r.revoked_at,r.expires_at,
            s.revoked_at,s.expires_at,u.is_active
            FROM refresh_token r JOIN session s ON s.id=r.session_id
            JOIN app_user u ON u.id=s.user_id WHERE r.token_hash=?''', (digest(presented_token),)).fetchone()
        if not row:
            raise ValueError('Token inválido')
        token_id, session_id, used_at, token_revoked, expiry, session_revoked, family_expiry, active = row
        if used_at is not None:
            revoke_family(db,session_id,now)
            db.commit()  # Rejeitar a requisição não pode desfazer esta revogação.
            raise ValueError('Reutilização detectada; família revogada')
        if token_revoked or session_revoked or not active or expiry <= stamp(now) or family_expiry <= stamp(now):
            raise ValueError('Token expirado, revogado ou conta inativa')
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        updated = db.execute('UPDATE refresh_token SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL', (stamp(now),token_id))
        if updated.rowcount != 1:
            raise ValueError('Token já consumido')
        db.execute('INSERT INTO refresh_token(session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(?,?,?,?,?)',
                   (session_id,digest(refresh),token_id,stamp(now),family_expiry))
        access_expiry = min(stamp(now+timedelta(minutes=15)),family_expiry)
        db.execute('UPDATE session SET token_hash=?,access_expires_at=? WHERE id=?', (digest(access),access_expiry,session_id))
        db.commit()
        return access, refresh
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise
