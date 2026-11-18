ALTER TABLE app_user
  ADD COLUMN moderation_message TEXT,
  ADD COLUMN moderation_appeal TEXT,
  ADD COLUMN deactivated_at TIMESTAMPTZ,
  ADD COLUMN deactivated_by TEXT CHECK (deactivated_by IN ('admin','owner'));

UPDATE app_user SET deactivated_at=clock_timestamp(),deactivated_by='admin' WHERE is_active=0;

CREATE INDEX app_user_deactivation_expiry ON app_user(deactivated_at) WHERE is_active=0;

ALTER TABLE builder_document
  ADD COLUMN moderation_message TEXT,
  ADD COLUMN moderation_appeal TEXT;
