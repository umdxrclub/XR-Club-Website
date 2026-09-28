import { api, state, isAdvisor, type Member, type AdvisorAvailability } from './api';
import { esc, onboardingProgress, openModal, toast } from './ui';
import { TEAM_ZONE, shiftDay, zoneParts, wallTimeToIso, monthDays } from '../../lib/suitsCalendar';

export const availabilityDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TEAM_ZONE, weekday: 'short', month: 'short', day: 'numeric' });
export const availabilityTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TEAM_ZONE, hour: 'numeric', minute: '2-digit' });

/** "2 to 4 PM", "11 AM to 1:30 PM" */
export function availabilityRange(startIso: string, endIso: string) {
 const part = (iso: string) => {
  const [time, period] = availabilityTime(iso).split(' ');
  return { time: time.replace(/:00$/, ''), period };
 };
 const a = part(startIso), b = part(endIso);
 return a.period === b.period ? `${a.time} to ${b.time} ${b.period}` : `${a.time} ${a.period} to ${b.time} ${b.period}`;
}

// Bookable hours, Eastern: each button is one hour starting at that time.
const FIRST_HOUR = 8, LAST_HOUR = 19;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`;
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const rangeLabel = (start: number, end: number) => {
 const p = (h: number) => (h < 12 ? 'AM' : 'PM'), n = (h: number) => `${h % 12 || 12}`;
 return p(start) === p(end) ? `${n(start)} to ${n(end)} ${p(end)}` : `${n(start)} ${p(start)} to ${n(end)} ${p(end)}`;
};
const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const firstOfMonth = (day: string, delta = 0) => {
 const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + delta);
 return d.toISOString().slice(0, 10);
};
/** Picked hours as merged [start, end) ranges, so 9, 10 and 11 become 9 AM to 12 PM. */
const toRanges = (hours: Set<number>) => {
 const out: Array<[number, number]> = [];
 for (const h of [...hours].sort((a, b) => a - b)) { const last = out[out.length - 1]; if (last && last[1] === h) last[1] = h + 1; else out.push([h, h + 1]); }
 return out;
};

let opening = false;

/**
 * A mini month calendar and hour picker. Advisors choose a day, tap the hours
 * they are free, and save; teammates see the saved list without the controls.
 */
export async function openAdvisorAvailability(member: Member | null = state.me, editing?: AdvisorAvailability, opts: { first?: boolean } = {}) {
 if (!member || !isAdvisor(member) || opening || document.querySelector('.st-availability-modal')) return false;
 const person = member;
 const own = person.user_id === state.me?.user_id;
 const userId = state.me?.user_id;
 const host = document.getElementById('st-modal-host');
 let saved = false;
 opening = true;
 try {
  let slots = (await api.advisorAvailability()).filter(s => s.advisor_id === person.user_id && Date.parse(s.ends_at) > Date.now());
  if (!host?.isConnected || state.me?.user_id !== userId) return false;
  const today = zoneParts(new Date()).day;
  let day = editing ? zoneParts(editing.starts_at).day : shiftDay(today, 1);
  let month = firstOfMonth(day);
  const picked = new Set<number>();
  if (editing) {
   const s = minutes(zoneParts(editing.starts_at).time), e = minutes(zoneParts(editing.ends_at).time);
   for (const h of HOURS) if (h * 60 < e && (h + 1) * 60 > s) picked.add(h);
  }

  const done = openModal({
   title: own ? (opts.first ? 'Set your availability' : editing ? 'Edit availability' : 'Your availability') : `${person.display_name}'s availability`,
   className: 'st-availability-modal',
   cancelLabel: opts.first ? 'Later' : own ? 'Cancel' : 'Close',
   submitLabel: opts.first ? 'Finish setup' : 'Save',
   body: `${opts.first ? onboardingProgress(3, 3) : ''}${own ? `<div class="availability-picker">
     <div class="mini-cal">
      <div class="mini-cal__head"><strong data-month-label></strong>
       <div class="mini-cal__nav"><button type="button" data-month="-1" aria-label="Previous month">‹</button><button type="button" data-month="1" aria-label="Next month">›</button></div></div>
      <div class="mini-cal__grid" role="grid" aria-label="Choose a day" data-days></div>
     </div>
     <div class="availability-hours">
      <div class="availability-hours__head"><strong data-day-label></strong><span>Eastern time</span></div>
      <div class="availability-hours__grid" role="group" aria-label="Hours" data-hours></div>
      <p class="availability-hours__summary" data-summary aria-live="polite"></p>
     </div>
    </div>` : ''}
    <section class="availability-saved" aria-label="Saved times"><h3>${own ? 'Saved times' : 'Upcoming'}</h3><div data-availability-list></div></section>`,
   onSubmit: own ? async (_form, close) => {
    if (state.me?.user_id !== userId || !isAdvisor()) throw new Error('Sign in again to save your availability.');
    const ranges = toRanges(picked);
    if (!ranges.length) {
     if (opts.first) { saved = true; close(); return; }
     throw new Error('Choose at least one hour.');
    }
    const isoRanges = ranges.map(([s, e]) => [wallTimeToIso(day, clock(s)), wallTimeToIso(day, clock(e))] as const);
    if (isoRanges.some(([s]) => Date.parse(s) <= Date.now())) throw new Error('Choose a time later than now.');
    let first = true;
    for (const [starts, ends] of isoRanges) {
     await api.saveAdvisorAvailability(first && editing ? editing.id : null, starts, ends);
     first = false;
    }
    document.dispatchEvent(new CustomEvent('suits:availability-updated'));
    saved = true; close(); toast(opts.first ? 'Your workspace is ready' : 'Availability saved');
   } : undefined,
  });
  const modal = document.querySelector<HTMLElement>('.st-availability-modal')!;

  const onDay = (d: string) => slots.filter(s => s.id !== editing?.id && zoneParts(s.starts_at).day === d);
  const hourSaved = (h: number) => onDay(day).some(s => zoneParts(s.starts_at).minutes <= h * 60 && zoneParts(s.ends_at).minutes >= (h + 1) * 60);
  const hourPast = (h: number) => Date.parse(wallTimeToIso(day, clock(h))) <= Date.now();

  const drawPicker = () => {
   if (!own) return;
   const busy = new Set(slots.map(s => zoneParts(s.starts_at).day));
   const cells = monthDays(month);
   const inMonth = (d: string) => d.slice(0, 7) === month.slice(0, 7);
   // Drop trailing weeks that hold no days of this month.
   const weeks = Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).filter(week => week.some(inMonth));
   modal.querySelector('[data-month-label]')!.textContent = dayLabel(month, { month: 'long', year: 'numeric' });
   modal.querySelector<HTMLButtonElement>('[data-month="-1"]')!.disabled = month <= firstOfMonth(today);
   modal.querySelector('[data-days]')!.innerHTML = WEEKDAYS.map(w => `<span class="mini-cal__weekday" aria-hidden="true">${w}</span>`).join('')
    + weeks.flat().map(d => {
     if (!inMonth(d)) return '<span class="mini-cal__blank"></span>';
     const past = d < today;
     const classes = ['mini-cal__day', d === today ? 'is-today' : '', busy.has(d) ? 'has-times' : ''].filter(Boolean).join(' ');
     return `<button type="button" class="${classes}" data-day="${d}" aria-pressed="${d === day}"${past ? ' disabled' : ''} aria-label="${esc(dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' }))}${busy.has(d) ? ', has saved times' : ''}">${esc(dayLabel(d, { day: 'numeric' }))}</button>`;
    }).join('');
   modal.querySelector('[data-day-label]')!.textContent = dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' });
   modal.querySelector('[data-hours]')!.innerHTML = HOURS.map(h => {
    const isSaved = hourSaved(h), past = hourPast(h);
    return `<button type="button" class="availability-hour${isSaved ? ' is-saved' : ''}" data-hour="${h}" aria-pressed="${picked.has(h) && !isSaved}"${isSaved || past ? ' disabled' : ''} aria-label="${hourLabel(h)}${isSaved ? ', saved' : ''}">${hourLabel(h)}</button>`;
   }).join('');
   const ranges = toRanges(picked);
   modal.querySelector('[data-summary]')!.textContent = ranges.length ? ranges.map(([s, e]) => rangeLabel(s, e)).join(', ') : 'Tap the hours you are free';
  };
  const drawList = () => {
   const sorted = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
   modal.querySelector('[data-availability-list]')!.innerHTML = sorted.length ? sorted.map(s => `<div class="availability-slot">
    <div><strong>${esc(availabilityDate(s.starts_at))}</strong><span>${esc(availabilityRange(s.starts_at, s.ends_at))}</span></div>
    ${own ? `<div class="availability-slot__actions"><button type="button" data-edit-availability="${esc(s.id)}" aria-label="Edit ${esc(availabilityDate(s.starts_at))}, ${esc(availabilityRange(s.starts_at, s.ends_at))}">Edit</button><button type="button" data-remove-availability="${esc(s.id)}" aria-label="Remove ${esc(availabilityDate(s.starts_at))}, ${esc(availabilityRange(s.starts_at, s.ends_at))}">Remove</button></div>` : ''}</div>`).join('')
    : `<p class="availability-empty">${own ? 'No times saved yet' : 'No upcoming times'}</p>`;
  };
  drawPicker(); drawList();
  modal.querySelector<HTMLButtonElement>('[data-day][aria-pressed="true"]')?.focus({ preventScroll: true });

  modal.addEventListener('click', async e => {
   if (!own) return;
   const target = e.target as HTMLElement;
   const monthButton = target.closest<HTMLButtonElement>('[data-month]');
   if (monthButton) { month = firstOfMonth(month, Number(monthButton.dataset.month)); drawPicker(); return; }
   const dayButton = target.closest<HTMLButtonElement>('[data-day]');
   if (dayButton) {
    // Hours belong to one day, so switching days starts a fresh pick.
    if (dayButton.dataset.day !== day && !editing) picked.clear();
    day = dayButton.dataset.day!; drawPicker();
    modal.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus({ preventScroll: true });
    return;
   }
   const hour = target.closest<HTMLButtonElement>('[data-hour]');
   if (hour) {
    const h = Number(hour.dataset.hour);
    if (picked.has(h)) picked.delete(h); else picked.add(h);
    drawPicker();
    modal.querySelector<HTMLButtonElement>(`[data-hour="${h}"]`)?.focus({ preventScroll: true });
    return;
   }
   const edit = target.closest<HTMLButtonElement>('[data-edit-availability]');
   if (edit) {
    const slot = slots.find(s => s.id === edit.dataset.editAvailability);
    modal.querySelector<HTMLButtonElement>('[data-modal-cancel]')?.click();
    void done.then(() => openAdvisorAvailability(person, slot));
    return;
   }
   const remove = target.closest<HTMLButtonElement>('[data-remove-availability]');
   if (!remove) return;
   remove.disabled = true;
   try {
    await api.deleteAdvisorAvailability(remove.dataset.removeAvailability!);
    slots = slots.filter(s => s.id !== remove.dataset.removeAvailability);
    document.dispatchEvent(new CustomEvent('suits:availability-updated'));
    if (modal.isConnected) {
     if (editing?.id === remove.dataset.removeAvailability) {
      modal.querySelector<HTMLButtonElement>('[data-modal-cancel]')?.click();
      void done.then(() => openAdvisorAvailability(person));
     } else { drawPicker(); drawList(); }
    }
    toast('Availability removed');
   } catch (err) { remove.disabled = false; toast((err as Error).message, 'danger'); }
  });
  await done;
  return saved;
 } catch (err) { toast((err as Error).message, 'danger'); return false; }
 finally { opening = false; }
}
