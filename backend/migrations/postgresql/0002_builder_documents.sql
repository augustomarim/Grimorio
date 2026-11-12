CREATE TABLE builder_document (
  id UUID PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX builder_document_owner ON builder_document(owner_id, updated_at DESC);
