BEGIN;
ALTER TABLE public.suits_team ADD COLUMN designation text CHECK (designation IS NULL OR designation='advisor');

CREATE OR REPLACE FUNCTION public.suits_team_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.email IS DISTINCT FROM OLD.email THEN
  RAISE EXCEPTION 'Account identity cannot be changed from a profile';
 END IF;
 IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.proposal_role IS DISTINCT FROM OLD.proposal_role
 OR NEW.designation IS DISTINCT FROM OLD.designation) AND NOT public.suits_is_lead() THEN
  RAISE EXCEPTION 'Only the team owner can change access, subteams or designations';
 END IF;
 IF lower(OLD.email)='kcyle@terpmail.umd.edu' AND NEW.role <> 'lead' THEN
  RAISE EXCEPTION 'The team owner must retain lead access';
 END IF;
 IF NEW.avatar_seed IS NOT NULL THEN
  NEW.avatar_url := 'https://api.dicebear.com/10.x/bottts-neutral/svg?seed=' || NEW.avatar_seed;
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.suits_join() RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u auth.users%ROWTYPE; result public.suits_team; person_name text; advisor boolean; preapproved boolean;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR u.email_confirmed_at IS NULL OR NOT(coalesce(u.email,'') ~* '@(terpmail\.)?umd\.edu$') THEN
  RAISE EXCEPTION 'Sign in with a verified UMD account';
 END IF;
 -- This exact verified address was preapproved by the team owner.
 advisor:=lower(u.email)='zwicker@umd.edu';
 preapproved:=public.suits_is_lead() OR advisor;
 person_name:=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1));
 INSERT INTO public.suits_membership_requests(user_id,email,display_name,status,reviewed_at)
 VALUES(u.id,u.email,person_name,CASE WHEN preapproved THEN 'approved' ELSE 'pending' END,
 CASE WHEN preapproved THEN now() ELSE NULL END) ON CONFLICT(user_id) DO NOTHING;
 -- A later rejection remains effective, including for the preapproved advisor.
 IF NOT public.suits_is_approved() THEN RETURN NULL; END IF;
 INSERT INTO public.suits_team(user_id,email,display_name,avatar_url,role,designation)
 VALUES(u.id,u.email,person_name,coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
 CASE WHEN preapproved THEN 'lead' ELSE 'member' END,CASE WHEN advisor THEN 'advisor' ELSE NULL END)
 ON CONFLICT(user_id) DO UPDATE SET last_seen=now() RETURNING * INTO result;
 RETURN result;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
