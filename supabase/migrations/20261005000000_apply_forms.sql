-- The funding page (/ideate): project funding pitches and applications to join a team.
-- Anyone can submit; only the board can read, review, or remove them (public.is_board_or_admin()).

CREATE TABLE public.funding_pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'chosen', 'waitlisted', 'declined')),

  -- The project
  project_title TEXT NOT NULL,
  idea TEXT NOT NULL,
  topic TEXT,

  -- The team (3 to 10 people including the lead)
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_discord TEXT NOT NULL,
  members JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The plan
  outline TEXT NOT NULL,
  zero_dollar_plan TEXT NOT NULL,
  timeline TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  lab_equipment TEXT,

  -- The budget: hardware only, each item {name, cost, priority: must|nice, link}
  budget_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  agreed_to_rules BOOLEAN NOT NULL DEFAULT false,

  reviewer_notes TEXT
);

CREATE INDEX funding_pitches_created_at_idx ON public.funding_pitches (created_at DESC);
CREATE INDEX funding_pitches_status_idx ON public.funding_pitches (status);

ALTER TABLE public.funding_pitches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a funding pitch" ON public.funding_pitches
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Board can view funding pitches" ON public.funding_pitches
  FOR SELECT USING (public.is_board_or_admin());
CREATE POLICY "Board can update funding pitches" ON public.funding_pitches
  FOR UPDATE USING (public.is_board_or_admin()) WITH CHECK (public.is_board_or_admin());
CREATE POLICY "Board can delete funding pitches" ON public.funding_pitches
  FOR DELETE USING (public.is_board_or_admin());

CREATE TABLE public.team_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'joined', 'declined')),

  -- Which team: immersive-installations, niantic-spatial, spatial-reality-display
  team TEXT NOT NULL,

  -- About the applicant
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  year TEXT NOT NULL,
  major TEXT NOT NULL,

  -- Their answers
  pitch TEXT NOT NULL,
  tools TEXT[] NOT NULL DEFAULT '{}',
  link TEXT,
  availability TEXT NOT NULL,
  anything_else TEXT,

  reviewer_notes TEXT
);

CREATE INDEX team_applications_created_at_idx ON public.team_applications (created_at DESC);
CREATE INDEX team_applications_team_idx ON public.team_applications (team, status);

ALTER TABLE public.team_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can apply to a team" ON public.team_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Board can view team applications" ON public.team_applications
  FOR SELECT USING (public.is_board_or_admin());
CREATE POLICY "Board can update team applications" ON public.team_applications
  FOR UPDATE USING (public.is_board_or_admin()) WITH CHECK (public.is_board_or_admin());
CREATE POLICY "Board can delete team applications" ON public.team_applications
  FOR DELETE USING (public.is_board_or_admin());
