# Dicionário de dados

Definições físicas por coluna; constraints adicionais reproduzidas de schema.sql. Datas em UTC; booleanos 0/1; níveis pertencem às classes.

## app_user

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| email | `email TEXT NOT NULL COLLATE NOCASE UNIQUE` |
| username | `username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(username) BETWEEN 3 AND 32)` |
| password_hash | `password_hash TEXT NOT NULL` |
| role | `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'))` |
| is_active | `is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))` |
| email_verified_at | `email_verified_at TEXT` |
| last_login_at | `last_login_at TEXT` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| updated_at | `updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## session

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| user_id | `user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE` |
| token_hash | `token_hash TEXT NOT NULL UNIQUE` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| expires_at | `expires_at TEXT NOT NULL` |
| revoked_at | `revoked_at TEXT` |
| ip_address | `ip_address TEXT` |
| user_agent | `user_agent TEXT` |
| access_expires_at | `access_expires_at TEXT CHECK (revoked_at IS NOT NULL OR access_expires_at IS NOT NULL)` |


## auth_token

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| user_id | `user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE` |
| purpose | `purpose TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verification'))` |
| token_hash | `token_hash TEXT NOT NULL UNIQUE` |
| expires_at | `expires_at TEXT NOT NULL` |
| used_at | `used_at TEXT` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| issued_email_hash | `issued_email_hash TEXT CHECK (issued_email_hash IS NOT NULL AND length(issued_email_hash)=64)` |
| revoked_at | `revoked_at TEXT` |


## audit_log

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| actor_user_id | `actor_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL` |
| action | `action TEXT NOT NULL` |
| entity_type | `entity_type TEXT NOT NULL` |
| entity_id | `entity_id INTEGER` |
| details | `details TEXT CHECK (details IS NULL OR json_valid(details))` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## ruleset_revision

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| revision | `revision TEXT NOT NULL UNIQUE` |
| library_version | `library_version TEXT NOT NULL` |
| loaded_at | `loaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## lib_species

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| setting | `setting TEXT` |
| creature_type | `creature_type TEXT` |
| speed | `speed INTEGER CHECK (speed >= 0)` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'species' CHECK (catalog_kind = 'species')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_class

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| hit_die | `hit_die INTEGER CHECK (hit_die IN (6,8,10,12))` |
| is_spellcaster | `is_spellcaster INTEGER NOT NULL DEFAULT 0 CHECK (is_spellcaster IN (0,1))` |
| subclass_level | `subclass_level INTEGER NOT NULL CHECK (subclass_level BETWEEN 1 AND 20)` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'class' CHECK (catalog_kind = 'class')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_subclass

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| class_id | `class_id INTEGER NOT NULL REFERENCES lib_class(id) ON DELETE RESTRICT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'subclass' CHECK (catalog_kind = 'subclass')` |

- `UNIQUE (class_id, id)`
- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_background

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| setting | `setting TEXT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'background' CHECK (catalog_kind = 'background')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_fighting_style

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'fighting_style' CHECK (catalog_kind = 'fighting_style')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_spell

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| level | `level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 9)` |
| school | `school TEXT NOT NULL CHECK (school IN ('Abjuration','Conjuration','Divination','Enchantment','Evocation','Illusion','Necromancy','Transmutation'))` |
| is_concentration | `is_concentration INTEGER NOT NULL DEFAULT 0 CHECK (is_concentration IN (0,1))` |
| is_ritual | `is_ritual INTEGER NOT NULL DEFAULT 0 CHECK (is_ritual IN (0,1))` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'spell' CHECK (catalog_kind = 'spell')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_feat

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| category | `category TEXT` |
| setting | `setting TEXT` |
| is_repeatable | `is_repeatable INTEGER NOT NULL DEFAULT 0 CHECK (is_repeatable IN (0,1))` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'feat' CHECK (catalog_kind = 'feat')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_item

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| kind | `kind TEXT NOT NULL CHECK (kind IN ('gear','weapon','armor','tool','mount','poison','potion','scroll','wondrous','ring','rod','staff','wand'))` |
| rarity | `rarity TEXT CHECK (rarity IN ('common','uncommon','rare','very rare','legendary','artifact','varies'))` |
| is_magic | `is_magic INTEGER NOT NULL DEFAULT 0 CHECK (is_magic IN (0,1))` |
| cost_cp | `cost_cp INTEGER CHECK (cost_cp >= 0)` |
| weight | `weight REAL CHECK (weight >= 0)` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'item' CHECK (catalog_kind = 'item')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_tool_group

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'tool_group' CHECK (catalog_kind = 'tool_group')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_tool

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| group_id | `group_id INTEGER NOT NULL REFERENCES lib_tool_group(id) ON DELETE RESTRICT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'tool' CHECK (catalog_kind = 'tool')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_language

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| tier | `tier TEXT NOT NULL CHECK (tier IN ('common','rare'))` |
| origin | `origin TEXT` |
| is_always | `is_always INTEGER NOT NULL DEFAULT 0 CHECK (is_always IN (0,1))` |
| note | `note TEXT` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'language' CHECK (catalog_kind = 'language')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_alignment

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| abbr | `abbr TEXT NOT NULL` |
| order_axis | `order_axis TEXT NOT NULL` |
| morality_axis | `morality_axis TEXT NOT NULL` |
| body | `body TEXT` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'alignment' CHECK (catalog_kind = 'alignment')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_rule

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| category | `category TEXT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'rule' CHECK (catalog_kind = 'rule')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_link

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| link_key | `link_key TEXT NOT NULL UNIQUE` |
| from_type | `from_type TEXT NOT NULL` |
| from_slug | `from_slug TEXT NOT NULL` |
| kind | `kind TEXT NOT NULL` |
| to_type | `to_type TEXT NOT NULL` |
| to_slug | `to_slug TEXT NOT NULL` |


