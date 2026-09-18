// The Proposal section's live parts: key dates and the shared checklist.
import { api, state, memberName } from './api';
import { esc, fmtDate, toast } from './ui';
import { KEY_DATES, CHECKLIST } from './content';

export function datesHtml(limit?: number) {
  const now = Date.now();
  const list = KEY_DATES.map(d => {
    const t = new Date(d.date + 'T23:59:59').getTime();
    const days = Math.ceil((t - now) / 86400000);
    return { ...d, days };
  });
  const nextIdx = list.findIndex(d => d.days >= 0);
  const shown = limit ? list.filter(d => d.days >= 0).slice(0, limit) : list;
  return `<div class="st-dates">${shown.map((d, i) => {
    const when = d.approx
      ? new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : fmtDate(d.date + 'T12:00:00', { weekday: 'short', month: 'short', day: 'numeric' });
    const rel = d.days < 0 ? 'Passed' : d.days === 0 ? 'Today' : d.approx ? '' : `${d.days} days left`;
    const isNext = limit ? i === 0 : list.indexOf(d) === nextIdx;
    return `<div class="st-date${isNext ? ' is-next' : ''}"><div class="st-date__when">${esc(when)}${rel ? `<span class="st-date__days">${esc(rel)}</span>` : ''}</div><div class="st-date__what"><strong>${esc(d.label)}</strong><br><span class="st-muted">${esc(d.detail)}</span></div></div>`;
  }).join('')}</div>`;
}

export async function render() {
  document.getElementById('st-dates')!.innerHTML = datesHtml();
  await renderChecklist();
}

export async function checklistStats() {
  const rows = await api.checklist();
  const done = new Set(rows.filter(r => r.done).map(r => r.item_key));
  const total = CHECKLIST.length;
  return { rows, done, total, count: CHECKLIST.filter(i => done.has(i.key)).length };
}

async function renderChecklist() {
  const host = document.getElementById('st-checklist')!;
  const bar = document.getElementById('st-checklist-bar')!;
  const summary = document.getElementById('st-checklist-summary')!;
  const { rows, done, total, count } = await checklistStats();
  const byKey = new Map(rows.map(r => [r.item_key, r]));

  bar.style.width = `${Math.round((count / total) * 100)}%`;
  summary.textContent = `${count} of ${total} done`;

  const groups = [...new Set(CHECKLIST.map(i => i.group))];
  host.innerHTML = groups.map(g => `
    <div class="st-section" style="margin-bottom:2rem;">
      <h4 class="st-h3" style="margin-bottom:0.7rem;">${esc(g)}</h4>
      <div class="st-checklist">
        ${CHECKLIST.filter(i => i.group === g).map(i => {
          const row = byKey.get(i.key);
          const isDone = done.has(i.key);
          const who = isDone && row?.done_by ? ` · ${esc(memberName(row.done_by))}${row.done_at ? `, ${esc(fmtDate(row.done_at))}` : ''}` : '';
          return `<label class="st-checkitem${isDone ? ' is-done' : ''}" data-item="${i.key}">
            <span class="st-check" style="margin-top:2px;"><input type="checkbox" ${isDone ? 'checked' : ''} /><span class="st-check__box"></span></span>
            <span><span class="st-checkitem__title">${esc(i.title)}</span><span class="st-checkitem__text">${esc(i.text)}${who}</span></span>
          </label>`;
        }).join('')}
      </div>
    </div>`).join('');

  host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(box => {
    box.addEventListener('change', async () => {
      const item = box.closest<HTMLElement>('[data-item]')!;
      try {
        await api.setChecklist(item.dataset.item!, box.checked);
        await renderChecklist();
      } catch (err) {
        box.checked = !box.checked;
        toast((err as Error).message, 'danger');
      }
    });
  });
}

export { state };
