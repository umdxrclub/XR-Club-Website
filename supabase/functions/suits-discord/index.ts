// Discord for the NASA SUITS team dashboard (/suits/team).
//
// One function does three jobs:
//   1. Slash commands and buttons. Discord sends them here as signed HTTP
//      requests, so nothing has to stay running.
//   2. Announcements. The dashboard calls this after someone adds or changes
//      a task, meeting, or document, and the bot posts it and pings the
//      people it concerns.
//   3. A scheduled check (every two minutes, from pg_cron) that reads the
//      team's Google Drive folder, works out what changed and who did it,
//      posts it to the log channel, and sends meeting and due date reminders.
//
// Secrets:
//   DISCORD_APP_ID, DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN   from the Discord developer portal
//   SUITS_CRON_SECRET                                       shared with the pg_cron job
//   SUITS_GOOGLE_SERVICE_ACCOUNT                            same key the Drive function uses
//
// Deploy: npx supabase functions deploy suits-discord --no-verify-jwt
// Then register the commands once:
//   curl -X POST <function url> -H "Authorization: Bearer <SUITS_CRON_SECRET>" -d '{"action":"register"}'

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE = 'https://xr.umd.edu/suits/team/';
const TZ = 'America/New_York';
const API = 'https://discord.com/api/v10';
const TEAM_EMAIL = /@(terpmail\.)?umd\.edu$/i;
const INK = 0x0a0a0a;
const GREY = 0x8a8a8a;
const RED = 0xd93025;

const SECTIONS: Array<{ key: string; name: string }> = [
  { key: 'setup', name: 'Setup and letters' },
  { key: 'abstract', name: 'Abstract' },
  { key: 'design', name: 'Software and hardware design description' },
  { key: 'conops', name: 'Concept of operations' },
  { key: 'ai', name: 'Artificial intelligence and machine learning' },
  { key: 'hitl', name: 'Human in the loop testing' },
  { key: 'pm', name: 'Project management' },
  { key: 'references', name: 'Technical references' },
  { key: 'community', name: 'Community engagement' },
  { key: 'industry', name: 'Industry engagement' },
  { key: 'admin', name: 'Administrative section' },
  { key: 'budget', name: 'Funding and budget' },
  { key: 'general', name: 'General' },
];
const sectionName = (key: string) => SECTIONS.find(s => s.key === key)?.name || key;

const ROLES: Record<string, string> = {
  team: 'Everyone',
  technical: 'Technical Design and Systems',
  uiux: 'UI UX Design',
  aiml: 'AI ML',
  hitl: 'HITL and Human Factors',
  pm: 'Project Management',
  engagement: 'Community and Industry Engagement',
};
const roleName = (key: string | null | undefined) => ROLES[key || 'team'] || ROLES.team;
const accessLabel = (role: string) => role === 'lead' ? 'Team lead' : role === 'product_manager' ? 'Product manager' : 'Member';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Member { user_id: string; email: string; display_name: string; role: string; proposal_role: string | null; discord_id: string | null; discord_username: string | null }
interface Task { id: string; title: string; details: string | null; section: string; assignee_id: string | null; due_date: string | null; status: string; link: string | null; created_by: string | null }
interface Meeting { id: string; title: string; starts_at: string; ends_at: string; location: string | null; agenda: string | null; created_by: string | null }
interface Doc { id: string; title: string; kind: string; url: string | null; role: string; notes: string | null; drive_url: string | null; created_by: string | null; created_at: string }
interface DiscordSettings { guild_id?: string; channel_id?: string; log_channel_id?: string; role_id?: string }

interface Ctx {
  admin: SupabaseClient;
  settings: DiscordSettings;
  members: Member[];
  saveSettings: (s: DiscordSettings) => Promise<void>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Discord REST
// ---------------------------------------------------------------------------
function botToken() {
  const t = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!t) throw new Error('The Discord bot token is not set');
  return t;
}

async function discord(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${botToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ? `Discord: ${data.message}` : `Discord returned ${r.status}`);
  return data;
}

const NO_PINGS = { parse: [] as string[] };

async function post(channelId: string, payload: Record<string, unknown>) {
  return await discord(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ allowed_mentions: NO_PINGS, ...payload }) });
}

