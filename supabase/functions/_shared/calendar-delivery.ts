// Durable Discord delivery for the existing SUITS bot. No secrets reach clients.
export interface CalendarMember { user_id: string; display_name: string; discord_id: string | null; proposal_role: string | null; email?: string }
export interface CalendarMeeting { id: string; title: string; starts_at: string; ends_at: string; audience?: string; subteam?: string | null; attendee_ids?: string[]; created_by: string | null; agenda: string | null; location: string | null; discord_channel_id?: string | null; announcement_channel_id?: string | null; revision?: number; notify_discord?: boolean }
export interface CalendarJob { id: string; meeting_id: string; revision: number; kind: string; recipient_id: string | null; minutes_before: number; snapshot: CalendarMeeting; attempts: number; lease_token: string; expires_at: string }
export interface CalendarSettings { guild_id?: string; channel_id?: string; meeting_channel_id?: string }
type Database = any; // Supabase Edge Functions use the existing generated database client.
const API = 'https://discord.com/api/v10';
const NO_MENTIONS = { parse: [], users: [], roles: [] };
const stamp = (s: string) => Math.floor(Date.parse(s) / 1000);
const clean = (s: string) => s.replace(/@/g, '@\u200b').replace(/([*_`~|>])/g, '\\$1');
export function isInvited(m: CalendarMeeting, member: CalendarMember) {
  return !m.audience || m.audience === 'team' || member.user_id === m.created_by || (m.attendee_ids || []).includes(member.user_id) || (m.audience === 'subteam' && member.proposal_role === m.subteam);
}
export function deliveryPayload(job: CalendarJob, settings: CalendarSettings, member?: CalendarMember) {
  const m = job.snapshot;
  const checkIn = m.audience === 'check_in';
  const verb = job.kind === 'cancelled' ? 'Meeting cancelled' : job.kind === 'updated' ? 'Meeting updated' : job.kind === 'reminder' ? 'Meeting reminder' : checkIn ? 'Check-in scheduled' : 'Meeting scheduled';
  // The server gets scheduling details, never personal check-in notes or titles.
  const title = checkIn && !member ? '1:1 check-in' : clean(m.title).slice(0, 256);
  const channel = settings.guild_id && m.discord_channel_id ? `https://discord.com/channels/${settings.guild_id}/${m.discord_channel_id}` : null;
  const lines = [`<t:${stamp(m.starts_at)}:F> · <t:${stamp(m.starts_at)}:R>`];
  if (channel) lines.push(`[Join meeting channel](${channel})`);
  else if (m.location && (!checkIn || member)) lines.push(clean(m.location).slice(0, 500));
  if (m.agenda && (!checkIn || member) && job.kind !== 'cancelled') lines.push(clean(m.agenda).slice(0, 1500));
  return { content: verb, allowed_mentions: NO_MENTIONS,
    // Discord deduplicates retries using a stable message nonce.
    nonce: job.id.replace(/-/g, '').slice(0, 24), enforce_nonce: true,
    embeds: [{ title, description: lines.join('\n\n'), color: job.kind === 'cancelled' ? 0x9aa4b2 : 0x356fe6, footer: { text: 'SUITS · XR Labs' } }],
    components: job.kind === 'cancelled' ? [] : [{ type: 1, components: [{ type: 2, style: 5, label: channel ? 'Join channel' : 'Open calendar', url: channel || 'https://xr.umd.edu/suits/workspace/meetings/' }] }],
  };
}
export class DiscordDeliveryError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0) { super(message); }
}
export async function calendarDiscord(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(12000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new DiscordDeliveryError(response.status === 403 ? 'Discord blocked this message. Check DM privacy or channel permissions.' : response.status === 404 ? 'The Discord channel or member is no longer available.' : response.status === 429 ? 'Discord rate limit; delivery will retry.' : 'Discord delivery temporarily failed.', response.status, Number(result.retry_after || response.headers.get('retry-after') || 0));
  return result;
}
export async function processCalendarQueue(admin: Database, settings: CalendarSettings, members: CalendarMember[], token: string | undefined) {
  if (!token || !settings.guild_id) return { sent: 0, configured: false };
  const { data: jobs, error } = await admin.rpc('suits_claim_calendar_notifications', { batch_size: 20 });
  if (error) throw new Error('Calendar delivery is not installed in the database yet.');
  const result = { sent: 0, retried: 0, skipped: 0, failed: 0, configured: true };
  let rateLimitUntil = 0;
  const finish = async (job: CalendarJob, patch: Record<string, unknown>) => {
    const { error } = await admin.from('suits_calendar_notifications').update({ ...patch, locked_until: null, lease_token: null }).eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'processing');
    if (error) throw new Error('Could not record Discord delivery.');
  };
  for (const job of (jobs || []) as CalendarJob[]) {
    try {
      if (rateLimitUntil > Date.now()) { await finish(job, { status: 'pending', due_at: new Date(rateLimitUntil).toISOString(), attempts: job.attempts - 1, last_error: 'Waiting for Discord rate limit.' }); result.retried++; continue; }
      const { data: liveJob } = await admin.from('suits_calendar_notifications').select('status,lease_token').eq('id', job.id).single();
      if (liveJob?.status !== 'processing' || liveJob.lease_token !== job.lease_token) continue;
      const member = job.recipient_id ? members.find(m => m.user_id === job.recipient_id) : undefined;
      if (job.kind !== 'cancelled') {
        const { data: current } = await admin.from('suits_meetings').select('*').eq('id', job.meeting_id).maybeSingle();
        if (!current || current.revision !== job.revision || !current.notify_discord || (member && !isInvited(current, member))) {
          await finish(job, { status: 'skipped', last_error: 'Meeting or invitation changed.', completed_at: new Date().toISOString() }); result.skipped++; continue;
        }
      }
      if (job.kind === 'reminder' && job.recipient_id) {
        const { data: reply } = await admin.from('suits_meeting_rsvps').select('response').eq('meeting_id', job.meeting_id).eq('user_id', job.recipient_id).maybeSingle();
        if (reply?.response === 'no') { await finish(job, { status: 'skipped', last_error: 'Invitation declined.', completed_at: new Date().toISOString() }); result.skipped++; continue; }
        if (Date.parse(job.snapshot.starts_at) <= Date.now()) { await finish(job, { status: 'skipped', last_error: 'Meeting already started.', completed_at: new Date().toISOString() }); result.skipped++; continue; }
      }
      let channel: string | undefined;
      if (job.recipient_id) {
        if (!member?.discord_id) { await finish(job, { status: 'skipped', last_error: 'Teammate has not linked Discord.', completed_at: new Date().toISOString() }); result.skipped++; continue; }
        if (/^e2e\./i.test(member.email || '')) { await finish(job, { status: 'skipped', last_error: 'Test account.', completed_at: new Date().toISOString() }); result.skipped++; continue; }
        const dm = await calendarDiscord('/users/@me/channels', token, { method: 'POST', body: JSON.stringify({ recipient_id: member.discord_id }) });
        channel = dm.id;
      } else {
        channel = job.snapshot.announcement_channel_id || settings.channel_id;
        if (!channel) throw new DiscordDeliveryError('No announcement channel is configured.', 400);
        const details = await calendarDiscord(`/channels/${channel}`, token);
        if (details.guild_id !== settings.guild_id || ![0, 5].includes(details.type)) throw new DiscordDeliveryError('Announcement channel is outside the SUITS server.', 400);
      }
      const sent = await calendarDiscord(`/channels/${channel}/messages`, token, { method: 'POST', body: JSON.stringify(deliveryPayload(job, settings, member)) });
      await finish(job, { status: 'sent', discord_message_id: sent.id, completed_at: new Date().toISOString(), last_error: null }); result.sent++;
    } catch (err) {
      const error = err instanceof DiscordDeliveryError ? err : new DiscordDeliveryError('Delivery interrupted; retrying.', 503);
      const terminal = [400, 401, 403, 404].includes(error.status) || job.attempts >= 8;
      const seconds = Math.max(error.retryAfter, Math.min(3600, 30 * 2 ** (job.attempts - 1)));
      if (error.status === 429) rateLimitUntil = Date.now() + Math.ceil(seconds * 1000);
      await finish(job, { status: terminal ? 'failed' : 'pending', due_at: new Date(Date.now() + seconds * 1000).toISOString(), last_error: error.message, ...(terminal ? { completed_at: new Date().toISOString() } : {}) });
      if (terminal) result.failed++; else result.retried++;
    }
  }
  return result;
}
