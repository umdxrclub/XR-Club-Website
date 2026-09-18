// Meetings: managers schedule, everyone RSVPs and adds to their calendar.
import { api, state, isManager, memberName, type Meeting, type Rsvp } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, formValue, formChecked, fmtTime, fmtDate, dateKey } from './ui';
import { refreshBadges } from './index';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const [meetings, rsvps] = await Promise.all([api.meetings(), api.rsvps()]);
  const now = Date.now();
  const upcoming = meetings.filter(m => new Date(m.ends_at).getTime() > now);
  const past = meetings.filter(m => new Date(m.ends_at).getTime() <= now).reverse();

  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <div><h2 class="st-h1">Meetings</h2><p class="st-lead" style="margin:0;">Say whether you are coming and put it on your calendar.</p></div>
        ${isManager() ? `<button type="button" class="st-btn st-btn--primary" id="st-new-meeting">New meeting</button>` : ''}
      </div>
      ${upcoming.length ? `<div class="st-stack">${upcoming.map(m => meetingHtml(m, rsvps, false)).join('')}</div>` : `<div class="st-empty">Nothing scheduled yet.${isManager() ? ' Open an availability poll first, then schedule here.' : ''}</div>`}
    </div>
    ${past.length ? `<div class="st-section"><h3 class="st-h2">Past</h3><div class="st-stack">${past.slice(0, 10).map(m => meetingHtml(m, rsvps, true)).join('')}</div></div>` : ''}`;

  host.querySelector('#st-new-meeting')?.addEventListener('click', () => editMeeting(host, null));
  host.querySelectorAll<HTMLElement>('[data-edit-meeting]').forEach(b => b.addEventListener('click', () => editMeeting(host, meetings.find(m => m.id === b.dataset.editMeeting)!)));
  host.querySelectorAll<HTMLElement>('[data-delete-meeting]').forEach(b => b.addEventListener('click', async () => {
    const m = meetings.find(x => x.id === b.dataset.deleteMeeting)!;
    if (!(await confirmModal('Delete this meeting?', `"${m.title}" will be removed for everyone.`, 'Delete meeting'))) return;
    await api.deleteMeeting(m.id);
    await refreshBadges();
    await render(host);
  }));
  host.querySelectorAll<HTMLElement>('[data-ics]').forEach(b => b.addEventListener('click', () => downloadIcs(meetings.find(m => m.id === b.dataset.ics)!)));
  bindRsvp(host, async () => render(host));
}

function meetingHtml(m: Meeting, rsvps: Rsvp[], past: boolean) {
  const start = new Date(m.starts_at);
  const yes = rsvps.filter(r => r.meeting_id === m.id && r.response === 'yes').length;
  const maybe = rsvps.filter(r => r.meeting_id === m.id && r.response === 'maybe').length;
  const no = rsvps.filter(r => r.meeting_id === m.id && r.response === 'no').length;
  return `
    <div class="st-meeting${past ? ' is-past' : ''}">
      <div class="st-meeting__date"><span class="st-meeting__month">${esc(start.toLocaleDateString(undefined, { month: 'short' }))}</span><span class="st-meeting__day">${start.getDate()}</span></div>
      <div>
        <h3 class="st-meeting__title">${esc(m.title)}</h3>
        <p class="st-meeting__meta">${esc(start.toLocaleDateString(undefined, { weekday: 'long' }))}, ${esc(fmtTime(m.starts_at))} to ${esc(fmtTime(m.ends_at))}${m.location ? ` · ${linkify(m.location)}` : ''}</p>
        ${m.agenda ? `<p class="st-meeting__agenda">${esc(m.agenda)}</p>` : ''}
        <div class="st-meeting__actions">
          ${past ? '' : rsvpControlHtml(m, rsvps)}
          <span class="st-muted" style="font-size:0.9rem;">${yes} going${maybe ? `, ${maybe} maybe` : ''}${no ? `, ${no} can't` : ''}</span>
          ${past ? '' : `<a class="st-btn st-btn--small" href="${googleCalendarUrl(m)}" target="_blank" rel="noopener">Google Calendar</a><button type="button" class="st-btn st-btn--small" data-ics="${m.id}">Apple or Outlook</button>`}
          ${isManager() ? `<button type="button" class="st-btn st-btn--small" data-edit-meeting="${m.id}">Edit</button><button type="button" class="st-btn st-btn--small st-btn--danger" data-delete-meeting="${m.id}">Delete</button>` : ''}
        </div>
        ${m.created_by ? `<p class="st-muted" style="font-size:0.85rem; margin:0.6rem 0 0;">Scheduled by ${esc(memberName(m.created_by))}</p>` : ''}
      </div>
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
      try {
        await api.setRsvp(group.dataset.rsvp!, btn.dataset.response as Rsvp['response']);
        await after();
      } catch (err) {
        toast((err as Error).message, 'danger');
      }
    });
  });
}

function editMeeting(host: HTMLElement, existing: Meeting | null) {
  const start = existing ? new Date(existing.starts_at) : nextHour();
  const end = existing ? new Date(existing.ends_at) : new Date(start.getTime() + 3600000);
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  openModal({
    title: existing ? 'Edit meeting' : 'New meeting',
    body: `
      ${field('title', 'Title', input('title', `type="text" required value="${esc(existing?.title || '')}" placeholder="Team meeting"`))}
      ${field('date', 'Date', input('date', `type="date" required value="${dateKey(start)}"`))}
      <div class="st-row">
        ${field('start', 'Starts', input('start', `type="time" required value="${hm(start)}"`))}
        ${field('end', 'Ends', input('end', `type="time" required value="${hm(end)}"`))}
      </div>
      ${field('location', 'Where', input('location', `type="text" value="${esc(existing?.location || '')}" placeholder="Zoom link, Discord voice, or a room"`))}
      ${field('agenda', 'Agenda', textarea('agenda', 'rows="4" placeholder="What we will cover"'))}`,
    submitLabel: existing ? 'Save changes' : 'Schedule',
    onSubmit: async (form, close) => {
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give the meeting a title.');
      const date = formValue(form, 'date');
      const s = new Date(`${date}T${formValue(form, 'start')}:00`);
      const e = new Date(`${date}T${formValue(form, 'end')}:00`);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error('Check the date and times.');
      if (e <= s) throw new Error('The meeting has to end after it starts.');
      const payload = { title, starts_at: s.toISOString(), ends_at: e.toISOString(), location: formValue(form, 'location') || null, agenda: formValue(form, 'agenda') || null };
      if (existing) {
        await api.updateMeeting(existing.id, payload);
        close();
        toast('Meeting updated.');
      } else {
        await api.createMeeting(payload);
        close();
        toast('Meeting scheduled.');
      }
      await refreshBadges();
      await render(host);
    },
  }).then(() => {
    if (existing) {
      const ta = document.querySelector<HTMLTextAreaElement>('#f-agenda');
      if (ta) ta.value = existing.agenda || '';
    }
  });
  // Pre-fill the agenda textarea (textarea() renders empty)
  setTimeout(() => { const ta = document.querySelector<HTMLTextAreaElement>('#f-agenda'); if (ta && existing) ta.value = existing.agenda || ''; }, 0);
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
