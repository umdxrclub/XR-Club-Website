import { api, state, isAdvisor, type Member, type AdvisorAvailability } from './api';
import { esc, field, formValue, onboardingProgress, openModal, toast } from './ui';
import { timePicker, bindPickers } from './pickers';
import { TEAM_ZONE, shiftDay, zoneParts, wallTimeToIso } from '../../lib/suitsCalendar';

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

// Common meeting windows, in minutes after midnight Eastern.
const BLOCKS = [
 { key: 'morning', name: 'Morning', start: 9 * 60, end: 12 * 60 },
 { key: 'midday', name: 'Midday', start: 12 * 60, end: 14 * 60 },
 { key: 'afternoon', name: 'Afternoon', start: 14 * 60, end: 17 * 60 },
 { key: 'evening', name: 'Evening', start: 17 * 60, end: 20 * 60 },
] as const;
const DAY_START = 8 * 60, DAY_END = 21 * 60;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const blockLabel = (start: number, end: number) => {
 const f = (m: number) => { const h = Math.floor(m / 60) % 12 || 12, mm = m % 60; return mm ? `${h}:${String(mm).padStart(2, '0')}` : `${h}`; };
 const p = (m: number) => (m < 12 * 60 ? 'AM' : 'PM');
 return p(start) === p(end) ? `${f(start)} to ${f(end)} ${p(end)}` : `${f(start)} ${p(start)} to ${f(end)} ${p(end)}`;
};
const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const timeline = (start: number, end: number) => `<span class="availability-timeline" aria-hidden="true"><i style="left:${((start - DAY_START) / (DAY_END - DAY_START)) * 100}%;width:${((end - start) / (DAY_END - DAY_START)) * 100}%"></i></span>`;

let opening = false;

/**
 * Advisors pick a day and one or more time windows, styled like the avatar and
 * layout pickers. Teammates see the same list without the controls.
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
  let weekStart = day < shiftDay(today, 7) ? today : day;
  const picked = new Set<string>();
  let custom = false;
  let customStart = '10:00', customEnd = '11:00';
  if (editing) {
   const s = minutes(zoneParts(editing.starts_at).time), e = minutes(zoneParts(editing.ends_at).time);
   const match = BLOCKS.find(b => b.start === s && b.end === e);
   if (match) picked.add(match.key); else { custom = true; customStart = clock(s); customEnd = clock(e); }
  }

  const done = openModal({
   title: own ? (opts.first ? 'Set your availability' : editing ? 'Edit availability' : 'Your availability') : `${person.display_name}'s availability`,
   className: 'st-availability-modal',
   cancelLabel: opts.first ? 'Later' : own ? 'Cancel' : 'Close',
   submitLabel: opts.first ? 'Finish setup' : 'Save',
   body: `${opts.first ? onboardingProgress(3, 3) : ''}${own ? `<div class="availability-picker">
     <div class="availability-week">
      <div class="availability-week__head"><strong data-week-label></strong><span>Eastern time</span>
       <div class="availability-week__nav"><button type="button" data-week="-1" aria-label="Previous week">‹</button><button type="button" data-week="1" aria-label="Next week">›</button></div></div>
      <div class="availability-days" role="group" aria-label="Day" data-days></div>
     </div>
     <div class="availability-blocks" role="group" aria-label="Time" data-blocks></div>
     <button type="button" class="availability-toggle" data-block="custom" aria-pressed="false">Set exact times</button>
     <div class="st-row availability-custom" data-custom hidden>
      ${field('available_start', 'From', timePicker('available_start', customStart, 0))}
      ${field('available_end', 'To', timePicker('available_end', customEnd, 0))}
     </div>
    </div>` : ''}
    <section class="availability-saved" aria-label="Saved times"><h3>${own ? 'Saved times' : 'Upcoming'}</h3><div data-availability-list></div></section>`,
   onSubmit: own ? async (form, close) => {
    if (state.me?.user_id !== userId || !isAdvisor()) throw new Error('Sign in again to save your availability.');
    const ranges: Array<[number, number]> = [];
    for (const b of BLOCKS) if (picked.has(b.key)) ranges.push([b.start, b.end]);
    if (custom) ranges.push([minutes(formValue(form, 'available_start')), minutes(formValue(form, 'available_end'))]);
    if (!ranges.length) {
     if (opts.first && !slots.length) throw new Error('Choose at least one time, or select Later.');
     if (opts.first) { saved = true; close(); return; }
     throw new Error('Choose at least one time.');
    }
    if (ranges.some(([s, e]) => e <= s)) throw new Error('Choose an end time after the start time.');
    // Adjacent windows save as one block, so Morning and Midday become 9 AM to 2 PM.
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
    const isoRanges = merged.map(([s, e]) => [wallTimeToIso(day, clock(s)), wallTimeToIso(day, clock(e))] as const);
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
  bindPickers(modal);

  const covered = (b: typeof BLOCKS[number]) => slots.some(s => s.id !== editing?.id && zoneParts(s.starts_at).day === day
   && minutes(zoneParts(s.starts_at).time) <= b.start && minutes(zoneParts(s.ends_at).time) >= b.end);
  const drawPicker = () => {
   if (!own) return;
   const days = Array.from({ length: 7 }, (_, i) => shiftDay(weekStart, i));
   modal.querySelector('[data-week-label]')!.textContent = dayLabel(days[3], { month: 'long', year: 'numeric' });
   modal.querySelector<HTMLButtonElement>('[data-week="-1"]')!.disabled = weekStart <= today;
   const busy = new Set(slots.map(s => zoneParts(s.starts_at).day));
   modal.querySelector('[data-days]')!.innerHTML = days.map(d => `<button type="button" data-day="${d}" aria-pressed="${d === day}" aria-label="${esc(dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' }))}"><small>${esc(dayLabel(d, { weekday: 'short' }))}</small><strong>${esc(dayLabel(d, { day: 'numeric' }))}</strong><i${busy.has(d) ? '' : ' hidden'} aria-hidden="true"></i></button>`).join('');
   modal.querySelector('[data-blocks]')!.innerHTML = BLOCKS.map(b => {
    const taken = covered(b);
    return `<button type="button" data-block="${b.key}" aria-pressed="${picked.has(b.key) && !taken}"${taken ? ' disabled' : ''}>${timeline(b.start, b.end)}<strong>${b.name}</strong><small>${taken ? 'Saved' : blockLabel(b.start, b.end)}</small></button>`;
   }).join('');
   modal.querySelector('.availability-toggle')!.setAttribute('aria-pressed', String(custom));
   modal.querySelector<HTMLElement>('[data-custom]')!.hidden = !custom;
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
   const week = target.closest<HTMLButtonElement>('[data-week]');
   if (week) { weekStart = shiftDay(weekStart, Number(week.dataset.week) * 7); if (weekStart < today) weekStart = today; day = weekStart === today ? shiftDay(today, 1) : weekStart; drawPicker(); return; }
   const dayButton = target.closest<HTMLButtonElement>('[data-day]');
   if (dayButton) { day = dayButton.dataset.day!; drawPicker(); return; }
   const block = target.closest<HTMLButtonElement>('[data-block]');
   if (block) {
    const key = block.dataset.block!;
    if (key === 'custom') custom = !custom; else if (picked.has(key)) picked.delete(key); else picked.add(key);
    drawPicker();
    modal.querySelector<HTMLButtonElement>(`[data-block="${key}"]`)?.focus({ preventScroll: true });
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
