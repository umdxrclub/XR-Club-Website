import { api, state, isAdvisor, type Member, type AdvisorAvailability } from './api';
import { esc, field, formValue, openModal, toast } from './ui';
import { datePicker, timePicker, bindPickers } from './pickers';
import { TEAM_ZONE, shiftDay, zoneParts, wallTimeToIso } from '../../lib/suitsCalendar';

export const availabilityDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TEAM_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const availabilityTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TEAM_ZONE, hour: 'numeric', minute: '2-digit' });
let opening = false;

/** One date and time range, using the same controls as the team calendar. */
export async function openAdvisorAvailability(member: Member | null = state.me, editing?: AdvisorAvailability) {
 if (!member || !isAdvisor(member) || opening || document.querySelector('.st-availability-modal')) return;
 const person = member;
 const own = person.user_id === state.me?.user_id;
 const userId = state.me?.user_id;
 const host = document.getElementById('st-modal-host');
 opening = true;
 try {
  let slots = (await api.advisorAvailability()).filter(s => s.advisor_id === person.user_id && Date.parse(s.ends_at) > Date.now());
  if (!host?.isConnected || state.me?.user_id !== userId) return;
  const day = editing ? zoneParts(editing.starts_at).day : shiftDay(zoneParts(new Date()).day, 1);
  const start = editing ? zoneParts(editing.starts_at).time : '10:00';
  const end = editing ? zoneParts(editing.ends_at).time : '11:00';
  const done = openModal({
   title: own ? (editing ? 'Edit availability' : 'Your availability') : `${person.display_name} availability`,
   className: 'st-availability-modal', cancelLabel: 'Done', submitLabel: editing ? 'Save changes' : 'Save availability',
   body: `${own ? `<p class="st-muted">Choose when you’re free to meet. Saved times appear on the team calendar.</p>
    ${field('available_date', 'Date', datePicker('available_date', day))}
    <div class="st-row">${field('available_start', 'From', timePicker('available_start', start, 0))}${field('available_end', 'To', timePicker('available_end', end, 0))}</div>` : ''}
    <p class="st-availability-zone">Eastern time</p>
    <section class="st-availability-list" aria-label="Saved availability"><h3>Upcoming availability</h3><div data-availability-list></div></section>`,
   onSubmit: own ? async (form, close) => {
    if (state.me?.user_id !== userId || !isAdvisor()) throw new Error('Sign in again to save your availability.');
    const date = formValue(form, 'available_date');
    const starts = wallTimeToIso(date, formValue(form, 'available_start'));
    const ends = wallTimeToIso(date, formValue(form, 'available_end'));
    if (ends <= starts) throw new Error('Choose an end time after the start time.');
    if (Date.parse(starts) <= Date.now()) throw new Error('Choose a future date and time.');
    await api.saveAdvisorAvailability(editing?.id || null, starts, ends);
    document.dispatchEvent(new CustomEvent('suits:availability-updated'));
    close(); toast('Availability saved to the team calendar.');
   } : undefined,
  });
  const modal = document.querySelector<HTMLElement>('.st-availability-modal')!;
  bindPickers(modal);
  const draw = () => {
   modal.querySelector('[data-availability-list]')!.innerHTML = slots.length ? slots.map(s => `<div class="st-availability-slot">
    <div><strong>${esc(availabilityDate(s.starts_at))}</strong><span>${esc(availabilityTime(s.starts_at))} to ${esc(availabilityTime(s.ends_at))}</span></div>
    ${own ? `<div class="st-availability-actions"><button type="button" class="st-btn st-btn--small" data-edit-availability="${esc(s.id)}" aria-label="Edit ${esc(availabilityDate(s.starts_at))} at ${esc(availabilityTime(s.starts_at))}">Edit</button><button type="button" class="st-btn st-btn--small st-btn--danger" data-remove-availability="${esc(s.id)}" aria-label="Remove ${esc(availabilityDate(s.starts_at))} at ${esc(availabilityTime(s.starts_at))}">Remove</button></div>` : ''}</div>`).join('') : '<p class="st-muted">No availability added yet.</p>';
  };
  draw();
  modal.addEventListener('click', async e => {
   if (!own) return;
   const edit = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-edit-availability]');
   if (edit) {
    const slot = slots.find(s => s.id === edit.dataset.editAvailability);
    modal.querySelector<HTMLButtonElement>('[data-modal-cancel]')?.click();
    void done.then(() => openAdvisorAvailability(person, slot));
   }
   const remove = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-availability]');
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
     } else draw();
    }
    toast('Availability removed.');
   } catch (err) { remove.disabled = false; toast((err as Error).message, 'danger'); }
  });
 } catch (err) { toast((err as Error).message, 'danger'); }
 finally { opening = false; }
}
