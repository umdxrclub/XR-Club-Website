-- Google Drive workspace for the SUITS team dashboard.
-- Shared settings (team folder, proposal document) and a link on each task.

CREATE TABLE public.suits_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suits_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view settings" ON public.suits_settings
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers create settings" ON public.suits_settings
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers update settings" ON public.suits_settings
  FOR UPDATE USING (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers delete settings" ON public.suits_settings
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

ALTER TABLE public.suits_tasks ADD COLUMN link TEXT;
