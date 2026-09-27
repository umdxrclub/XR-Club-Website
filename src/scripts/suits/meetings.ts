import { api, state, isManager, memberName, type Meeting, type Rsvp, type CalendarOptions } from './api';
import { esc, toast, openModal, confirmModal, field, input, formValue } from './ui';
import { refreshBadges } from './index';
import { datePicker, timePicker, bindPickers } from './pickers';
import { defaultSubteam } from '../../lib/suitsCalendar';
import { TEAM_ZONE, SUBTEAMS, zoneParts, weekDays, monthDays, shiftDay, calendarDayWindow, CALENDAR_START_MINUTE, eventsOnDay, audienceLabel, recurringStarts, calendarGoogleUrl, discordChannelUrl, type Audience } from '../../lib/suitsCalendar';

let cursor = zoneParts(new Date()).day;
let mode: 'week' | 'day' | 'month' | 'schedule' = typeof window !== 'undefined' && window.innerWidth < 760 ? 'day' : 'week';
let selectedSubteam = '';
let calendarMemberKey = '';
const visible = new Set<Audience>(['team', 'subteam', 'check_in']);
let meetings: Meeting[] = [], answers: Rsvp[] = [];
let calendarOptions: CalendarOptions | null = null;
let optionsError = '';
let openingMeeting = false;
let activeHost: HTMLElement | null = null;
let requestVersion = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const dayDate = (d: string) => new Date(`${d}T12:00:00Z`);
const formatDay = (d: string, opts: Intl.DateTimeFormatOptions) => dayDate(d).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TEAM_ZONE, hour: 'numeric', minute: '2-digit' });
const errorText = (err: unknown) => err instanceof Error ? err.message : 'Please try again.';
const icon = (direction: 'prev' | 'next') => direction === 'prev' ? '‹' : '›';