async function edit(channelId: string, messageId: string, payload: Record<string, unknown>) {
  return await discord(`/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ allowed_mentions: NO_PINGS, ...payload }) });
}

async function followUp(token: string, payload: Record<string, unknown>) {
  const app = Deno.env.get('DISCORD_APP_ID');
  return await discord(`/webhooks/${app}/${token}/messages/@original`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// ---------------------------------------------------------------------------
// Request signature (Ed25519)
// ---------------------------------------------------------------------------
function hex(s: string) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(req: Request, body: string) {
  const sig = req.headers.get('X-Signature-Ed25519');
  const ts = req.headers.get('X-Signature-Timestamp');
  const pub = Deno.env.get('DISCORD_PUBLIC_KEY');
  if (!sig || !ts || !pub) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(pub), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dates in the team's time zone
// ---------------------------------------------------------------------------
function zoneParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour) % 24, mm: Number(p.minute), weekday: p.weekday };
}

/** The moment that reads as the given wall clock time in the team's zone. */
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number) {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const z = zoneParts(new Date(guess));
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm);
    guess += Date.UTC(y, m - 1, d, hh, mm) - asUtc;
  }
  return new Date(guess);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** "2026-09-24", "9/24", "9/24/2026", "today", "tomorrow", "friday", "next friday". Returns YYYY-MM-DD. */
function parseDate(input: string): string | null {
  const s = input.trim().toLowerCase();
  const today = zoneParts(new Date());
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const shift = (days: number) => { const t = new Date(Date.UTC(today.y, today.m - 1, today.d + days)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  if (s === 'today') return shift(0);
  if (s === 'tomorrow') return shift(1);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? Number(m[3]) : today.y;
    if (y < 100) y += 2000;
    if (!m[3] && (Number(m[1]) < today.m || (Number(m[1]) === today.m && Number(m[2]) < today.d))) y += 1;
    return ymd(y, Number(m[1]), Number(m[2]));
  }
  m = s.match(/^(?:next\s+)?([a-z]+)$/);
  if (m) {
    const idx = WEEKDAYS.findIndex(w => w.startsWith(m![1]) && m![1].length >= 3);
    if (idx >= 0) {
      const todayIdx = WEEKDAYS.indexOf(zoneParts(new Date()).weekday.toLowerCase().slice(0, 3) === 'sun' ? 'sunday' : WEEKDAYS.find(w => w.startsWith(today.weekday.toLowerCase()))!);
      let ahead = (idx - todayIdx + 7) % 7;
      if (ahead === 0 || s.startsWith('next')) ahead += ahead === 0 ? 7 : (s.startsWith('next') && ahead < 7 ? 0 : 0);
      return shift(ahead);
    }
  }
  return null;
}

/** "6pm", "6:30 pm", "18:00", "noon". Returns hours and minutes. */
function parseTime(input: string): { hh: number; mm: number } | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (s === 'noon') return { hh: 12, mm: 0 };
  if (s === 'midnight') return { hh: 0, mm: 0 };
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (m[3] === 'pm' && hh < 12) hh += 12;
  if (m[3] === 'am' && hh === 12) hh = 0;
  if (!m[3] && hh < 8) hh += 12; // "6" on its own means evening for this team
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

const ts = (iso: string, style = 'F') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const tsDate = (ymd: string) => ts(zonedToUtc(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), Number(ymd.slice(8, 10)), 12, 0).toISOString(), 'D');

function calendarUrl(m: Meeting) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: m.title, dates: `${fmt(m.starts_at)}/${fmt(m.ends_at)}`, details: m.agenda || '', location: m.location || '' });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ---------------------------------------------------------------------------
// Members and mentions
// ---------------------------------------------------------------------------
function byUser(ctx: Ctx, userId: string | null | undefined) {
  return userId ? ctx.members.find(m => m.user_id === userId) || null : null;
}

function byDiscord(ctx: Ctx, discordId: string) {
  return ctx.members.find(m => m.discord_id === discordId) || null;
}

function byEmail(ctx: Ctx, email: string) {
  const lower = email.trim().toLowerCase();
  return ctx.members.find(m => m.email.toLowerCase() === lower) || null;
}

function isManager(m: Member | null) {
  return !!m && (m.role === 'lead' || m.role === 'product_manager');
}

/** A member with a Discord username on their profile but no id yet: look them up in the server once. */
async function resolveDiscordId(ctx: Ctx, m: Member) {
  if (m.discord_id) return m.discord_id;
  const name = (m.discord_username || '').replace(/^@/, '').trim().toLowerCase();
  if (!name || !ctx.settings.guild_id) return null;
  try {
    const found = await discord(`/guilds/${ctx.settings.guild_id}/members/search?query=${encodeURIComponent(name)}&limit=10`) as Array<{ user: { id: string; username: string } }>;
    const hit = found.find(x => x.user.username.toLowerCase() === name);
    if (!hit) return null;
    await ctx.admin.from('suits_team').update({ discord_id: hit.user.id }).eq('user_id', m.user_id);
    m.discord_id = hit.user.id;
    return hit.user.id;
  } catch {
    return null;
  }
}

/** How to write a member in a message: a mention if we know their Discord, otherwise their name. */
async function nameOf(ctx: Ctx, m: Member | null) {
  if (!m) return 'nobody yet';
  const id = await resolveDiscordId(ctx, m);
  return id ? `<@${id}>` : m.display_name;
}

// ---------------------------------------------------------------------------
// Messages the bot has posted
// ---------------------------------------------------------------------------
async function remembered(ctx: Ctx, kind: string, refId: string) {
  const { data } = await ctx.admin.from('suits_discord_messages').select('channel_id, message_id').eq('kind', kind).eq('ref_id', refId).maybeSingle();
  return data as { channel_id: string; message_id: string } | null;
}

async function remember(ctx: Ctx, kind: string, refId: string, channelId: string, messageId: string) {
  await ctx.admin.from('suits_discord_messages').upsert({ kind, ref_id: refId, channel_id: channelId, message_id: messageId });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
async function taskEmbed(ctx: Ctx, t: Task) {
  const owner = byUser(ctx, t.assignee_id);
  const lines = [
    `Section: ${sectionName(t.section)}`,
    `Owner: ${await nameOf(ctx, owner)}`,
    t.due_date ? `Due: ${tsDate(t.due_date)}` : 'Due: no date yet',
  ];
  if (t.details) lines.push('', t.details);
  if (t.link) lines.push('', t.link);
  const done = t.status === 'done';
  return {
    title: done ? `Done: ${t.title}` : t.title,
    description: lines.join('\n'),
    color: done ? GREY : INK,
    footer: { text: t.status === 'doing' ? 'In progress' : done ? 'Finished' : 'To do' },
  };
}

function taskButtons(t: Task) {
  if (t.status === 'done') return [];
  return [{
    type: 1,
    components: [
      { type: 2, style: 2, label: t.status === 'todo' ? 'Start' : 'Mark done', custom_id: `task:${t.id}:${t.status === 'todo' ? 'doing' : 'done'}` },
      { type: 2, style: 5, label: 'Open the dashboard', url: `${SITE}tasks/` },
    ],
  }];
}

async function announceTask(ctx: Ctx, t: Task, event: string, actor: Member | null) {
  const channel = ctx.settings.channel_id;
  if (!channel) return;
  const owner = byUser(ctx, t.assignee_id);
  const ownerId = owner ? await resolveDiscordId(ctx, owner) : null;
  const who = actor ? actor.display_name : 'Someone';
  const embed = await taskEmbed(ctx, t);
  const saved = await remembered(ctx, 'task', t.id);
  const pingOwner = ownerId ? { allowed_mentions: { users: [ownerId] } } : {};

  if (event === 'created') {
    const content = ownerId ? `<@${ownerId}>, ${who} gave you a task.` : `${who} added a task.`;
    const msg = await post(channel, { content, embeds: [embed], components: taskButtons(t), ...pingOwner });
    await remember(ctx, 'task', t.id, channel, msg.id);
    return;
  }
  if (saved) await edit(saved.channel_id, saved.message_id, { embeds: [embed], components: taskButtons(t) }).catch(() => {});
  if (event === 'assigned' && ownerId) {
    await post(channel, { content: `<@${ownerId}>, ${who} handed you ${t.title}.`, ...pingOwner });
  } else if (event === 'completed') {
    await post(channel, { content: `${who} finished ${t.title}.` });
  } else if (event === 'deleted') {
    if (saved) await edit(saved.channel_id, saved.message_id, { embeds: [{ ...embed, title: `Removed: ${t.title}`, color: GREY, footer: { text: 'Removed' } }], components: [] }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------
async function rsvps(ctx: Ctx, meetingId: string) {
  const { data } = await ctx.admin.from('suits_meeting_rsvps').select('user_id, response').eq('meeting_id', meetingId);
  return (data || []) as Array<{ user_id: string; response: string }>;
}

async function meetingEmbed(ctx: Ctx, m: Meeting, cancelled = false) {
  const answers = await rsvps(ctx, m.id);
  const names = (r: string) => answers.filter(a => a.response === r).map(a => byUser(ctx, a.user_id)?.display_name).filter(Boolean).join(', ');
  const lines = [`${ts(m.starts_at, 'F')} to ${ts(m.ends_at, 't')}`, ts(m.starts_at, 'R')];
  if (m.location) lines.push(`Where: ${m.location}`);
  if (m.agenda) lines.push('', m.agenda);
  const fields = [];
  if (names('yes')) fields.push({ name: 'Going', value: names('yes'), inline: true });
  if (names('maybe')) fields.push({ name: 'Maybe', value: names('maybe'), inline: true });
  if (names('no')) fields.push({ name: "Can't make it", value: names('no'), inline: true });
  return {
    title: cancelled ? `Cancelled: ${m.title}` : m.title,
    description: lines.join('\n'),
    color: cancelled ? GREY : INK,
    fields,
    footer: { text: cancelled ? 'This meeting was cancelled' : 'Tap a button so the team knows who is coming' },
  };
}

function meetingButtons(m: Meeting, cancelled = false) {
  if (cancelled) return [];
  return [{
    type: 1,
    components: [
      { type: 2, style: 3, label: 'Going', custom_id: `rsvp:${m.id}:yes` },
      { type: 2, style: 2, label: 'Maybe', custom_id: `rsvp:${m.id}:maybe` },
      { type: 2, style: 4, label: "Can't", custom_id: `rsvp:${m.id}:no` },
      { type: 2, style: 5, label: 'Add to Google Calendar', url: calendarUrl(m) },
    ],
  }];
}

async function announceMeeting(ctx: Ctx, m: Meeting, event: string, actor: Member | null) {
  const channel = ctx.settings.channel_id;
  if (!channel) return;
  const who = actor ? actor.display_name : 'Someone';
  const role = ctx.settings.role_id ? `<@&${ctx.settings.role_id}> ` : '';
  const pingRole = ctx.settings.role_id ? { allowed_mentions: { roles: [ctx.settings.role_id] } } : {};
  const saved = await remembered(ctx, 'meeting', m.id);

  if (event === 'created') {
    const msg = await post(channel, { content: `${role}${who} scheduled a meeting.`, embeds: [await meetingEmbed(ctx, m)], components: meetingButtons(m), ...pingRole });
    await remember(ctx, 'meeting', m.id, channel, msg.id);
    return;
  }
  if (event === 'deleted') {
    if (saved) await edit(saved.channel_id, saved.message_id, { embeds: [await meetingEmbed(ctx, m, true)], components: [] }).catch(() => {});
    await post(channel, { content: `${role}${who} cancelled ${m.title}.`, ...pingRole });
    return;
  }
  if (saved) await edit(saved.channel_id, saved.message_id, { embeds: [await meetingEmbed(ctx, m)], components: meetingButtons(m) }).catch(() => {});
  if (event === 'updated') await post(channel, { content: `${role}${who} changed ${m.title}. It is now ${ts(m.starts_at, 'F')}.`, ...pingRole });
}

async function refreshMeetingMessage(ctx: Ctx, m: Meeting) {
  const saved = await remembered(ctx, 'meeting', m.id);
  if (saved) await edit(saved.channel_id, saved.message_id, { embeds: [await meetingEmbed(ctx, m)], components: meetingButtons(m) }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
function docLink(d: Doc) {
  return d.drive_url || d.url || `${SITE}documents/`;
}

async function announceDocument(ctx: Ctx, d: Doc, event: string, actor: Member | null) {
  const channel = ctx.settings.log_channel_id || ctx.settings.channel_id;
  if (!channel) return;
  const who = actor ? await nameOf(ctx, actor) : 'Someone';
  if (event === 'created') await post(channel, { content: `${who} added [${d.title}](${docLink(d)}) to ${roleName(d.role)}.` });
  if (event === 'deleted') await post(channel, { content: `${who} removed ${d.title} from ${roleName(d.role)}.` });
}

// ---------------------------------------------------------------------------
// Google Drive activity
// ---------------------------------------------------------------------------
interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }
let cachedToken: { value: string; expires: number } | null = null;

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function googleToken(sa: ServiceAccount) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  if (!r.ok) throw new Error('Google did not accept the service account key');
  const data = await r.json();
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

interface DriveFile { id: string; name: string; mimeType: string; modifiedTime: string; parents?: string[]; trashed: boolean; trashedTime?: string; webViewLink?: string; lastModifyingUser?: { displayName?: string; emailAddress?: string }; trashingUser?: { displayName?: string; emailAddress?: string } }
const FOLDER = 'application/vnd.google-apps.folder';
const DRIVE_FIELDS = 'nextPageToken,files(id,name,mimeType,modifiedTime,parents,trashed,trashedTime,webViewLink,lastModifyingUser(displayName,emailAddress),trashingUser(displayName,emailAddress))';

async function driveList(token: string, q: string) {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({ q, pageSize: '200', fields: DRIVE_FIELDS, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (pageToken) p.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Google returned ${r.status}`);
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Every file under the team folder, three levels deep, trashed ones included. */
async function driveTree(token: string, rootId: string) {
  const files: DriveFile[] = [];
  const folders = new Map<string, string>();
  let level = [rootId];
  for (let depth = 0; depth < 3 && level.length; depth++) {
    const next: string[] = [];
    for (const parent of level) {
      const items = await driveList(token, `'${parent}' in parents`);
      for (const f of items) {
        if (f.mimeType === FOLDER) { if (!f.trashed) { folders.set(f.id, f.name); next.push(f.id); } continue; }
        files.push(f);
      }
    }
    level = next;
  }
  return { files, folders };
}

interface Change { verb: string; file: DriveFile; actor: string; folder: string }

async function driveActivity(ctx: Ctx) {
  const channel = ctx.settings.log_channel_id || ctx.settings.channel_id;
  const raw = Deno.env.get('SUITS_GOOGLE_SERVICE_ACCOUNT');
  if (!channel || !raw) return { skipped: 'not set up' };
  const sa = JSON.parse(raw) as ServiceAccount;
  const { data: setting } = await ctx.admin.from('suits_settings').select('value').eq('key', 'drive_folder').maybeSingle();
  const rootId = setting?.value?.id as string | undefined;
  if (!rootId) return { skipped: 'no folder' };

  const token = await googleToken(sa);
  const { files, folders } = await driveTree(token, rootId);
  const { data: rows } = await ctx.admin.from('suits_drive_snapshot').select('*');
  const before = new Map((rows || []).map((r: Record<string, unknown>) => [r.file_id as string, r]));
  const firstRun = before.size === 0;
  const saEmail = sa.client_email.toLowerCase();
  const folderName = (f: DriveFile) => folders.get(f.parents?.[0] || '') || (f.parents?.[0] === rootId ? 'the team folder' : 'a folder');
  const actorOf = (u?: { displayName?: string; emailAddress?: string }) => {
    const email = (u?.emailAddress || '').toLowerCase();
    if (email === saEmail) return 'dashboard';
    const m = email ? byEmail(ctx, email) : null;
    if (m?.discord_id) return `<@${m.discord_id}>`;
    return u?.displayName || m?.display_name || 'Someone';
  };

  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    seen.add(f.id);
    const old = before.get(f.id) as Record<string, unknown> | undefined;
    const parent = f.parents?.[0] || null;
    if (!old) {
      if (!f.trashed) changes.push({ verb: 'added', file: f, actor: actorOf(f.lastModifyingUser), folder: folderName(f) });
      continue;
    }
    if (!old.trashed && f.trashed) changes.push({ verb: 'trashed', file: f, actor: actorOf(f.trashingUser || f.lastModifyingUser), folder: folderName(f) });
    else if (old.trashed && !f.trashed) changes.push({ verb: 'restored', file: f, actor: actorOf(f.lastModifyingUser), folder: folderName(f) });
    else if (!f.trashed && old.name !== f.name) changes.push({ verb: `renamed from ${old.name} to`, file: f, actor: actorOf(f.lastModifyingUser), folder: folderName(f) });
    else if (!f.trashed && old.parent_id !== parent) changes.push({ verb: 'moved', file: f, actor: actorOf(f.lastModifyingUser), folder: folderName(f) });
    else if (!f.trashed && old.modified_time && new Date(f.modifiedTime).getTime() > new Date(String(old.modified_time)).getTime() + 1000) changes.push({ verb: 'edited', file: f, actor: actorOf(f.lastModifyingUser), folder: folderName(f) });
  }
  const gone = [...before.keys()].filter(id => !seen.has(id));

  // Save what we saw
  if (files.length) await ctx.admin.from('suits_drive_snapshot').upsert(files.map(f => ({ file_id: f.id, name: f.name, mime: f.mimeType, parent_id: f.parents?.[0] || null, modified_time: f.modifiedTime, trashed: !!f.trashed, url: f.webViewLink || null, seen_at: new Date().toISOString() })));
  if (gone.length) await ctx.admin.from('suits_drive_snapshot').delete().in('file_id', gone);
  if (firstRun) return { seeded: files.length };

  // The dashboard already announces what it uploads
  const worth = changes.filter(c => c.actor !== 'dashboard');
  const goneLines = gone.map(id => { const r = before.get(id) as Record<string, unknown>; return `${r.name} is no longer in the folder.`; });
  if (!worth.length && !goneLines.length) return { changes: 0 };

  const lines = worth.slice(0, 15).map(c => {
    const link = c.file.webViewLink ? `[${c.file.name}](${c.file.webViewLink})` : c.file.name;
    return `${c.actor} ${c.verb} ${link} in ${c.folder}.`;
  });
  if (worth.length > 15) lines.push(`and ${worth.length - 15} more.`);
  lines.push(...goneLines.slice(0, 5));
  await post(channel, { embeds: [{ description: lines.join('\n'), color: INK, footer: { text: 'Google Drive' } }] });
  return { changes: worth.length + goneLines.length };
}

