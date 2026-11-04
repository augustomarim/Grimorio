-- A sessão passa a representar uma família de access/refresh tokens opacos.
-- Sessões antigas exigem novo login: não possuem refresh token seguro para migrar.
UPDATE session
SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

ALTER TABLE session ADD COLUMN access_expires_at TEXT
    CHECK (revoked_at IS NOT NULL OR access_expires_at IS NOT NULL);

CREATE TABLE refresh_token (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    parent_token_id INTEGER UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    UNIQUE (session_id, id),
    FOREIGN KEY (session_id, parent_token_id)
        REFERENCES refresh_token(session_id, id) ON DELETE NO ACTION,
    CHECK (parent_token_id IS NULL OR parent_token_id != id),
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) STRICT;

CREATE UNIQUE INDEX uq_refresh_root ON refresh_token(session_id)
    WHERE parent_token_id IS NULL;
CREATE UNIQUE INDEX uq_refresh_unconsumed ON refresh_token(session_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_refresh_expiry ON refresh_token(expires_at);
