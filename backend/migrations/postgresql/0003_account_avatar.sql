ALTER TABLE app_user ADD COLUMN avatar TEXT CHECK (length(avatar) <= 65536);
