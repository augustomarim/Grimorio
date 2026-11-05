-- Executar depois de schema.sql e sample-data.sql em banco novo.
PRAGMA foreign_keys=ON;

-- Galeria comum: não presume classe, nível ou atributos universais.
SELECT c.id,c.name,s.code,s.name AS system_name,s.edition,c.portrait
FROM character c JOIN rpg_system s ON s.id=c.system_id
JOIN app_user u ON u.id=c.owner_id
WHERE c.is_public=1 AND c.publication_blocked_at IS NULL AND u.is_active=1 AND u.email_verified_at IS NOT NULL
ORDER BY c.name COLLATE NOCASE;

-- Resumo D&D: esperado Ari 10/66 e Bela 1/9.
SELECT c.id,c.name,c.total_level,h.base_hit_points
FROM character_summary c JOIN character_hp_base h ON h.character_id=c.id
ORDER BY c.id;

-- O serviço deve rejeitar ficha D&D concluída sem perfil: nenhuma linha na fixture.
SELECT c.id,c.name
FROM character c JOIN rpg_system s ON s.id=c.system_id
LEFT JOIN dnd_character d ON d.character_id=c.id
WHERE s.code='dnd-2024' AND d.character_id IS NULL;

-- Conferência dos sistemas disponíveis: somente dnd-2024 habilitado.
SELECT code,name,edition FROM rpg_system WHERE is_enabled=1;

PRAGMA foreign_key_check;
PRAGMA integrity_check;
