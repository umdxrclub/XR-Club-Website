-- Private bucket for the SUITS team's reference documents (past proposals,
-- letters, NASA feedback). Only signed in UMD accounts on the roster can read.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('suits-docs', 'suits-docs', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Team reads suits docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'suits-docs' AND public.suits_is_team_email());
