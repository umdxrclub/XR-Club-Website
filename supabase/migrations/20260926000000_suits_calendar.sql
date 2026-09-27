-- Additive calendar migration. Existing accounts, meetings, and sessions remain.
BEGIN;
ALTER TABLE public.suits_meetings
  ADD COLUMN audience text NOT NULL DEFAULT 'team',
  ADD COLUMN subteam text,
  ADD COLUMN attendee_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN discord_channel_id text,
  ADD COLUMN announcement_channel_id text,
  ADD COLUMN reminder_minutes integer[] NOT NULL DEFAULT '{60,10}',
  ADD COLUMN notify_discord boolean NOT NULL DEFAULT true,
  ADD COLUMN series_id uuid,
  ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.suits_meetings ADD CONSTRAINT suits_meeting_audience CHECK (
  (audience = 'team' AND subteam IS NULL AND cardinality(attendee_ids) = 0) OR
  (audience = 'subteam' AND subteam IN ('technical','uiux','aiml','hitl','pm','engagement') AND cardinality(attendee_ids) = 0) OR
  (audience = 'check_in' AND subteam IS NULL AND cardinality(attendee_ids) = 1)
);
ALTER TABLE public.suits_meetings ADD CONSTRAINT suits_meeting_duration CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '12 hours') NOT VALID;
ALTER TABLE public.suits_meetings ADD CONSTRAINT suits_meeting_title CHECK (length(btrim(title)) BETWEEN 1 AND 160) NOT VALID;
ALTER TABLE public.suits_meetings ADD CONSTRAINT suits_meeting_reminders CHECK (reminder_minutes <@ ARRAY[10,60,1440] AND cardinality(reminder_minutes) <= 3);
CREATE INDEX suits_meetings_calendar_range ON public.suits_meetings(starts_at, ends_at);

-- The bot refreshes this cache from the existing guild; clients cannot add channels.
CREATE TABLE public.suits_discord_channels (
  id text PRIMARY KEY CHECK (id ~ '^\d{17,20}$'),
  guild_id text NOT NULL CHECK (guild_id ~ '^\d{17,20}$'),
  name text NOT NULL,
  type integer NOT NULL CHECK (type IN (0,2,5,13)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suits_discord_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read Discord channels" ON public.suits_discord_channels FOR SELECT TO authenticated USING (public.suits_is_team_email() AND public.suits_is_manager());
GRANT SELECT ON public.suits_discord_channels TO authenticated;
GRANT ALL ON public.suits_discord_channels TO service_role;

CREATE FUNCTION public.suits_can_view_meeting(m public.suits_meetings) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.suits_is_team_email() AND EXISTS (SELECT 1 FROM public.suits_team WHERE user_id = auth.uid()) AND
    (public.suits_is_manager() OR m.audience <> 'check_in' OR auth.uid() = m.created_by OR auth.uid() = ANY(m.attendee_ids));
$$;
REVOKE ALL ON FUNCTION public.suits_can_view_meeting(public.suits_meetings) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suits_can_view_meeting(public.suits_meetings) TO authenticated, service_role;
DROP POLICY "Team can view meetings" ON public.suits_meetings;
CREATE POLICY "Invited team reads meetings" ON public.suits_meetings FOR SELECT TO authenticated USING (public.suits_can_view_meeting(suits_meetings));
DROP POLICY "Team can view rsvps" ON public.suits_meeting_rsvps;
DROP POLICY "Members rsvp for themselves" ON public.suits_meeting_rsvps;
DROP POLICY "Members change their own rsvp" ON public.suits_meeting_rsvps;
CREATE POLICY "Invited team reads replies" ON public.suits_meeting_rsvps FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.suits_meetings m WHERE m.id = meeting_id));
CREATE POLICY "Invited member replies" ON public.suits_meeting_rsvps FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.suits_meetings m WHERE m.id = meeting_id AND (m.audience <> 'subteam' OR public.suits_is_manager() OR m.subteam = (SELECT proposal_role FROM public.suits_team WHERE user_id = auth.uid()))));
CREATE POLICY "Invited member updates reply" ON public.suits_meeting_rsvps FOR UPDATE TO authenticated USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.suits_meetings m WHERE m.id = meeting_id)) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.suits_meetings m WHERE m.id = meeting_id AND (m.audience <> 'subteam' OR public.suits_is_manager() OR m.subteam = (SELECT proposal_role FROM public.suits_team WHERE user_id = auth.uid()))));

