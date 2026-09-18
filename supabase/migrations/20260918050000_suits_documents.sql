-- Team documents: any file or link, filed under a proposal role (or the whole
-- team), mirrored to the club's Google Drive by the suits-drive function.

CREATE TABLE public.suits_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'link')),
  url TEXT,
  storage_path TEXT,
  mime TEXT,
  size BIGINT,
  role TEXT NOT NULL DEFAULT 'team',
  notes TEXT,
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drive_file_id TEXT,
  drive_url TEXT,
  drive_status TEXT NOT NULL DEFAULT 'pending',
  drive_error TEXT
);

CREATE INDEX suits_documents_role_idx ON public.suits_documents (role);

ALTER TABLE public.suits_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view documents" ON public.suits_documents
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Team adds documents" ON public.suits_documents
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND created_by = auth.uid());
CREATE POLICY "Owner or managers edit documents" ON public.suits_documents
  FOR UPDATE USING (public.suits_is_team_email() AND (created_by = auth.uid() OR public.suits_is_manager()));
CREATE POLICY "Owner or managers remove documents" ON public.suits_documents
  FOR DELETE USING (public.suits_is_team_email() AND (created_by = auth.uid() OR public.suits_is_manager()));

-- Uploads go under uploads/ in the private bucket
CREATE POLICY "Team uploads suits docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'suits-docs' AND public.suits_is_team_email() AND name LIKE 'uploads/%');
CREATE POLICY "Uploader or managers remove suits docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'suits-docs' AND public.suits_is_team_email() AND name LIKE 'uploads/%' AND (owner = auth.uid() OR public.suits_is_manager()));
