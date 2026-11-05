-- Os atributos existentes permanecem como base; só novas escolhas aplicam bônus.
ALTER TABLE dnd_character ADD COLUMN campaign_setting TEXT CHECK (campaign_setting IS NULL OR length(trim(campaign_setting)) BETWEEN 1 AND 100);
CREATE TABLE character_ability_boost (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 character_id INTEGER NOT NULL,
 grant_id INTEGER NOT NULL,
 rule_id TEXT NOT NULL CHECK (length(trim(rule_id)) BETWEEN 1 AND 200),
 ability TEXT NOT NULL CHECK (ability IN ('strength','dexterity','constitution','intelligence','wisdom','charisma')),
 amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 30),
 FOREIGN KEY (character_id,grant_id) REFERENCES character_rule_grant(character_id,id) ON DELETE CASCADE,
 UNIQUE (grant_id,rule_id,ability)
) STRICT;
CREATE INDEX idx_ability_boost_character ON character_ability_boost(character_id,grant_id);
CREATE VIEW character_rule_source AS
 SELECT g.id AS grant_id,g.character_id,
 CASE g.origin_kind WHEN 'feat' THEN json_extract(f.data,'$.effects') WHEN 'class' THEN c.data WHEN 'subclass' THEN sub.data WHEN 'species' THEN s.data WHEN 'background' THEN b.data END AS source_data
 FROM character_rule_grant g
 LEFT JOIN character_class cc ON cc.id=g.origin_character_class_id AND cc.character_id=g.character_id
 LEFT JOIN lib_class c ON c.id=cc.class_id
 LEFT JOIN lib_subclass sub ON sub.id=g.origin_subclass_id
 LEFT JOIN lib_species s ON s.id=g.origin_species_id
 LEFT JOIN lib_background b ON b.id=g.origin_background_id
 LEFT JOIN lib_feat f ON f.id=g.origin_feat_id;
CREATE VIEW character_ability_boost_application AS
 WITH RECURSIVE
 seed(character_id,ability,score) AS (
 SELECT character_id,'strength',strength FROM dnd_character UNION ALL
 SELECT character_id,'dexterity',dexterity FROM dnd_character UNION ALL
 SELECT character_id,'constitution',constitution FROM dnd_character UNION ALL
 SELECT character_id,'intelligence',intelligence FROM dnd_character UNION ALL
 SELECT character_id,'wisdom',wisdom FROM dnd_character UNION ALL
 SELECT character_id,'charisma',charisma FROM dnd_character),
 ordered AS (
 SELECT b.*,CAST(json_extract(j.value,'$.max') AS INTEGER) AS cap,
 ROW_NUMBER() OVER(PARTITION BY b.character_id,b.ability ORDER BY g.acquired_at_level,g.id,b.rule_id,b.id) AS sequence_no
 FROM character_ability_boost b JOIN character_rule_grant g ON g.id=b.grant_id AND g.character_id=b.character_id
 JOIN character_rule_source rs ON rs.grant_id=g.id
 JOIN json_each(rs.source_data,'$.abilityBoosts') j ON json_extract(j.value,'$.id')=b.rule_id
 WHERE CAST(json_extract(j.value,'$.max') AS INTEGER) BETWEEN 1 AND 30),
 applied(character_id,ability,sequence_no,score,boost_id,applied_points) AS (
 SELECT character_id,ability,0,score,NULL,0 FROM seed
 UNION ALL
 SELECT a.character_id,a.ability,o.sequence_no,
 CASE WHEN a.score>=o.cap THEN a.score ELSE MIN(o.cap,a.score+o.amount) END,
 o.id,CASE WHEN a.score>=o.cap THEN 0 ELSE MIN(o.cap,a.score+o.amount)-a.score END
 FROM applied a JOIN ordered o ON o.character_id=a.character_id AND o.ability=a.ability AND o.sequence_no=a.sequence_no+1)
 SELECT * FROM applied;
CREATE VIEW character_effective_attributes AS
 SELECT character_id,
 MAX(CASE WHEN ability='strength' THEN score END) AS strength,
 MAX(CASE WHEN ability='dexterity' THEN score END) AS dexterity,
 MAX(CASE WHEN ability='constitution' THEN score END) AS constitution,
 MAX(CASE WHEN ability='intelligence' THEN score END) AS intelligence,
 MAX(CASE WHEN ability='wisdom' THEN score END) AS wisdom,
 MAX(CASE WHEN ability='charisma' THEN score END) AS charisma
 FROM character_ability_boost_application GROUP BY character_id;
DROP VIEW character_summary;
CREATE VIEW character_summary AS SELECT c.*, a.strength,a.dexterity,a.constitution,a.intelligence,a.wisdom,a.charisma,d.species_id,d.background_id,d.alignment_id,d.ruleset_revision_id,d.campaign_setting,COALESCE((SELECT SUM(cc.level) FROM character_class cc WHERE cc.character_id=c.id),0) AS total_level FROM character c JOIN dnd_character d ON d.character_id=c.id JOIN character_effective_attributes a ON a.character_id=c.id;
DROP VIEW character_hp_base;
CREATE VIEW character_hp_base AS SELECT c.id AS character_id,COALESCE(SUM(MAX(1,CASE e.hp_method WHEN 'first_max' THEN cl.hit_die WHEN 'average' THEN cl.hit_die/2+1 ELSE e.hp_roll END + CASE WHEN d.constitution>=10 THEN (d.constitution-10)/2 ELSE (d.constitution-11)/2 END)),0) AS base_hit_points FROM character c JOIN character_effective_attributes d ON d.character_id=c.id LEFT JOIN character_level_entry e ON e.character_id=c.id LEFT JOIN character_class cc ON cc.id=e.character_class_id LEFT JOIN lib_class cl ON cl.id=cc.class_id GROUP BY c.id;
