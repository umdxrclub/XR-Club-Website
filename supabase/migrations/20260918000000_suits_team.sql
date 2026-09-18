-- NASA SUITS team dashboard (/suits/team).
-- Sign in with Google; only umd.edu and terpmail.umd.edu accounts are team
-- accounts. Every table below is limited to those accounts, and anything that
-- organizes the team (polls, meetings, tasks, announcements, links) can only be
-- created by a product manager or the team lead.

-- ---------------------------------------------------------------------------
-- Who counts as the team
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suits_is_team_email()
RETURNS BOOLEAN AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') ~* '@(terpmail\.)?umd\.edu$';
$$ LANGUAGE sql STABLE;

CREATE TABLE public.suits_team (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'product_manager', 'lead')),
  discord_username TEXT,
  discord_id TEXT,
  discord_avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.suits_role()
RETURNS TEXT AS $$
  SELECT coalesce((SELECT role FROM public.suits_team WHERE user_id = auth.uid()), 'member');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.suits_is_lead()
RETURNS BOOLEAN AS $$
  SELECT public.suits_role() = 'lead' OR public.is_board_or_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.suits_is_manager()
RETURNS BOOLEAN AS $$
  SELECT public.suits_role() IN ('product_manager', 'lead') OR public.is_board_or_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Called after sign in. Creates or refreshes the caller's team row. The first
-- person to join (or any club board member) becomes the lead.
CREATE OR REPLACE FUNCTION public.suits_join()
RETURNS public.suits_team AS $$
DECLARE
  u auth.users%ROWTYPE;
  name TEXT;
  avatar TEXT;
  new_role TEXT := 'member';
  row public.suits_team;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR NOT (coalesce(u.email, '') ~* '@(terpmail\.)?umd\.edu$') THEN
    RAISE EXCEPTION 'Only UMD accounts can join the team dashboard';
  END IF;

  name := coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1));
  avatar := coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture');

  IF public.is_board_or_admin() OR NOT EXISTS (SELECT 1 FROM public.suits_team WHERE role = 'lead') THEN
    new_role := 'lead';
  END IF;

  INSERT INTO public.suits_team (user_id, email, display_name, avatar_url, role)
  VALUES (u.id, u.email, name, avatar, new_role)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = CASE WHEN public.suits_team.display_name = split_part(public.suits_team.email, '@', 1) THEN EXCLUDED.display_name ELSE public.suits_team.display_name END,
        avatar_url = coalesce(EXCLUDED.avatar_url, public.suits_team.avatar_url),
        role = CASE WHEN public.suits_team.role = 'member' AND EXCLUDED.role = 'lead' THEN 'lead' ELSE public.suits_team.role END,
        last_seen = NOW()
  RETURNING * INTO row;
  RETURN row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lead only: change someone's role.