export async function render(host: HTMLElement) {
  const memberKey = `${state.me?.user_id}:${state.me?.proposal_role}`;
  if (calendarMemberKey !== memberKey) {
    calendarMemberKey = memberKey;
    selectedSubteam = defaultSubteam(state.me?.proposal_role);
    visible.clear(); ['team', 'subteam', 'check_in'].forEach(a => visible.add(a as Audience));
  }
  activeHost = host;
  const request = ++requestVersion;
  host.innerHTML = '<div class="sc-empty" role="status">Opening your calendar…</div>';
  try {
    [meetings, answers] = await Promise.all([api.meetings(), api.rsvps()]);
    if (request !== requestVersion || activeHost !== host) return;
    draw(host);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { void refresh(host, false); }, 60000);
    void api.discord<CalendarOptions>('calendar-options').then(options => { calendarOptions = options; optionsError = ''; }).catch(err => { optionsError = errorText(err); });
  } catch (err) {
    if (activeHost !== host) return;
    host.innerHTML = `<div class="sc-error"><h2 class="st-h2">Your calendar couldn’t load.</h2><p class="st-muted">${esc(errorText(err))}</p><button type="button" class="st-btn" data-retry>Try again</button></div>`;
    host.querySelector('[data-retry]')?.addEventListener('click', () => void render(host));
  }
}
export function leave() { activeHost = null; requestVersion++; if (timer) clearInterval(timer); timer = undefined; }
async function refresh(host: HTMLElement, report = true) {
  try {
    const [items, rsvps] = await Promise.all([api.meetings(), api.rsvps()]);
    if (activeHost !== host) return;
    meetings = items; answers = rsvps; draw(host, true);
  } catch (err) { if (report) toast(errorText(err), 'danger'); }
}
function filtered() { return meetings.filter(m => visible.has(m.audience || 'team') && (!selectedSubteam || m.audience !== 'subteam' || m.subteam === selectedSubteam)); }
function rangeLabel() {
  if (mode === 'month') return formatDay(cursor, { month: 'long', year: 'numeric' });
  if (mode === 'day') return formatDay(cursor, { month: 'long', day: 'numeric', year: 'numeric' });
  const days = weekDays(cursor), end = days[6];
  return `${formatDay(days[0], { month: 'short', day: 'numeric' })} – ${formatDay(end, { ...(days[0].slice(0, 7) !== end.slice(0, 7) ? { month: 'short' as const } : {}), day: 'numeric' })}, ${end.slice(0, 4)}`;
}
function draw(host: HTMLElement, preserveScroll = false) {
  const scroll = preserveScroll ? host.querySelector('.sc-week__scroll')?.scrollTop : undefined;
  const items = filtered();
  host.innerHTML = `<div class="st-calendar">
    <div class="sc-toolbar">
      <h1>Calendar</h1><button type="button" class="sc-today" data-today>Today</button>
      <div class="sc-arrows"><button type="button" class="sc-icon" data-shift="-1" aria-label="Previous ${mode === 'month' ? 'month' : mode === 'day' ? 'day' : 'week'}">${icon('prev')}</button><button type="button" class="sc-icon" data-shift="1" aria-label="Next ${mode === 'month' ? 'month' : mode === 'day' ? 'day' : 'week'}">${icon('next')}</button></div>
      <p class="sc-period" aria-live="polite">${esc(rangeLabel())}</p>
      <select class="sc-mode" aria-label="Calendar view">${['day', 'week', 'month', 'schedule'].map(v => `<option value="${v}"${v === mode ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>
      ${isManager() ? '<button type="button" class="sc-create" data-create><span aria-hidden="true">+</span> Create</button>' : ''}
    </div>
    <div class="sc-filters">${(['team', 'subteam', 'check_in'] as Audience[]).map(a => `<label class="sc-filter sc-filter--${a}"><input type="checkbox" data-filter="${a}"${visible.has(a) ? ' checked' : ''} />${a === 'team' ? 'All team' : a === 'subteam' ? 'Subteams' : 'Check-ins'}</label>`).join('')}
      <select class="sc-subteam" aria-label="Filter subteam"><option value="">All subteams</option>${SUBTEAMS.map(t => `<option value="${t.key}"${selectedSubteam === t.key ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select><span class="sc-zone">Eastern time</span>
    </div>
    ${mode === 'month' ? monthHtml(items) : mode === 'schedule' ? scheduleHtml(items) : weekHtml(items)}
  </div>`;
  host.querySelector('[data-early]')?.addEventListener('click',()=>{mode='schedule';draw(host);});
  host.querySelector('[data-today]')?.addEventListener('click', () => { cursor = zoneParts(new Date()).day; draw(host); });
  host.querySelectorAll<HTMLElement>('[data-shift]').forEach(b => b.addEventListener('click', () => {
    const direction = Number(b.dataset.shift);
    if (mode === 'month') { const d = dayDate(`${cursor.slice(0, 7)}-01`); d.setUTCMonth(d.getUTCMonth() + direction); cursor = d.toISOString().slice(0, 10); }
    else cursor = shiftDay(cursor, direction * (mode === 'day' ? 1 : 7));
    draw(host);
  }));
  host.querySelector<HTMLSelectElement>('.sc-mode')?.addEventListener('change', e => { mode = (e.target as HTMLSelectElement).value as typeof mode; draw(host); });
  host.querySelector<HTMLSelectElement>('.sc-subteam')?.addEventListener('change', e => { selectedSubteam = (e.target as HTMLSelectElement).value; draw(host, true); });
  host.querySelectorAll<HTMLInputElement>('[data-filter]').forEach(b => b.addEventListener('change', () => { const a = b.dataset.filter as Audience; if (b.checked) visible.add(a); else visible.delete(a); draw(host, true); }));
  host.querySelector('[data-create]')?.addEventListener('click', () => void editMeeting(host));
  host.querySelectorAll<HTMLElement>('[data-create-day]').forEach(b => b.addEventListener('click', () => { if (isManager()) void editMeeting(host, undefined, b.dataset.createDay, b.dataset.time); else { cursor = b.dataset.createDay!; mode = 'day'; draw(host); } }));
  host.querySelectorAll<HTMLElement>('[data-event]').forEach(b => b.addEventListener('click', () => { const m = meetings.find(m => m.id === b.dataset.event); if (m) showMeeting(host, m); }));
  const scroller = host.querySelector('.sc-week__scroll');
  if (scroller) scroller.scrollTop = scroll ?? 0;
}
function eventHtml(m: Meeting, style = '', compact = false) {
  return `<button type="button" class="sc-event" data-event="${esc(m.id)}" data-audience="${m.audience || 'team'}" ${style ? `style="${style}"` : ''} aria-label="${esc(`${m.title}, ${time(m.starts_at)}, ${audienceLabel(m)}`)}"><strong>${esc(m.title)}</strong>${compact ? '' : `<small>${esc(time(m.starts_at))} – ${esc(time(m.ends_at))}</small>${m.location ? `<small>${esc(m.location)}</small>` : ''}`}</button>`;
}
function weekHtml(items: Meeting[]) {
  const days = mode === 'day' ? [cursor] : weekDays(cursor), today = zoneParts(new Date());
  const early=items.filter(m=>days.includes(zoneParts(m.starts_at).day)&&zoneParts(m.starts_at).minutes<CALENDAR_START_MINUTE).length;
  return `${early?`<button type="button" class="sc-early" data-early>${early} meeting${early===1?'':'s'} before 9 AM · View in Schedule</button>`:''}<div class="sc-week" style="--days:${days.length}"><div class="sc-week__head"><span></span>${days.map(d => `<div class="sc-week__day${today.day === d ? ' is-today' : ''}"><span>${formatDay(d, { weekday: 'short' })}</span><strong>${Number(d.slice(8))}</strong></div>`).join('')}</div>
  <div class="sc-week__scroll"><div class="sc-week__body"><div class="sc-hours">${Array.from({ length: 15 }, (_, i) => `<span style="top:${i * 60 + 12}px">${(i + 9) % 12 || 12} ${i + 9 < 12 ? 'AM' : 'PM'}</span>`).join('')}</div>
  ${days.map(d => `<div class="sc-day">${isManager() ? Array.from({ length: 30 }, (_, i) => `<button type="button" class="sc-slot" style="top:${i * 30 + 12}px" data-create-day="${d}" data-time="${String((Math.floor(i / 2) + 9)).padStart(2, '0')}:${i % 2 ? '30' : '00'}" aria-label="Schedule ${formatDay(d, { month: 'long', day: 'numeric' })} at ${(Math.floor(i / 2) + 9)}:${i % 2 ? '30' : '00'} Eastern"></button>`).join('') : ''}
  ${calendarDayWindow(items, d).map(e => eventHtml(e.event, `top:${e.start + 12}px;height:${Math.max(22, e.end - e.start - 2)}px;left:calc(${e.column / e.columns * 100}% + 2px);width:calc(${100 / e.columns}% - 5px)`, e.end - e.start <= 30)).join('')}${today.day === d && today.minutes >= CALENDAR_START_MINUTE ? `<div class="sc-now" style="top:${today.minutes - CALENDAR_START_MINUTE + 12}px"></div>` : ''}</div>`).join('')}</div></div></div>`;
}
function monthHtml(items: Meeting[]) {
  const today = zoneParts(new Date()).day;
  return `<div class="sc-month">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="sc-month__label">${d}</div>`).join('')}${monthDays(cursor).map(d => `<div class="sc-month__cell${d.slice(0, 7) !== cursor.slice(0, 7) ? ' is-outside' : ''}${today === d ? ' is-today' : ''}"><button type="button" class="sc-month__date" data-create-day="${d}" aria-label="${formatDay(d, { month: 'long', day: 'numeric' })}">${Number(d.slice(8))}</button>${eventsOnDay(items, d).map(m => eventHtml(m, '', true)).join('')}</div>`).join('')}</div>`;
}
function scheduleHtml(items: Meeting[]) {
  const end = shiftDay(cursor, 35), days = [...new Set(items.filter(m => zoneParts(m.starts_at).day >= cursor && zoneParts(m.starts_at).day < end).map(m => zoneParts(m.starts_at).day))];
  return `<div class="sc-agenda">${days.length ? days.map(d => `<section class="sc-agenda__day"><div class="sc-agenda__date">${formatDay(d, { weekday: 'short', month: 'short' })}<strong>${Number(d.slice(8))}</strong></div><div>${eventsOnDay(items, d).map(m => `<button type="button" class="sc-agenda__event" data-event="${m.id}"><small>${esc(time(m.starts_at))}</small><strong>${esc(m.title)}</strong><small>${esc(audienceLabel(m))}</small></button>`).join('')}</div></section>`).join('') : '<p class="sc-empty"><strong>No meetings scheduled.</strong>No meetings in the next five weeks.</p>'}</div>`;
}

function showMeeting(host: HTMLElement, m: Meeting) {
  const channel = discordChannelUrl(calendarOptions?.guildId, m.discord_channel_id);
  void openModal({ title: m.title, cancelLabel: 'Done', body: `
    <div class="sc-details"><p><small>${esc(audienceLabel(m))}</small>${esc(formatDay(zoneParts(m.starts_at).day, { weekday: 'long', month: 'long', day: 'numeric' }))}<br>${esc(time(m.starts_at))} – ${esc(time(m.ends_at))} · Eastern time</p>
    ${m.audience === 'check_in' ? `<p><small>With</small>${esc((m.attendee_ids || []).map(memberName).join(', '))}</p>` : ''}
    ${m.location || channel ? `<p><small>Where</small>${channel ? `<a href="${channel}" target="_blank" rel="noopener">Join Discord channel ↗</a>` : esc(m.location)}</p>` : ''}
    ${m.agenda ? `<p style="white-space:pre-wrap"><small>Agenda</small>${esc(m.agenda)}</p>` : ''}
    <div><small>Your response</small>${rsvpControlHtml(m, answers)}</div></div>
    <div class="sc-detail-actions"><a class="st-btn st-btn--small" href="${esc(calendarGoogleUrl(m))}" target="_blank" rel="noopener">Add to Google Calendar</a><button type="button" class="st-btn st-btn--small" data-ics>Download event</button>${isManager() ? '<button type="button" class="st-btn st-btn--small" data-edit>Edit</button><button type="button" class="st-btn st-btn--small" data-delete>Cancel meeting</button>' : ''}</div>
    ${isManager() ? '<details class="sc-deliveries"><summary>Discord delivery</summary><div data-deliveries>Loading…</div></details>' : ''}` });
  const modal = document.querySelector<HTMLElement>('.st-modal')!;
  const close = () => modal.querySelector<HTMLButtonElement>('[data-modal-cancel]')?.click();
  bindRsvp(modal, async () => { answers = await api.rsvps(); });
  modal.querySelector('[data-ics]')?.addEventListener('click', () => downloadIcs(m));
  modal.querySelector('[data-edit]')?.addEventListener('click', () => { close(); void editMeeting(host, m); });
  modal.querySelector('[data-delete]')?.addEventListener('click', async () => {
    close();
    if (!(await confirmModal('Cancel this meeting?', 'Everyone invited will see the cancellation. Other dates in a recurring series stay scheduled.', 'Cancel meeting'))) return;
    try { await api.deleteMeeting(m.id, m); await refresh(host); await refreshBadges(); toast('Meeting cancelled.'); } catch (err) { toast(errorText(err), 'danger'); }
  });
  if (isManager()) void api.meetingDeliveries(m.id).then(rows => {
    const area = modal.querySelector('[data-deliveries]');
    if (area) area.innerHTML = rows.length ? `<ul>${rows.map(r => `<li>${esc(r.recipient_id ? memberName(r.recipient_id) : m.audience === 'check_in' ? 'Reminders channel' : m.audience === 'subteam' ? 'Subteam channel' : 'Announcements channel')} · ${esc(r.kind === 'reminder' ? 'Reminder' : 'Update')} · ${esc(r.status)}${r.last_error ? ` — ${esc(r.last_error)}` : ''}</li>`).join('')}</ul>` : '<p>No notifications queued for this event.</p>';
  }).catch(() => { const area = modal.querySelector('[data-deliveries]'); if (area) area.textContent = 'Delivery status isn’t available yet.'; });
}

async function editMeeting(host: HTMLElement, existing?: Meeting, day?: string, startTime?: string) {
  if (openingMeeting) return;
  if (!calendarOptions) {
    openingMeeting = true;
    try { calendarOptions = await api.discord<CalendarOptions>('calendar-options'); optionsError = ''; }
    catch (err) { optionsError = errorText(err); }
    finally { openingMeeting = false; }
    if (activeHost !== host) return;
  }
  const p = existing ? zoneParts(existing.starts_at, existing.timezone || TEAM_ZONE) : zoneParts(new Date(Date.now() + 3600000));
  const minutes = existing ? Math.round((Date.parse(existing.ends_at) - Date.parse(existing.starts_at)) / 60000) : 30;
  const audience = existing?.audience || (selectedSubteam ? 'subteam' : 'team');
  const channels = [...(calendarOptions?.channels || [])];
  // A temporary Discord outage must not clear an existing channel on save.
  for (const [id, type] of [[existing?.discord_channel_id, 2], [existing?.announcement_channel_id, 0]] as const) {
    if (id && !channels.some(c => c.id === id)) channels.push({ id, type, name: 'Current saved channel' });
  }
  const options = (values: { value: string; label: string }[], current: string) => values.map(o => `<option value="${esc(o.value)}"${o.value === current ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  const reservedChannels = [calendarOptions?.announcementChannelId, calendarOptions?.remindersChannelId];
  const subteamChannels = channels.filter(c => [0, 5].includes(c.type) && !reservedChannels.includes(c.id));
  const savedUpdatesChannel = audience === 'subteam' && subteamChannels.some(c => c.id === existing?.announcement_channel_id) ? existing!.announcement_channel_id! : '';
  const zones = [...new Set([TEAM_ZONE, existing?.timezone || TEAM_ZONE, Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC'])];
  let desiredAudience = audience;
  void openModal({ title: existing ? 'Edit meeting' : 'Create a meeting', className:'sc-compose', submitLabel: existing ? 'Save changes' : 'Schedule meeting', body: `
    <div class="sc-type" aria-label="Meeting audience">${(['team', 'subteam', 'check_in'] as Audience[]).map(a => `<button type="button" data-audience-choice="${a}" aria-pressed="${a === audience}">${a === 'team' ? 'All team' : a === 'subteam' ? 'Subteam' : '1:1 check-in'}</button>`).join('')}</div>
    ${field('title', 'Title', input('title', `maxlength="160" value="${esc(existing?.title || '')}" placeholder="Meeting title"`))}
    <div data-subteam-field${audience !== 'subteam' ? ' hidden' : ''}>${field('subteam', 'Subteam', `<select class="sc-native" name="subteam" id="f-subteam">${options(SUBTEAMS.map(t => ({ value: t.key, label: t.name })), existing?.subteam || selectedSubteam || state.me?.proposal_role || 'technical')}</select>`)}</div>
    <div data-person-field${audience !== 'check_in' ? ' hidden' : ''}>${field('person', 'Who are you checking in with?', `<select class="sc-native" name="person" id="f-person"><option value="">Choose a teammate</option>${options(state.members.filter(m => m.user_id !== state.me!.user_id).map(m => ({ value: m.user_id, label: m.display_name })), existing?.attendee_ids?.[0] || '')}</select>`)}<p class="sc-form-note" data-person-link></p></div>
    <div class="st-row">${field('date', 'Date', datePicker('date',day || p.day))}${field('start', 'Time', timePicker('start',startTime || (existing ? p.time : `${String(Math.max(9,Number(p.time.slice(0,2)))).padStart(2,'0')}:00`)))}</div>
    <div class="st-row">${field('duration', 'Duration', `<select class="sc-native" name="duration" id="f-duration">${options([...new Set([15, 30, 45, 60, 90, 120, minutes])].sort((a, b) => a - b).map(n => ({ value: String(n), label: `${n} minutes` })), String(minutes))}</select>`)}
    ${field('channel', 'Discord meeting channel', `<select class="sc-native" name="channel" id="f-channel"><option value="">Choose a channel</option>${options(channels.filter(c => [0, 2, 13].includes(c.type)).map(c => ({ value: c.id, label: `${c.type === 2 || c.type === 13 ? 'Voice · ' : '# '}${c.name}` })), existing?.discord_channel_id || calendarOptions?.meetingChannelId || '')}</select>`)}</div>
    ${!calendarOptions?.configured ? `<p class="sc-form-note">${esc(optionsError ? 'Discord channels are temporarily unavailable. You can still add a meeting location.' : 'Connect the SUITS bot to load server channels.')}</p>` : ''}
    ${field('location', 'Location or call link', input('location', `maxlength="500" value="${esc(existing?.location || '')}" placeholder="Optional when using a Discord channel"`))}
    ${field('agenda', 'Notes', `<textarea class="st-textarea" id="f-agenda" name="agenda" rows="2" maxlength="4000" placeholder="A short agenda, if needed">${esc(existing?.agenda || '')}</textarea>`)}
    <details class="sc-advanced"><summary>Repeat, reminders & more</summary>
    <div class="st-row">${field('timezone', 'Time zone', `<select class="sc-native" name="timezone" id="f-timezone">${options(zones.map(z => ({ value: z, label: z === TEAM_ZONE ? 'Eastern · New York' : z.replace(/_/g, ' ') })), existing?.timezone || TEAM_ZONE)}</select>`)}
    ${!existing ? field('repeat', 'Repeat', `<select class="sc-native" name="repeat" id="f-repeat">${options([{ value: '1', label: 'Does not repeat' }, { value: '4', label: 'Every week · 4 meetings' }, { value: '8', label: 'Every week · 8 meetings' }, { value: '12', label: 'Every week · 12 meetings' }], '1')}</select>`) : existing.series_id ? '<p class="sc-form-note">Changes apply to this meeting only.</p>' : ''}</div>
    <label class="sc-filter"><input type="checkbox" name="notify"${existing?.notify_discord !== false ? ' checked' : ''} />Send Discord updates and reminders</label>
    <div class="st-field" style="margin-top:14px"><span class="st-label">Remind invited people</span><div class="sc-reminders">${[1440, 60, 10].map(n => `<label><input type="checkbox" name="reminder" value="${n}"${(existing?.reminder_minutes || [60, 10]).includes(n) ? ' checked' : ''} />${n === 1440 ? '1 day' : n === 60 ? '1 hour' : '10 minutes'} before</label>`).join('')}</div></div>
    <div data-updates-channel${audience !== 'subteam' ? ' hidden' : ''}>${field('announcement', 'Subteam updates channel', `<select class="sc-native" name="announcement" id="f-announcement"><option value="">Same as the meeting channel</option>${options(subteamChannels.map(c => ({ value: c.id, label: `# ${c.name}` })), savedUpdatesChannel)}</select>`)}</div>
    <p class="sc-form-note" data-discord-routing aria-live="polite"></p>
    <p class="sc-form-note">Linked teammates also get a DM when scheduled and before the meeting. Private check-in titles and notes stay in DMs.</p>
    </details>
    <p class="sc-form-note" data-conflict></p>
  `, onSubmit: async (form, close) => {
    const attendee = formValue(form, 'person');
    if (desiredAudience === 'check_in' && !attendee) throw new Error('Choose a teammate for the check-in.');
    const zone = formValue(form, 'timezone');
    const starts = recurringStarts(formValue(form, 'date'), formValue(form, 'start'), existing ? 1 : Number(formValue(form, 'repeat')), zone);
    const duration = Number(formValue(form, 'duration'));
    if (!Number.isFinite(duration) || duration < 5 || duration > 720) throw new Error('Choose a duration between 5 minutes and 12 hours.');
    const title = formValue(form, 'title') || (desiredAudience === 'check_in' ? `Check-in with ${memberName(attendee)}` : desiredAudience === 'subteam' ? `${SUBTEAMS.find(t => t.key === formValue(form, 'subteam'))?.name || 'Subteam'} meeting` : 'Team meeting');
    const notify = (form.elements.namedItem('notify') as HTMLInputElement).checked;
    const updatesChannel = desiredAudience === 'subteam' ? formValue(form, 'announcement') || null : null;
    if (notify && desiredAudience === 'check_in' && (!calendarOptions?.remindersChannelId || calendarOptions.remindersChannelId === calendarOptions.announcementChannelId)) throw new Error('Set a separate reminders channel with /setup in Discord, then reopen the calendar. Or turn off Discord updates for this meeting.');
    if (notify && desiredAudience === 'subteam') {
      const destination = updatesChannel || formValue(form, 'channel');
      if (!destination || reservedChannels.includes(destination)) throw new Error('Choose this subteam’s meeting or updates channel. Subteam meetings cannot post to announcements or reminders.');
    }
    const payload = { title, starts_at: starts[0], ends_at: new Date(Date.parse(starts[0]) + duration * 60000).toISOString(), timezone: zone, audience: desiredAudience, subteam: desiredAudience === 'subteam' ? formValue(form, 'subteam') : null, attendee_ids: desiredAudience === 'check_in' ? [attendee] : [], discord_channel_id: formValue(form, 'channel') || null, announcement_channel_id: updatesChannel, location: formValue(form, 'location') || null, agenda: formValue(form, 'agenda') || null, notify_discord: notify, reminder_minutes: [...form.querySelectorAll<HTMLInputElement>('input[name="reminder"]:checked')].map(i => Number(i.value)) };
    if (existing) await api.updateMeeting(existing.id, payload);
    else await api.scheduleMeetings(starts.map(start => ({ ...payload, starts_at: start, ends_at: new Date(Date.parse(start) + duration * 60000).toISOString() })));
    cursor = zoneParts(starts[0]).day; close();
    toast(existing ? 'Meeting updated.' : starts.length > 1 ? `${starts.length} meetings scheduled.` : 'Meeting scheduled.');
    await refresh(host); await refreshBadges();
  } });
  const modal = document.querySelector<HTMLElement>('.st-modal')!, form = modal.querySelector('form')!;
  modal.classList.add('sc-compose');
  bindPickers(modal);
  const update = () => {
    const person = state.members.find(m => m.user_id === formValue(form, 'person'));
    const note = modal.querySelector<HTMLElement>('[data-person-link]')!;
    note.textContent = person ? person.discord_id ? 'Discord linked · participant tags and reminder DMs enabled.' : 'This teammate needs to link Discord in Team to receive tags and DMs.' : '';
    const channelLabel = (id: string | null | undefined, fallback: string) => channels.find(c => c.id === id)?.name ? `#${channels.find(c => c.id === id)!.name}` : fallback;
    const routing = modal.querySelector<HTMLElement>('[data-discord-routing]')!;
    modal.querySelector<HTMLElement>('[data-updates-channel]')!.hidden = desiredAudience !== 'subteam';
    routing.textContent = desiredAudience === 'check_in'
      ? calendarOptions?.remindersChannelId ? `1:1 updates and reminders go to ${channelLabel(calendarOptions.remindersChannelId, 'the reminders channel')} and tag the two participants. People who decline are not tagged in reminders.` : 'Set a separate reminders channel with /setup in Discord before enabling check-in notifications.'
      : desiredAudience === 'subteam' ? `Updates and reminders go only to ${channelLabel(formValue(form, 'announcement') || formValue(form, 'channel'), 'the selected subteam channel')}.`
      : `All-team updates and reminders go to ${channelLabel(calendarOptions?.announcementChannelId, 'the announcements channel')}.`;
    try {
      const starts = recurringStarts(formValue(form, 'date'), formValue(form, 'start'), 1, formValue(form, 'timezone'));
      const start = Date.parse(starts[0]), end = start + Number(formValue(form, 'duration')) * 60000;
      const conflicts = meetings.filter(m => m.id !== existing?.id && Date.parse(m.starts_at) < end && Date.parse(m.ends_at) > start && (m.audience === 'team' || desiredAudience === 'team' || (desiredAudience === 'subteam' && m.subteam === formValue(form, 'subteam')) || (desiredAudience === 'check_in' && ((m.attendee_ids || []).includes(formValue(form, 'person')) || m.created_by === state.me?.user_id))));
      modal.querySelector<HTMLElement>('[data-conflict]')!.textContent = conflicts.length ? `Overlaps with ${conflicts.map(m => m.title).join(', ')}. Choose another time or schedule anyway.` : '';
    } catch { modal.querySelector<HTMLElement>('[data-conflict]')!.textContent = ''; }
  };
  modal.querySelectorAll<HTMLElement>('[data-audience-choice]').forEach(b => b.addEventListener('click', () => {
    desiredAudience = b.dataset.audienceChoice as Audience;
    modal.querySelectorAll('[data-audience-choice]').forEach(el => el.setAttribute('aria-pressed', String(el === b)));
    modal.querySelector<HTMLElement>('[data-subteam-field]')!.hidden = desiredAudience !== 'subteam';
    modal.querySelector<HTMLElement>('[data-person-field]')!.hidden = desiredAudience !== 'check_in'; update();
  }));
  form.addEventListener('change', update); update();
}

export function rsvpControlHtml(m: Meeting, rsvps: Rsvp[]) {
  const mine = rsvps.find(r => r.meeting_id === m.id && r.user_id === state.me!.user_id)?.response;
  return `<span class="st-rsvp" data-rsvp="${m.id}">${(['yes', 'maybe', 'no'] as const).map(r => `<button type="button" data-response="${r}" aria-pressed="${mine === r}" class="${mine === r ? 'is-active' : ''}">${r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't go"}</button>`).join('')}</span>`;
}
export function bindRsvp(host: HTMLElement, after: () => Promise<void>) {
  host.querySelectorAll<HTMLElement>('[data-rsvp]').forEach(group => group.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-response]'); if (!btn || btn.disabled) return;
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')]; buttons.forEach(b => { b.disabled = true; });
    try { await api.setRsvp(group.dataset.rsvp!, btn.dataset.response as Rsvp['response']); buttons.forEach(b => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); }); await after(); }
    catch (err) { toast(errorText(err), 'danger'); } finally { buttons.forEach(b => { b.disabled = false; }); }
  }));
}
function downloadIcs(m: Meeting) {
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//XR Labs//SUITS//EN', 'BEGIN:VEVENT', `UID:${m.id}@xr.umd.edu`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(m.starts_at)}`, `DTEND:${stamp(m.ends_at)}`, `SUMMARY:${text(m.title)}`, `LOCATION:${text(m.location || '')}`, `DESCRIPTION:${text(m.agenda || '')}`, 'END:VEVENT', 'END:VCALENDAR'];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'suits-meeting.ics' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
