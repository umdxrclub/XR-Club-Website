// Task board, grouped by proposal section so the board mirrors the document.
import { api, state, isManager, memberName, type Task } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtDate } from './ui';
import { SECTIONS, sectionName } from './content';
import { refreshBadges } from './index';

type Filter = 'all' | 'mine' | 'open' | 'done';
let filter: Filter = 'all';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const tasks = await api.tasks();
  const me = state.me!.user_id;
  const now = Date.now();
  const visible = tasks.filter(t => filter === 'all' ? true : filter === 'mine' ? t.assignee_id === me : filter === 'open' ? t.status !== 'done' : t.status === 'done');

  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <div><h2 class="st-h1">Tasks</h2><p class="st-lead" style="margin:0;">Each task is tied to a proposal section and assigned to one team member.</p></div>
        ${isManager() ? `<button type="button" class="st-btn st-btn--primary" id="st-new-task">New task</button>` : ''}
      </div>
      <div class="st-segment" id="st-task-filter">
        ${(['all', 'mine', 'open', 'done'] as Filter[]).map(f => `<button type="button" data-filter="${f}" class="${filter === f ? 'is-active' : ''}">${f === 'all' ? 'All' : f === 'mine' ? 'Mine' : f === 'open' ? 'Open' : 'Done'}</button>`).join('')}
      </div>
    </div>
    ${tasks.length === 0 ? `<div class="st-empty">No tasks yet.${isManager() ? ' Create the first ones from the proposal checklist.' : ''}</div>` : ''}
    ${SECTIONS.map(s => {
      const all = tasks.filter(t => t.section === s.key);
      const shown = visible.filter(t => t.section === s.key);
      if (!all.length) return '';
      const done = all.filter(t => t.status === 'done').length;
      return `
        <div class="st-task-section">
          <div class="st-task-section__head">
            <h3 class="st-task-section__title">${esc(s.name)}</h3>
            <span class="st-muted" style="font-size:0.9rem;">${done} of ${all.length} done</span>
          </div>
          <div class="st-progress" style="height:6px; margin-bottom:0.6rem;"><div class="st-progress__bar" style="width:${all.length ? Math.round((done / all.length) * 100) : 0}%"></div></div>
          ${shown.length ? shown.map(t => taskHtml(t, now)).join('') : `<p class="st-muted" style="font-size:0.9rem; margin:0 0 0.5rem;">Nothing in this view.</p>`}
        </div>`;
    }).join('')}`;

  host.querySelector('#st-task-filter')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]');
    if (b) { filter = b.dataset.filter as Filter; render(host); }
  });
  host.querySelector('#st-new-task')?.addEventListener('click', () => editTask(host, null));
  host.querySelectorAll<HTMLElement>('[data-edit-task]').forEach(b => b.addEventListener('click', () => editTask(host, tasks.find(t => t.id === b.dataset.editTask)!)));
  host.querySelectorAll<HTMLElement>('[data-delete-task]').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === b.dataset.deleteTask)!;
    if (!(await confirmModal('Delete this task?', `"${t.title}" will be removed.`, 'Delete task'))) return;
    await api.deleteTask(t.id);
    await refreshBadges();
    await render(host);
  }));
  host.querySelectorAll<HTMLElement>('[data-cycle]').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === b.dataset.cycle)!;
    const next: Task['status'] = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
    try {
      await api.updateTask(t.id, { status: next });
      await refreshBadges();
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  }));
}

function taskHtml(t: Task, now: number) {
  const canMove = isManager() || t.assignee_id === state.me!.user_id;
  const late = t.status !== 'done' && t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < now;
  return `
    <div class="st-task${t.status === 'done' ? ' is-done' : ''}">
      <button type="button" class="st-task__status" data-status="${t.status}" ${canMove ? `data-cycle="${t.id}"` : 'disabled'} title="${t.status === 'todo' ? 'To do' : t.status === 'doing' ? 'In progress' : 'Done'}" aria-label="Change status"></button>
      <div>
        <p class="st-task__title">${esc(t.title)}</p>
        <p class="st-task__meta${late ? ' is-late' : ''}">${esc(memberName(t.assignee_id))}${t.due_date ? `, due ${esc(fmtDate(t.due_date + 'T12:00:00'))}${late ? ', past due' : ''}` : ''}${t.status === 'doing' ? ', in progress' : ''}</p>
        ${t.details ? `<p class="st-muted" style="font-size:0.92rem; margin:0.3rem 0 0; white-space:pre-wrap;">${esc(t.details)}</p>` : ''}
        ${t.link ? `<p style="margin:0.4rem 0 0;"><a class="st-btn st-btn--small" href="${esc(t.link)}" target="_blank" rel="noopener">${esc(linkLabel(t.link))}</a></p>` : ''}
      </div>
      ${isManager() ? `<div class="st-task__actions" style="display:flex; gap:0.4rem;"><button type="button" class="st-btn st-btn--small" data-edit-task="${t.id}">Edit</button><button type="button" class="st-btn st-btn--small st-btn--danger" data-delete-task="${t.id}">Delete</button></div>` : '<span></span>'}
    </div>`;
}

function editTask(host: HTMLElement, existing: Task | null) {
  openModal({
    title: existing ? 'Edit task' : 'New task',
    body: `
      ${field('title', 'Task', input('title', `type="text" required value="${esc(existing?.title || '')}" placeholder="Draft the abstract"`))}
      ${field('section', 'Proposal section', select('section', SECTIONS.map(s => ({ value: s.key, label: s.name, selected: (existing?.section || 'setup') === s.key }))))}
      <div class="st-row">
        ${field('assignee', 'Owner', select('assignee', [{ value: '', label: 'Unassigned', selected: !existing?.assignee_id }, ...state.members.map(m => ({ value: m.user_id, label: m.display_name, selected: existing?.assignee_id === m.user_id }))]))}
        ${field('due', 'Due', input('due', `type="date" value="${existing?.due_date || ''}"`))}
      </div>
      ${field('details', 'Details', textarea('details', 'rows="3" placeholder="What done looks like"'))}
      ${field('link', 'Link', input('link', `type="url" value="${esc(existing?.link || '')}" placeholder="The Google Doc, Sheet, or Figma file this task lives in"`))}`,
    submitLabel: existing ? 'Save changes' : 'Create task',
    onSubmit: async (form, close) => {
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give the task a name.');
      let link = formValue(form, 'link') || null;
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const payload = { title, section: formValue(form, 'section'), assignee_id: formValue(form, 'assignee') || null, due_date: formValue(form, 'due') || null, details: formValue(form, 'details') || null, link };
      if (existing) await api.updateTask(existing.id, payload);
      else await api.createTask(payload);
      close();
      toast(existing ? 'Task updated.' : 'Task created.');
      await refreshBadges();
      await render(host);
    },
  });
  setTimeout(() => { const ta = document.querySelector<HTMLTextAreaElement>('#f-details'); if (ta && existing) ta.value = existing.details || ''; }, 0);
  void sectionName;
}

function linkLabel(url: string) {
  if (/docs\.google\.com\/document/i.test(url)) return 'Open the Doc';
  if (/docs\.google\.com\/spreadsheets/i.test(url)) return 'Open the Sheet';
  if (/docs\.google\.com\/presentation/i.test(url)) return 'Open the Slides';
  if (/drive\.google\.com/i.test(url)) return 'Open in Drive';
  if (/figma\.com/i.test(url)) return 'Open in Figma';
  return 'Open link';
}
