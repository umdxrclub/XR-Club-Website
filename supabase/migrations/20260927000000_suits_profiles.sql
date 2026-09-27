BEGIN;
ALTER TABLE public.suits_team ADD COLUMN avatar_seed text,
 ADD COLUMN avatar_color text NOT NULL DEFAULT 'blue', ADD COLUMN avatar_set_at timestamptz;
ALTER TABLE public.suits_team ADD CONSTRAINT suits_avatar_seed_valid CHECK (avatar_seed IS NULL OR avatar_seed ~ '^[a-zA-Z0-9_-]{1,64}$'),
 ADD CONSTRAINT suits_avatar_color_valid CHECK (avatar_color IN ('blue','orange','violet','mint'));

-- Identity comes from Auth, never a client-editable profile field or metadata.
CREATE OR REPLACE FUNCTION public.suits_is_lead() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM auth.users u JOIN public.suits_team t ON t.user_id=u.id
 WHERE u.id=auth.uid() AND lower(u.email)='kcyle@terpmail.umd.edu' AND t.role='lead');
$$;

CREATE OR REPLACE FUNCTION public.suits_team_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.email IS DISTINCT FROM OLD.email THEN
  RAISE EXCEPTION 'Account identity cannot be changed from a profile';
 END IF;
 IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.proposal_role IS DISTINCT FROM OLD.proposal_role)
 AND NOT public.suits_is_lead() THEN
  RAISE EXCEPTION 'Only the team owner can change access or subteams';
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

CREATE OR REPLACE FUNCTION public.suits_set_role(target uuid,new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.suits_is_lead() THEN RAISE EXCEPTION 'Only the team owner can change roles'; END IF;
 IF new_role NOT IN ('member','product_manager','lead') THEN RAISE EXCEPTION 'Unknown role'; END IF;
 UPDATE public.suits_team SET role=new_role WHERE user_id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.suits_join() RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u auth.users%ROWTYPE; result public.suits_team;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR NOT (coalesce(u.email,'') ~* '@(terpmail\.)?umd\.edu$') THEN
  RAISE EXCEPTION 'Only UMD accounts can join the team dashboard';
 END IF;
 INSERT INTO public.suits_team(user_id,email,display_name,avatar_url,role)
 VALUES(u.id,u.email,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1)),
 coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
 CASE WHEN lower(u.email)='kcyle@terpmail.umd.edu' THEN 'lead' ELSE 'member' END)
 ON CONFLICT(user_id) DO UPDATE SET last_seen=now()
 RETURNING * INTO result;
 RETURN result;
END;
$$;

CREATE FUNCTION public.suits_save_avatar(seed text,color text) RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.suits_team;
BEGIN
 IF auth.uid() IS NULL OR NOT public.suits_is_team_email() THEN RAISE EXCEPTION 'Sign in to save your avatar'; END IF;
 IF seed IS NULL OR seed !~ '^[a-zA-Z0-9_-]{1,64}$' OR color IS NULL OR color NOT IN ('blue','orange','violet','mint') THEN
  RAISE EXCEPTION 'Choose a valid avatar';
 END IF;
 UPDATE public.suits_team SET avatar_seed=seed,avatar_color=color,avatar_set_at=now() WHERE user_id=auth.uid() RETURNING * INTO result;
 IF result.user_id IS NULL THEN RAISE EXCEPTION 'Join the team first'; END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION public.suits_protect_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF lower(OLD.email)='kcyle@terpmail.umd.edu' THEN RAISE EXCEPTION 'The team owner cannot be removed'; END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER suits_protect_owner BEFORE DELETE ON public.suits_team FOR EACH ROW EXECUTE FUNCTION public.suits_protect_owner();
REVOKE ALL ON FUNCTION public.suits_save_avatar(text,text), public.suits_set_role(uuid,text), public.suits_join() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suits_save_avatar(text,text), public.suits_set_role(uuid,text), public.suits_join() TO authenticated;
REVOKE ALL ON FUNCTION public.suits_protect_owner(), public.suits_team_guard() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.suits_manage_member(target uuid,new_role text,new_subteam text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.suits_is_lead() THEN RAISE EXCEPTION 'Only the team owner can manage members'; END IF;
 IF new_role IS NULL OR new_role NOT IN ('member','product_manager','lead') OR
 (new_subteam IS NOT NULL AND new_subteam NOT IN ('technical','uiux','aiml','hitl','pm','engagement')) THEN
  RAISE EXCEPTION 'Choose a valid role and subteam';
 END IF;
 UPDATE public.suits_team SET role=new_role,proposal_role=new_subteam WHERE user_id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_manage_member(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suits_manage_member(uuid,text,text) TO authenticated;
COMMIT;
