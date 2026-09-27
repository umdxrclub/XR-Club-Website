-- Run once after the calendar migration and suits-discord deployment.
-- Store SUITS_CRON_SECRET in Supabase Vault under the name suits_cron_secret.
-- Its value must match the existing Edge Function secret. Never put it in this file.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='suits_cron_secret') THEN
    RAISE EXCEPTION 'Add the existing SUITS_CRON_SECRET to Vault as suits_cron_secret first';
  END IF;
END $$;
-- The existing bot cron may remain: claims and leases prevent double delivery.
SELECT cron.schedule('suits-calendar-delivery', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://cpgkqtldivzjmzxqcsvf.supabase.co/functions/v1/suits-discord',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='suits_cron_secret' LIMIT 1)),
    body := '{"action":"calendar-cron"}'::jsonb,
    timeout_milliseconds := 50000
  );
$job$);