## character

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| owner_id | `owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT` |
| system_id | `system_id INTEGER NOT NULL REFERENCES rpg_system(id) ON DELETE RESTRICT` |
| name | `name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100)` |
| portrait | `portrait TEXT` |
| is_public | `is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1))` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| updated_at | `updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| publication_blocked_at | `publication_blocked_at TEXT` |

- `UNIQUE (id, system_id)`

## character_class

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| class_id | `class_id INTEGER NOT NULL REFERENCES lib_class(id) ON DELETE RESTRICT` |
| level | `level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 20)` |
| subclass_id | `subclass_id INTEGER` |
| is_initial_class | `is_initial_class INTEGER NOT NULL DEFAULT 0 CHECK (is_initial_class IN (0,1))` |

- `UNIQUE (character_id, class_id)`
- `FOREIGN KEY (class_id, subclass_id) REFERENCES lib_subclass(class_id, id) ON DELETE RESTRICT`
- `UNIQUE (character_id, id)`
- `UNIQUE (character_id, id, subclass_id)`

## character_narrative

| Coluna | Definição SQLite |
|---|---|
| character_id | `character_id INTEGER PRIMARY KEY REFERENCES character(id) ON DELETE CASCADE` |
| backstory | `backstory TEXT` |
| description | `description TEXT` |
| personality | `personality TEXT` |
| motivations | `motivations TEXT` |
| goals | `goals TEXT` |
| updated_at | `updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## character_item

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| lib_item_id | `lib_item_id INTEGER NOT NULL REFERENCES lib_item(id) ON DELETE RESTRICT` |
| quantity | `quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1)` |
| equipped | `equipped INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0,1))` |
| notes | `notes TEXT` |


## character_ability

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| lib_feat_id | `lib_feat_id INTEGER REFERENCES lib_feat(id) ON DELETE RESTRICT` |
| lib_tool_id | `lib_tool_id INTEGER REFERENCES lib_tool(id) ON DELETE RESTRICT` |
| lib_language_id | `lib_language_id INTEGER REFERENCES lib_language(id) ON DELETE RESTRICT` |
| notes | `notes TEXT` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| proficiency_rank | `proficiency_rank INTEGER` |

