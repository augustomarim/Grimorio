-- Apenas leitura. Executar no SQL Editor do Neon após migração/importação.
SELECT version,name,applied_at FROM schema_migration ORDER BY version;
SELECT kind,count(*) AS total FROM catalog_entry GROUP BY kind ORDER BY kind;
SELECT name,total_level,strength,dexterity,constitution,intelligence,wisdom,charisma
FROM character_summary ORDER BY id LIMIT 20;
SELECT c.name,e.name AS class_name,cc.level,sc.name AS subclass_name
FROM character_class cc JOIN character c ON c.id=cc.character_id
JOIN lib_class cl ON cl.id=cc.class_id JOIN catalog_entry e ON e.id=cl.catalog_entry_id
LEFT JOIN lib_subclass s ON s.id=cc.subclass_id LEFT JOIN catalog_entry sc ON sc.id=s.catalog_entry_id
ORDER BY c.id,cc.id;
SELECT n.character_id,n.backstory,n.description,n.personality,n.motivations,n.goals
FROM character_narrative n ORDER BY n.character_id LIMIT 20;
SELECT character_id,base_hit_points,modeled_max_hit_points FROM character_hit_point_summary ORDER BY character_id LIMIT 20;
-- Constraints de referências não validadas devem retornar zero linhas.
SELECT conrelid::regclass AS table_name,conname FROM pg_constraint
WHERE contype='f' AND connamespace=current_schema()::regnamespace AND NOT convalidated;