CREATE FUNCTION public.suits_calendar_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE configured_guild text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.series_id := OLD.series_id;
    NEW.revision := OLD.revision + 1;
  ELSE
    IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
    NEW.revision := 1;
  END IF;
  NEW.title := btrim(NEW.title);
  IF length(coalesce(NEW.agenda,'')) > 4000 OR length(coalesce(NEW.location,'')) > 500 THEN RAISE EXCEPTION 'Meeting details are too long'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN RAISE EXCEPTION 'Unknown time zone'; END IF;
  IF array_position(NEW.attendee_ids,NULL) IS NOT NULL OR array_position(NEW.reminder_minutes,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid attendee or reminder'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.attendee_ids) id WHERE NOT EXISTS (SELECT 1 FROM public.suits_team t WHERE t.user_id = id)) THEN RAISE EXCEPTION 'Choose a current team member'; END IF;
  IF NEW.audience = 'check_in' AND NEW.created_by = ANY(NEW.attendee_ids) THEN RAISE EXCEPTION 'Choose another teammate for the check-in'; END IF;
  SELECT value->>'guild_id' INTO configured_guild FROM public.suits_settings WHERE key = 'discord';
  IF NEW.discord_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suits_discord_channels WHERE id = NEW.discord_channel_id AND guild_id = configured_guild AND type IN (0,2,13)) THEN RAISE EXCEPTION 'Reload Discord channels and choose a meeting channel'; END IF;
  IF NEW.announcement_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suits_discord_channels WHERE id = NEW.announcement_channel_id AND guild_id = configured_guild AND type IN (0,5)) THEN RAISE EXCEPTION 'Choose an announcement channel in the SUITS server'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER suits_calendar_guard BEFORE INSERT OR UPDATE ON public.suits_meetings FOR EACH ROW EXECUTE FUNCTION public.suits_calendar_guard();

-- Durable outbox: writes and notifications commit together. Only the worker may
-- claim/complete jobs. Managers can inspect status, never fabricate notifications.
CREATE TABLE public.suits_calendar_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','updated','cancelled','reminder')),
  recipient_id uuid REFERENCES public.suits_team(user_id) ON DELETE CASCADE,
  minutes_before integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  due_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','skipped','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  locked_until timestamptz,
  last_error text,
  discord_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX suits_calendar_notification_once ON public.suits_calendar_notifications(meeting_id,revision,kind,coalesce(recipient_id::text,'channel'),minutes_before);
CREATE INDEX suits_calendar_notification_due ON public.suits_calendar_notifications(due_at) WHERE status IN ('pending','processing');
ALTER TABLE public.suits_calendar_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers inspect calendar delivery" ON public.suits_calendar_notifications FOR SELECT TO authenticated USING (public.suits_is_team_email() AND public.suits_is_manager());
GRANT SELECT ON public.suits_calendar_notifications TO authenticated;
GRANT ALL ON public.suits_calendar_notifications TO service_role;

CREATE FUNCTION public.suits_calendar_recipients(m public.suits_meetings) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT user_id FROM public.suits_team WHERE m.audience = 'team' OR
    (m.audience = 'subteam' AND proposal_role = m.subteam) OR
    user_id = m.created_by OR user_id = ANY(m.attendee_ids);
