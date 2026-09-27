BEGIN;

CREATE TABLE public.suits_membership_requests (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 email text NOT NULL, display_name text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz, reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.suits_membership_requests ENABLE ROW LEVEL SECURITY;
-- Existing members retain access. Subsequent sign-ins never approve themselves.
INSERT INTO public.suits_membership_requests(user_id,email,display_name,status,reviewed_at)
 SELECT user_id,email,display_name,'approved',now() FROM public.suits_team;

CREATE OR REPLACE FUNCTION public.suits_is_lead() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()
 AND lower(email)='kcyle@terpmail.umd.edu' AND email_confirmed_at IS NOT NULL);
$$;
CREATE FUNCTION public.suits_is_approved() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
 AND u.email_confirmed_at IS NOT NULL AND u.email ~* '@(terpmail\.)?umd\.edu$'
 AND (lower(u.email)='kcyle@terpmail.umd.edu' OR EXISTS(
 SELECT 1 FROM public.suits_membership_requests r WHERE r.user_id=u.id AND r.status='approved')));
$$;
-- Keep the established policy helper, now requiring membership as well as a UMD account.
CREATE OR REPLACE FUNCTION public.suits_is_team_email() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT public.suits_is_approved(); $$;
CREATE OR REPLACE FUNCTION public.suits_is_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.suits_is_approved() AND (public.suits_is_lead() OR EXISTS(
 SELECT 1 FROM public.suits_team WHERE user_id=auth.uid() AND role IN ('lead','product_manager')));
$$;
CREATE POLICY "Read own request or owner inbox" ON public.suits_membership_requests
 FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.suits_is_lead());
GRANT SELECT ON public.suits_membership_requests TO authenticated;
GRANT ALL ON public.suits_membership_requests TO service_role;

CREATE OR REPLACE FUNCTION public.suits_join() RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u auth.users%ROWTYPE; result public.suits_team; person_name text;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR u.email_confirmed_at IS NULL OR NOT(coalesce(u.email,'') ~* '@(terpmail\.)?umd\.edu$') THEN
  RAISE EXCEPTION 'Sign in with a verified UMD account';
 END IF;
 person_name:=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1));
 INSERT INTO public.suits_membership_requests(user_id,email,display_name,status,reviewed_at)
 VALUES(u.id,u.email,person_name,CASE WHEN public.suits_is_lead() THEN 'approved' ELSE 'pending' END,
 CASE WHEN public.suits_is_lead() THEN now() ELSE NULL END) ON CONFLICT(user_id) DO NOTHING;
 IF NOT public.suits_is_approved() THEN RETURN NULL; END IF;
 INSERT INTO public.suits_team(user_id,email,display_name,avatar_url,role)
 VALUES(u.id,u.email,person_name,coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
 CASE WHEN public.suits_is_lead() THEN 'lead' ELSE 'member' END)
 ON CONFLICT(user_id) DO UPDATE SET last_seen=now() RETURNING * INTO result;
 RETURN result;
END;
$$;