- `CHECK ((lib_feat_id IS NOT NULL) + (lib_tool_id IS NOT NULL) + (lib_language_id IS NOT NULL) = 1)`
- `UNIQUE (character_id, id, lib_feat_id)`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `CHECK ((lib_tool_id IS NOT NULL AND proficiency_rank IS NOT NULL AND proficiency_rank IN (1,2)) OR (lib_tool_id IS NULL AND proficiency_rank IS NULL))`

## character_spell

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| lib_spell_id | `lib_spell_id INTEGER NOT NULL REFERENCES lib_spell(id) ON DELETE RESTRICT` |
| origin_kind | `origin_kind TEXT NOT NULL CHECK (origin_kind IN ('class','subclass','species','background','feat'))` |
| origin_character_class_id | `origin_character_class_id INTEGER` |
| origin_subclass_id | `origin_subclass_id INTEGER` |
| origin_species_id | `origin_species_id INTEGER` |
| origin_background_id | `origin_background_id INTEGER` |
| origin_character_ability_id | `origin_character_ability_id INTEGER` |
| origin_feat_id | `origin_feat_id INTEGER` |
| preparation_mode | `preparation_mode TEXT NOT NULL CHECK (preparation_mode IN ('cantrip','selectable','always_prepared','granted'))` |
| is_prepared | `is_prepared INTEGER NOT NULL DEFAULT 0 CHECK (is_prepared IN (0,1))` |
| casting_ability_choice | `casting_ability_choice TEXT CHECK (casting_ability_choice IN ('strength','dexterity','constitution','intelligence','wisdom','charisma'))` |
| notes | `notes TEXT` |

- `CHECK ((origin_kind = 'class' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'subclass' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NOT NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'species' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NOT NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'background' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NOT NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'feat' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NOT NULL AND origin_feat_id IS NOT NULL))`
- `CHECK (is_prepared = 0 OR preparation_mode = 'selectable')`
- `FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE`

## character_spellbook_entry

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| character_class_id | `character_class_id INTEGER NOT NULL` |
| lib_spell_id | `lib_spell_id INTEGER NOT NULL REFERENCES lib_spell(id) ON DELETE RESTRICT` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| notes | `notes TEXT` |

- `UNIQUE (character_class_id, lib_spell_id)`
- `FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE`

## character_fighting_style

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| lib_fighting_style_id | `lib_fighting_style_id INTEGER NOT NULL REFERENCES lib_fighting_style(id) ON DELETE RESTRICT` |
| source | `source TEXT NOT NULL DEFAULT 'class' CHECK (source IN ('class','subclass','species','background','feat','manual'))` |
| notes | `notes TEXT` |

- `UNIQUE (character_id, lib_fighting_style_id)`

## lib_skill

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| ability | `ability TEXT NOT NULL CHECK (ability IN ('strength','dexterity','constitution','intelligence','wisdom','charisma'))` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'skill' CHECK (catalog_kind = 'skill')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_weapon_property

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'weapon_property' CHECK (catalog_kind = 'weapon_property')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_weapon_mastery

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| data | `data TEXT NOT NULL CHECK (json_valid(data))` |
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL UNIQUE` |
| catalog_kind | `catalog_kind TEXT NOT NULL DEFAULT 'weapon_mastery' CHECK (catalog_kind = 'weapon_mastery')` |

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE`

## lib_weapon_definition

| Coluna | Definição SQLite |
|---|---|
| item_id | `item_id INTEGER PRIMARY KEY REFERENCES lib_item(id) ON DELETE RESTRICT` |
| category | `category TEXT NOT NULL CHECK (category IN ('Simple','Martial'))` |
| weapon_range | `weapon_range TEXT NOT NULL CHECK (weapon_range IN ('Melee','Ranged'))` |
| mastery_id | `mastery_id INTEGER REFERENCES lib_weapon_mastery(id) ON DELETE RESTRICT` |