CREATE OR REPLACE FUNCTION public.suits_set_role(target UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.suits_is_lead() THEN
    RAISE EXCEPTION 'Only the team lead can change roles';
  END IF;
  IF new_role NOT IN ('member', 'product_manager', 'lead') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  UPDATE public.suits_team SET role = new_role WHERE user_id = target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Members may edit their own profile fields, never their own role.
CREATE OR REPLACE FUNCTION public.suits_team_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.suits_is_lead() THEN
    RAISE EXCEPTION 'Only the team lead can change roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suits_team_guard BEFORE UPDATE ON public.suits_team
  FOR EACH ROW EXECUTE FUNCTION public.suits_team_guard();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.suits_role_choices (
  user_id UUID PRIMARY KEY REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
  first_choice TEXT NOT NULL,
  second_choice TEXT,
  third_choice TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.suits_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  days DATE[] NOT NULL,
  start_hour INTEGER NOT NULL DEFAULT 9,
  end_hour INTEGER NOT NULL DEFAULT 22,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.suits_poll_availability (
  poll_id UUID REFERENCES public.suits_polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
  slots TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE public.suits_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  agenda TEXT,
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.suits_meeting_rsvps (
  meeting_id UUID REFERENCES public.suits_meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('yes', 'no', 'maybe')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE TABLE public.suits_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT,
  section TEXT NOT NULL,
  assignee_id UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.suits_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_to_discord BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.suits_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  note TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proposal checklist: one row per required component, shared by the team.
CREATE TABLE public.suits_checklist (
  item_key TEXT PRIMARY KEY,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_by UUID REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
  done_at TIMESTAMPTZ
);

CREATE INDEX suits_meetings_starts_idx ON public.suits_meetings (starts_at);
CREATE INDEX suits_tasks_section_idx ON public.suits_tasks (section);
CREATE INDEX suits_tasks_assignee_idx ON public.suits_tasks (assignee_id);

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
ALTER TABLE public.suits_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_role_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_poll_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_meeting_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_checklist ENABLE ROW LEVEL SECURITY;

-- Team directory
CREATE POLICY "Team can view the team" ON public.suits_team
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Members edit their own profile" ON public.suits_team
  FOR UPDATE USING (public.suits_is_team_email() AND (user_id = auth.uid() OR public.suits_is_lead()))
  WITH CHECK (public.suits_is_team_email() AND (user_id = auth.uid() OR public.suits_is_lead()));
CREATE POLICY "Lead can remove members" ON public.suits_team
  FOR DELETE USING (public.suits_is_lead());

-- Role choices
CREATE POLICY "Team can view role choices" ON public.suits_role_choices
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Members submit their own role choices" ON public.suits_role_choices
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND user_id = auth.uid());
CREATE POLICY "Members update their own role choices" ON public.suits_role_choices
  FOR UPDATE USING (public.suits_is_team_email() AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Availability polls
CREATE POLICY "Team can view polls" ON public.suits_polls
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers create polls" ON public.suits_polls
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers update polls" ON public.suits_polls
  FOR UPDATE USING (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers delete polls" ON public.suits_polls
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

CREATE POLICY "Team can view availability" ON public.suits_poll_availability
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Members set their own availability" ON public.suits_poll_availability
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND user_id = auth.uid());
CREATE POLICY "Members update their own availability" ON public.suits_poll_availability
  FOR UPDATE USING (public.suits_is_team_email() AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members clear their own availability" ON public.suits_poll_availability
  FOR DELETE USING (public.suits_is_team_email() AND user_id = auth.uid());

-- Meetings
CREATE POLICY "Team can view meetings" ON public.suits_meetings
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers create meetings" ON public.suits_meetings
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers update meetings" ON public.suits_meetings
  FOR UPDATE USING (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers delete meetings" ON public.suits_meetings
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

CREATE POLICY "Team can view rsvps" ON public.suits_meeting_rsvps
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Members rsvp for themselves" ON public.suits_meeting_rsvps
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND user_id = auth.uid());
CREATE POLICY "Members change their own rsvp" ON public.suits_meeting_rsvps
  FOR UPDATE USING (public.suits_is_team_email() AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Tasks
CREATE POLICY "Team can view tasks" ON public.suits_tasks
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers create tasks" ON public.suits_tasks
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers and assignees update tasks" ON public.suits_tasks
  FOR UPDATE USING (public.suits_is_team_email() AND (public.suits_is_manager() OR assignee_id = auth.uid()));
CREATE POLICY "Managers delete tasks" ON public.suits_tasks
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

-- Announcements
CREATE POLICY "Team can view announcements" ON public.suits_announcements
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers post announcements" ON public.suits_announcements
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers remove announcements" ON public.suits_announcements
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

-- Workspace links
CREATE POLICY "Team can view links" ON public.suits_links
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Managers add links" ON public.suits_links
  FOR INSERT WITH CHECK (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers update links" ON public.suits_links
  FOR UPDATE USING (public.suits_is_team_email() AND public.suits_is_manager());
CREATE POLICY "Managers remove links" ON public.suits_links
  FOR DELETE USING (public.suits_is_team_email() AND public.suits_is_manager());

-- Checklist: the whole team can tick items
CREATE POLICY "Team can view the checklist" ON public.suits_checklist
  FOR SELECT USING (public.suits_is_team_email());
CREATE POLICY "Team can add checklist rows" ON public.suits_checklist
  FOR INSERT WITH CHECK (public.suits_is_team_email());
CREATE POLICY "Team can update checklist rows" ON public.suits_checklist
  FOR UPDATE USING (public.suits_is_team_email());
