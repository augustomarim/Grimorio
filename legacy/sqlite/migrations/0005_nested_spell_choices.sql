-- Vínculo opcional entre magia e opção escolhida, preservando os registros legados.
CREATE UNIQUE INDEX uq_character_choice_owner ON character_choice(character_id,id);
CREATE TABLE character_spell_v5 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  lib_spell_id INTEGER NOT NULL REFERENCES lib_spell(id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('class','subclass','species','background','feat')),
  origin_character_class_id INTEGER,
  origin_subclass_id INTEGER,
  origin_species_id INTEGER,
  origin_background_id INTEGER,
  origin_character_ability_id INTEGER,
  origin_feat_id INTEGER,
  preparation_mode TEXT NOT NULL CHECK (preparation_mode IN ('cantrip','selectable','always_prepared','granted')),
  is_prepared INTEGER NOT NULL DEFAULT 0 CHECK (is_prepared IN (0,1)),
  casting_ability_choice TEXT CHECK (casting_ability_choice IN ('strength','dexterity','constitution','intelligence','wisdom','charisma')),
  notes TEXT,
  choice_instance_id INTEGER,
  nested_choice_key TEXT,
  FOREIGN KEY (character_id, choice_instance_id) REFERENCES character_choice(character_id, id) ON DELETE CASCADE,
  CHECK ((choice_instance_id IS NULL AND nested_choice_key IS NULL) OR (choice_instance_id IS NOT NULL AND nested_choice_key IS NOT NULL AND length(trim(nested_choice_key)) BETWEEN 1 AND 200)),
  CHECK ((origin_kind = 'class' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'subclass' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NOT NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'species' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NOT NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'background' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NOT NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'feat' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NOT NULL AND origin_feat_id IS NOT NULL)),
  CHECK (is_prepared = 0 OR preparation_mode = 'selectable'),
  FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE
) STRICT;
INSERT INTO character_spell_v5(id,character_id,lib_spell_id,origin_kind,origin_character_class_id,origin_subclass_id,origin_species_id,origin_background_id,origin_character_ability_id,origin_feat_id,preparation_mode,is_prepared,casting_ability_choice,notes) SELECT id,character_id,lib_spell_id,origin_kind,origin_character_class_id,origin_subclass_id,origin_species_id,origin_background_id,origin_character_ability_id,origin_feat_id,preparation_mode,is_prepared,casting_ability_choice,notes FROM character_spell;
UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='character_spell'),0)) WHERE name='character_spell_v5';
DROP TABLE character_spell;
ALTER TABLE character_spell_v5 RENAME TO character_spell;
CREATE INDEX idx_character_spell_28 ON character_spell (origin_character_class_id);
CREATE INDEX idx_character_spell_29 ON character_spell (origin_character_ability_id);
CREATE UNIQUE INDEX uq_spell_class_grant ON character_spell(character_id, lib_spell_id, origin_character_class_id) WHERE origin_kind = 'class' AND choice_instance_id IS NULL;
CREATE UNIQUE INDEX uq_spell_subclass_grant ON character_spell(character_id, lib_spell_id, origin_character_class_id, origin_subclass_id) WHERE origin_kind = 'subclass' AND choice_instance_id IS NULL;
CREATE UNIQUE INDEX uq_spell_species_grant ON character_spell(character_id, lib_spell_id, origin_species_id) WHERE origin_kind = 'species' AND choice_instance_id IS NULL;
CREATE UNIQUE INDEX uq_spell_background_grant ON character_spell(character_id, lib_spell_id, origin_background_id) WHERE origin_kind = 'background' AND choice_instance_id IS NULL;
CREATE UNIQUE INDEX uq_spell_feat_grant ON character_spell(character_id, lib_spell_id, origin_character_ability_id) WHERE origin_kind = 'feat' AND choice_instance_id IS NULL;
CREATE INDEX idx_character_spell_choice ON character_spell(character_id,choice_instance_id);
CREATE UNIQUE INDEX uq_spell_nested_choice ON character_spell(character_id,choice_instance_id,nested_choice_key,lib_spell_id) WHERE choice_instance_id IS NOT NULL;