## lib_weapon_property_link

| Coluna | Definição SQLite |
|---|---|
| item_id | `item_id INTEGER NOT NULL REFERENCES lib_weapon_definition(item_id) ON DELETE CASCADE` |
| property_id | `property_id INTEGER NOT NULL REFERENCES lib_weapon_property(id) ON DELETE RESTRICT` |

- `PRIMARY KEY (item_id, property_id)`

## character_rule_grant

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| origin_kind | `origin_kind TEXT NOT NULL CHECK (origin_kind IN ('class','subclass','species','background','feat'))` |
| origin_character_class_id | `origin_character_class_id INTEGER` |
| origin_subclass_id | `origin_subclass_id INTEGER` |
| origin_species_id | `origin_species_id INTEGER` |
| origin_background_id | `origin_background_id INTEGER` |
| origin_character_ability_id | `origin_character_ability_id INTEGER` |
| origin_feat_id | `origin_feat_id INTEGER` |
| acquisition_context | `acquisition_context TEXT NOT NULL CHECK (acquisition_context IN ('initial_class','multiclass_entry','class_progression','species','background','feat'))` |
| rule_key | `rule_key TEXT NOT NULL CHECK (length(trim(rule_key)) > 0)` |
| acquired_at_level | `acquired_at_level INTEGER NOT NULL CHECK (acquired_at_level BETWEEN 1 AND 20)` |
| notes | `notes TEXT` |

- `CHECK ((origin_kind = 'class' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'subclass' AND origin_character_class_id IS NOT NULL AND origin_subclass_id IS NOT NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'species' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NOT NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'background' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NOT NULL AND origin_character_ability_id IS NULL AND origin_feat_id IS NULL) OR (origin_kind = 'feat' AND origin_character_class_id IS NULL AND origin_subclass_id IS NULL AND origin_species_id IS NULL AND origin_background_id IS NULL AND origin_character_ability_id IS NOT NULL AND origin_feat_id IS NOT NULL))`
- `FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE`
- `FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE`
- `UNIQUE (character_id, id)`
- `UNIQUE (character_id, rule_key)`
- `CHECK ((origin_kind IN ('class','subclass') AND acquisition_context IN ('initial_class','multiclass_entry','class_progression')) OR (origin_kind IN ('species','background','feat') AND acquisition_context = origin_kind))`
- `CHECK (acquisition_context != 'initial_class' OR (origin_kind = 'class' AND acquired_at_level = 1))`
- `CHECK (acquisition_context != 'multiclass_entry' OR (origin_kind = 'class' AND acquired_at_level > 1))`

## character_skill

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| skill_id | `skill_id INTEGER NOT NULL REFERENCES lib_skill(id) ON DELETE RESTRICT` |
| proficiency_rank | `proficiency_rank INTEGER NOT NULL CHECK (proficiency_rank IN (1,2))` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, skill_id)`

## character_saving_throw

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| ability | `ability TEXT NOT NULL CHECK (ability IN ('strength','dexterity','constitution','intelligence','wisdom','charisma'))` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, ability)`

## character_armor_training

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| armor_kind | `armor_kind TEXT NOT NULL CHECK (armor_kind IN ('Light','Medium','Heavy','Shield'))` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, armor_kind)`

## character_weapon_training

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| clause_key | `clause_key TEXT NOT NULL CHECK (length(trim(clause_key)) > 0)` |
| weapon_item_id | `weapon_item_id INTEGER REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT` |
| category | `category TEXT CHECK (category IN ('Simple','Martial'))` |
| weapon_range | `weapon_range TEXT CHECK (weapon_range IN ('Melee','Ranged'))` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, clause_key)`
- `CHECK ((weapon_item_id IS NOT NULL AND category IS NULL AND weapon_range IS NULL) OR (weapon_item_id IS NULL AND category IS NOT NULL))`

