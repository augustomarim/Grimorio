-- Publicação depende de e-mail confirmado e conta ativa; preservar as fichas privadas.
UPDATE character SET is_public=0
WHERE owner_id IN (SELECT id FROM app_user WHERE email_verified_at IS NULL OR is_active=0);
ALTER TABLE character ADD COLUMN publication_blocked_at TEXT;

-- Tokens legados não foram vinculados ao e-mail de emissão: solicitar novos.
DELETE FROM auth_token;
ALTER TABLE auth_token ADD COLUMN issued_email_hash TEXT
    CHECK (issued_email_hash IS NOT NULL AND length(issued_email_hash)=64);
ALTER TABLE auth_token ADD COLUMN revoked_at TEXT;
CREATE UNIQUE INDEX uq_auth_pending ON auth_token(user_id,purpose)
    WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE login_throttle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK (scope IN ('email','network')),
    key_hash TEXT NOT NULL CHECK (length(key_hash)=64),
    window_started_at TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    blocked_until TEXT,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scope,key_hash),
    CHECK (expires_at > window_started_at)
) STRICT;
CREATE INDEX idx_login_throttle_expiry ON login_throttle(expires_at);
