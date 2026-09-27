ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS discord_username text;
