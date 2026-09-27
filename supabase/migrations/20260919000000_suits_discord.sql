-- Discord for the SUITS team dashboard: linked accounts, the Drive activity
-- snapshot the bot diffs against, and the messages it has posted so it can
-- edit them later.

CREATE UNIQUE INDEX IF NOT EXISTS suits_team_discord_id
  ON public.suits_team (discord_id) WHERE discord_id IS NOT NULL;

-- What the team folder looked like the last time the bot checked. Service role only.
CREATE TABLE IF NOT EXISTS public.suits_drive_snapshot (
  file_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT,
  parent_id TEXT,
  modified_time TIMESTAMPTZ,
  trashed BOOLEAN NOT NULL DEFAULT false,
  url TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suits_drive_snapshot ENABLE ROW LEVEL SECURITY;

-- Messages the bot posted, by what they are about. Service role only.
CREATE TABLE IF NOT EXISTS public.suits_discord_messages (
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);
ALTER TABLE public.suits_discord_messages ENABLE ROW LEVEL SECURITY;

-- The bot's scheduled check runs from the database.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
