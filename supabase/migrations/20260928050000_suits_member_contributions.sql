BEGIN;

-- Approved members share team-wide tasks and manage their own subteam's work.
-- These are working responsibilities, not account or membership permissions.
CREATE OR REPLACE FUNCTION public.suits_can_manage_subteam(team text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.suits_is_approved() AND (public.suits_is_manager() OR team='team' OR
 (team IN ('technical','uiux','aiml','hitl','pm','engagement') AND EXISTS(
 SELECT 1 FROM public.suits_team WHERE user_id=auth.uid() AND proposal_role=team)));
$$;

DROP POLICY "Managers create meetings" ON public.suits_meetings;
DROP POLICY "Managers update meetings" ON public.suits_meetings;
DROP POLICY "Managers delete meetings" ON public.suits_meetings;
CREATE POLICY "Members create meetings" ON public.suits_meetings FOR INSERT TO authenticated
 WITH CHECK(public.suits_is_approved() AND created_by=auth.uid());
CREATE POLICY "Organizers and managers update meetings" ON public.suits_meetings FOR UPDATE TO authenticated
 USING(public.suits_is_approved() AND (created_by=auth.uid() OR public.suits_is_manager()))
 WITH CHECK(public.suits_is_approved() AND (created_by=auth.uid() OR public.suits_is_manager()));
CREATE POLICY "Organizers and managers cancel meetings" ON public.suits_meetings FOR DELETE TO authenticated
 USING(public.suits_is_approved() AND (created_by=auth.uid() OR public.suits_is_manager()));
DROP POLICY "Managers read Discord channels" ON public.suits_discord_channels;
CREATE POLICY "Members read calendar channels" ON public.suits_discord_channels FOR SELECT TO authenticated
 USING(public.suits_is_approved());

CREATE OR REPLACE FUNCTION public.suits_schedule_meetings(events jsonb) RETURNS SETOF public.suits_meetings
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; series uuid;
BEGIN
 IF NOT public.suits_is_approved() OR auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.suits_team WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Team approval is required to schedule meetings'; END IF;
 IF jsonb_typeof(events) <> 'array' OR jsonb_array_length(events) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Schedule between 1 and 12 meetings'; END IF;
 IF jsonb_array_length(events)>1 THEN series:=gen_random_uuid(); END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(events) LOOP
  RETURN QUERY INSERT INTO public.suits_meetings(title,starts_at,ends_at,location,agenda,created_by,audience,subteam,attendee_ids,timezone,discord_channel_id,announcement_channel_id,reminder_minutes,notify_discord,series_id)
   VALUES(item->>'title',(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,item->>'location',item->>'agenda',auth.uid(),coalesce(item->>'audience','team'),item->>'subteam',ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'attendee_ids','[]'::jsonb))::uuid),coalesce(item->>'timezone','America/New_York'),item->>'discord_channel_id',item->>'announcement_channel_id',ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'reminder_minutes','[60,10]'::jsonb))::integer),coalesce((item->>'notify_discord')::boolean,true),series)
   RETURNING *;
 END LOOP;
END;
$$;

-- A retained roster row does not make a rejected account eligible for new invitations.
CREATE FUNCTION public.suits_check_meeting_attendees() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.attendee_ids IS DISTINCT FROM OLD.attendee_ids THEN
  IF EXISTS(SELECT 1 FROM unnest(NEW.attendee_ids) person WHERE NOT EXISTS(
   SELECT 1 FROM public.suits_membership_requests WHERE user_id=person AND status='approved')) THEN
   RAISE EXCEPTION 'Choose an approved teammate';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_check_meeting_attendees() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER suits_check_meeting_attendees BEFORE INSERT OR UPDATE ON public.suits_meetings
 FOR EACH ROW EXECUTE FUNCTION public.suits_check_meeting_attendees();

COMMIT;
