ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS attended_kickoff text,
  ADD COLUMN IF NOT EXISTS member_over_year text;
