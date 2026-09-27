BEGIN;

CREATE TABLE public.suits_advisor_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 advisor_id uuid NOT NULL REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (isfinite(starts_at) AND isfinite(ends_at) AND ends_at > starts_at AND ends_at <= starts_at + interval '24 hours')
);
CREATE INDEX suits_advisor_availability_times ON public.suits_advisor_availability(advisor_id,starts_at);
ALTER TABLE public.suits_advisor_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved team can see advisor availability" ON public.suits_advisor_availability
 FOR SELECT TO authenticated USING (public.suits_is_approved() AND EXISTS(
  SELECT 1 FROM public.suits_team t WHERE t.user_id=advisor_id AND t.designation='advisor'
  AND public.suits_member_is_approved(t.user_id)));
CREATE POLICY "Advisors remove their own availability" ON public.suits_advisor_availability
 FOR DELETE TO authenticated USING (advisor_id=auth.uid() AND public.suits_is_approved() AND EXISTS(
  SELECT 1 FROM public.suits_team t WHERE t.user_id=auth.uid() AND t.designation='advisor'));
REVOKE ALL ON public.suits_advisor_availability FROM anon,authenticated;
GRANT SELECT,DELETE ON public.suits_advisor_availability TO authenticated;
GRANT ALL ON public.suits_advisor_availability TO service_role;

CREATE FUNCTION public.suits_save_advisor_availability(starts timestamptz,ends timestamptz,target uuid DEFAULT NULL)
RETURNS public.suits_advisor_availability
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.suits_advisor_availability;
BEGIN
 IF NOT public.suits_is_approved() OR NOT EXISTS(
  SELECT 1 FROM public.suits_team WHERE user_id=auth.uid() AND designation='advisor') THEN
  RAISE EXCEPTION 'Only an approved advisor can set their availability';
 END IF;
 IF starts IS NULL OR ends IS NULL OR NOT isfinite(starts) OR NOT isfinite(ends)
  OR ends<=starts OR (starts AT TIME ZONE 'America/New_York')::date<>(ends AT TIME ZONE 'America/New_York')::date THEN
  RAISE EXCEPTION 'Choose an end time after the start time on the same day';
 END IF;
 IF starts<=now() THEN RAISE EXCEPTION 'Choose a future date and time'; END IF;
 -- Serialize this advisor's saves so simultaneous requests cannot overlap.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.suits_advisor_availability WHERE id=target AND advisor_id=auth.uid()) THEN
  RAISE EXCEPTION 'Availability not found';
 END IF;
 IF EXISTS(SELECT 1 FROM public.suits_advisor_availability WHERE advisor_id=auth.uid()
  AND id IS DISTINCT FROM target AND starts_at<ends AND ends_at>starts) THEN
  RAISE EXCEPTION 'That time overlaps your saved availability';
 END IF;
 IF target IS NULL THEN
  INSERT INTO public.suits_advisor_availability(advisor_id,starts_at,ends_at)
  VALUES(auth.uid(),starts,ends) RETURNING * INTO result;
 ELSE
  UPDATE public.suits_advisor_availability SET starts_at=starts,ends_at=ends
  WHERE id=target AND advisor_id=auth.uid() RETURNING * INTO result;
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_save_advisor_availability(timestamptz,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suits_save_advisor_availability(timestamptz,timestamptz,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
