BEGIN;
CREATE OR REPLACE FUNCTION public.suits_join() RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u auth.users%ROWTYPE; result public.suits_team; person_name text; advisor boolean; preapproved boolean;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR u.email_confirmed_at IS NULL OR NOT(coalesce(u.email,'') ~* '@(terpmail\.)?umd\.edu$') THEN
  RAISE EXCEPTION 'Sign in with a verified UMD account';
 END IF;
 -- Both exact addresses were approved by the owner for advisor access.
 advisor:=lower(u.email) IN ('zwicker@umd.edu','kcyle@umd.edu');
 preapproved:=public.suits_is_lead() OR advisor;
 person_name:=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1));
 INSERT INTO public.suits_membership_requests(user_id,email,display_name,status,reviewed_at)
 VALUES(u.id,u.email,person_name,CASE WHEN preapproved THEN 'approved' ELSE 'pending' END,
 CASE WHEN preapproved THEN now() ELSE NULL END) ON CONFLICT(user_id) DO NOTHING;
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