## character_weapon_training_property

| Coluna | Definição SQLite |
|---|---|
| training_id | `training_id INTEGER NOT NULL REFERENCES character_weapon_training(id) ON DELETE CASCADE` |
| property_id | `property_id INTEGER NOT NULL REFERENCES lib_weapon_property(id) ON DELETE RESTRICT` |
| predicate | `predicate TEXT NOT NULL CHECK (predicate IN ('require_any','exclude'))` |

- `PRIMARY KEY (training_id, property_id)`

## character_weapon_mastery

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| weapon_item_id | `weapon_item_id INTEGER NOT NULL REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, weapon_item_id)`

## character_level_entry

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| character_class_id | `character_class_id INTEGER NOT NULL` |
| sequence_no | `sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 1 AND 20)` |
| hp_method | `hp_method TEXT NOT NULL CHECK (hp_method IN ('first_max','average','roll'))` |
| hp_roll | `hp_roll INTEGER CHECK (hp_roll BETWEEN 1 AND 12)` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| notes | `notes TEXT` |

- `UNIQUE (character_id, sequence_no)`
- `CHECK ((hp_method = 'roll' AND hp_roll IS NOT NULL) OR (hp_method IN ('first_max','average') AND hp_roll IS NULL))`
- `FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE`
- `CHECK ((sequence_no = 1 AND hp_method = 'first_max') OR (sequence_no > 1 AND hp_method IN ('average','roll')))`

