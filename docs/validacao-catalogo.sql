-- Executar depois de schema.sql e sample-data.sql.
-- Uma linha por livro; nenhuma procedência conhecida é exibida como desconhecida.
SELECT e.kind,e.slug,e.name,
       COALESCE(s.name,'Fonte não identificada') AS source_name,
       s.source_type,s.edition
FROM catalog_entry e
LEFT JOIN catalog_entry_source es ON es.catalog_entry_id=e.id
LEFT JOIN rules_source s ON s.id=es.source_id
ORDER BY e.kind,e.name,s.name;

-- Identidade especializada da magia e seus detalhes.
SELECT sp.id, e.slug, e.name, sp.level, sp.school
FROM lib_spell sp JOIN catalog_entry e ON e.id=sp.catalog_entry_id
WHERE e.slug='light';

-- Catálogo completo: nenhuma identidade deve faltar em seu subtipo.
-- Esta consulta deve ser executada antes do COMMIT de cada carga/atualização.
WITH specialized AS (
SELECT catalog_entry_id, 'species' AS kind FROM lib_species
UNION ALL
SELECT catalog_entry_id, 'class' AS kind FROM lib_class
UNION ALL
SELECT catalog_entry_id, 'subclass' AS kind FROM lib_subclass
UNION ALL
SELECT catalog_entry_id, 'background' AS kind FROM lib_background
UNION ALL
SELECT catalog_entry_id, 'fighting_style' AS kind FROM lib_fighting_style
UNION ALL
SELECT catalog_entry_id, 'spell' AS kind FROM lib_spell
UNION ALL
SELECT catalog_entry_id, 'feat' AS kind FROM lib_feat
UNION ALL
SELECT catalog_entry_id, 'item' AS kind FROM lib_item
UNION ALL
SELECT catalog_entry_id, 'tool_group' AS kind FROM lib_tool_group
UNION ALL
SELECT catalog_entry_id, 'tool' AS kind FROM lib_tool
UNION ALL
SELECT catalog_entry_id, 'language' AS kind FROM lib_language
UNION ALL
SELECT catalog_entry_id, 'alignment' AS kind FROM lib_alignment
UNION ALL
SELECT catalog_entry_id, 'rule' AS kind FROM lib_rule
UNION ALL
SELECT catalog_entry_id, 'skill' AS kind FROM lib_skill
UNION ALL
SELECT catalog_entry_id, 'weapon_property' AS kind FROM lib_weapon_property
UNION ALL
SELECT catalog_entry_id, 'weapon_mastery' AS kind FROM lib_weapon_mastery
)
SELECT e.id,e.kind,e.slug FROM catalog_entry e
LEFT JOIN specialized s ON s.catalog_entry_id=e.id AND s.kind=e.kind
WHERE s.catalog_entry_id IS NULL;

PRAGMA foreign_key_check;
PRAGMA integrity_check;
