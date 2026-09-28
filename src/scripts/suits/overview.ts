// Overview: your open tasks and what is coming up, in the same rows the
// Tasks and Meetings pages use. Empty until there is something.
import { api, state } from './api';
import { esc, fmtTime } from './ui';
import { sectionName } from './content';
import { taskRowHtml, bindRows } from './tasks';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading…</p>`;
  const [tasks, meetings] = await Promise.all([api.tasks(), api.meetings()]);
  const me = state.me!;
  const now = Date.now();
  const myTasks = tasks.filter(t => t.assignee_id === me.user_id && t.status !== 'done');

  const upcoming = [
    ...meetings.filter(m => new Date(m.ends_at).getTime() > now).map(m => ({
      when: new Date(m.starts_at), title: m.title, sub: [fmtTime(m.starts_at), m.location || ''].filter(Boolean).join(', '), go: 'meetings',
    })),
    ...tasks.filter(t => t.due_date && t.status !== 'done').map(t => ({
      when: new Date(t.due_date + 'T23:59:59'), title: t.title, sub: t.section === 'team' ? 'Task due' : `Task due, ${sectionName(t.section)}`, go: 'tasks',
    })),
  ].sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, 8);

  const dayOf = (d: Date) => ({
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  });

  host.innerHTML = `
    <header class="st-page-head"><h1 class="st-page-title">Hello, ${esc(me.display_name.split(' ')[0])}</h1></header>
    <div class="st-overview">
      <section>
        <div class="st-group__head">
          <h2 class="st-group__title">Your tasks</h2>
        </div>
        ${myTasks.length
          ? `<div class="st-tlist">${myTasks.slice(0, 6).map(t => taskRowHtml(t, now, true)).join('')}</div>
             <p class="st-overview__more"><button type="button" class="st-btn st-btn--small" data-go="tasks">View all</button></p>`
          : `<p class="st-group__empty">No tasks assigned to you</p>`}
      </section>
      <section>
        <div class="st-group__head">
          <h2 class="st-group__title">Coming up</h2>
        </div>
        ${upcoming.length
          ? `<div class="st-uplist">${upcoming.map(u => { const d = dayOf(u.when); return `
              <button type="button" class="st-uprow" data-go="${u.go}">
                <span class="st-uprow__when"><span class="st-uprow__weekday">${esc(d.weekday)}</span>${esc(d.date)}</span>
                <span class="st-uprow__main">
                  <span class="st-uprow__title">${esc(u.title)}</span>
                  <span class="st-uprow__sub">${esc(u.sub)}</span>
                </span>
              </button>`; }).join('')}</div>`
          : `<p class="st-group__empty">Nothing scheduled</p>`}
      </section>
    </div>`;
  bindRows(host, tasks, () => render(host));
}
