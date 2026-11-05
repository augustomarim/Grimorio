-- Diagnóstico somente de leitura. Executar após instalar schema e exemplos.
PRAGMA journal_mode;
PRAGMA foreign_keys;
PRAGMA user_version;
SELECT version,name,checksum_sha256,applied_at FROM schema_migration ORDER BY version;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
SELECT c.name,c.total_level,h.base_hit_points
FROM character_summary c JOIN character_hp_base h ON h.character_id=c.id
ORDER BY c.id;
-- SHA-256 precisa ser calculado sobre os bytes dos arquivos pelo executor,
-- não é verificado somente por estas consultas SQL.
