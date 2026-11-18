ALTER TABLE builder_document
  ADD COLUMN publication_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT builder_document_blocked_private CHECK (NOT publication_blocked OR NOT is_public);
