CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'board', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected')),
  first_name TEXT,
  last_name TEXT,
  umd_email TEXT,
  graduation_year INTEGER,
  major TEXT,
  year_in_school TEXT CHECK (year_in_school IS NULL OR year_in_school IN ('freshman', 'sophomore', 'junior', 'senior', 'graduate')),
  experience_level TEXT CHECK (experience_level IS NULL OR experience_level IN ('none', 'beginner', 'intermediate', 'advanced')),
  interests TEXT[],
  why_join TEXT,
  project_preference TEXT,
  portfolio_url TEXT,
  resume_path TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  target_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_board_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('board', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Board can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_board_or_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own application" ON public.applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own application" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft" ON public.applications
  FOR UPDATE USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Board can view all applications" ON public.applications
  FOR SELECT USING (public.is_board_or_admin());

CREATE POLICY "Board can update any application" ON public.applications
  FOR UPDATE USING (public.is_board_or_admin());

CREATE POLICY "Board can view notes" ON public.admin_notes
  FOR SELECT USING (public.is_board_or_admin());

CREATE POLICY "Board can insert notes" ON public.admin_notes
  FOR INSERT WITH CHECK (public.is_board_or_admin());

CREATE POLICY "Board can delete own notes" ON public.admin_notes
  FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Board can view activity" ON public.activity_log
  FOR SELECT USING (public.is_board_or_admin());

CREATE POLICY "Board can insert activity" ON public.activity_log
  FOR INSERT WITH CHECK (public.is_board_or_admin());

CREATE POLICY "Users upload own resume" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users read own resume" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users update own resume" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Board can read all resumes" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'resumes'
    AND public.is_board_or_admin()
  );

CREATE OR REPLACE FUNCTION public.get_application_stats()
RETURNS TABLE (
  total BIGINT,
  submitted BIGINT,
  under_review BIGINT,
  accepted BIGINT,
  rejected BIGINT
) AS $$
  SELECT
    COUNT(*) FILTER (WHERE status != 'draft') as total,
    COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
    COUNT(*) FILTER (WHERE status = 'under_review') as under_review,
    COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected
  FROM public.applications;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
