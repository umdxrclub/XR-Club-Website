-- NASA SUITS 2026–2027 team application.
-- Applicants submit without an account; board/admin review in /suits/dashboard.

CREATE TABLE public.suits_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'interview', 'accepted', 'rejected')),

  -- About you
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  year TEXT NOT NULL,
  majors TEXT NOT NULL,
  minors TEXT,
  organizations TEXT NOT NULL,

  -- Your work
  resume_path TEXT,
  portfolio_url TEXT,

  -- Short answers
  bring_to_table TEXT NOT NULL,
  why_join TEXT NOT NULL,
  teamwork_story TEXT NOT NULL,
  team_environment TEXT NOT NULL,

  -- Interests
  interest_areas TEXT[] NOT NULL DEFAULT '{}',
  interest_other TEXT,

  -- Availability and eligibility
  hours_per_week TEXT NOT NULL,
  availability_changes TEXT NOT NULL,
  required_dates TEXT NOT NULL,
  us_citizen_or_pr TEXT NOT NULL,
  interview_slots TEXT[] NOT NULL DEFAULT '{}',  -- e.g. 2026-09-18 14:00 (Eastern)
  anything_else TEXT,

  -- Review
  reviewer_notes TEXT
);

CREATE INDEX suits_applications_created_at_idx ON public.suits_applications (created_at DESC);
CREATE INDEX suits_applications_status_idx ON public.suits_applications (status);

ALTER TABLE public.suits_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit; only the board can see, review, or remove submissions.
CREATE POLICY "Anyone can submit a SUITS application" ON public.suits_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Board can view SUITS applications" ON public.suits_applications
  FOR SELECT USING (public.is_board_or_admin());

CREATE POLICY "Board can update SUITS applications" ON public.suits_applications
  FOR UPDATE USING (public.is_board_or_admin()) WITH CHECK (public.is_board_or_admin());

CREATE POLICY "Board can delete SUITS applications" ON public.suits_applications
  FOR DELETE USING (public.is_board_or_admin());

-- Resumes: private bucket, PDF only, 10 MB cap. Files live under a random
-- per-submission folder so nothing can be guessed or overwritten.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('suits-resumes', 'suits-resumes', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload a SUITS resume" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'suits-resumes');

CREATE POLICY "Board can read SUITS resumes" ON storage.objects
  FOR SELECT USING (bucket_id = 'suits-resumes' AND public.is_board_or_admin());

CREATE POLICY "Board can delete SUITS resumes" ON storage.objects
  FOR DELETE USING (bucket_id = 'suits-resumes' AND public.is_board_or_admin());
