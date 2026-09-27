BEGIN;

-- Trust the verified Auth record, never a profile, role, or client-supplied email.
CREATE OR REPLACE FUNCTION public.suits_can_review_applications() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND lower(u.email)='kcyle@terpmail.umd.edu' AND u.email_confirmed_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.suits_can_review_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suits_can_review_applications() TO anon, authenticated;

DROP POLICY IF EXISTS "Board can view SUITS applications" ON public.suits_applications;
DROP POLICY IF EXISTS "Board can update SUITS applications" ON public.suits_applications;
DROP POLICY IF EXISTS "Board can delete SUITS applications" ON public.suits_applications;
CREATE POLICY "Owner can view SUITS applications" ON public.suits_applications
 FOR SELECT TO authenticated USING (public.suits_can_review_applications());
CREATE POLICY "Owner can update SUITS applications" ON public.suits_applications
 FOR UPDATE TO authenticated USING (public.suits_can_review_applications()) WITH CHECK (public.suits_can_review_applications());
CREATE POLICY "Owner can delete SUITS applications" ON public.suits_applications
 FOR DELETE TO authenticated USING (public.suits_can_review_applications());

-- Restrictive policies also constrain any older permissive board policies.
CREATE POLICY "SUITS application read guard" ON public.suits_applications AS RESTRICTIVE
 FOR SELECT USING (public.suits_can_review_applications());
CREATE POLICY "SUITS application update guard" ON public.suits_applications AS RESTRICTIVE
 FOR UPDATE USING (public.suits_can_review_applications()) WITH CHECK (public.suits_can_review_applications());
CREATE POLICY "SUITS application delete guard" ON public.suits_applications AS RESTRICTIVE
 FOR DELETE USING (public.suits_can_review_applications());

DROP POLICY IF EXISTS "Board can read SUITS resumes" ON storage.objects;
DROP POLICY IF EXISTS "Board can delete SUITS resumes" ON storage.objects;
CREATE POLICY "Owner can read SUITS resumes" ON storage.objects
 FOR SELECT TO authenticated USING (bucket_id='suits-resumes' AND public.suits_can_review_applications());
CREATE POLICY "Owner can delete SUITS resumes" ON storage.objects
 FOR DELETE TO authenticated USING (bucket_id='suits-resumes' AND public.suits_can_review_applications());
CREATE POLICY "SUITS resume read guard" ON storage.objects AS RESTRICTIVE
 FOR SELECT USING (bucket_id <> 'suits-resumes' OR public.suits_can_review_applications());
CREATE POLICY "SUITS resume update guard" ON storage.objects AS RESTRICTIVE
 FOR UPDATE USING (bucket_id <> 'suits-resumes' OR public.suits_can_review_applications())
 WITH CHECK (bucket_id <> 'suits-resumes' OR public.suits_can_review_applications());
CREATE POLICY "SUITS resume delete guard" ON storage.objects AS RESTRICTIVE
 FOR DELETE USING (bucket_id <> 'suits-resumes' OR public.suits_can_review_applications());

-- Keep the bucket private even if its settings were changed outside migrations.
UPDATE storage.buckets SET public=false WHERE id='suits-resumes';
COMMIT;
