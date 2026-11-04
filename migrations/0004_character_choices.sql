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