$$;
REVOKE ALL ON FUNCTION public.suits_calendar_recipients(public.suits_meetings) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.suits_queue_calendar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.suits_meetings; action text; recipient uuid; mins integer; old_recipient uuid;
BEGIN
  m := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  action := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'cancelled' END;
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.suits_calendar_notifications SET status='cancelled', completed_at=now(), lease_token=NULL
      WHERE meeting_id=m.id AND status IN ('pending','processing');
  END IF;
  IF TG_OP='DELETE' THEN m.revision := m.revision + 1; END IF;
  IF TG_OP='UPDATE' AND OLD.notify_discord THEN
    -- Removed guests still receive a cancellation; they must not keep stale invites.
    FOR old_recipient IN SELECT * FROM public.suits_calendar_recipients(OLD) EXCEPT SELECT * FROM public.suits_calendar_recipients(NEW) LOOP
      INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,recipient_id,snapshot,due_at,expires_at)
        VALUES(m.id,m.revision,'cancelled',old_recipient,to_jsonb(OLD),now(),now()+interval '1 day');
    END LOOP;
  END IF;
  IF m.notify_discord THEN
    INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,snapshot,due_at,expires_at)
      VALUES(m.id,m.revision,action,to_jsonb(m),now(),now()+interval '1 day');
    FOR recipient IN SELECT * FROM public.suits_calendar_recipients(m) LOOP
      INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,recipient_id,snapshot,due_at,expires_at)
        VALUES(m.id,m.revision,action,recipient,to_jsonb(m),now(),now()+interval '1 day');
      IF TG_OP <> 'DELETE' THEN
        FOREACH mins IN ARRAY m.reminder_minutes LOOP
          IF m.starts_at - make_interval(mins=>mins) > now() THEN
            INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,recipient_id,minutes_before,snapshot,due_at,expires_at)
              VALUES(m.id,m.revision,'reminder',recipient,mins,to_jsonb(m),m.starts_at-make_interval(mins=>mins),m.starts_at)
              ON CONFLICT DO NOTHING;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER suits_queue_calendar AFTER INSERT OR UPDATE OR DELETE ON public.suits_meetings FOR EACH ROW EXECUTE FUNCTION public.suits_queue_calendar();

CREATE FUNCTION public.suits_schedule_meetings(events jsonb) RETURNS SETOF public.suits_meetings
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE item jsonb; series uuid;
BEGIN
  IF NOT public.suits_is_team_email() OR NOT public.suits_is_manager() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Only team managers can schedule meetings'; END IF;
  IF jsonb_typeof(events) <> 'array' OR jsonb_array_length(events) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Schedule between 1 and 12 meetings'; END IF;
  IF jsonb_array_length(events)>1 THEN series:=gen_random_uuid(); END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(events) LOOP
    RETURN QUERY INSERT INTO public.suits_meetings(title,starts_at,ends_at,location,agenda,created_by,audience,subteam,attendee_ids,timezone,discord_channel_id,announcement_channel_id,reminder_minutes,notify_discord,series_id)
      VALUES(item->>'title',(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,item->>'location',item->>'agenda',auth.uid(),coalesce(item->>'audience','team'),item->>'subteam',ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'attendee_ids','[]'::jsonb))::uuid),coalesce(item->>'timezone','America/New_York'),item->>'discord_channel_id',item->>'announcement_channel_id',ARRAY(SELECT jsonb_array_elements_text(coalesce(item->'reminder_minutes','[60,10]'::jsonb))::integer),coalesce((item->>'notify_discord')::boolean,true),series)
      RETURNING *;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_schedule_meetings(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suits_schedule_meetings(jsonb) TO authenticated;

CREATE FUNCTION public.suits_claim_calendar_notifications(batch_size integer DEFAULT 20) RETURNS SETOF public.suits_calendar_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.suits_calendar_notifications SET status='failed',last_error='Delivery stopped after repeated interruptions',completed_at=now()
    WHERE status='processing' AND locked_until<now() AND attempts>=8;
  UPDATE public.suits_calendar_notifications SET status='skipped',last_error='Delivery window passed',completed_at=now()
    WHERE status IN ('pending','processing') AND expires_at <= now();
  RETURN QUERY WITH due AS (
    SELECT id FROM public.suits_calendar_notifications WHERE due_at<=now() AND expires_at>now() AND attempts<8
      AND (status='pending' OR (status='processing' AND locked_until<now()))
      ORDER BY due_at,created_at LIMIT least(greatest(batch_size,1),20) FOR UPDATE SKIP LOCKED
  ) UPDATE public.suits_calendar_notifications n SET status='processing', attempts=n.attempts+1, locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid()
    FROM due WHERE n.id=due.id RETURNING n.*;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_claim_calendar_notifications(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.suits_claim_calendar_notifications(integer) TO service_role;

-- Existing meetings get future reminders, never a retroactive "created" message.
INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,recipient_id,minutes_before,snapshot,due_at,expires_at)
SELECT m.id,m.revision,'reminder',r.user_id,v.minutes,to_jsonb(m),m.starts_at-make_interval(mins=>v.minutes),m.starts_at
FROM public.suits_meetings m CROSS JOIN LATERAL public.suits_calendar_recipients(m) AS r(user_id) CROSS JOIN LATERAL unnest(m.reminder_minutes) AS v(minutes)
WHERE m.notify_discord AND m.starts_at-make_interval(mins=>v.minutes)>now()
ON CONFLICT DO NOTHING;
COMMIT;
