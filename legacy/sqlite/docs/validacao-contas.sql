-- Somente diagnóstico/consulta; não substitui autorização nos endpoints.
PRAGMA foreign_keys=ON;
-- Galeria elegível, sem exigir campos de D&D.
SELECT c.id,c.name,s.code
FROM character c JOIN app_user u ON u.id=c.owner_id
JOIN rpg_system s ON s.id=c.system_id
WHERE c.is_public=1 AND c.publication_blocked_at IS NULL
  AND u.is_active=1 AND u.email_verified_at IS NOT NULL;
-- Diagnóstico de inconsistência de flags: nenhuma linha na fixture.
SELECT c.id FROM character c JOIN app_user u ON u.id=c.owner_id
WHERE c.is_public=1 AND
  (c.publication_blocked_at IS NOT NULL OR u.is_active=0 OR u.email_verified_at IS NULL);
-- Tokens sem expor hash ou e-mail vinculado.
SELECT id,user_id,purpose,created_at,expires_at,used_at,revoked_at FROM auth_token;
-- Buckets sem revelar chave HMAC.
SELECT scope,window_started_at,failure_count,blocked_until,expires_at FROM login_throttle;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