## character_hit_point_bonus

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| character_id | `character_id INTEGER NOT NULL REFERENCES dnd_character(character_id) ON DELETE CASCADE` |
| grant_id | `grant_id INTEGER NOT NULL` |
| selection_kind | `selection_kind TEXT NOT NULL CHECK (selection_kind IN ('fixed','chosen'))` |
| choice_key | `choice_key TEXT` |
| notes | `notes TEXT` |
| bonus_kind | `bonus_kind TEXT NOT NULL CHECK (bonus_kind IN ('flat','per_character_level','per_class_level'))` |
| amount | `amount INTEGER NOT NULL CHECK (amount != 0)` |
| target_character_class_id | `target_character_class_id INTEGER` |

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE`
- `CHECK ((selection_kind = 'fixed' AND choice_key IS NULL) OR (selection_kind = 'chosen' AND choice_key IS NOT NULL AND length(trim(choice_key)) > 0))`
- `UNIQUE (grant_id, bonus_kind, target_character_class_id)`
- `CHECK ((bonus_kind = 'per_class_level' AND target_character_class_id IS NOT NULL) OR (bonus_kind IN ('flat','per_character_level') AND target_character_class_id IS NULL))`
- `FOREIGN KEY (character_id, target_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE`

## rules_source

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| slug | `slug TEXT NOT NULL UNIQUE` |
| name | `name TEXT NOT NULL` |
| source_type | `source_type TEXT NOT NULL CHECK (source_type IN ('base','supplement'))` |
| edition | `edition TEXT NOT NULL` |
| bibliographic_reference | `bibliographic_reference TEXT` |
| reference_url | `reference_url TEXT` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## catalog_entry

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| kind | `kind TEXT NOT NULL CHECK (kind IN ('species', 'class', 'subclass', 'background', 'fighting_style', 'spell', 'feat', 'item', 'tool_group', 'tool', 'language', 'alignment', 'rule', 'skill', 'weapon_property', 'weapon_mastery'))` |
| slug | `slug TEXT NOT NULL` |
| name | `name TEXT NOT NULL` |
| deprecated_at | `deprecated_at TEXT` |

- `UNIQUE (kind, slug)`
- `UNIQUE (id, kind)`

## catalog_entry_source

| Coluna | Definição SQLite |
|---|---|
| catalog_entry_id | `catalog_entry_id INTEGER NOT NULL REFERENCES catalog_entry(id) ON DELETE CASCADE` |
| source_id | `source_id INTEGER NOT NULL REFERENCES rules_source(id) ON DELETE RESTRICT` |

- `PRIMARY KEY (catalog_entry_id, source_id)`

## rpg_system

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| code | `code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0)` |
| name | `name TEXT NOT NULL` |
| edition | `edition TEXT NOT NULL` |
| is_enabled | `is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1))` |

- `UNIQUE (id, code)`

## dnd_character

| Coluna | Definição SQLite |
|---|---|
| character_id | `character_id INTEGER PRIMARY KEY REFERENCES character(id) ON DELETE CASCADE` |
| system_id | `system_id INTEGER NOT NULL` |
| system_code | `system_code TEXT NOT NULL DEFAULT 'dnd-2024' CHECK (system_code = 'dnd-2024')` |
| strength | `strength INTEGER NOT NULL CHECK (strength BETWEEN 1 AND 30)` |
| dexterity | `dexterity INTEGER NOT NULL CHECK (dexterity BETWEEN 1 AND 30)` |
| constitution | `constitution INTEGER NOT NULL CHECK (constitution BETWEEN 1 AND 30)` |
| intelligence | `intelligence INTEGER NOT NULL CHECK (intelligence BETWEEN 1 AND 30)` |
| wisdom | `wisdom INTEGER NOT NULL CHECK (wisdom BETWEEN 1 AND 30)` |
| charisma | `charisma INTEGER NOT NULL CHECK (charisma BETWEEN 1 AND 30)` |
| species_id | `species_id INTEGER NOT NULL REFERENCES lib_species(id) ON DELETE RESTRICT` |
| background_id | `background_id INTEGER REFERENCES lib_background(id) ON DELETE RESTRICT` |
| alignment_id | `alignment_id INTEGER REFERENCES lib_alignment(id) ON DELETE RESTRICT` |
| ruleset_revision_id | `ruleset_revision_id INTEGER NOT NULL REFERENCES ruleset_revision(id) ON DELETE RESTRICT` |

- `UNIQUE (character_id, species_id)`
- `UNIQUE (character_id, background_id)`
- `FOREIGN KEY (character_id, system_id) REFERENCES character(id, system_id) ON DELETE CASCADE`
- `FOREIGN KEY (system_id, system_code) REFERENCES rpg_system(id, code) ON DELETE RESTRICT`

## schema_migration

| Coluna | Definição SQLite |
|---|---|
| version | `version INTEGER PRIMARY KEY CHECK (version > 0)` |
| name | `name TEXT NOT NULL UNIQUE` |
| checksum_sha256 | `checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64)` |
| applied_at | `applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |


## refresh_token

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| session_id | `session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE` |
| token_hash | `token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64)` |
| parent_token_id | `parent_token_id INTEGER UNIQUE` |
| created_at | `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))` |
| expires_at | `expires_at TEXT NOT NULL` |
| used_at | `used_at TEXT` |
| revoked_at | `revoked_at TEXT` |

- `UNIQUE (session_id, id)`
- `FOREIGN KEY (session_id, parent_token_id) REFERENCES refresh_token(session_id, id) ON DELETE NO ACTION`
- `CHECK (parent_token_id IS NULL OR parent_token_id != id)`
- `CHECK (expires_at > created_at)`
- `CHECK (used_at IS NULL OR used_at >= created_at)`
- `CHECK (revoked_at IS NULL OR revoked_at >= created_at)`

## login_throttle

| Coluna | Definição SQLite |
|---|---|
| id | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| scope | `scope TEXT NOT NULL CHECK (scope IN ('email','network'))` |
| key_hash | `key_hash TEXT NOT NULL CHECK (length(key_hash)=64)` |
| window_started_at | `window_started_at TEXT NOT NULL` |
| failure_count | `failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0)` |
| blocked_until | `blocked_until TEXT` |
| expires_at | `expires_at TEXT NOT NULL` |
| updated_at | `updated_at TEXT NOT NULL` |

