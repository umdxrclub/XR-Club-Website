// Overview: your open tasks and the dates coming up. Empty until there are some.
import { api, state } from './api';
import { esc, fmtDate, fmtDateTime, fmtRelative } from './ui';
import { sectionName } from './content';
import { taskRowHtml, bindRows } from './tasks';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const [tasks, meetings] = await Promise.all([api.tasks(), api.meetings()]);
  const me = state.me!;
  const now = Date.now();
  const myTasks = tasks.filter(t => t.assignee_id === me.user_id && t.status !== 'done');

  const dates = [
    ...meetings.filter(m => new Date(m.ends_at).getTime() > now).map(m => ({ when: new Date(m.starts_at).getTime(), label: m.title, detail: `${fmtDateTime(m.starts_at)}, ${fmtRelative(m.starts_at)}`, go: 'meetings' })),
    ...tasks.filter(t => t.due_date && t.status !== 'done').map(t => ({ when: new Date(t.due_date + 'T23:59:59').getTime(), label: `${t.title} due`, detail: `${fmtDate(t.due_date + 'T12:00:00', { weekday: 'short', month: 'short', day: 'numeric' })}, ${sectionName(t.section)}`, go: 'tasks' })),
  ].sort((a, b) => a.when - b.when).slice(0, 8);

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Hello, ${esc(me.display_name.split(' ')[0])}.</h2>
    </div>
    <div class="st-grid st-grid--2">
      <div class="st-card">
        <h3 class="st-h3">Your tasks</h3>
        ${myTasks.length ? `<div class="st-tlist st-tlist--tight">${myTasks.slice(0, 6).map(t => taskRowHtml(t, now, true)).join('')}</div>` : `<p class="st-muted" style="margin:0;">Nothing yet.</p>`}
        ${myTasks.length ? `<p style="margin:0.9rem 0 0;"><button type="button" class="st-link" data-go="tasks">All tasks</button></p>` : ''}
      </div>
      <div class="st-card">
        <h3 class="st-h3">Dates</h3>
        ${dates.length ? `<div class="st-stack" style="gap:0.6rem;">${dates.map(d => `<button type="button" class="st-datebtn" data-go="${d.go}"><span class="st-datebtn__label">${esc(d.label)}</span><span class="st-datebtn__detail">${esc(d.detail)}</span></button>`).join('')}</div>` : `<p class="st-muted" style="margin:0;">Nothing yet.</p>`}
      </div>
    </div>`;
  bindRows(host, tasks, () => render(host));
}