// ---------------------------------------------------------------------------
// Reminders (run from the same schedule)
// ---------------------------------------------------------------------------
async function reminders(ctx: Ctx) {
  const channel = ctx.settings.channel_id;
  if (!channel) return { skipped: 'not set up' };
  let sent = 0;
  const now = Date.now();

  // Meetings starting within the hour
  const { data: soon } = await ctx.admin.from('suits_meetings').select('*').gt('starts_at', new Date(now).toISOString()).lt('starts_at', new Date(now + 60 * 60000).toISOString());
  for (const m of (soon || []) as Meeting[]) {
    if (await remembered(ctx, 'meeting_reminder', m.id)) continue;
    const answers = await rsvps(ctx, m.id);
    const ids: string[] = [];
    for (const a of answers) {
      if (a.response === 'no') continue;
      const mem = byUser(ctx, a.user_id);
      const id = mem ? await resolveDiscordId(ctx, mem) : null;
      if (id) ids.push(id);
    }
    const role = ctx.settings.role_id ? `<@&${ctx.settings.role_id}> ` : '';
    const mentions = ids.map(id => `<@${id}>`).join(' ');
    const where = m.location ? ` Where: ${m.location}` : '';
    const msg = await post(channel, {
      content: `${role}${m.title} starts ${ts(m.starts_at, 'R')}.${where} ${mentions}`.trim(),
      allowed_mentions: { users: ids, roles: ctx.settings.role_id ? [ctx.settings.role_id] : [] },
    });
    await remember(ctx, 'meeting_reminder', m.id, channel, msg.id);
    sent++;
  }

  // Tasks due today, once, in the morning
  const z = zoneParts(new Date());
  if (z.hh >= 9) {
    const today = `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
    const { data: due } = await ctx.admin.from('suits_tasks').select('*').eq('due_date', today).neq('status', 'done');
    for (const t of (due || []) as Task[]) {
      if (await remembered(ctx, 'task_due', t.id)) continue;
      const owner = byUser(ctx, t.assignee_id);
      const id = owner ? await resolveDiscordId(ctx, owner) : null;
      const msg = await post(channel, {
        content: `${id ? `<@${id}>, ` : ''}${t.title} is due today. ${SITE}tasks/`,
        allowed_mentions: { users: id ? [id] : [] },
      });
      await remember(ctx, 'task_due', t.id, channel, msg.id);
      sent++;
    }
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------
const STRING = 3, USER = 6, CHANNEL = 7, ROLE = 8;
const SUB = 1;

const COMMANDS = [
  {
    name: 'task', description: 'Tasks on the SUITS dashboard',
    options: [
      { type: SUB, name: 'new', description: 'Add a task', options: [
        { type: STRING, name: 'title', description: 'What needs doing', required: true },
        { type: STRING, name: 'section', description: 'Proposal section', required: true, choices: SECTIONS.map(s => ({ name: s.name, value: s.key })) },
        { type: USER, name: 'owner', description: 'Who is doing it' },
        { type: STRING, name: 'due', description: 'When it is due, like 9/24, friday, or tomorrow' },
        { type: STRING, name: 'link', description: 'The Doc, Sheet, or Figma file it lives in' },
        { type: STRING, name: 'details', description: 'What done looks like' },
      ] },
      { type: SUB, name: 'list', description: 'See tasks', options: [
        { type: STRING, name: 'show', description: 'Which tasks', choices: [{ name: 'Open', value: 'open' }, { name: 'Mine', value: 'mine' }, { name: 'Done', value: 'done' }, { name: 'All', value: 'all' }] },
      ] },
      { type: SUB, name: 'done', description: 'Mark a task finished', options: [
        { type: STRING, name: 'task', description: 'The task', required: true, autocomplete: true },
      ] },
      { type: SUB, name: 'assign', description: 'Give a task to someone', options: [
        { type: STRING, name: 'task', description: 'The task', required: true, autocomplete: true },
        { type: USER, name: 'owner', description: 'Who is doing it', required: true },
      ] },
    ],
  },
  {
    name: 'meeting', description: 'Team meetings',
    options: [
      { type: SUB, name: 'new', description: 'Schedule a meeting', options: [
        { type: STRING, name: 'title', description: 'What the meeting is', required: true },
        { type: STRING, name: 'date', description: 'Like 9/24, friday, or tomorrow', required: true },
        { type: STRING, name: 'time', description: 'Like 6pm or 6:30 pm', required: true },
        { type: STRING, name: 'length', description: 'How long', choices: [{ name: '30 minutes', value: '30' }, { name: '1 hour', value: '60' }, { name: '1.5 hours', value: '90' }, { name: '2 hours', value: '120' }] },
        { type: STRING, name: 'where', description: 'Zoom link, Discord voice, or a room' },
        { type: STRING, name: 'agenda', description: 'What you will cover' },
      ] },
      { type: SUB, name: 'list', description: 'What is coming up' },
      { type: SUB, name: 'cancel', description: 'Cancel a meeting', options: [
        { type: STRING, name: 'meeting', description: 'The meeting', required: true, autocomplete: true },
      ] },
    ],
  },
  {
    name: 'docs', description: 'Team documents and the Drive folder',
    options: [
      { type: SUB, name: 'search', description: 'Find a document', options: [
        { type: STRING, name: 'query', description: 'Part of the title', required: true },
      ] },
      { type: SUB, name: 'recent', description: 'The newest documents' },
      { type: SUB, name: 'folder', description: 'Links to the Drive folders' },
      { type: SUB, name: 'add', description: 'Add a link to the documents and Drive', options: [
        { type: STRING, name: 'url', description: 'The link', required: true },
        { type: STRING, name: 'title', description: 'A name for it' },
        { type: STRING, name: 'role', description: 'Whose folder it goes in', choices: Object.entries(ROLES).map(([value, name]) => ({ name, value })) },
        { type: STRING, name: 'notes', description: 'Anything the team should know' },
      ] },
    ],
  },
  { name: 'team', description: 'Who is on the team and their roles' },
  { name: 'link', description: 'Connect your Discord to your dashboard account', options: [
    { type: STRING, name: 'email', description: 'Your umd.edu or terpmail address', required: true },
  ] },
  { name: 'dashboard', description: 'Open the SUITS dashboard' },
  { name: 'help', description: 'What the bot can do' },
  {
    name: 'setup', description: 'Choose where the bot posts', default_member_permissions: '32',
    options: [
      { type: CHANNEL, name: 'announcements', description: 'Tasks, meetings, and reminders go here', required: true, channel_types: [0] },
      { type: CHANNEL, name: 'log', description: 'Drive and document activity goes here', channel_types: [0] },
      { type: ROLE, name: 'role', description: 'The role to ping for meetings' },
    ],
  },
];

async function registerCommands() {
  const app = Deno.env.get('DISCORD_APP_ID');
  if (!app) throw new Error('DISCORD_APP_ID is not set');
  const out = await discord(`/applications/${app}/commands`, { method: 'PUT', body: JSON.stringify(COMMANDS) });
  return { registered: (out as unknown[]).length };
}

type Opt = { name: string; type: number; value?: string; options?: Opt[]; focused?: boolean };

function optionsOf(data: { options?: Opt[] }) {
  const sub = data.options?.find(o => o.type === SUB);
  const list = sub ? sub.options || [] : data.options || [];
  const get = (name: string) => list.find(o => o.name === name)?.value;
  return { sub: sub?.name || '', get, focused: list.find(o => o.focused) };
}

const reply = (content: string, extra: Record<string, unknown> = {}) => ({ type: 4, data: { content, flags: 64, allowed_mentions: NO_PINGS, ...extra } });
const publicReply = (payload: Record<string, unknown>) => ({ type: 4, data: { allowed_mentions: NO_PINGS, ...payload } });
const LINK_FIRST = 'The dashboard does not know who you are yet. Run /link with your UMD email, then try again.';

async function handleCommand(ctx: Ctx, body: Record<string, any>) {
  const data = body.data;
  const discordUser = body.member?.user || body.user;
  const me = byDiscord(ctx, discordUser.id);
  const { sub, get } = optionsOf(data);
  const name = data.name as string;

  if (name === 'help') {
    return reply([
      '**Tasks**',
      '/task new, /task list, /task done, /task assign',
      '**Meetings**',
      '/meeting new, /meeting list, /meeting cancel',
      '**Documents**',
      '/docs search, /docs recent, /docs add, /docs folder',
      '**You and the team**',
      '/link connects your Discord to the dashboard. /team shows everyone. /dashboard opens the site.',
      '',
      'When a task or meeting is added on the dashboard, it shows up here and the people it concerns get pinged. Changes in the Drive folder are posted in the log channel.',
    ].join('\n'));
  }

  if (name === 'dashboard') return reply(SITE);

  if (name === 'link') {
    const email = String(get('email') || '');
    if (!TEAM_EMAIL.test(email)) return reply('Use your umd.edu or terpmail.umd.edu address.');
    const m = byEmail(ctx, email);
    if (!m) return reply('That address is not on the roster. Sign in to the dashboard once, then run /link again.');
    if (m.discord_id && m.discord_id !== discordUser.id) return reply('That dashboard account is already linked to a different Discord account.');
    await ctx.admin.from('suits_team').update({ discord_id: discordUser.id, discord_username: discordUser.username }).eq('user_id', m.user_id);
    return reply(`Linked. You are ${m.display_name} on the dashboard.`);
  }

  if (name === 'setup') {
    const s: DiscordSettings = {
      guild_id: body.guild_id,
      channel_id: get('announcements') || ctx.settings.channel_id,
      log_channel_id: get('log') || get('announcements') || ctx.settings.log_channel_id,
      role_id: get('role') || ctx.settings.role_id,
    };
    await ctx.saveSettings(s);
    ctx.settings = s;
    await post(s.channel_id!, { content: 'The SUITS dashboard is connected. Tasks, meetings, and reminders will show up here. Run /link with your UMD email so the bot can ping you.' }).catch(() => {});
    return reply(`Set. Announcements go to <#${s.channel_id}>${s.log_channel_id && s.log_channel_id !== s.channel_id ? `, Drive activity goes to <#${s.log_channel_id}>` : ''}${s.role_id ? `, and meetings ping <@&${s.role_id}>` : ''}.`);
  }

  if (name === 'team') {
    const lines = ctx.members.map(m => `**${m.display_name}**, ${m.proposal_role ? roleName(m.proposal_role) : 'no proposal role yet'}, ${accessLabel(m.role).toLowerCase()}${m.discord_id ? '' : ', not linked to Discord'}`);
    return publicReply({ embeds: [{ title: `${ctx.members.length} on the team`, description: lines.join('\n'), color: INK, footer: { text: 'Roles are picked on the dashboard' } }] });
  }

  if (name === 'task') {
    if (sub === 'list') {
      const show = String(get('show') || 'open');
      const { data: rows } = await ctx.admin.from('suits_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('created_at');
      let tasks = (rows || []) as Task[];
      if (show === 'open') tasks = tasks.filter(t => t.status !== 'done');
      if (show === 'done') tasks = tasks.filter(t => t.status === 'done');
      if (show === 'mine') { if (!me) return reply(LINK_FIRST); tasks = tasks.filter(t => t.assignee_id === me.user_id && t.status !== 'done'); }
      if (!tasks.length) return reply(show === 'mine' ? 'Nothing on your plate.' : 'No tasks yet.');
      const groups = new Map<string, Task[]>();
      for (const t of tasks) groups.set(t.section, [...(groups.get(t.section) || []), t]);
      const fields = [...groups.entries()].slice(0, 12).map(([section, list]) => ({
        name: sectionName(section),
        value: list.slice(0, 8).map(t => {
          const owner = byUser(ctx, t.assignee_id)?.display_name || 'nobody yet';
          const due = t.due_date ? `, due ${tsDate(t.due_date)}` : '';
          const state = t.status === 'done' ? ' (done)' : t.status === 'doing' ? ' (in progress)' : '';
          return `${t.title}${state}. ${owner}${due}`;
        }).join('\n'),
      }));
      return publicReply({ embeds: [{ title: show === 'mine' ? 'Your tasks' : show === 'done' ? 'Finished tasks' : 'Open tasks', fields, color: INK, footer: { text: `${SITE}tasks/` } }] });
    }
    if (!me) return reply(LINK_FIRST);
    if (sub === 'new') {
      if (!isManager(me)) return reply('Only the lead or a product manager can add tasks. Ask them, or use the dashboard if you have that access.');
      const title = String(get('title') || '').trim();
      const section = String(get('section') || 'general');
      let assignee: Member | null = null;
      const ownerId = get('owner');
      if (ownerId) {
        assignee = byDiscord(ctx, ownerId);
        if (!assignee) return reply(`<@${ownerId}> has not linked their Discord to the dashboard yet. They can run /link.`);
      }
      let due: string | null = null;
      if (get('due')) { due = parseDate(String(get('due'))); if (!due) return reply('I could not read that date. Try 9/24, friday, or tomorrow.'); }
      let link = get('link') ? String(get('link')).trim() : null;
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const { data: row, error } = await ctx.admin.from('suits_tasks').insert({ title, section, assignee_id: assignee?.user_id || null, due_date: due, details: get('details') || null, link, created_by: me.user_id }).select().single();
      if (error || !row) return reply(`Could not add the task. ${error?.message || ''}`);
      await announceTask(ctx, row as Task, 'created', me);
      return reply(`Added ${title}${assignee ? ` for ${assignee.display_name}` : ''}.`);
    }
    if (sub === 'done' || sub === 'assign') {
      const { data: t } = await ctx.admin.from('suits_tasks').select('*').eq('id', String(get('task') || '')).maybeSingle();
      if (!t) return reply('I could not find that task. Pick one from the list that appears as you type.');
      const task = t as Task;
      if (sub === 'done') {
        if (task.assignee_id !== me.user_id && !isManager(me)) return reply('Only the owner of a task, the lead, or a product manager can mark it done.');
        await ctx.admin.from('suits_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', task.id);
        await announceTask(ctx, { ...task, status: 'done' }, 'completed', me);
        return reply(`${task.title} is done.`);
      }
      if (!isManager(me)) return reply('Only the lead or a product manager can reassign tasks.');
      const owner = byDiscord(ctx, String(get('owner')));
      if (!owner) return reply(`<@${get('owner')}> has not linked their Discord to the dashboard yet. They can run /link.`);
      await ctx.admin.from('suits_tasks').update({ assignee_id: owner.user_id, updated_at: new Date().toISOString() }).eq('id', task.id);
      await announceTask(ctx, { ...task, assignee_id: owner.user_id }, 'assigned', me);
      return reply(`${task.title} is now with ${owner.display_name}.`);
    }
  }

  if (name === 'meeting') {
    if (sub === 'list') {
      const { data: rows } = await ctx.admin.from('suits_meetings').select('*').gt('ends_at', new Date().toISOString()).order('starts_at').limit(10);
      const list = (rows || []) as Meeting[];
      if (!list.length) return reply('Nothing scheduled yet.');
      const lines: string[] = [];
      for (const m of list) {
        const answers = await rsvps(ctx, m.id);
        const going = answers.filter(a => a.response === 'yes').length;
        lines.push(`**${m.title}**\n${ts(m.starts_at, 'F')}, ${ts(m.starts_at, 'R')}${m.location ? `\n${m.location}` : ''}${going ? `\n${going} going` : ''}`);
      }
      return publicReply({ embeds: [{ title: 'Coming up', description: lines.join('\n\n'), color: INK, footer: { text: `${SITE}meetings/` } }] });
    }
    if (!me) return reply(LINK_FIRST);
    if (!isManager(me)) return reply('Only the lead or a product manager can schedule or cancel meetings.');
    if (sub === 'new') {
      const date = parseDate(String(get('date') || ''));
      const time = parseTime(String(get('time') || ''));
      if (!date) return reply('I could not read that date. Try 9/24, friday, or tomorrow.');
      if (!time) return reply('I could not read that time. Try 6pm or 6:30 pm.');
      const starts = zonedToUtc(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)), time.hh, time.mm);
      const minutes = Number(get('length') || 60);
      const ends = new Date(starts.getTime() + minutes * 60000);
      const { data: row, error } = await ctx.admin.from('suits_meetings').insert({ title: String(get('title')).trim(), starts_at: starts.toISOString(), ends_at: ends.toISOString(), location: get('where') || null, agenda: get('agenda') || null, created_by: me.user_id }).select().single();
      if (error || !row) return reply(`Could not schedule it. ${error?.message || ''}`);
      await announceMeeting(ctx, row as Meeting, 'created', me);
      return reply(`Scheduled ${row.title} for ${ts(row.starts_at, 'F')}.`);
    }
    if (sub === 'cancel') {
      const { data: m } = await ctx.admin.from('suits_meetings').select('*').eq('id', String(get('meeting') || '')).maybeSingle();
      if (!m) return reply('I could not find that meeting. Pick one from the list that appears as you type.');
      await ctx.admin.from('suits_meetings').delete().eq('id', m.id);
      await announceMeeting(ctx, m as Meeting, 'deleted', me);
      return reply(`Cancelled ${m.title}.`);
    }
  }

  if (name === 'docs') {
    if (sub === 'folder') {
      const { data: setting } = await ctx.admin.from('suits_settings').select('value').eq('key', 'drive_folder').maybeSingle();
      const { data: sub2 } = await ctx.admin.from('suits_settings').select('value').eq('key', 'drive_folders').maybeSingle();
      const root = setting?.value?.url || (setting?.value?.id ? `https://drive.google.com/drive/folders/${setting.value.id}` : null);
      if (!root) return reply('The Drive folder is not connected yet. A lead can set it on the dashboard.');
      const roleFolders = (sub2?.value || {}) as Record<string, { id?: string; url?: string; name?: string }>;
      const lines = [`[The team folder](${root})`];
      for (const [key, f] of Object.entries(roleFolders)) if (f?.id) lines.push(`[${roleName(key)}](https://drive.google.com/drive/folders/${f.id})`);
      return publicReply({ embeds: [{ title: 'Google Drive', description: lines.join('\n'), color: INK }] });
    }
    if (sub === 'search' || sub === 'recent') {
      let q = ctx.admin.from('suits_documents').select('*').order('created_at', { ascending: false }).limit(10);
      if (sub === 'search') q = q.ilike('title', `%${String(get('query') || '').replace(/[%_]/g, '')}%`);
      const { data: rows } = await q;
      const docs = (rows || []) as Doc[];
      if (!docs.length) return reply(sub === 'search' ? 'Nothing with that in the title.' : 'No documents yet.');
      const lines = docs.map(d => `[${d.title}](${docLink(d)}), ${roleName(d.role)}${byUser(ctx, d.created_by) ? `, ${byUser(ctx, d.created_by)!.display_name}` : ''}`);
      return publicReply({ embeds: [{ title: sub === 'search' ? `Documents matching ${get('query')}` : 'Newest documents', description: lines.join('\n'), color: INK, footer: { text: `${SITE}documents/` } }] });
    }
    if (sub === 'add') {
      if (!me) return reply(LINK_FIRST);
      let url = String(get('url') || '').trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return reply('That does not look like a link.'); }
      const title = String(get('title') || host).trim();
      const role = String(get('role') || me.proposal_role || 'team');
      const { data: row, error } = await ctx.admin.from('suits_documents').insert({ title, kind: 'link', url, role, notes: get('notes') || null, created_by: me.user_id, drive_status: 'pending' }).select().single();
      if (error || !row) return reply(`Could not add it. ${error?.message || ''}`);
      const finish = (async () => {
        let driveUrl: string | null = null;
        try {
          const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/suits-drive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ action: 'sync', documentId: row.id, as_user_id: me.user_id }),
          });
          const out = await r.json().catch(() => ({}));
          driveUrl = out.drive_url || null;
        } catch { /* the dashboard shows it as not in Drive and a manager can send it later */ }
        await announceDocument(ctx, { ...(row as Doc), drive_url: driveUrl }, 'created', me);
        await followUp(body.token, { content: `Added ${title} to ${roleName(role)}.${driveUrl ? ` It is in Drive: ${driveUrl}` : ' It is on the dashboard and will go to Drive next time it syncs.'}` }).catch(() => {});
      })();
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(finish); else await finish;
      return { type: 5, data: { flags: 64 } };
    }
  }

  return reply('I do not know that one. Try /help.');
}