- `UNIQUE (scope,key_hash)`
- `CHECK (expires_at > window_started_at)`

## Campo derivado

`character_summary.total_level`: soma de `character_class.level` por personagem; retorna 0 para personagem sem classe. Não é armazenado em character.

## Semântica complementar

character é a identidade comum; dnd_character contém os atributos D&D e é a raiz das FKs mecânicas. As seis views continuam de D&D; a galeria comum não presume nível/atributos. catalog_entry é a origem canônica dos metadados, com relações bibliográficas em catalog_entry_source. As presenças inversas de perfil/detalhe são verificadas no serviço.

publication_blocked_at registra bloqueio de publicação pela administração. Mesmo is_public=1 não autoriza exibição quando há bloqueio, dono inativo ou e-mail não confirmado. Permissões são regras de serviço, não um efeito automático de consultar character.

issued_email_hash de auth_token é obrigatório por CHECK (apesar de a coluna ter sido adicionada sem NOT NULL físico). Vincula a credencial ao e-mail normalizado da emissão. revoked_at invalida sem afirmar que o token foi consumido; used_at é de uso único. O índice parcial uq_auth_pending permite uma geração não usada/não revogada por usuário e propósito.

login_throttle.scope/key_hash identificam um bucket temporário por e-mail ou rede. O serviço usa HMAC e segredo próprio; desconhecidos também têm buckets sem FK a app_user. failure_count não altera is_active. Limites e limpeza são configuráveis, não codificados em CHECKs de negócio.

session é a família, token_hash é o hash do access atual; refresh_token guarda gerações. Raiz e token não consumido são únicos por família por índices parciais do SQL. schema_migration e user_version=3 identificam a cadeia 0001–0003, diferente de revisão da biblioteca e versão de produto.

Requisitos completos estão em contas-permissoes.md, autenticacao-refresh-token.md, sistemas-e-versoes.md e migracoes-backup-restauracao.md. Os protocolos em tests não são backend de produção.

## character_choice (migração 0004)

| Coluna | Definição SQLite |
|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT |
| character_id | INTEGER NOT NULL; parte da FK composta da concessão |
| grant_id | INTEGER NOT NULL; origem já vinculada ao personagem |
| choice_id | TEXT NOT NULL; id ItemChoice, trim não vazio, comprimento 1–200 |
| option_id | TEXT NOT NULL; id ChoiceOption, trim não vazio, comprimento 1–200 |
| created_at | TEXT NOT NULL; UTC gerado por strftime |

Tabela STRICT. FK (character_id,grant_id) → character_rule_grant(character_id,id), ON DELETE CASCADE. UNIQUE (grant_id,choice_id,option_id). Índice (character_id,grant_id). Elegibilidade, nível e orçamento compartilhado entre concessões da mesma origem são conferidos pelo serviço. Não armazena JSON nem copia o texto da regra. Excluir a escolha não exclui magias ou itens registrados separadamente.

## Complemento de character_spell — migração 0005

| Coluna nova | Definição |
|---|---|
| choice_instance_id | INTEGER opcional; junto com character_id referencia character_choice(character_id,id), ON DELETE CASCADE |
| nested_choice_key | TEXT opcional, 1–200 caracteres não vazios; preenchida junto com choice_instance_id |

UNIQUE de apoio em character_choice(character_id,id). Índice character_spell(character_id,choice_instance_id). Magias legadas continuam únicas por origem sob WHERE choice_instance_id IS NULL. Para magias vinculadas, UNIQUE(character_id,choice_instance_id,nested_choice_key,lib_spell_id) WHERE choice_instance_id IS NOT NULL. A associação de origem e critérios do JSON é conferida na aplicação; a FK garante mesmo personagem. A API exige confirmação para excluir uma opção com magias dependentes. Detalhes em magias-escolhas-aninhadas.md.
