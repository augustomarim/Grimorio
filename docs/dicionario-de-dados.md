# Dicionário de dados — PostgreSQL / Neon

Gerado do schema executado em PostgreSQL 17. 51 tabelas e 9 views. IDs usam identity; booleanos do modelo permanecem INTEGER 0/1; datas permanecem TEXT ISO 8601 UTC para preservar o contrato. JSON externo permanece TEXT validado por IS JSON. E-mail e username usam citext.

## app_user

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| email | citext | não | — |
| username | citext | não | — |
| password_hash | text | não | — |
| role | text | não | 'user'::text |
| is_active | integer | não | 1 |
| email_verified_at | text | sim | — |
| last_login_at | text | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| updated_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `UNIQUE (email)`
- `CHECK ((is_active = ANY (ARRAY[0, 1])))`
- `PRIMARY KEY (id)`
- `CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))`
- `CHECK (((length((username)::text) >= 3) AND (length((username)::text) <= 32)))`
- `UNIQUE (username)`

## audit_log

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| actor_user_id | integer | sim | — |
| action | text | não | — |
| entity_type | text | não | — |
| entity_id | integer | sim | — |
| details | text | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `FOREIGN KEY (actor_user_id) REFERENCES app_user(id) ON DELETE SET NULL DEFERRABLE`
- `CHECK (((details IS NULL) OR (details IS JSON)))`
- `PRIMARY KEY (id)`

## auth_token

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| user_id | integer | não | — |
| purpose | text | não | — |
| token_hash | text | não | — |
| expires_at | text | não | — |
| used_at | text | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| issued_email_hash | text | sim | — |
| revoked_at | text | sim | — |

Restrições:

- `CHECK (((issued_email_hash IS NOT NULL) AND (length(issued_email_hash) = 64)))`
- `PRIMARY KEY (id)`
- `CHECK ((purpose = ANY (ARRAY['password_reset'::text, 'email_verification'::text])))`
- `UNIQUE (token_hash)`
- `FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE DEFERRABLE`

## catalog_entry

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| kind | text | não | — |
| slug | text | não | — |
| name | text | não | — |
| deprecated_at | text | sim | — |

Restrições:

- `UNIQUE (id, kind)`
- `CHECK ((kind = ANY (ARRAY['species'::text, 'class'::text, 'subclass'::text, 'background'::text, 'fighting_style'::text, 'spell'::text, 'feat'::text, 'item'::text, 'tool_group'::text, 'tool'::text, 'language'::text, 'alignment'::text, 'rule'::text, 'skill'::text, 'weapon_property'::text, 'weapon_mastery'::text])))`
- `UNIQUE (kind, slug)`
- `PRIMARY KEY (id)`

## catalog_entry_source

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| catalog_entry_id | integer | não | — |
| source_id | integer | não | — |

Restrições:

- `FOREIGN KEY (catalog_entry_id) REFERENCES catalog_entry(id) ON DELETE CASCADE DEFERRABLE`
- `PRIMARY KEY (catalog_entry_id, source_id)`
- `FOREIGN KEY (source_id) REFERENCES rules_source(id) ON DELETE RESTRICT DEFERRABLE`

## character

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| owner_id | integer | não | — |
| system_id | integer | não | — |
| name | text | não | — |
| portrait | text | sim | — |
| is_public | integer | não | 0 |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| updated_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| publication_blocked_at | text | sim | — |

Restrições:

- `UNIQUE (id, system_id)`
- `CHECK ((is_public = ANY (ARRAY[0, 1])))`
- `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100)))`
- `FOREIGN KEY (owner_id) REFERENCES app_user(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (system_id) REFERENCES rpg_system(id) ON DELETE RESTRICT DEFERRABLE`