async function handleAutocomplete(ctx: Ctx, body: Record<string, any>) {
  const { sub, focused } = optionsOf(body.data);
  const typed = String(focused?.value || '').toLowerCase();
  let choices: Array<{ name: string; value: string }> = [];
  if (body.data.name === 'task') {
    const { data: rows } = await ctx.admin.from('suits_tasks').select('id, title, assignee_id, status').neq('status', 'done').order('created_at', { ascending: false }).limit(100);
    choices = ((rows || []) as Task[])
      .filter(t => t.title.toLowerCase().includes(typed))
      .slice(0, 25)
      .map(t => ({ name: `${t.title}${byUser(ctx, t.assignee_id) ? ` (${byUser(ctx, t.assignee_id)!.display_name})` : ''}`.slice(0, 100), value: t.id }));
  }
  if (body.data.name === 'meeting' && sub === 'cancel') {
    const { data: rows } = await ctx.admin.from('suits_meetings').select('id, title, starts_at').gt('ends_at', new Date().toISOString()).order('starts_at').limit(25);
    choices = ((rows || []) as Meeting[])
      .filter(m => m.title.toLowerCase().includes(typed))
      .map(m => ({ name: `${m.title}, ${new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(m.starts_at))}`.slice(0, 100), value: m.id }));
  }
  return { type: 8, data: { choices } };
}

