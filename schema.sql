-- Snapshot atual para banco novo; alternativa à cadeia de migrações.

PRAGMA foreign_keys=ON;

PRAGMA journal_mode=WAL;

BEGIN IMMEDIATE;

-- 0001: baseline inicial do Grimorio; executar pela transação do migrador.
-- foreign_keys/WAL são configurados na conexão antes do BEGIN IMMEDIATE.
CREATE TABLE app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(username) BETWEEN 3 AND 32),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  email_verified_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_address TEXT,
  user_agent TEXT
) STRICT;

CREATE TABLE auth_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verification')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT CHECK (details IS NULL OR json_valid(details)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE ruleset_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision TEXT NOT NULL UNIQUE,
  library_version TEXT NOT NULL,
  loaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE lib_species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting TEXT,
  creature_type TEXT,
  speed INTEGER CHECK (speed >= 0),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'species' CHECK (catalog_kind = 'species'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_class (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hit_die INTEGER CHECK (hit_die IN (6,8,10,12)),
  is_spellcaster INTEGER NOT NULL DEFAULT 0 CHECK (is_spellcaster IN (0,1)),
  subclass_level INTEGER NOT NULL CHECK (subclass_level BETWEEN 1 AND 20),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'class' CHECK (catalog_kind = 'class'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_subclass (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES lib_class(id) ON DELETE RESTRICT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'subclass' CHECK (catalog_kind = 'subclass'),
  UNIQUE (class_id, id),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_background (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting TEXT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'background' CHECK (catalog_kind = 'background'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_fighting_style (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'fighting_style' CHECK (catalog_kind = 'fighting_style'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_spell (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 9),
  school TEXT NOT NULL CHECK (school IN ('Abjuration','Conjuration','Divination','Enchantment','Evocation','Illusion','Necromancy','Transmutation')),
  is_concentration INTEGER NOT NULL DEFAULT 0 CHECK (is_concentration IN (0,1)),
  is_ritual INTEGER NOT NULL DEFAULT 0 CHECK (is_ritual IN (0,1)),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'spell' CHECK (catalog_kind = 'spell'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_feat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  setting TEXT,
  is_repeatable INTEGER NOT NULL DEFAULT 0 CHECK (is_repeatable IN (0,1)),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'feat' CHECK (catalog_kind = 'feat'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('gear','weapon','armor','tool','mount','poison','potion','scroll','wondrous','ring','rod','staff','wand')),
  rarity TEXT CHECK (rarity IN ('common','uncommon','rare','very rare','legendary','artifact','varies')),
  is_magic INTEGER NOT NULL DEFAULT 0 CHECK (is_magic IN (0,1)),
  cost_cp INTEGER CHECK (cost_cp >= 0),
  weight REAL CHECK (weight >= 0),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'item' CHECK (catalog_kind = 'item'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_tool_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'tool_group' CHECK (catalog_kind = 'tool_group'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_tool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES lib_tool_group(id) ON DELETE RESTRICT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'tool' CHECK (catalog_kind = 'tool'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_language (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier TEXT NOT NULL CHECK (tier IN ('common','rare')),
  origin TEXT,
  is_always INTEGER NOT NULL DEFAULT 0 CHECK (is_always IN (0,1)),
  note TEXT,
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'language' CHECK (catalog_kind = 'language'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_alignment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abbr TEXT NOT NULL,
  order_axis TEXT NOT NULL,
  morality_axis TEXT NOT NULL,
  body TEXT,
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'alignment' CHECK (catalog_kind = 'alignment'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'rule' CHECK (catalog_kind = 'rule'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_key TEXT NOT NULL UNIQUE,
  from_type TEXT NOT NULL,
  from_slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_slug TEXT NOT NULL
) STRICT;

CREATE TABLE character (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  system_id INTEGER NOT NULL REFERENCES rpg_system(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  portrait TEXT,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, system_id)
) STRICT;

CREATE TABLE character_class (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES lib_class(id) ON DELETE RESTRICT,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 20),
  subclass_id INTEGER,
  is_initial_class INTEGER NOT NULL DEFAULT 0 CHECK (is_initial_class IN (0,1)),
  UNIQUE (character_id, class_id),
  FOREIGN KEY (class_id, subclass_id) REFERENCES lib_subclass(class_id, id) ON DELETE RESTRICT,
  UNIQUE (character_id, id),
  UNIQUE (character_id, id, subclass_id)
) STRICT;

CREATE TABLE character_narrative (
  character_id INTEGER PRIMARY KEY REFERENCES character(id) ON DELETE CASCADE,
  backstory TEXT,
  description TEXT,
  personality TEXT,
  motivations TEXT,
  goals TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE character_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  lib_item_id INTEGER NOT NULL REFERENCES lib_item(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  equipped INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0,1)),
  notes TEXT
) STRICT;

CREATE TABLE character_ability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  lib_feat_id INTEGER REFERENCES lib_feat(id) ON DELETE RESTRICT,
  lib_tool_id INTEGER REFERENCES lib_tool(id) ON DELETE RESTRICT,
  lib_language_id INTEGER REFERENCES lib_language(id) ON DELETE RESTRICT,
  notes TEXT,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  proficiency_rank INTEGER,
  CHECK ((lib_feat_id IS NOT NULL) + (lib_tool_id IS NOT NULL) + (lib_language_id IS NOT NULL) = 1),
  UNIQUE (character_id, id, lib_feat_id),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  CHECK ((lib_tool_id IS NOT NULL AND proficiency_rank IS NOT NULL AND proficiency_rank IN (1,2)) OR (lib_tool_id IS NULL AND proficiency_rank IS NULL))
) STRICT;

CREATE TABLE character_spell (
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
  CHECK ((origin_kind = 'class' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'subclass' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NOT NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'species' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NOT NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'background' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NOT NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'feat' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NOT NULL AND origin_feat_id IS NOT NULL)),
  CHECK (is_prepared = 0 OR preparation_mode = 'selectable'),
  FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE character_spellbook_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  character_class_id INTEGER NOT NULL,
  lib_spell_id INTEGER NOT NULL REFERENCES lib_spell(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes TEXT,
  UNIQUE (character_class_id, lib_spell_id),
  FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE character_fighting_style (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  lib_fighting_style_id INTEGER NOT NULL REFERENCES lib_fighting_style(id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'class' CHECK (source IN ('class','subclass','species','background','feat','manual')),
  notes TEXT,
  UNIQUE (character_id, lib_fighting_style_id)
) STRICT;

CREATE TABLE lib_skill (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ability TEXT NOT NULL CHECK (ability IN ('strength','dexterity','constitution','intelligence','wisdom','charisma')),
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'skill' CHECK (catalog_kind = 'skill'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_weapon_property (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'weapon_property' CHECK (catalog_kind = 'weapon_property'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_weapon_mastery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL CHECK (json_valid(data)),
  catalog_entry_id INTEGER NOT NULL UNIQUE,
  catalog_kind TEXT NOT NULL DEFAULT 'weapon_mastery' CHECK (catalog_kind = 'weapon_mastery'),
  FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE lib_weapon_definition (
  item_id INTEGER PRIMARY KEY REFERENCES lib_item(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('Simple','Martial')),
  weapon_range TEXT NOT NULL CHECK (weapon_range IN ('Melee','Ranged')),
  mastery_id INTEGER REFERENCES lib_weapon_mastery(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE lib_weapon_property_link (
  item_id INTEGER NOT NULL REFERENCES lib_weapon_definition(item_id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES lib_weapon_property(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, property_id)
) STRICT;

CREATE TABLE character_rule_grant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('class','subclass','species','background','feat')),
  origin_character_class_id INTEGER,
  origin_subclass_id INTEGER,
  origin_species_id INTEGER,
  origin_background_id INTEGER,
  origin_character_ability_id INTEGER,
  origin_feat_id INTEGER,
  acquisition_context TEXT NOT NULL CHECK (acquisition_context IN ('initial_class','multiclass_entry','class_progression','species','background','feat')),
  rule_key TEXT NOT NULL CHECK (length(trim(rule_key)) > 0),
  acquired_at_level INTEGER NOT NULL CHECK (acquired_at_level BETWEEN 1 AND 20),
  notes TEXT,
  CHECK ((origin_kind = 'class' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'subclass' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NOT NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'species' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NOT NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'background' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NOT NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'feat' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NOT NULL AND origin_feat_id IS NOT NULL)),
  FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE,
  FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE,
  UNIQUE (character_id, id),
  UNIQUE (character_id, rule_key),
  CHECK ((origin_kind IN ('class','subclass') AND acquisition_context IN ('initial_class','multiclass_entry','class_progression')) OR (origin_kind IN ('species','background','feat') AND acquisition_context = origin_kind)),
  CHECK (acquisition_context != 'initial_class' OR (origin_kind = 'class' AND acquired_at_level = 1)),
  CHECK (acquisition_context != 'multiclass_entry' OR (origin_kind = 'class' AND acquired_at_level > 1))
) STRICT;

CREATE TABLE character_skill (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  skill_id INTEGER NOT NULL REFERENCES lib_skill(id) ON DELETE RESTRICT,
  proficiency_rank INTEGER NOT NULL CHECK (proficiency_rank IN (1,2)),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, skill_id)
) STRICT;

CREATE TABLE character_saving_throw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  ability TEXT NOT NULL CHECK (ability IN ('strength','dexterity','constitution','intelligence','wisdom','charisma')),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, ability)
) STRICT;

CREATE TABLE character_armor_training (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  armor_kind TEXT NOT NULL CHECK (armor_kind IN ('Light','Medium','Heavy','Shield')),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, armor_kind)
) STRICT;

CREATE TABLE character_weapon_training (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  clause_key TEXT NOT NULL CHECK (length(trim(clause_key)) > 0),
  weapon_item_id INTEGER REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT,
  category TEXT CHECK (category IN ('Simple','Martial')),
  weapon_range TEXT CHECK (weapon_range IN ('Melee','Ranged')),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, clause_key),
  CHECK ((weapon_item_id IS NOT NULL AND category IS NULL AND weapon_range IS NULL) OR (weapon_item_id IS NULL AND category IS NOT NULL))
) STRICT;

CREATE TABLE character_weapon_training_property (
  training_id INTEGER NOT NULL REFERENCES character_weapon_training(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES lib_weapon_property(id) ON DELETE RESTRICT,
  predicate TEXT NOT NULL CHECK (predicate IN ('require_any','exclude')),
  PRIMARY KEY (training_id, property_id)
) STRICT;

CREATE TABLE character_weapon_mastery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  weapon_item_id INTEGER NOT NULL REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT,
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, weapon_item_id)
) STRICT;

CREATE TABLE character_level_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  character_class_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 1 AND 20),
  hp_method TEXT NOT NULL CHECK (hp_method IN ('first_max','average','roll')),
  hp_roll INTEGER CHECK (hp_roll BETWEEN 1 AND 12),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes TEXT,
  UNIQUE (character_id, sequence_no),
  CHECK ((hp_method = 'roll' AND hp_roll IS NOT NULL) OR (hp_method IN ('first_max','average') AND hp_roll IS NULL)),
  FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE,
  CHECK ((sequence_no = 1 AND hp_method = 'first_max') OR (sequence_no > 1 AND hp_method IN ('average','roll')))
) STRICT;

CREATE TABLE character_hit_point_bonus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE,
  grant_id INTEGER NOT NULL,
  selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen')),
  choice_key TEXT,
  notes TEXT,
  bonus_kind TEXT NOT NULL CHECK (bonus_kind IN ('flat','per_character_level','per_class_level')),
  amount INTEGER NOT NULL CHECK (amount != 0),
  target_character_class_id INTEGER,
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0)),
  UNIQUE (grant_id, bonus_kind, target_character_class_id),
  CHECK ((bonus_kind = 'per_class_level' AND target_character_class_id IS NOT NULL) OR (bonus_kind IN ('flat','per_character_level') AND target_character_class_id IS NULL)),
  FOREIGN KEY (character_id, target_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE rules_source (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('base','supplement')),
  edition TEXT NOT NULL,
  bibliographic_reference TEXT,
  reference_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE catalog_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('species', 'class', 'subclass', 'background', 'fighting_style', 'spell', 'feat', 'item', 'tool_group', 'tool', 'language', 'alignment', 'rule', 'skill', 'weapon_property', 'weapon_mastery')),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  deprecated_at TEXT,
  UNIQUE (kind, slug),
  UNIQUE (id, kind)
) STRICT;

CREATE TABLE catalog_entry_source (
  catalog_entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES rules_source(id) ON DELETE RESTRICT,
  PRIMARY KEY (catalog_entry_id, source_id)
) STRICT;

CREATE TABLE rpg_system (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL,
  edition TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  UNIQUE (id, code)
) STRICT;

CREATE TABLE dnd_character (
  character_id INTEGER PRIMARY KEY REFERENCES character(id) ON DELETE CASCADE,
  system_id INTEGER NOT NULL,
  system_code TEXT NOT NULL DEFAULT 'dnd-2024' CHECK (system_code = 'dnd-2024'),
  strength INTEGER NOT NULL CHECK (strength BETWEEN 1 AND 30),
  dexterity INTEGER NOT NULL CHECK (dexterity BETWEEN 1 AND 30),
  constitution INTEGER NOT NULL CHECK (constitution BETWEEN 1 AND 30),
  intelligence INTEGER NOT NULL CHECK (intelligence BETWEEN 1 AND 30),
  wisdom INTEGER NOT NULL CHECK (wisdom BETWEEN 1 AND 30),
  charisma INTEGER NOT NULL CHECK (charisma BETWEEN 1 AND 30),
  species_id INTEGER NOT NULL REFERENCES lib_species(id) ON DELETE RESTRICT,
  background_id INTEGER REFERENCES lib_background(id) ON DELETE RESTRICT,
  alignment_id INTEGER REFERENCES lib_alignment(id) ON DELETE RESTRICT,
  ruleset_revision_id INTEGER NOT NULL REFERENCES ruleset_revision(id) ON DELETE RESTRICT,
  UNIQUE (character_id, species_id),
  UNIQUE (character_id, background_id),
  FOREIGN KEY (character_id, system_id) REFERENCES character(id, system_id) ON DELETE CASCADE,
  FOREIGN KEY (system_id, system_code) REFERENCES rpg_system(id, code) ON DELETE RESTRICT
) STRICT;

CREATE TABLE schema_migration (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX idx_session_0 ON session (user_id);

CREATE INDEX idx_session_1 ON session (expires_at);

CREATE INDEX idx_auth_token_2 ON auth_token (user_id);

CREATE INDEX idx_audit_log_3 ON audit_log (created_at);

CREATE INDEX idx_audit_log_4 ON audit_log (actor_user_id);

CREATE INDEX idx_character_5 ON character (owner_id, name COLLATE NOCASE);

CREATE INDEX idx_dnd_character_6 ON dnd_character (species_id);

CREATE INDEX idx_character_class_7 ON character_class (class_id, level);

CREATE INDEX idx_character_item_8 ON character_item (character_id);

CREATE INDEX idx_character_ability_9 ON character_ability (character_id);

CREATE INDEX idx_lib_spell_10 ON lib_spell (level, school);

CREATE INDEX idx_lib_item_11 ON lib_item (kind, rarity);

CREATE INDEX idx_lib_feat_12 ON lib_feat (category);

CREATE INDEX idx_lib_link_13 ON lib_link (from_type, from_slug, kind);

CREATE INDEX idx_lib_link_14 ON lib_link (to_type, to_slug, kind);

CREATE INDEX idx_character_skill_15 ON character_skill (character_id, grant_id);

CREATE INDEX idx_character_saving_throw_16 ON character_saving_throw (character_id, grant_id);

CREATE INDEX idx_character_armor_training_17 ON character_armor_training (character_id, grant_id);

CREATE INDEX idx_character_weapon_training_18 ON character_weapon_training (character_id, grant_id);

CREATE INDEX idx_character_weapon_mastery_19 ON character_weapon_mastery (character_id, grant_id);

CREATE INDEX idx_character_hit_point_bonus_20 ON character_hit_point_bonus (character_id, grant_id);

CREATE INDEX idx_character_rule_grant_21 ON character_rule_grant (origin_character_class_id);

CREATE INDEX idx_character_rule_grant_22 ON character_rule_grant (origin_character_ability_id);

CREATE INDEX idx_character_ability_23 ON character_ability (grant_id);

CREATE INDEX idx_character_level_entry_24 ON character_level_entry (character_class_id);

CREATE INDEX idx_character_weapon_training_property_25 ON character_weapon_training_property (property_id);

CREATE INDEX idx_lib_weapon_property_link_26 ON lib_weapon_property_link (property_id);

CREATE INDEX idx_lib_weapon_definition_27 ON lib_weapon_definition (mastery_id);

CREATE INDEX idx_character_spell_28 ON character_spell (origin_character_class_id);

CREATE INDEX idx_character_spell_29 ON character_spell (origin_character_ability_id);

CREATE INDEX idx_character_spellbook_entry_30 ON character_spellbook_entry (character_id);

CREATE INDEX idx_catalog_entry_source_31 ON catalog_entry_source (source_id);

CREATE INDEX idx_character_32 ON character (system_id, owner_id);

CREATE UNIQUE INDEX uq_hp_bonus_no_class ON character_hit_point_bonus(grant_id, bonus_kind) WHERE target_character_class_id IS NULL;

CREATE UNIQUE INDEX uq_spell_class_grant ON character_spell(character_id, lib_spell_id, origin_character_class_id) WHERE origin_kind = 'class';

CREATE UNIQUE INDEX uq_spell_subclass_grant ON character_spell(character_id, lib_spell_id, origin_character_class_id, origin_subclass_id) WHERE origin_kind = 'subclass';

CREATE UNIQUE INDEX uq_spell_species_grant ON character_spell(character_id, lib_spell_id, origin_species_id) WHERE origin_kind = 'species';

CREATE UNIQUE INDEX uq_spell_background_grant ON character_spell(character_id, lib_spell_id, origin_background_id) WHERE origin_kind = 'background';

CREATE UNIQUE INDEX uq_spell_feat_grant ON character_spell(character_id, lib_spell_id, origin_character_ability_id) WHERE origin_kind = 'feat';

CREATE INDEX idx_character_public_name ON character(name COLLATE NOCASE) WHERE is_public = 1;

CREATE UNIQUE INDEX uq_character_initial_class ON character_class(character_id) WHERE is_initial_class = 1;

-- A view inclui personagens sem classe como nível 0: estado incompleto, proibido no salvamento pelo serviço.

CREATE VIEW character_summary AS SELECT c.*, d.strength, d.dexterity, d.constitution, d.intelligence, d.wisdom, d.charisma, d.species_id, d.background_id, d.alignment_id, d.ruleset_revision_id, COALESCE((SELECT SUM(cc.level) FROM character_class cc WHERE cc.character_id = c.id), 0) AS total_level FROM character c JOIN dnd_character d ON d.character_id=c.id;

CREATE VIEW character_skill_summary AS SELECT character_id, skill_id, MAX(proficiency_rank) AS proficiency_rank FROM character_skill GROUP BY character_id, skill_id;

CREATE VIEW character_level_history AS SELECT e.*, ROW_NUMBER() OVER (PARTITION BY character_id, character_class_id ORDER BY sequence_no) AS class_level FROM character_level_entry e;

CREATE VIEW character_hp_base AS SELECT c.id AS character_id, COALESCE(SUM(MAX(1, CASE e.hp_method WHEN 'first_max' THEN cl.hit_die WHEN 'average' THEN cl.hit_die / 2 + 1 ELSE e.hp_roll END + CASE WHEN d.constitution >= 10 THEN (d.constitution - 10) / 2 ELSE (d.constitution - 11) / 2 END)), 0) AS base_hit_points FROM character c JOIN dnd_character d ON d.character_id=c.id LEFT JOIN character_level_entry e ON e.character_id = c.id LEFT JOIN character_class cc ON cc.id = e.character_class_id LEFT JOIN lib_class cl ON cl.id = cc.class_id GROUP BY c.id;

CREATE VIEW character_hit_point_summary AS SELECT b.character_id, b.base_hit_points, b.base_hit_points + COALESCE((SELECT SUM(CASE h.bonus_kind WHEN 'flat' THEN h.amount WHEN 'per_character_level' THEN h.amount * cs.total_level ELSE h.amount * cc.level END) FROM character_hit_point_bonus h LEFT JOIN character_class cc ON cc.id = h.target_character_class_id WHERE h.character_id = b.character_id), 0) AS modeled_max_hit_points FROM character_hp_base b JOIN character_summary cs ON cs.id = b.character_id;

CREATE VIEW character_weapon_proficiency AS SELECT DISTINCT t.character_id, w.item_id FROM character_weapon_training t JOIN lib_weapon_definition w ON (t.weapon_item_id = w.item_id OR (t.weapon_item_id IS NULL AND t.category = w.category AND (t.weapon_range IS NULL OR t.weapon_range = w.weapon_range))) WHERE NOT EXISTS (SELECT 1 FROM character_weapon_training_property p JOIN lib_weapon_property_link wp ON wp.property_id = p.property_id AND wp.item_id = w.item_id WHERE p.training_id = t.id AND p.predicate = 'exclude') AND (NOT EXISTS (SELECT 1 FROM character_weapon_training_property p WHERE p.training_id = t.id AND p.predicate = 'require_any') OR EXISTS (SELECT 1 FROM character_weapon_training_property p JOIN lib_weapon_property_link wp ON wp.property_id = p.property_id AND wp.item_id = w.item_id WHERE p.training_id = t.id AND p.predicate = 'require_any'));


INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(1,'0001_initial.sql','29de688ea9cb9cb9e50605cc8c9fc9cca7571df04578827ed80b94e331ae20b9');

-- A sessão passa a representar uma família de access/refresh tokens opacos.
-- Sessões antigas exigem novo login: não possuem refresh token seguro para migrar.
UPDATE session
SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

ALTER TABLE session ADD COLUMN access_expires_at TEXT
    CHECK (revoked_at IS NOT NULL OR access_expires_at IS NOT NULL);

CREATE TABLE refresh_token (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    parent_token_id INTEGER UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    UNIQUE (session_id, id),
    FOREIGN KEY (session_id, parent_token_id)
        REFERENCES refresh_token(session_id, id) ON DELETE NO ACTION,
    CHECK (parent_token_id IS NULL OR parent_token_id != id),
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) STRICT;

CREATE UNIQUE INDEX uq_refresh_root ON refresh_token(session_id)
    WHERE parent_token_id IS NULL;
CREATE UNIQUE INDEX uq_refresh_unconsumed ON refresh_token(session_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_refresh_expiry ON refresh_token(expires_at);


INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(2,'0002_refresh_tokens.sql','4926168700bff7645f2e698a50b851700237e4a21d7bd86234acc40b340f78c1');

-- Publicação depende de e-mail confirmado e conta ativa; preservar as fichas privadas.
UPDATE character SET is_public=0
WHERE owner_id IN (SELECT id FROM app_user WHERE email_verified_at IS NULL OR is_active=0);
ALTER TABLE character ADD COLUMN publication_blocked_at TEXT;

-- Tokens legados não foram vinculados ao e-mail de emissão: solicitar novos.
DELETE FROM auth_token;
ALTER TABLE auth_token ADD COLUMN issued_email_hash TEXT
    CHECK (issued_email_hash IS NOT NULL AND length(issued_email_hash)=64);
ALTER TABLE auth_token ADD COLUMN revoked_at TEXT;
CREATE UNIQUE INDEX uq_auth_pending ON auth_token(user_id,purpose)
    WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE login_throttle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL CHECK (scope IN ('email','network')),
    key_hash TEXT NOT NULL CHECK (length(key_hash)=64),
    window_started_at TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    blocked_until TEXT,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scope,key_hash),
    CHECK (expires_at > window_started_at)
) STRICT;
CREATE INDEX idx_login_throttle_expiry ON login_throttle(expires_at);


INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(3,'0003_account_policies.sql','145b2c13121d82c0e70cdf3d8e5deb392a53976576d0e6ca0f8f8c25598a092e');

-- Opções explícitas escolhidas dentro da origem já vinculada ao personagem.
CREATE TABLE character_choice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  grant_id INTEGER NOT NULL,
  choice_id TEXT NOT NULL CHECK (length(trim(choice_id)) BETWEEN 1 AND 200),
  option_id TEXT NOT NULL CHECK (length(trim(option_id)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE,
  UNIQUE (grant_id, choice_id, option_id)
) STRICT;
CREATE INDEX idx_character_choice_character ON character_choice(character_id, grant_id);

INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(4,'0004_character_choices.sql','69fc704aebe487df2ad3c462ae73f2d7db79e2b709dc885cdde8215272b29a8f');

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

INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(5,'0005_nested_spell_choices.sql','ad394de5760ac56634034894203c50b6689b0e3a51d62d2d51588e6f81d20723');

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

INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(6,'0006_structured_effects.sql','1c83edda929542e4cbcd94f18c1f819ecab327f84770018a4baf9d56c8b57950');

PRAGMA user_version=6;

COMMIT;
