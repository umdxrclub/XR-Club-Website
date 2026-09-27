-- Add channel reminders alongside the existing per-person DMs. Routing is
-- enforced by the worker: all team -> announcements, subteam -> its channel,
-- 1:1 -> the configured reminders channel. No existing data is reset.
BEGIN;
CREATE FUNCTION public.suits_queue_calendar_channel_reminders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE mins integer;
BEGIN
  IF NEW.notify_discord THEN
    FOREACH mins IN ARRAY NEW.reminder_minutes LOOP
      IF NEW.starts_at - make_interval(mins=>mins) > now() THEN
        INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,minutes_before,snapshot,due_at,expires_at)
          VALUES(NEW.id,NEW.revision,'reminder',mins,to_jsonb(NEW),NEW.starts_at-make_interval(mins=>mins),NEW.starts_at)
          ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_queue_calendar_channel_reminders() FROM PUBLIC,anon,authenticated;
-- PostgreSQL runs same-event triggers by name. This runs after
-- suits_queue_calendar cancels stale deliveries and queues the current revision.
CREATE TRIGGER suits_queue_calendar_channel_reminders AFTER INSERT OR UPDATE ON public.suits_meetings
  FOR EACH ROW EXECUTE FUNCTION public.suits_queue_calendar_channel_reminders();

-- Add only future channel reminders, not retroactive announcements or pings.
INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,minutes_before,snapshot,due_at,expires_at)
SELECT m.id,m.revision,'reminder',v.minutes,to_jsonb(m),m.starts_at-make_interval(mins=>v.minutes),m.starts_at
FROM public.suits_meetings m CROSS JOIN LATERAL unnest(m.reminder_minutes) AS v(minutes)
WHERE m.notify_discord AND m.starts_at-make_interval(mins=>v.minutes)>now()
ON CONFLICT DO NOTHING;
COMMIT;