## character_ability

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| lib_feat_id | integer | sim | — |
| lib_tool_id | integer | sim | — |
| lib_language_id | integer | sim | — |
| notes | text | sim | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| proficiency_rank | integer | sim | — |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, id, lib_feat_id)`
- `CHECK ((((
CASE
    WHEN (lib_feat_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (lib_tool_id IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (lib_language_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1))`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `CHECK ((((lib_tool_id IS NOT NULL) AND (proficiency_rank IS NOT NULL) AND (proficiency_rank = ANY (ARRAY[1, 2]))) OR ((lib_tool_id IS NULL) AND (proficiency_rank IS NULL))))`
- `FOREIGN KEY (lib_feat_id) REFERENCES lib_feat(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (lib_language_id) REFERENCES lib_language(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (lib_tool_id) REFERENCES lib_tool(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`

## character_ability_boost

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| rule_id | text | não | — |
| ability | text | não | — |
| amount | integer | não | — |

Restrições:

- `CHECK ((ability = ANY (ARRAY['strength'::text, 'dexterity'::text, 'constitution'::text, 'intelligence'::text, 'wisdom'::text, 'charisma'::text])))`
- `CHECK (((amount >= 1) AND (amount <= 30)))`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (grant_id, rule_id, ability)`
- `PRIMARY KEY (id)`
- `CHECK (((length(TRIM(BOTH FROM rule_id)) >= 1) AND (length(TRIM(BOTH FROM rule_id)) <= 200)))`

## character_armor_training

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| armor_kind | text | não | — |

Restrições:

- `CHECK ((armor_kind = ANY (ARRAY['Light'::text, 'Medium'::text, 'Heavy'::text, 'Shield'::text])))`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `UNIQUE (grant_id, armor_kind)`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`

## character_choice

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| choice_id | text | não | — |
| option_id | text | não | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK (((length(TRIM(BOTH FROM choice_id)) >= 1) AND (length(TRIM(BOTH FROM choice_id)) <= 200)))`
- `UNIQUE (grant_id, choice_id, option_id)`
- `CHECK (((length(TRIM(BOTH FROM option_id)) >= 1) AND (length(TRIM(BOTH FROM option_id)) <= 200)))`
- `PRIMARY KEY (id)`

## character_class

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| class_id | integer | não | — |
| level | integer | não | — |
| subclass_id | integer | sim | — |
| is_initial_class | integer | não | 0 |

Restrições:

- `UNIQUE (character_id, class_id)`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, id)`
- `UNIQUE (character_id, id, subclass_id)`
- `FOREIGN KEY (class_id) REFERENCES lib_class(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (class_id, subclass_id) REFERENCES lib_subclass(class_id, id) ON DELETE RESTRICT DEFERRABLE`
- `CHECK ((is_initial_class = ANY (ARRAY[0, 1])))`
- `CHECK (((level >= 1) AND (level <= 20)))`
- `PRIMARY KEY (id)`

## character_fighting_style

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| lib_fighting_style_id | integer | não | — |
| source | text | não | 'class'::text |
| notes | text | sim | — |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, lib_fighting_style_id)`
- `FOREIGN KEY (lib_fighting_style_id) REFERENCES lib_fighting_style(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`
- `CHECK ((source = ANY (ARRAY['class'::text, 'subclass'::text, 'species'::text, 'background'::text, 'feat'::text, 'manual'::text])))`

## character_hit_point_bonus

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| bonus_kind | text | não | — |
| amount | integer | não | — |
| target_character_class_id | integer | sim | — |

Restrições:

- `CHECK ((amount <> 0))`
- `CHECK ((bonus_kind = ANY (ARRAY['flat'::text, 'per_character_level'::text, 'per_class_level'::text])))`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, target_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `CHECK ((((bonus_kind = 'per_class_level'::text) AND (target_character_class_id IS NOT NULL)) OR ((bonus_kind = ANY (ARRAY['flat'::text, 'per_character_level'::text])) AND (target_character_class_id IS NULL))))`
- `UNIQUE (grant_id, bonus_kind, target_character_class_id)`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`

## character_item

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| lib_item_id | integer | não | — |
| quantity | integer | não | 1 |
| equipped | integer | não | 0 |
| notes | text | sim | — |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((equipped = ANY (ARRAY[0, 1])))`
- `FOREIGN KEY (lib_item_id) REFERENCES lib_item(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`
- `CHECK ((quantity >= 1))`

## character_level_entry

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| character_class_id | integer | não | — |
| sequence_no | integer | não | — |
| hp_method | text | não | — |
| hp_roll | integer | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| notes | text | sim | — |

Restrições:

- `FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, sequence_no)`
- `CHECK ((((hp_method = 'roll'::text) AND (hp_roll IS NOT NULL)) OR ((hp_method = ANY (ARRAY['first_max'::text, 'average'::text])) AND (hp_roll IS NULL))))`
- `CHECK ((((sequence_no = 1) AND (hp_method = 'first_max'::text)) OR ((sequence_no > 1) AND (hp_method = ANY (ARRAY['average'::text, 'roll'::text])))))`
- `CHECK ((hp_method = ANY (ARRAY['first_max'::text, 'average'::text, 'roll'::text])))`
- `CHECK (((hp_roll >= 1) AND (hp_roll <= 12)))`
- `PRIMARY KEY (id)`
- `CHECK (((sequence_no >= 1) AND (sequence_no <= 20)))`

## character_narrative

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| character_id | integer | não | identity |
| backstory | text | sim | — |
| description | text | sim | — |
| personality | text | sim | — |
| motivations | text | sim | — |
| goals | text | sim | — |
| updated_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES "character"(id) ON DELETE CASCADE DEFERRABLE`
- `PRIMARY KEY (character_id)`

## character_rule_grant

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| origin_kind | text | não | — |
| origin_character_class_id | integer | sim | — |
| origin_subclass_id | integer | sim | — |
| origin_species_id | integer | sim | — |
| origin_background_id | integer | sim | — |
| origin_character_ability_id | integer | sim | — |
| origin_feat_id | integer | sim | — |
| acquisition_context | text | não | — |
| rule_key | text | não | — |
| acquired_at_level | integer | não | — |
| notes | text | sim | — |

Restrições:

- `CHECK (((acquired_at_level >= 1) AND (acquired_at_level <= 20)))`
- `CHECK ((acquisition_context = ANY (ARRAY['initial_class'::text, 'multiclass_entry'::text, 'class_progression'::text, 'species'::text, 'background'::text, 'feat'::text])))`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, id)`
- `FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, rule_key)`
- `CHECK ((((origin_kind = 'class'::text) AND (origin_character_class_id IS NOT NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'subclass'::text) AND (origin_character_class_id IS NOT NULL) AND (origin_subclass_id IS NOT NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'species'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NOT NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'background'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NOT NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'feat'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NOT NULL) AND (origin_feat_id IS NOT NULL))))`
- `CHECK ((((origin_kind = ANY (ARRAY['class'::text, 'subclass'::text])) AND (acquisition_context = ANY (ARRAY['initial_class'::text, 'multiclass_entry'::text, 'class_progression'::text]))) OR ((origin_kind = ANY (ARRAY['species'::text, 'background'::text, 'feat'::text])) AND (acquisition_context = origin_kind))))`
- `CHECK (((acquisition_context <> 'initial_class'::text) OR ((origin_kind = 'class'::text) AND (acquired_at_level = 1))))`
- `CHECK (((acquisition_context <> 'multiclass_entry'::text) OR ((origin_kind = 'class'::text) AND (acquired_at_level > 1))))`
- `CHECK ((origin_kind = ANY (ARRAY['class'::text, 'subclass'::text, 'species'::text, 'background'::text, 'feat'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((length(TRIM(BOTH FROM rule_key)) > 0))`

## character_saving_throw

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| ability | text | não | — |

Restrições:

- `CHECK ((ability = ANY (ARRAY['strength'::text, 'dexterity'::text, 'constitution'::text, 'intelligence'::text, 'wisdom'::text, 'charisma'::text])))`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `UNIQUE (grant_id, ability)`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`

## character_skill

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| skill_id | integer | não | — |
| proficiency_rank | integer | não | — |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `UNIQUE (grant_id, skill_id)`
- `PRIMARY KEY (id)`
- `CHECK ((proficiency_rank = ANY (ARRAY[1, 2])))`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`
- `FOREIGN KEY (skill_id) REFERENCES lib_skill(id) ON DELETE RESTRICT DEFERRABLE`

## character_spell

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| lib_spell_id | integer | não | — |
| origin_kind | text | não | — |
| origin_character_class_id | integer | sim | — |
| origin_subclass_id | integer | sim | — |
| origin_species_id | integer | sim | — |
| origin_background_id | integer | sim | — |
| origin_character_ability_id | integer | sim | — |
| origin_feat_id | integer | sim | — |
| preparation_mode | text | não | — |
| is_prepared | integer | não | 0 |
| casting_ability_choice | text | sim | — |
| notes | text | sim | — |
| choice_instance_id | integer | sim | — |
| nested_choice_key | text | sim | — |

Restrições:

- `CHECK ((casting_ability_choice = ANY (ARRAY['strength'::text, 'dexterity'::text, 'constitution'::text, 'intelligence'::text, 'wisdom'::text, 'charisma'::text])))`
- `FOREIGN KEY (character_id, choice_instance_id) REFERENCES character_choice(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_background_id) REFERENCES dnd_character(character_id, background_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_ability_id, origin_feat_id) REFERENCES character_ability(character_id, id, lib_feat_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_character_class_id, origin_subclass_id) REFERENCES character_class(character_id, id, subclass_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, origin_species_id) REFERENCES dnd_character(character_id, species_id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((choice_instance_id IS NULL) AND (nested_choice_key IS NULL)) OR ((choice_instance_id IS NOT NULL) AND (nested_choice_key IS NOT NULL) AND ((length(TRIM(BOTH FROM nested_choice_key)) >= 1) AND (length(TRIM(BOTH FROM nested_choice_key)) <= 200)))))`
- `CHECK ((((origin_kind = 'class'::text) AND (origin_character_class_id IS NOT NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'subclass'::text) AND (origin_character_class_id IS NOT NULL) AND (origin_subclass_id IS NOT NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'species'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NOT NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'background'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NOT NULL) AND (origin_character_ability_id IS NULL) AND (origin_feat_id IS NULL)) OR ((origin_kind = 'feat'::text) AND (origin_character_class_id IS NULL) AND (origin_subclass_id IS NULL) AND (origin_species_id IS NULL) AND (origin_background_id IS NULL) AND (origin_character_ability_id IS NOT NULL) AND (origin_feat_id IS NOT NULL))))`
- `CHECK (((is_prepared = 0) OR (preparation_mode = 'selectable'::text)))`
- `CHECK ((is_prepared = ANY (ARRAY[0, 1])))`
- `FOREIGN KEY (lib_spell_id) REFERENCES lib_spell(id) ON DELETE RESTRICT DEFERRABLE`
- `CHECK ((origin_kind = ANY (ARRAY['class'::text, 'subclass'::text, 'species'::text, 'background'::text, 'feat'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((preparation_mode = ANY (ARRAY['cantrip'::text, 'selectable'::text, 'always_prepared'::text, 'granted'::text])))`

## character_spellbook_entry

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| character_class_id | integer | não | — |
| lib_spell_id | integer | não | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| notes | text | sim | — |

Restrições:

- `UNIQUE (character_class_id, lib_spell_id)`
- `FOREIGN KEY (character_id, character_class_id) REFERENCES character_class(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (lib_spell_id) REFERENCES lib_spell(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`

## character_weapon_mastery

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| weapon_item_id | integer | não | — |

Restrições:

- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `UNIQUE (grant_id, weapon_item_id)`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`
- `FOREIGN KEY (weapon_item_id) REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT DEFERRABLE`

## character_weapon_training

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| character_id | integer | não | — |
| grant_id | integer | não | — |
| selection_kind | text | não | — |
| choice_key | text | sim | — |
| notes | text | sim | — |
| clause_key | text | não | — |
| weapon_item_id | integer | sim | — |
| category | text | sim | — |
| weapon_range | text | sim | — |

Restrições:

- `CHECK ((category = ANY (ARRAY['Simple'::text, 'Martial'::text])))`
- `FOREIGN KEY (character_id) REFERENCES dnd_character(character_id) ON DELETE CASCADE DEFERRABLE`
- `FOREIGN KEY (character_id, grant_id) REFERENCES character_rule_grant(character_id, id) ON DELETE CASCADE DEFERRABLE`
- `CHECK ((((selection_kind = 'fixed'::text) AND (choice_key IS NULL)) OR ((selection_kind = 'chosen'::text) AND (choice_key IS NOT NULL) AND (length(TRIM(BOTH FROM choice_key)) > 0))))`
- `CHECK ((((weapon_item_id IS NOT NULL) AND (category IS NULL) AND (weapon_range IS NULL)) OR ((weapon_item_id IS NULL) AND (category IS NOT NULL))))`
- `CHECK ((length(TRIM(BOTH FROM clause_key)) > 0))`
- `UNIQUE (grant_id, clause_key)`
- `PRIMARY KEY (id)`
- `CHECK ((selection_kind = ANY (ARRAY['fixed'::text, 'chosen'::text])))`
- `FOREIGN KEY (weapon_item_id) REFERENCES lib_weapon_definition(item_id) ON DELETE RESTRICT DEFERRABLE`
- `CHECK ((weapon_range = ANY (ARRAY['Melee'::text, 'Ranged'::text])))`

## character_weapon_training_property

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| training_id | integer | não | — |
| property_id | integer | não | — |
| predicate | text | não | — |

Restrições:

- `PRIMARY KEY (training_id, property_id)`
- `CHECK ((predicate = ANY (ARRAY['require_any'::text, 'exclude'::text])))`
- `FOREIGN KEY (property_id) REFERENCES lib_weapon_property(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (training_id) REFERENCES character_weapon_training(id) ON DELETE CASCADE DEFERRABLE`

## dnd_character

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| character_id | integer | não | identity |
| system_id | integer | não | — |
| system_code | text | não | 'dnd-2024'::text |
| strength | integer | não | — |
| dexterity | integer | não | — |
| constitution | integer | não | — |
| intelligence | integer | não | — |
| wisdom | integer | não | — |
| charisma | integer | não | — |
| species_id | integer | não | — |
| background_id | integer | sim | — |
| alignment_id | integer | sim | — |
| ruleset_revision_id | integer | não | — |
| campaign_setting | text | sim | — |

Restrições:

- `FOREIGN KEY (alignment_id) REFERENCES lib_alignment(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (background_id) REFERENCES lib_background(id) ON DELETE RESTRICT DEFERRABLE`
- `CHECK (((campaign_setting IS NULL) OR ((length(TRIM(BOTH FROM campaign_setting)) >= 1) AND (length(TRIM(BOTH FROM campaign_setting)) <= 100))))`
- `UNIQUE (character_id, background_id)`
- `FOREIGN KEY (character_id) REFERENCES "character"(id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (character_id, species_id)`
- `FOREIGN KEY (character_id, system_id) REFERENCES "character"(id, system_id) ON DELETE CASCADE DEFERRABLE`
- `CHECK (((charisma >= 1) AND (charisma <= 30)))`
- `CHECK (((constitution >= 1) AND (constitution <= 30)))`
- `CHECK (((dexterity >= 1) AND (dexterity <= 30)))`
- `CHECK (((intelligence >= 1) AND (intelligence <= 30)))`
- `PRIMARY KEY (character_id)`
- `FOREIGN KEY (ruleset_revision_id) REFERENCES ruleset_revision(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (species_id) REFERENCES lib_species(id) ON DELETE RESTRICT DEFERRABLE`
- `CHECK (((strength >= 1) AND (strength <= 30)))`
- `CHECK ((system_code = 'dnd-2024'::text))`
- `FOREIGN KEY (system_id, system_code) REFERENCES rpg_system(id, code) ON DELETE RESTRICT DEFERRABLE`
- `CHECK (((wisdom >= 1) AND (wisdom <= 30)))`

## lib_alignment

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| abbr | text | não | — |
| order_axis | text | não | — |
| morality_axis | text | não | — |
| body | text | sim | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'alignment'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'alignment'::text))`
- `PRIMARY KEY (id)`

## lib_background

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| setting | text | sim | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'background'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'background'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_class

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| hit_die | integer | sim | — |
| is_spellcaster | integer | não | 0 |
| subclass_level | integer | não | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'class'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'class'::text))`
- `CHECK ((data IS JSON))`
- `CHECK ((hit_die = ANY (ARRAY[6, 8, 10, 12])))`
- `CHECK ((is_spellcaster = ANY (ARRAY[0, 1])))`
- `PRIMARY KEY (id)`
- `CHECK (((subclass_level >= 1) AND (subclass_level <= 20)))`

## lib_feat

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| category | text | sim | — |
| setting | text | sim | — |
| is_repeatable | integer | não | 0 |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'feat'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'feat'::text))`
- `CHECK ((data IS JSON))`
- `CHECK ((is_repeatable = ANY (ARRAY[0, 1])))`
- `PRIMARY KEY (id)`

## lib_fighting_style

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'fighting_style'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'fighting_style'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_item

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| kind | text | não | — |
| rarity | text | sim | — |
| is_magic | integer | não | 0 |
| cost_cp | integer | sim | — |
| weight | real | sim | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'item'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'item'::text))`
- `CHECK ((cost_cp >= 0))`
- `CHECK ((data IS JSON))`
- `CHECK ((is_magic = ANY (ARRAY[0, 1])))`
- `CHECK ((kind = ANY (ARRAY['gear'::text, 'weapon'::text, 'armor'::text, 'tool'::text, 'mount'::text, 'poison'::text, 'potion'::text, 'scroll'::text, 'wondrous'::text, 'ring'::text, 'rod'::text, 'staff'::text, 'wand'::text])))`
- `PRIMARY KEY (id)`
- `CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'very rare'::text, 'legendary'::text, 'artifact'::text, 'varies'::text])))`
- `CHECK ((weight >= (0)::double precision))`

## lib_language

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| tier | text | não | — |
| origin | text | sim | — |
| is_always | integer | não | 0 |
| note | text | sim | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'language'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'language'::text))`
- `CHECK ((is_always = ANY (ARRAY[0, 1])))`
- `PRIMARY KEY (id)`
- `CHECK ((tier = ANY (ARRAY['common'::text, 'rare'::text])))`

## lib_link

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| link_key | text | não | — |
| from_type | text | não | — |
| from_slug | text | não | — |
| kind | text | não | — |
| to_type | text | não | — |
| to_slug | text | não | — |

Restrições:

- `UNIQUE (link_key)`
- `PRIMARY KEY (id)`

## lib_rule

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| category | text | sim | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'rule'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'rule'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_skill

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| ability | text | não | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'skill'::text |

Restrições:

- `CHECK ((ability = ANY (ARRAY['strength'::text, 'dexterity'::text, 'constitution'::text, 'intelligence'::text, 'wisdom'::text, 'charisma'::text])))`
- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'skill'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_species

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| setting | text | sim | — |
| creature_type | text | sim | — |
| speed | integer | sim | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'species'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'species'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`
- `CHECK ((speed >= 0))`

## lib_spell

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| level | integer | não | — |
| school | text | não | — |
| is_concentration | integer | não | 0 |
| is_ritual | integer | não | 0 |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'spell'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'spell'::text))`
- `CHECK ((data IS JSON))`
- `CHECK ((is_concentration = ANY (ARRAY[0, 1])))`
- `CHECK ((is_ritual = ANY (ARRAY[0, 1])))`
- `CHECK (((level >= 0) AND (level <= 9)))`
- `PRIMARY KEY (id)`
- `CHECK ((school = ANY (ARRAY['Abjuration'::text, 'Conjuration'::text, 'Divination'::text, 'Enchantment'::text, 'Evocation'::text, 'Illusion'::text, 'Necromancy'::text, 'Transmutation'::text])))`

## lib_subclass

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| class_id | integer | não | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'subclass'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'subclass'::text))`
- `FOREIGN KEY (class_id) REFERENCES lib_class(id) ON DELETE RESTRICT DEFERRABLE`
- `UNIQUE (class_id, id)`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_tool

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| group_id | integer | não | — |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'tool'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'tool'::text))`
- `CHECK ((data IS JSON))`
- `FOREIGN KEY (group_id) REFERENCES lib_tool_group(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (id)`

## lib_tool_group

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'tool_group'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'tool_group'::text))`
- `PRIMARY KEY (id)`

## lib_weapon_definition

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| item_id | integer | não | identity |
| category | text | não | — |
| weapon_range | text | não | — |
| mastery_id | integer | sim | — |

Restrições:

- `CHECK ((category = ANY (ARRAY['Simple'::text, 'Martial'::text])))`
- `FOREIGN KEY (item_id) REFERENCES lib_item(id) ON DELETE RESTRICT DEFERRABLE`
- `FOREIGN KEY (mastery_id) REFERENCES lib_weapon_mastery(id) ON DELETE RESTRICT DEFERRABLE`
- `PRIMARY KEY (item_id)`
- `CHECK ((weapon_range = ANY (ARRAY['Melee'::text, 'Ranged'::text])))`

## lib_weapon_mastery

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'weapon_mastery'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'weapon_mastery'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_weapon_property

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| data | text | não | — |
| catalog_entry_id | integer | não | — |
| catalog_kind | text | não | 'weapon_property'::text |

Restrições:

- `FOREIGN KEY (catalog_entry_id, catalog_kind) REFERENCES catalog_entry(id, kind) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (catalog_entry_id)`
- `CHECK ((catalog_kind = 'weapon_property'::text))`
- `CHECK ((data IS JSON))`
- `PRIMARY KEY (id)`

## lib_weapon_property_link

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| item_id | integer | não | — |
| property_id | integer | não | — |

Restrições:

- `FOREIGN KEY (item_id) REFERENCES lib_weapon_definition(item_id) ON DELETE CASCADE DEFERRABLE`
- `PRIMARY KEY (item_id, property_id)`
- `FOREIGN KEY (property_id) REFERENCES lib_weapon_property(id) ON DELETE RESTRICT DEFERRABLE`

## login_throttle

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| scope | text | não | — |
| key_hash | text | não | — |
| window_started_at | text | não | — |
| failure_count | integer | não | 0 |
| blocked_until | text | sim | — |
| expires_at | text | não | — |
| updated_at | text | não | — |

Restrições:

- `CHECK ((expires_at > window_started_at))`
- `CHECK ((failure_count >= 0))`
- `CHECK ((length(key_hash) = 64))`
- `PRIMARY KEY (id)`
- `CHECK ((scope = ANY (ARRAY['email'::text, 'network'::text])))`
- `UNIQUE (scope, key_hash)`

## refresh_token

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| session_id | integer | não | — |
| token_hash | text | não | — |
| parent_token_id | integer | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| expires_at | text | não | — |
| used_at | text | sim | — |
| revoked_at | text | sim | — |

Restrições:

- `CHECK (((parent_token_id IS NULL) OR (parent_token_id <> id)))`
- `CHECK ((expires_at > created_at))`
- `CHECK (((used_at IS NULL) OR (used_at >= created_at)))`
- `CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))`
- `UNIQUE (parent_token_id)`
- `PRIMARY KEY (id)`
- `FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE DEFERRABLE`
- `UNIQUE (session_id, id)`
- `FOREIGN KEY (session_id, parent_token_id) REFERENCES refresh_token(session_id, id) DEFERRABLE`
- `CHECK ((length(token_hash) = 64))`
- `UNIQUE (token_hash)`

## rpg_system

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| code | text | não | — |
| name | text | não | — |
| edition | text | não | — |
| is_enabled | integer | não | 0 |

Restrições:

- `CHECK ((length(TRIM(BOTH FROM code)) > 0))`
- `UNIQUE (code)`
- `UNIQUE (id, code)`
- `CHECK ((is_enabled = ANY (ARRAY[0, 1])))`
- `PRIMARY KEY (id)`

## rules_source

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| slug | text | não | — |
| name | text | não | — |
| source_type | text | não | — |
| edition | text | não | — |
| bibliographic_reference | text | sim | — |
| reference_url | text | sim | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `PRIMARY KEY (id)`
- `UNIQUE (slug)`
- `CHECK ((source_type = ANY (ARRAY['base'::text, 'supplement'::text])))`

## ruleset_revision

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| revision | text | não | — |
| library_version | text | não | — |
| loaded_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `PRIMARY KEY (id)`
- `UNIQUE (revision)`

## schema_migration

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| version | integer | não | — |
| name | text | não | — |
| checksum_sha256 | text | não | — |
| applied_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |

Restrições:

- `PRIMARY KEY (version)`

## session

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| id | integer | não | identity |
| user_id | integer | não | — |
| token_hash | text | não | — |
| created_at | text | não | to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) |
| expires_at | text | não | — |
| revoked_at | text | sim | — |
| ip_address | text | sim | — |
| user_agent | text | sim | — |
| access_expires_at | text | sim | — |

Restrições:

- `CHECK (((revoked_at IS NOT NULL) OR (access_expires_at IS NOT NULL)))`
- `PRIMARY KEY (id)`
- `UNIQUE (token_hash)`
- `FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE DEFERRABLE`

## Views

### character_ability_boost_application

```sql
 WITH RECURSIVE seed(character_id, ability, score) AS (
         SELECT dnd_character.character_id,
            'strength'::text AS "?column?",
            dnd_character.strength
           FROM dnd_character
        UNION ALL
         SELECT dnd_character.character_id,
            'dexterity'::text,
            dnd_character.dexterity
           FROM dnd_character
        UNION ALL
         SELECT dnd_character.character_id,
            'constitution'::text,
            dnd_character.constitution
           FROM dnd_character
        UNION ALL
         SELECT dnd_character.character_id,
            'intelligence'::text,
            dnd_character.intelligence
           FROM dnd_character
        UNION ALL
         SELECT dnd_character.character_id,
            'wisdom'::text,
            dnd_character.wisdom
           FROM dnd_character
        UNION ALL
         SELECT dnd_character.character_id,
            'charisma'::text,
            dnd_character.charisma
           FROM dnd_character
        ), ordered AS (
         SELECT b.id,
            b.character_id,
            b.grant_id,
            b.rule_id,
            b.ability,
            b.amount,
            ((j.value ->> 'max'::text))::integer AS cap,
            row_number() OVER (PARTITION BY b.character_id, b.ability ORDER BY g.acquired_at_level, g.id, b.rule_id, b.id) AS sequence_no
           FROM (((character_ability_boost b
             JOIN character_rule_grant g ON (((g.id = b.grant_id) AND (g.character_id = b.character_id))))
             JOIN character_rule_source rs ON ((rs.grant_id = g.id)))
             JOIN LATERAL jsonb_array_elements(((rs.source_data)::jsonb -> 'abilityBoosts'::text)) j(value) ON (((j.value ->> 'id'::text) = b.rule_id)))
          WHERE ((((j.value ->> 'max'::text))::integer >= 1) AND (((j.value ->> 'max'::text))::integer <= 30))
        ), applied(character_id, ability, sequence_no, score, boost_id, applied_points) AS (
         SELECT seed.character_id,
            seed.ability,
            (0)::bigint AS int8,
            seed.score,
            NULL::integer AS int4,
            0 AS "?column?"
           FROM seed
        UNION ALL
         SELECT a.character_id,
            a.ability,
            o.sequence_no,
                CASE
                    WHEN (a.score >= o.cap) THEN a.score
                    ELSE LEAST(o.cap, (a.score + o.amount))
                END AS "least",
            o.id,
                CASE
                    WHEN (a.score >= o.cap) THEN 0
                    ELSE (LEAST(o.cap, (a.score + o.amount)) - a.score)
                END AS "case"
           FROM (applied a
             JOIN ordered o ON (((o.character_id = a.character_id) AND (o.ability = a.ability) AND (o.sequence_no = (a.sequence_no + 1)))))
        )
 SELECT character_id,
    ability,
    sequence_no,
    score,
    boost_id,
    applied_points
   FROM applied;
