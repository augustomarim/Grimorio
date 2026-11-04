-- Consultas para executar depois do schema.sql e sample-data.sql em banco novo.
PRAGMA foreign_keys = ON;

-- Expertise não acumula: Bela deve ter Furtividade com rank 2.
SELECT c.name, se.name AS skill, ss.proficiency_rank
FROM character_skill_summary ss
JOIN character c ON c.id = ss.character_id
JOIN lib_skill s ON s.id = ss.skill_id
JOIN catalog_entry se ON se.id = s.catalog_entry_id
ORDER BY c.id, se.name;

-- Origem de cada benefício e contexto de aquisição.
SELECT c.name, g.rule_key, g.origin_kind, g.acquisition_context, g.acquired_at_level
FROM character_rule_grant g JOIN character c ON c.id = g.character_id
ORDER BY c.id, g.id;

-- Treinamentos resolvidos: na fixture ambos têm acesso à Adaga.
SELECT c.name, ie.name AS weapon
FROM character_weapon_proficiency p
JOIN character c ON c.id = p.character_id
JOIN lib_item i ON i.id = p.item_id
JOIN catalog_entry ie ON ie.id = i.catalog_entry_id;

-- Maestrias são separadas do treinamento e derivadas do tipo de arma.
SELECT c.name, ie.name AS weapon, me.name AS mastery
FROM character_weapon_mastery cm
JOIN character c ON c.id = cm.character_id
JOIN lib_item i ON i.id = cm.weapon_item_id
JOIN catalog_entry ie ON ie.id = i.catalog_entry_id
JOIN lib_weapon_definition w ON w.item_id = i.id
LEFT JOIN lib_weapon_mastery m ON m.id = w.mastery_id
LEFT JOIN catalog_entry me ON me.id = m.catalog_entry_id;

-- Histórico: deve conter níveis 1 a 10 para Ari e 1 para Bela.
SELECT e.character_id, e.sequence_no, cle.name, e.class_level, e.hp_method, e.hp_roll
FROM character_level_history e
JOIN character_class cc ON cc.id = e.character_class_id
JOIN lib_class cl ON cl.id = cc.class_id
JOIN catalog_entry cle ON cle.id = cl.catalog_entry_id
ORDER BY e.character_id, e.sequence_no;

-- Esperado: Ari 66, Bela 9; sem bônus na fixture.
SELECT c.name, h.base_hit_points, h.modeled_max_hit_points
FROM character_hit_point_summary h
JOIN character c ON c.id = h.character_id
ORDER BY c.id;

-- Detectar divergência entre composição atual e histórico: esperado nenhuma linha.
SELECT cc.id, cc.level, COUNT(e.id) AS recorded_levels
FROM character_class cc
LEFT JOIN character_level_entry e ON e.character_class_id = cc.id
GROUP BY cc.id HAVING cc.level != COUNT(e.id);

-- Detectar lacunas na sequência: esperado nenhuma linha.
SELECT character_id
FROM character_level_entry
GROUP BY character_id
HAVING MIN(sequence_no) != 1 OR MAX(sequence_no) != COUNT(*);

-- Detectar classe incorreta no primeiro nível: esperado nenhuma linha.
SELECT e.id
FROM character_level_entry e
JOIN character_class cc ON cc.id = e.character_class_id
WHERE e.sequence_no = 1 AND cc.is_initial_class != 1;

-- Detectar rolagem acima do dado real: esperado nenhuma linha.
SELECT e.id
FROM character_level_entry e
JOIN character_class cc ON cc.id = e.character_class_id
JOIN lib_class cl ON cl.id = cc.class_id
WHERE e.hp_method = 'roll' AND e.hp_roll > cl.hit_die;

PRAGMA foreign_key_check;
PRAGMA integrity_check;
