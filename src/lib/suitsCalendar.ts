export const TEAM_ZONE = 'America/New_York';
export const SUBTEAMS = [
  { key: 'technical', name: 'Technical Design & Systems' },
  { key: 'uiux', name: 'UI / UX Design' },
  { key: 'aiml', name: 'AI / ML' },
  { key: 'hitl', name: 'HITL & Human Factors' },
  { key: 'pm', name: 'Project Management' },
  { key: 'engagement', name: 'Community & Industry' },
] as const;
export type Audience = 'team' | 'subteam' | 'check_in';
export interface CalendarEvent {
  id: string; title: string; starts_at: string; ends_at: string;
  audience?: Audience; subteam?: string | null; attendee_ids?: string[];
  timezone?: string; discord_channel_id?: string | null;
  reminder_minutes?: number[]; notify_discord?: boolean; revision?: number;
  series_id?: string | null; created_by?: string | null;
  location?: string | null; agenda?: string | null;
}
export function zoneParts(date: Date | string, zone = TEAM_ZONE) {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date))) parts[part.type] = part.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
export function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => shiftDay(day, i - weekday));
}
export function monthDays(day: string) {
  const first = `${day.slice(0, 7)}-01`;
  const start = shiftDay(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  return Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
}
/** Reject nonexistent or ambiguous DST wall times instead of silently shifting them. */
export function wallTimeToIso(day: string, time: string, zone = TEAM_ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid date and time.');
  const wanted = `${day}T${time}:00Z`, base = Date.parse(wanted);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== wanted.slice(0, 16)) throw new Error('Choose a valid date and time.');
  let guess = base;
  for (let i = 0; i < 4; i++) { const p = zoneParts(new Date(guess), zone); guess += base - Date.parse(`${p.day}T${p.time}:00Z`); }
  const actual = zoneParts(new Date(guess), zone);
  if (actual.day !== day || actual.time !== time) throw new Error('That time does not exist during the daylight-saving change. Choose another time.');
  for (const offset of [-3600000, 3600000]) { const p = zoneParts(new Date(guess + offset), zone); if (p.day === day && p.time === time) throw new Error('That time occurs twice during the daylight-saving change. Choose a time after 2 AM.'); }
  return new Date(guess).toISOString();
}
export function audienceLabel(event: CalendarEvent) {
  return event.audience === 'check_in' ? 'Check-in' : event.audience === 'subteam' ? SUBTEAMS.find(t => t.key === event.subteam)?.name || 'Subteam' : 'All team';
}
export function eventsOnDay<T extends CalendarEvent>(events: T[], day: string, zone = TEAM_ZONE): T[] {
  return events.filter(e => zoneParts(e.starts_at, zone).day <= day && zoneParts(new Date(Date.parse(e.ends_at) - 1), zone).day >= day).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
/** Assign overlapping events separate columns, including chained overlaps. */
export function layoutDay<T extends CalendarEvent>(events: T[], day: string, zone = TEAM_ZONE) {
  const sorted = eventsOnDay(events, day, zone).map(event => {
    const start = zoneParts(event.starts_at, zone), end = zoneParts(event.ends_at, zone);
    return { event, start: start.day < day ? 0 : start.minutes, end: end.day > day ? 1440 : end.minutes, column: 0, columns: 1 };
  });
  let cluster: typeof sorted = [], ends: number[] = [];
  const flush = () => { for (const e of cluster) e.columns = ends.length; cluster = []; ends = []; };
  for (const item of sorted) {
    if (cluster.length && ends.every(end => end <= item.start)) flush();
    let col = ends.findIndex(end => end <= item.start); if (col < 0) col = ends.length;
    item.column = col; ends[col] = item.end; cluster.push(item);
  }
  flush(); return sorted;
}
export function recurringStarts(day: string, time: string, count: number, zone = TEAM_ZONE) {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Choose between 1 and 12 meetings.');
  return Array.from({ length: count }, (_, i) => wallTimeToIso(shiftDay(day, i * 7), time, zone));
}
export function discordChannelUrl(guild: string | null | undefined, channel: string | null | undefined) {
  return /^\d{17,20}$/.test(guild || '') && /^\d{17,20}$/.test(channel || '') ? `https://discord.com/channels/${guild}/${channel}` : null;
}
export function calendarGoogleUrl(event: CalendarEvent) {
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${stamp(event.starts_at)}/${stamp(event.ends_at)}`, details: event.agenda || '', location: event.location || '' })}`;
}

/** Calendar grid begins at 9 AM. Earlier events remain accessible in Schedule. */
export const CALENDAR_START_MINUTE = 9 * 60;
export function calendarDayWindow<T extends CalendarEvent>(events:T[],day:string,zone=TEAM_ZONE){
 return layoutDay(events,day,zone).filter(e=>e.end>CALENDAR_START_MINUTE).map(e=>({
  ...e,start:Math.max(CALENDAR_START_MINUTE,e.start)-CALENDAR_START_MINUTE,end:e.end-CALENDAR_START_MINUTE,
 }));
}