CREATE FUNCTION public.suits_review_membership(target uuid, decision text, subteam text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u auth.users%ROWTYPE; requested public.suits_membership_requests;
BEGIN
 IF NOT public.suits_is_lead() THEN RAISE EXCEPTION 'Only the team owner can approve or reject access'; END IF;
 IF decision IS NULL OR decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
 IF subteam IS NOT NULL AND subteam NOT IN ('technical','uiux','aiml','hitl','pm','engagement') THEN RAISE EXCEPTION 'Choose a valid subteam'; END IF;
 SELECT * INTO requested FROM public.suits_membership_requests WHERE user_id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=target;
 IF lower(u.email)='kcyle@terpmail.umd.edu' THEN RAISE EXCEPTION 'Owner access cannot be changed'; END IF;
 IF decision='approved' AND (u.email_confirmed_at IS NULL OR NOT(coalesce(u.email,'') ~* '@(terpmail\.)?umd\.edu$')) THEN RAISE EXCEPTION 'A verified UMD account is required'; END IF;
 UPDATE public.suits_membership_requests SET status=decision,reviewed_at=now(),reviewed_by=auth.uid() WHERE user_id=target;
 IF decision='approved' THEN
  INSERT INTO public.suits_team(user_id,email,display_name,role,proposal_role)
  VALUES(target,u.email,requested.display_name,'member',subteam)
  ON CONFLICT(user_id) DO UPDATE SET proposal_role=coalesce(EXCLUDED.proposal_role,public.suits_team.proposal_role);
 ELSE
  UPDATE public.suits_calendar_notifications SET status='cancelled',locked_until=NULL,lease_token=NULL
   WHERE recipient_id=target AND status IN ('pending','processing');
 END IF;
END;
$$;

-- Every existing workspace policy remains in force, with approval as an additional requirement.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['suits_team','suits_role_choices','suits_polls','suits_poll_availability','suits_meetings',
 'suits_meeting_rsvps','suits_tasks','suits_announcements','suits_links','suits_checklist','suits_documents',
 'suits_settings','suits_discord_channels','suits_calendar_notifications'] LOOP
  EXECUTE format('CREATE POLICY "Approved workspace members only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.suits_is_approved()) WITH CHECK (public.suits_is_approved())',t);
 END LOOP;
END $$;
CREATE POLICY "Approved SUITS document access" ON storage.objects AS RESTRICTIVE
 FOR ALL USING(bucket_id <> 'suits-docs' OR public.suits_is_approved())
 WITH CHECK(bucket_id <> 'suits-docs' OR public.suits_is_approved());
-- Pending/rejected people do not appear in the active roster.
DROP POLICY "Team can view the team" ON public.suits_team;
-- The roster predicate must not depend on the caller's request-inbox RLS.
CREATE FUNCTION public.suits_member_is_approved(member_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.suits_is_approved() AND EXISTS(SELECT 1 FROM public.suits_membership_requests WHERE user_id=member_id AND status='approved');
$$;
CREATE POLICY "Approved roster" ON public.suits_team FOR SELECT TO authenticated USING(public.suits_member_is_approved(user_id));

CREATE FUNCTION public.suits_can_manage_subteam(team text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.suits_is_approved() AND (public.suits_is_manager() OR
 (team IN ('technical','uiux','aiml','hitl','pm','engagement') AND EXISTS(
 SELECT 1 FROM public.suits_team WHERE user_id=auth.uid() AND proposal_role=team)));
$$;
CREATE TABLE public.suits_subteam_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subteam text NOT NULL CHECK(subteam IN ('technical','uiux','aiml','hitl','pm','engagement')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60), description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 created_by uuid REFERENCES public.suits_team(user_id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suits_subteam_role_name ON public.suits_subteam_roles(subteam,lower(btrim(name)));
CREATE TABLE public.suits_subteam_role_members (
 role_id uuid REFERENCES public.suits_subteam_roles(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
 PRIMARY KEY(role_id,user_id)
);
ALTER TABLE public.suits_subteam_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suits_subteam_role_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved members read working roles" ON public.suits_subteam_roles FOR SELECT TO authenticated USING(public.suits_is_approved());
CREATE POLICY "Subteams create working roles" ON public.suits_subteam_roles FOR INSERT TO authenticated WITH CHECK(public.suits_can_manage_subteam(subteam) AND created_by=auth.uid());
CREATE POLICY "Subteams edit working roles" ON public.suits_subteam_roles FOR UPDATE TO authenticated USING(public.suits_can_manage_subteam(subteam)) WITH CHECK(public.suits_can_manage_subteam(subteam));
CREATE POLICY "Subteams remove working roles" ON public.suits_subteam_roles FOR DELETE TO authenticated USING(public.suits_can_manage_subteam(subteam));
CREATE POLICY "Approved members read role assignments" ON public.suits_subteam_role_members FOR SELECT TO authenticated USING(public.suits_is_approved());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.suits_subteam_roles TO authenticated;
GRANT SELECT ON public.suits_subteam_role_members TO authenticated;
GRANT ALL ON public.suits_subteam_roles,public.suits_subteam_role_members TO service_role;

CREATE FUNCTION public.suits_assign_working_role(target_role uuid, people uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE team text;
BEGIN
 SELECT subteam INTO team FROM public.suits_subteam_roles WHERE id=target_role FOR UPDATE;
 IF team IS NULL OR NOT public.suits_can_manage_subteam(team) THEN RAISE EXCEPTION 'You can manage working roles only in your subteam'; END IF;
 IF people IS NULL OR cardinality(people)>100 THEN RAISE EXCEPTION 'Choose the people for this role'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(people) p WHERE NOT EXISTS(SELECT 1 FROM public.suits_team t
  JOIN public.suits_membership_requests r ON r.user_id=t.user_id AND r.status='approved'
  WHERE t.user_id=p AND t.proposal_role=team)) THEN RAISE EXCEPTION 'Choose approved people in this subteam'; END IF;
 DELETE FROM public.suits_subteam_role_members WHERE role_id=target_role;
 INSERT INTO public.suits_subteam_role_members(role_id,user_id) SELECT target_role,p FROM (SELECT DISTINCT unnest(people) p) ids;
END;
$$;
ALTER TABLE public.suits_tasks ADD COLUMN responsibility_id uuid REFERENCES public.suits_subteam_roles(id) ON DELETE SET NULL;
CREATE INDEX suits_tasks_responsibility ON public.suits_tasks(responsibility_id);
DROP POLICY "Managers create tasks" ON public.suits_tasks;
DROP POLICY "Managers and assignees update tasks" ON public.suits_tasks;
DROP POLICY "Managers delete tasks" ON public.suits_tasks;
CREATE POLICY "Subteams create tasks" ON public.suits_tasks FOR INSERT TO authenticated WITH CHECK(public.suits_can_manage_subteam(section) AND created_by=auth.uid());
CREATE POLICY "Subteams and assignees update tasks" ON public.suits_tasks FOR UPDATE TO authenticated
 USING(public.suits_can_manage_subteam(section) OR assignee_id=auth.uid())
 WITH CHECK(public.suits_can_manage_subteam(section) OR assignee_id=auth.uid());
CREATE POLICY "Subteams remove tasks" ON public.suits_tasks FOR DELETE TO authenticated USING(public.suits_can_manage_subteam(section));

CREATE FUNCTION public.suits_work_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF NOT public.suits_is_approved() THEN RAISE EXCEPTION 'Team approval is required'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'Work identity cannot be changed'; END IF;
  IF TG_TABLE_NAME='suits_subteam_roles' THEN
   IF TG_OP='UPDATE' AND NEW.subteam<>OLD.subteam THEN RAISE EXCEPTION 'A working role stays in its subteam'; END IF;
  ELSIF TG_OP='UPDATE' AND NOT public.suits_can_manage_subteam(OLD.section) THEN
   IF OLD.assignee_id IS DISTINCT FROM auth.uid() OR (to_jsonb(NEW)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at']) THEN
    RAISE EXCEPTION 'You may change only the status of tasks assigned to you';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='suits_tasks' THEN
  IF NEW.responsibility_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suits_subteam_roles WHERE id=NEW.responsibility_id AND subteam=NEW.section) THEN RAISE EXCEPTION 'Choose a working role in this task subteam'; END IF;
  IF TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.section IS DISTINCT FROM OLD.section THEN
   IF NEW.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suits_team t JOIN public.suits_membership_requests r ON r.user_id=t.user_id
    WHERE t.user_id=NEW.assignee_id AND r.status='approved' AND (NEW.section='team' OR t.proposal_role=NEW.section)) THEN RAISE EXCEPTION 'Choose an approved teammate in this subteam'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;
$$;
CREATE TRIGGER suits_work_guard BEFORE INSERT OR UPDATE ON public.suits_tasks FOR EACH ROW EXECUTE FUNCTION public.suits_work_guard();
CREATE TRIGGER suits_work_guard BEFORE INSERT OR UPDATE ON public.suits_subteam_roles FOR EACH ROW EXECUTE FUNCTION public.suits_work_guard();

-- Revoking access does not delete the person's past work; their role assignments are cleared.
CREATE FUNCTION public.suits_clear_working_roles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='suits_membership_requests' THEN
  IF NEW.status<>'approved' THEN DELETE FROM public.suits_subteam_role_members WHERE user_id=NEW.user_id; END IF;
 ELSE
  DELETE FROM public.suits_subteam_role_members rm USING public.suits_subteam_roles r
   WHERE rm.role_id=r.id AND rm.user_id=NEW.user_id AND r.subteam IS DISTINCT FROM NEW.proposal_role;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER suits_clear_working_roles AFTER UPDATE OF status ON public.suits_membership_requests FOR EACH ROW EXECUTE FUNCTION public.suits_clear_working_roles();
CREATE TRIGGER suits_clear_working_roles AFTER UPDATE OF proposal_role ON public.suits_team FOR EACH ROW EXECUTE FUNCTION public.suits_clear_working_roles();
REVOKE ALL ON FUNCTION public.suits_review_membership(uuid,text,text),public.suits_assign_working_role(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suits_review_membership(uuid,text,text),public.suits_assign_working_role(uuid,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.suits_work_guard(),public.suits_clear_working_roles() FROM PUBLIC,anon,authenticated;
COMMIT;
