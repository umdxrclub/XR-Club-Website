# SUITS calendar activation

This extends the existing project `cpgkqtldivzjmzxqcsvf`. Do not create a new project, reset the database, or replay the old schema migrations.

Activated in the existing project on September 26, 2026: the calendar migration is recorded as `20260926000000`, the updated `suits-discord` function is deployed, and the existing `suits-discord-cron` job runs every 30 seconds. Its live response returned HTTP 200 with `calendar.configured: true`. All 18 existing members remain; there were no meetings or notification jobs at activation. The website is built for the local preview. Real account sign-in and a recipient's actual DM delivery still require an end-to-end user check.

The steps below document restoration or setup in another environment. **Do not reapply the migration or create a duplicate cron job in the current project.**

1. Apply **only** `migrations/20260926000000_suits_calendar.sql` to the existing database. It adds meeting audiences, check-in invitees, recurrence groups, channel validation, and the notification outbox. Existing meetings remain all-team events. Existing accounts and authentication settings are untouched. Managers schedule events; check-ins are visible only to the organizer, invited person, and managers. Subteam events remain readable across the team, but reminder recipients are limited to the subteam and organizer.
2. Deploy the updated existing bot, including `_shared/calendar-delivery.ts`:

   ```sh
   npx supabase functions deploy suits-discord --project-ref cpgkqtldivzjmzxqcsvf --no-verify-jwt
   ```

   Keep its existing `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, and `SUITS_CRON_SECRET`. The endpoint verifies dashboard sessions itself, Discord interaction signatures, and the scheduler secret. Do not expose these secrets to the frontend.
3. Keep the saved `suits_settings` Discord guild and announcement channel. Opening the calendar as a manager loads the server's actual channels and refreshes the cache. All-team meetings use the configured announcements channel. Subteam meetings use their selected meeting channel (including a voice channel's text chat), or the optional **Subteam updates channel**. They never fall back to announcements. One-to-one check-ins use the separate reminders channel configured with `/setup`. The bot needs access to each destination and permission to send messages.
4. Keep the existing bot schedule when it is active: its `cron` action now processes calendar jobs as well as Drive and task work. The current project's 30-second schedule was retained. Only if no bot schedule exists, store the existing `SUITS_CRON_SECRET` in Supabase Vault as `suits_cron_secret`, then run `calendar-cron.sql`. Jobs are claimed with leases to prevent double processing. Never paste a secret into tracked SQL or browser code.
5. Teammates need an existing linked `discord_id` and must allow the bot's DMs. The Team page retains the existing `/link` instructions. Unlinked accounts and blocked DMs appear under the event's **Discord delivery** details. The scheduler sends creation, update, cancellation, and reminder messages to the audience's channel, alongside the existing DMs. One-to-one channel messages tag only the organizer and invited teammate; reminder messages omit participants who declined. Check-in notes and titles are omitted from the channel message and included only in participants' DMs. No automatic mass mentions are sent.

## Audience routing update

The audience routing changes require the following deployment steps; the September 26 activation above does not include them:

1. Apply only the additive `migrations/20260927010000_suits_calendar_channels.sql` migration to the existing project. It queues one channel reminder for each selected time in addition to the existing DMs. It adds future reminders for existing meetings without replaying initial announcements. Existing edit/delete handling continues to invalidate stale jobs.
2. Deploy `suits-discord` and its updated `_shared/calendar-delivery.ts`, then re-register the slash commands using the existing authenticated `register` action. Do not create another scheduler.
3. Create the Discord reminders text channel. Run `/setup announcements:#announcements reminders:#reminders` in the existing server. This preserves the other saved Discord settings and stores `reminders_channel_id` under the existing `suits_settings` row with key `discord`. The reminders and announcements channels must be different. Reopen the calendar to reload channel settings.
4. Publish the updated calendar form. All-team and one-to-one destinations are fixed by audience; only subteam meetings expose an optional updates-channel selector. The delivery worker enforces these rules for old events and old clients too. Until reminders is configured, check-in channel messages fail explicitly instead of appearing in announcements; existing DM delivery continues.

The worker retries temporary failures and Discord rate limits, uses a stable message nonce, skips declined invitations and expired reminders, and records per-recipient failures. Editing an event invalidates old reminders; removed invitees receive a cancellation. Deleting an event preserves a cancellation job. Weekly creation is transactional, supports up to 12 dates, and preserves local wall-clock time across daylight-saving changes. Editing/cancelling currently affects one occurrence, as stated in the form.

No Google Calendar account access is requested. The interface follows familiar calendar conventions and provides **Add to Google Calendar** and an `.ics` download; this is not two-way Google Calendar sync.

## Verify before using it for real meetings

```sh
npm run check
npm test
npx deno check supabase/functions/suits-discord/index.ts
npm run build
```

The calendar test runs the actual SQL migration and policies against a disposable PGlite database, then runs the delivery worker against that database with mocked Discord HTTP responses. It does not contact Discord or modify Supabase.

The development-only `/suits/preview/` route uses clearly labeled in-memory sample events, is omitted from the production build, and never bypasses server authorization. Real login stays at `/suits/team/`, with the signed-in workspace at `/suits/workspace/`. The public header is absent from the workspace. Existing `/suits/team/<section>/` links continue through login to the corresponding workspace section.

After server activation, verify a real manager and member session, one test-channel event, one consented recipient's DM, a reschedule, and a cancellation. Confirm the cron job succeeds without an open browser. Live notifications have not been validated by the isolated tests.
