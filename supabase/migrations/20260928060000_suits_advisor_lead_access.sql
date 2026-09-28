BEGIN;

-- The preapproved advisor accounts share the owner's lead abilities: applications,
-- membership requests, roles and subteams. Identity comes from the verified Auth
-- record, and a later rejection of the advisor's request removes the access.
CREATE OR REPLACE FUNCTION public.suits_is_advisor_account() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u
 JOIN public.suits_membership_requests r ON r.user_id=u.id AND r.status='approved'
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND lower(u.email) IN ('zwicker@umd.edu','kcyle@umd.edu'));
$$;
REVOKE ALL ON FUNCTION public.suits_is_advisor_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suits_is_advisor_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.suits_is_lead() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()
 AND lower(email)='kcyle@terpmail.umd.edu' AND email_confirmed_at IS NOT NULL)
 OR public.suits_is_advisor_account();
$$;

CREATE OR REPLACE FUNCTION public.suits_can_review_applications() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND lower(u.email)='kcyle@terpmail.umd.edu' AND u.email_confirmed_at IS NOT NULL)
 OR public.suits_is_advisor_account();
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
