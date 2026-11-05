-- Executar após schema.sql e sample-data.sql em banco novo.
PRAGMA foreign_keys = ON;

-- Cada concessão mantém sua origem; esperado: Light por Wizard e Cleric.
SELECT se.name, cle.name AS origin_class, cs.preparation_mode, cs.is_prepared
FROM character_spell cs
JOIN lib_spell s ON s.id = cs.lib_spell_id
JOIN catalog_entry se ON se.id = s.catalog_entry_id
LEFT JOIN character_class cc ON cc.id = cs.origin_character_class_id
LEFT JOIN lib_class cl ON cl.id = cc.class_id
LEFT JOIN catalog_entry cle ON cle.id = cl.catalog_entry_id
WHERE cs.character_id = 1
ORDER BY cs.id;

-- Não somar classes depois de juntá-las às magias: isso multiplicaria os níveis.
SELECT name, total_level FROM character_summary WHERE id = 1;

-- Inscrições são independentes de preparação.
SELECT se.name, cle.name AS spellbook_class
FROM character_spellbook_entry e
JOIN lib_spell s ON s.id = e.lib_spell_id
JOIN catalog_entry se ON se.id = s.catalog_entry_id
JOIN character_class cc ON cc.id = e.character_class_id
JOIN lib_class cl ON cl.id = cc.class_id
JOIN catalog_entry cle ON cle.id = cl.catalog_entry_id
WHERE e.character_id = 1;

BEGIN;
CREATE TEMP TABLE validation_assertion (
    label TEXT NOT NULL,
    passed INTEGER NOT NULL CHECK (passed = 1)
) STRICT;
INSERT INTO validation_assertion
SELECT 'nível total 10', total_level = 10 FROM character_summary WHERE id = 1;
INSERT INTO validation_assertion
SELECT 'Luz com duas concessões', COUNT(*) = 2
FROM character_spell cs JOIN lib_spell s ON s.id = cs.lib_spell_id
JOIN catalog_entry se ON se.id = s.catalog_entry_id
WHERE cs.character_id = 1 AND se.slug = 'light';
INSERT INTO validation_assertion
SELECT 'uma entrada de grimório', COUNT(*) = 1
FROM character_spellbook_entry WHERE character_id = 1;
UPDATE character_spell SET is_prepared = 0 WHERE character_id = 1;
INSERT INTO validation_assertion
SELECT 'retirar preparação não apaga grimório', COUNT(*) = 1
FROM character_spellbook_entry WHERE character_id = 1;
SELECT * FROM validation_assertion;
ROLLBACK;

PRAGMA foreign_key_check;
PRAGMA integrity_check;