```

### character_effective_attributes

```sql
 SELECT character_id,
    max(
        CASE
            WHEN (ability = 'strength'::text) THEN score
            ELSE NULL::integer
        END) AS strength,
    max(
        CASE
            WHEN (ability = 'dexterity'::text) THEN score
            ELSE NULL::integer
        END) AS dexterity,
    max(
        CASE
            WHEN (ability = 'constitution'::text) THEN score
            ELSE NULL::integer
        END) AS constitution,
    max(
        CASE
            WHEN (ability = 'intelligence'::text) THEN score
            ELSE NULL::integer
        END) AS intelligence,
    max(
        CASE
            WHEN (ability = 'wisdom'::text) THEN score
            ELSE NULL::integer
        END) AS wisdom,
    max(
        CASE
            WHEN (ability = 'charisma'::text) THEN score
            ELSE NULL::integer
        END) AS charisma
   FROM character_ability_boost_application
  GROUP BY character_id;
```

### character_hit_point_summary

```sql
 SELECT b.character_id,
    b.base_hit_points,
    (((b.base_hit_points)::numeric + COALESCE(( SELECT sum(
                CASE h.bonus_kind
                    WHEN 'flat'::text THEN (h.amount)::bigint
                    WHEN 'per_character_level'::text THEN (h.amount * cs.total_level)
                    ELSE ((h.amount * cc.level))::bigint
                END) AS sum
           FROM (character_hit_point_bonus h
             LEFT JOIN character_class cc ON ((cc.id = h.target_character_class_id)))
          WHERE (h.character_id = b.character_id)), (0)::numeric)))::bigint AS modeled_max_hit_points
   FROM (character_hp_base b
     JOIN character_summary cs ON ((cs.id = b.character_id)));
