-- Diagnóstico da fixture, sem exibir hashes ou tokens.
PRAGMA foreign_keys=ON;
SELECT s.id,s.user_id,s.created_at,s.expires_at,s.access_expires_at,s.revoked_at
FROM session s ORDER BY s.id;
SELECT id,session_id,parent_token_id,created_at,expires_at,used_at,revoked_at
FROM refresh_token ORDER BY session_id,id;
-- Nenhuma cadeia pode atravessar famílias: esperado nenhuma linha.
SELECT child.id FROM refresh_token child
JOIN refresh_token parent ON parent.id=child.parent_token_id
WHERE child.session_id != parent.session_id;
-- Limites que o serviço deve exigir: esperado nenhuma linha.
SELECT r.id FROM refresh_token r JOIN session s ON s.id=r.session_id
WHERE r.expires_at > s.expires_at;
SELECT id FROM session WHERE access_expires_at > expires_at;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
