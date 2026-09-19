// Date and time controls drawn in the dashboard's own style, so no browser
// calendar icon shows up. The value lives in a hidden input (dates) or a
// select (times) so forms read them like any other field.
import { esc, dateKey, select } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function label(ymd: string) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** A button that opens a month. `value` is YYYY-MM-DD or empty. */
export function datePicker(name: string, value: string, opts: { placeholder?: string; clearable?: boolean } = {}) {
  return `
    <div class="st-datepick" data-datepick${opts.clearable ? ' data-clearable' : ''}>
      <input type="hidden" id="f-${name}" name="${name}" value="${esc(value || '')}" />
      <button type="button" class="st-dd__btn st-datepick__btn" aria-haspopup="dialog">
        <span class="st-dd__label${value ? '' : ' is-empty'}">${esc(value ? label(value) : (opts.placeholder || 'Pick a date'))}</span>
        <span class="st-dd__chev" aria-hidden="true"></span>
      </button>
    </div>`;
}

/** Every 15 minutes from 6:00 AM to 11:45 PM. `value` is HH:MM. */
export function timePicker(name: string, value: string) {
  const options = [];
  for (let m = 6 * 60; m < 24 * 60; m += 15) {
    const hh = Math.floor(m / 60), mm = m % 60;
    const v = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const text = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    options.push({ value: v, label: text, selected: v === value });
  }
  if (value && !options.some(o => o.selected)) options.unshift({ value, label: value, selected: true });
  return select(name, options);
}

function monthHtml(y: number, mo: number, selected: string) {
  const first = new Date(y, mo, 1);
  const pad = first.getDay();
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const today = dateKey(new Date());
  const cells: string[] = [];
  for (let i = 0; i < pad; i++) cells.push('<span class="st-month__cell is-pad"></span>');
  for (let d = 1; d <= daysIn; d++) {
    const k = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(`<button type="button" class="st-month__cell${k === today ? ' is-today' : ''}${k === selected ? ' is-selected' : ''}" data-day="${k}">${d}</button>`);
  }
  return `
    <div class="st-month__head">
      <button type="button" class="st-month__nav" data-nav="-1" aria-label="Previous month"><span></span></button>
      <span class="st-month__title">${MONTHS[mo]} ${y}</span>
      <button type="button" class="st-month__nav st-month__nav--next" data-nav="1" aria-label="Next month"><span></span></button>
    </div>
    <div class="st-month__grid">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="st-month__dow">${d}</span>`).join('')}
      ${cells.join('')}
    </div>`;
}

/** Wire every date picker under `root`. Safe to call more than once. */
export function bindPickers(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-datepick]:not([data-bound])').forEach(box => {
    box.dataset.bound = '1';
    const hidden = box.querySelector<HTMLInputElement>('input[type="hidden"]')!;
    const btn = box.querySelector<HTMLButtonElement>('.st-datepick__btn')!;
    const text = btn.querySelector<HTMLElement>('.st-dd__label')!;
    const placeholder = text.textContent || 'Pick a date';
    const draw = () => {
      text.textContent = hidden.value ? label(hidden.value) : placeholder;
      text.classList.toggle('is-empty', !hidden.value);
    };
    hidden.addEventListener('change', draw);

    btn.addEventListener('click', () => {
      document.querySelector('.st-datepick__pop')?.remove();
      const host = document.getElementById('st') || document.body;
      const pop = document.createElement('div');
      pop.className = 'st-menu st-datepick__pop';
      pop.setAttribute('role', 'dialog');
      const start = hidden.value ? new Date(hidden.value + 'T12:00:00') : new Date();
      let y = start.getFullYear(), mo = start.getMonth();
      const paint = () => {
        pop.innerHTML = `<div class="st-month st-month--pop">${monthHtml(y, mo, hidden.value)}</div>${box.hasAttribute('data-clearable') ? '<button type="button" class="st-datepick__clear" data-clear>No date</button>' : ''}`;
      };
      paint();
      host.appendChild(pop);
      const place = () => {
        const r = btn.getBoundingClientRect();
        const w = pop.offsetWidth, h = pop.offsetHeight;
        const top = window.innerHeight - r.bottom < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
        pop.style.top = `${top}px`;
        pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
      };
      place();
      const close = () => { pop.remove(); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); };
      const onDoc = (e: Event) => { if (!pop.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) close(); };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.focus(); } };
      setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); window.addEventListener('resize', close); }, 0);
      pop.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        const nav = target.closest<HTMLElement>('[data-nav]');
        if (nav) { mo += Number(nav.dataset.nav); if (mo < 0) { mo = 11; y--; } if (mo > 11) { mo = 0; y++; } paint(); place(); return; }
        const day = target.closest<HTMLElement>('[data-day]');
        if (day) { hidden.value = day.dataset.day!; hidden.dispatchEvent(new Event('change', { bubbles: true })); close(); btn.focus(); return; }
        if (target.closest('[data-clear]')) { hidden.value = ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); close(); btn.focus(); }
      });
    });
  });
}