```

### character_hp_base

```sql
 SELECT c.id AS character_id,
    COALESCE(sum(GREATEST(1, (
        CASE e.hp_method
            WHEN 'first_max'::text THEN cl.hit_die
            WHEN 'average'::text THEN ((cl.hit_die / 2) + 1)
            ELSE e.hp_roll
        END +
        CASE
            WHEN (d.constitution >= 10) THEN ((d.constitution - 10) / 2)
            ELSE ((d.constitution - 11) / 2)
        END))), (0)::bigint) AS base_hit_points
   FROM (((("character" c
     JOIN character_effective_attributes d ON ((d.character_id = c.id)))
     LEFT JOIN character_level_entry e ON ((e.character_id = c.id)))
     LEFT JOIN character_class cc ON ((cc.id = e.character_class_id)))
     LEFT JOIN lib_class cl ON ((cl.id = cc.class_id)))
  GROUP BY c.id;
```

### character_level_history

```sql
 SELECT id,
    character_id,
    character_class_id,
    sequence_no,
    hp_method,
    hp_roll,
    created_at,
    notes,
    row_number() OVER (PARTITION BY character_id, character_class_id ORDER BY sequence_no) AS class_level
   FROM character_level_entry e;
```

### character_rule_source

```sql
 SELECT g.id AS grant_id,
    g.character_id,
        CASE g.origin_kind
            WHEN 'feat'::text THEN (((f.data)::jsonb -> 'effects'::text))::text
            WHEN 'class'::text THEN c.data
            WHEN 'subclass'::text THEN sub.data
            WHEN 'species'::text THEN s.data
            WHEN 'background'::text THEN b.data
            ELSE NULL::text
        END AS source_data
   FROM ((((((character_rule_grant g
     LEFT JOIN character_class cc ON (((cc.id = g.origin_character_class_id) AND (cc.character_id = g.character_id))))
     LEFT JOIN lib_class c ON ((c.id = cc.class_id)))
     LEFT JOIN lib_subclass sub ON ((sub.id = g.origin_subclass_id)))
     LEFT JOIN lib_species s ON ((s.id = g.origin_species_id)))
     LEFT JOIN lib_background b ON ((b.id = g.origin_background_id)))
     LEFT JOIN lib_feat f ON ((f.id = g.origin_feat_id)));