async function handleComponent(ctx: Ctx, body: Record<string, any>) {
  const [kind, id, value] = String(body.data.custom_id || '').split(':');
  const discordUser = body.member?.user || body.user;
  const me = byDiscord(ctx, discordUser.id);
  if (!me) return reply(LINK_FIRST);

  if (kind === 'rsvp') {
    const { data: m } = await ctx.admin.from('suits_meetings').select('*').eq('id', id).maybeSingle();
    if (!m) return reply('That meeting is gone.');
    await ctx.admin.from('suits_meeting_rsvps').upsert({ meeting_id: id, user_id: me.user_id, response: value, updated_at: new Date().toISOString() });
    return { type: 7, data: { embeds: [await meetingEmbed(ctx, m as Meeting)], components: meetingButtons(m as Meeting), allowed_mentions: NO_PINGS } };
  }

  if (kind === 'task') {
    const { data: t } = await ctx.admin.from('suits_tasks').select('*').eq('id', id).maybeSingle();
    if (!t) return reply('That task is gone.');
    const task = t as Task;
    if (task.assignee_id !== me.user_id && !isManager(me)) return reply('Only the owner of a task, the lead, or a product manager can move it along.');
    await ctx.admin.from('suits_tasks').update({ status: value, updated_at: new Date().toISOString() }).eq('id', id);
    const updated = { ...task, status: value };
    if (value === 'done') {
      const saved = await remembered(ctx, 'task', id);
      if (ctx.settings.channel_id && saved) await post(ctx.settings.channel_id, { content: `${me.display_name} finished ${task.title}.` }).catch(() => {});
    }
    return { type: 7, data: { embeds: [await taskEmbed(ctx, updated)], components: taskButtons(updated), allowed_mentions: NO_PINGS } };
  }

  return reply('That button does not do anything anymore.');
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const loadCtx = async (): Promise<Ctx> => {
    const [{ data: setting }, { data: members }] = await Promise.all([
      admin.from('suits_settings').select('value').eq('key', 'discord').maybeSingle(),
      admin.from('suits_team').select('user_id, email, display_name, role, proposal_role, discord_id, discord_username'),
    ]);
    return {
      admin,
      settings: (setting?.value || {}) as DiscordSettings,
      members: (members || []) as Member[],
      saveSettings: async (s) => { await admin.from('suits_settings').upsert({ key: 'discord', value: s, updated_at: new Date().toISOString() }); },
    };
  };

  // 1. Discord itself (signed)
  if (req.headers.get('X-Signature-Ed25519')) {
    const text = await req.text();
    if (!(await verifySignature(req, text))) return new Response('bad signature', { status: 401 });
    const body = JSON.parse(text);
    if (body.type === 1) return json({ type: 1 });
    try {
      const ctx = await loadCtx();
      if (body.type === 2) return json(await handleCommand(ctx, body));
      if (body.type === 4) return json(await handleAutocomplete(ctx, body));
      if (body.type === 3) return json(await handleComponent(ctx, body));
      return json(reply('I do not know what to do with that.'));
    } catch (err) {
      return json(reply(`Something went wrong: ${(err as Error).message}`));
    }
  }

  // 2. The schedule, or an admin call with the shared secret
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const action = String(body.action || '');
  const cronSecret = Deno.env.get('SUITS_CRON_SECRET');

  if (cronSecret && token === cronSecret) {
    try {
      const ctx = await loadCtx();
      if (action === 'cron') {
        const results: Record<string, unknown> = {};
        try { results.drive = await driveActivity(ctx); } catch (err) { results.drive = { error: (err as Error).message }; }
        try { results.reminders = await reminders(ctx); } catch (err) { results.reminders = { error: (err as Error).message }; }
        return json(results);
      }
      if (action === 'register') return json(await registerCommands());
      return json({ error: 'Unknown action' }, 400);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  }

  // 3. The dashboard, on behalf of a signed in member
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || !TEAM_EMAIL.test(user.email || '')) return json({ error: 'Not signed in with a UMD account' }, 401);
  const ctx = await loadCtx();
  const me = byUser(ctx, user.id);
  if (!me) return json({ error: 'You are not on the team roster yet.' }, 403);

  try {
    if (action === 'status') {
      const configured = !!Deno.env.get('DISCORD_BOT_TOKEN') && !!Deno.env.get('DISCORD_PUBLIC_KEY') && !!Deno.env.get('DISCORD_APP_ID');
      let channel: string | null = null;
      if (configured && ctx.settings.channel_id) {
        try { channel = (await discord(`/channels/${ctx.settings.channel_id}`) as { name: string }).name; } catch { channel = null; }
      }
      return json({ configured, channel, channelId: ctx.settings.channel_id || null, logChannelId: ctx.settings.log_channel_id || null, linked: !!me.discord_id, linkedAs: me.discord_username });
    }

    if (action === 'announce') {
      if (!ctx.settings.channel_id || !Deno.env.get('DISCORD_BOT_TOKEN')) return json({ posted: false, reason: 'not set up' });
      const kind = String(body.kind || '');
      const event = String(body.event || 'created');
      const id = String(body.id || '');
      if (kind === 'task') {
        const { data: t } = await ctx.admin.from('suits_tasks').select('*').eq('id', id).maybeSingle();
        const task = (t || body.snapshot) as Task | undefined;
        if (!task) return json({ posted: false, reason: 'no task' });
        await announceTask(ctx, task, event, me);
      } else if (kind === 'meeting') {
        const { data: m } = await ctx.admin.from('suits_meetings').select('*').eq('id', id).maybeSingle();
        const meeting = (m || body.snapshot) as Meeting | undefined;
        if (!meeting) return json({ posted: false, reason: 'no meeting' });
        if (event === 'rsvp') await refreshMeetingMessage(ctx, meeting);
        else await announceMeeting(ctx, meeting, event, me);
      } else if (kind === 'document') {
        const { data: d } = await ctx.admin.from('suits_documents').select('*').eq('id', id).maybeSingle();
        const doc = (d || body.snapshot) as Doc | undefined;
        if (!doc) return json({ posted: false, reason: 'no document' });
        await announceDocument(ctx, doc, event, me);
      } else {
        return json({ error: 'Unknown kind' }, 400);
      }
      return json({ posted: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
