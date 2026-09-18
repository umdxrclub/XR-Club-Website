// Meetings: a small month at the top, then the schedule day by day. Everyone
// answers with one tap and puts a meeting on their own calendar. Managers
// schedule with a date, a start time, and a duration.
import { api, state, isManager, memberName, type Meeting, type Rsvp } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, formValue, fmtTime, dateKey, initials } from './ui';
import { refreshBadges } from './index';

let monthCursor: Date | null = null;
let dayFilter: string | null = null;
let showPast = false;

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const [meetings, rsvps] = await Promise.all([api.meetings(), api.rsvps()]);
  const now = Date.now();
  const upcoming = meetings.filter(m => new Date(m.ends_at).getTime() > now);
  const past = meetings.filter(m => new Date(m.ends_at).getTime() <= now).reverse();
  if (!monthCursor) monthCursor = new Date(upcoming[0] ? upcoming[0].starts_at : Date.now());

  const listed = dayFilter ? meetings.filter(m => dateKey(new Date(m.starts_at)) === dayFilter) : upcoming;
  const days = new Map<string, Meeting[]>();
  for (const m of listed) { const k = dateKey(new Date(m.starts_at)); days.set(k, [...(days.get(k) || []), m]); }

  host.innerHTML = `
    <div class="st-section" style="margin-bottom:1.25rem;">
      <div class="st-toolbar">
        <div><h2 class="st-h1" style="margin:0 0 0.2rem;">Meetings</h2><p class="st-muted" style="margin:0;">${upcoming.length ? `${upcoming.length} coming up` : 'Nothing scheduled'}</p></div>
        ${isManager() ? `<button type="button" class="st-btn st-btn--primary" id="st-new-meeting">New meeting</button>` : ''}
      </div>
    </div>
    <div class="st-callayout">
      <aside class="st-month" id="st-month">${monthHtml(monthCursor, meetings)}</aside>
      <div class="st-agenda" id="st-agenda">
        ${dayFilter ? `<p class="st-agenda__filter">Showing ${esc(new Date(dayFilter + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}. <button type="button" class="st-agenda__clear" id="st-day-clear">Show everything</button></p>` : ''}
        ${days.size ? [...days.entries()].map(([k, list]) => dayHtml(k, list, rsvps, now)).join('') : `<p class="st-group__empty">${dayFilter ? 'Nothing on this day.' : `Nothing scheduled yet.${isManager() ? ' Add the first meeting.' : ''}`}</p>`}
        ${!dayFilter && past.length ? `
          <button type="button" class="st-agenda__past" id="st-past-toggle">${showPast ? 'Hide' : 'Show'} ${past.length} past meeting${past.length === 1 ? '' : 's'}</button>
          ${showPast ? past.slice(0, 20).map(m => dayHtml(dateKey(new Date(m.starts_at)), [m], rsvps, now, true)).join('') : ''}` : ''}
      </div>
    </div>`;

  host.querySelector('#st-new-meeting')?.addEventListener('click', () => editMeeting(host, null));
  host.querySelector('#st-day-clear')?.addEventListener('click', () => { dayFilter = null; void render(host); });
  host.querySelector('#st-past-toggle')?.addEventListener('click', () => { showPast = !showPast; void render(host); });
  host.querySelector('#st-month-prev')?.addEventListener('click', () => { monthCursor = new Date(monthCursor!.getFullYear(), monthCursor!.getMonth() - 1, 1); void render(host); });
  host.querySelector('#st-month-next')?.addEventListener('click', () => { monthCursor = new Date(monthCursor!.getFullYear(), monthCursor!.getMonth() + 1, 1); void render(host); });
  host.querySelectorAll<HTMLElement>('[data-day]').forEach(b => b.addEventListener('click', () => { dayFilter = dayFilter === b.dataset.day ? null : b.dataset.day!; void render(host); }));
  host.querySelectorAll<HTMLElement>('[data-meeting-menu]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openMeetingMenu(host, b, meetings.find(m => m.id === b.dataset.meetingMenu)!); }));
  bindRsvp(host, async () => render(host));
}

function monthHtml(cursor: Date, meetings: Meeting[]) {
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const first = new Date(y, mo, 1);
  const startPad = first.getDay();
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const today = dateKey(new Date());
  const has = new Set(meetings.map(m => dateKey(new Date(m.starts_at))));
  const cells: string[] = [];
  for (let i = 0; i < startPad; i++) cells.push('<span class="st-month__cell is-pad"></span>');
  for (let d = 1; d <= daysIn; d++) {
    const k = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(`<button type="button" class="st-month__cell${k === today ? ' is-today' : ''}${has.has(k) ? ' has-meeting' : ''}${dayFilter === k ? ' is-selected' : ''}" data-day="${k}">${d}</button>`);
  }
  return `
    <div class="st-month__head">
      <button type="button" class="st-month__nav" id="st-month-prev" aria-label="Previous month"><span></span></button>
      <span class="st-month__title">${esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span>
      <button type="button" class="st-month__nav st-month__nav--next" id="st-month-next" aria-label="Next month"><span></span></button>
    </div>
    <div class="st-month__grid">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="st-month__dow">${d}</span>`).join('')}
      ${cells.join('')}
    </div>`;
}

function dayHtml(key: string, list: Meeting[], rsvps: Rsvp[], now: number, past = false) {
  const d = new Date(key + 'T12:00:00');
  const daysAway = Math.round((d.getTime() - now) / 86400000);
  const rel = past ? '' : daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : daysAway > 1 ? `In ${daysAway} days` : '';
  return `
    <section class="st-agenda__day${past ? ' is-past' : ''}">
      <div class="st-agenda__date">
        <span class="st-agenda__dow">${esc(d.toLocaleDateString(undefined, { weekday: 'long' }))}</span>
        <span class="st-agenda__md">${esc(d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))}</span>
        ${rel ? `<span class="st-agenda__rel">${esc(rel)}</span>` : ''}
      </div>
      ${list.map(m => meetingRowHtml(m, rsvps, past)).join('')}
    </section>`;
}

function meetingRowHtml(m: Meeting, rsvps: Rsvp[], past: boolean) {
  const going = rsvps.filter(r => r.meeting_id === m.id && r.response === 'yes');
  const maybe = rsvps.filter(r => r.meeting_id === m.id && r.response === 'maybe').length;
  const people = going.slice(0, 5).map(r => `<span class="st-avatar-sm" title="${esc(memberName(r.user_id))}">${esc(initials(memberName(r.user_id)))}</span>`).join('');
  const count = going.length ? `${going.length} going${maybe ? `, ${maybe} maybe` : ''}` : maybe ? `${maybe} maybe` : 'No replies yet';
  return `
    <div class="st-mrow">
      <div class="st-mrow__time"><span>${esc(fmtTime(m.starts_at))}</span><span class="st-mrow__end">${esc(fmtTime(m.ends_at))}</span></div>
      <div class="st-mrow__main">
        <p class="st-mrow__title">${esc(m.title)}</p>
        ${m.location ? `<p class="st-mrow__where">${linkify(m.location)}</p>` : ''}
        ${m.agenda ? `<p class="st-mrow__agenda">${esc(m.agenda)}</p>` : ''}
        <div class="st-mrow__foot">
          ${past ? '' : rsvpControlHtml(m, rsvps)}
          <span class="st-mrow__people">${people}<span class="st-mrow__count">${esc(count)}</span></span>
        </div>
      </div>
      <button type="button" class="st-doccard__more st-mrow__more" data-meeting-menu="${m.id}" aria-label="More options"><span></span><span></span><span></span></button>
    </div>`;
}

export function rsvpControlHtml(m: Meeting, rsvps: Rsvp[]) {
  const mine = rsvps.find(r => r.meeting_id === m.id && r.user_id === state.me!.user_id)?.response;
  return `<span class="st-rsvp" data-rsvp="${m.id}">${(['yes', 'maybe', 'no'] as const).map(r => `<button type="button" data-response="${r}" class="${mine === r ? 'is-active' : ''}">${r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't"}</button>`).join('')}</span>`;
}

export function bindRsvp(host: HTMLElement, after: () => Promise<void>) {
  host.querySelectorAll<HTMLElement>('[data-rsvp]').forEach(group => {
    group.addEventListener('click', async e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-response]');
      if (!btn) return;
      group.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
      try {
        await api.setRsvp(group.dataset.rsvp!, btn.dataset.response as Rsvp['response']);
        await after();
      } catch (err) {
        toast((err as Error).message, 'danger');
      }
    });
  });
}

function openMeetingMenu(host: HTMLElement, button: HTMLElement, m: Meeting) {
  document.querySelector('.st-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'st-menu';
  menu.innerHTML = `
    <button type="button" data-act="google">Add to Google Calendar</button>
    <button type="button" data-act="ics">Add to Apple or Outlook</button>
    ${isManager() ? `<button type="button" data-act="edit">Edit</button><button type="button" data-act="delete" class="is-danger">Delete</button>` : ''}`;
  const root = document.getElementById('st') || document.body;
  root.appendChild(menu);
  const r = button.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const top = window.innerHeight - r.bottom < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
  const close = () => { menu.remove(); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); };
  const onDoc = (e: Event) => { if (!menu.contains(e.target as Node)) close(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); window.addEventListener('scroll', close, true); }, 0);
  menu.addEventListener('click', async e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'google') window.open(googleCalendarUrl(m), '_blank', 'noopener');
    if (act === 'ics') downloadIcs(m);
    if (act === 'edit') editMeeting(host, m);
    if (act === 'delete') {
      if (!(await confirmModal('Delete this meeting?', `"${m.title}" will be removed for everyone.`, 'Delete meeting'))) return;
      await api.deleteMeeting(m.id);
      await refreshBadges();
      await render(host);
    }
  });
}

const DURATIONS = [30, 60, 90, 120];

function editMeeting(host: HTMLElement, existing: Meeting | null) {
  const start = existing ? new Date(existing.starts_at) : nextHour();
  const minutes = existing ? Math.round((new Date(existing.ends_at).getTime() - start.getTime()) / 60000) : 60;
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  openModal({
    title: existing ? 'Edit meeting' : 'New meeting',
    body: `
      ${field('title', 'Title', input('title', `type="text" required value="${esc(existing?.title || '')}" placeholder="Team meeting"`))}
      <div class="st-row">
        ${field('date', 'Date', input('date', `type="date" required value="${dateKey(start)}"`))}
        ${field('start', 'Starts', input('start', `type="time" required value="${hm(start)}"`))}
      </div>
      <div class="st-field">
        <span class="st-label">How long</span>
        <div class="st-segment" id="st-duration">${DURATIONS.map(d => `<button type="button" data-minutes="${d}" class="${d === minutes ? 'is-active' : ''}">${d < 60 ? `${d} min` : d === 60 ? '1 hour' : d === 90 ? '1.5 hours' : `${d / 60} hours`}</button>`).join('')}${DURATIONS.includes(minutes) ? '' : `<button type="button" data-minutes="${minutes}" class="is-active">${minutes} min</button>`}</div>
        <input type="hidden" name="minutes" value="${minutes}" />
      </div>
      ${field('location', 'Where', input('location', `type="text" value="${esc(existing?.location || '')}" placeholder="Zoom link, Discord voice, or a room"`))}
      ${field('agenda', 'Agenda', textarea('agenda', 'rows="4" placeholder="What we will cover"'))}`,
    submitLabel: existing ? 'Save changes' : 'Schedule',
    onSubmit: async (form, close) => {
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give the meeting a title.');
      const date = formValue(form, 'date');
      const s = new Date(`${date}T${formValue(form, 'start')}:00`);
      if (isNaN(s.getTime())) throw new Error('Check the date and time.');
      const mins = Number(formValue(form, 'minutes')) || 60;
      const e = new Date(s.getTime() + mins * 60000);
      const payload = { title, starts_at: s.toISOString(), ends_at: e.toISOString(), location: formValue(form, 'location') || null, agenda: formValue(form, 'agenda') || null };
      if (existing) await api.updateMeeting(existing.id, payload);
      else await api.createMeeting(payload);
      close();
      toast(existing ? 'Meeting updated.' : 'Meeting scheduled.');
      monthCursor = new Date(s);
      dayFilter = null;
      await refreshBadges();
      await render(host);
    },
  });
  setTimeout(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('#f-agenda');
    if (ta && existing) ta.value = existing.agenda || '';
    const seg = document.getElementById('st-duration');
    seg?.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-minutes]');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
      (seg.parentElement!.querySelector('input[name="minutes"]') as HTMLInputElement).value = b.dataset.minutes!;
    });
  }, 0);
}

function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function downloadIcs(m: Meeting) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//XR Club//SUITS//EN', 'BEGIN:VEVENT',
    `UID:${m.id}@xr.umd.edu`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(m.starts_at)}`, `DTEND:${icsDate(m.ends_at)}`,
    `SUMMARY:${icsText(m.title)}`,
    m.location ? `LOCATION:${icsText(m.location)}` : '',
    m.agenda ? `DESCRIPTION:${icsText(m.agenda)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${m.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics` });
  a.click();
  URL.revokeObjectURL(url);
}

function googleCalendarUrl(m: Meeting) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: m.title, dates: `${icsDate(m.starts_at)}/${icsDate(m.ends_at)}`, details: m.agenda || '', location: m.location || '' });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function linkify(s: string) {
  const e = esc(s);
  return e.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