```

### character_skill_summary

```sql
 SELECT character_id,
    skill_id,
    max(proficiency_rank) AS proficiency_rank
   FROM character_skill
  GROUP BY character_id, skill_id;
```

### character_summary

```sql
 SELECT c.id,
    c.owner_id,
    c.system_id,
    c.name,
    c.portrait,
    c.is_public,
    c.created_at,
    c.updated_at,
    c.publication_blocked_at,
    a.strength,
    a.dexterity,
    a.constitution,
    a.intelligence,
    a.wisdom,
    a.charisma,
    d.species_id,
    d.background_id,
    d.alignment_id,
    d.ruleset_revision_id,
    d.campaign_setting,
    COALESCE(( SELECT sum(cc.level) AS sum
           FROM character_class cc
          WHERE (cc.character_id = c.id)), (0)::bigint) AS total_level
   FROM (("character" c
     JOIN dnd_character d ON ((d.character_id = c.id)))
     JOIN character_effective_attributes a ON ((a.character_id = c.id)));
```

### character_weapon_proficiency

```sql
 SELECT DISTINCT t.character_id,
    w.item_id
   FROM (character_weapon_training t
     JOIN lib_weapon_definition w ON (((t.weapon_item_id = w.item_id) OR ((t.weapon_item_id IS NULL) AND (t.category = w.category) AND ((t.weapon_range IS NULL) OR (t.weapon_range = w.weapon_range))))))
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM (character_weapon_training_property p
             JOIN lib_weapon_property_link wp ON (((wp.property_id = p.property_id) AND (wp.item_id = w.item_id))))
          WHERE ((p.training_id = t.id) AND (p.predicate = 'exclude'::text))))) AND ((NOT (EXISTS ( SELECT 1
           FROM character_weapon_training_property p
          WHERE ((p.training_id = t.id) AND (p.predicate = 'require_any'::text))))) OR (EXISTS ( SELECT 1
           FROM (character_weapon_training_property p
             JOIN lib_weapon_property_link wp ON (((wp.property_id = p.property_id) AND (wp.item_id = w.item_id))))
          WHERE ((p.training_id = t.id) AND (p.predicate = 'require_any'::text))))));
```
