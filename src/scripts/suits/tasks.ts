// Tasks: one list per proposal section. Tap the circle to move a task along,
// tap the row for details. Managers add tasks from the line at the top.
import { api, state, isManager, memberName, type Task } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtDate, initials } from './ui';
import { SECTIONS, sectionName } from './content';
import { refreshBadges } from './index';

type Filter = 'all' | 'mine' | 'open' | 'done';
let filter: Filter = 'all';
let quickSection = 'setup';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const tasks = await api.tasks();
  const me = state.me!.user_id;
  const now = Date.now();
  const open = tasks.filter(t => t.status !== 'done');
  const mine = open.filter(t => t.assignee_id === me);
  const visible = tasks.filter(t => filter === 'all' ? true : filter === 'mine' ? t.assignee_id === me : filter === 'open' ? t.status !== 'done' : t.status === 'done');
  const summary = tasks.length ? `${open.length} open${mine.length ? `, ${mine.length} yours` : ''}, ${tasks.length - open.length} done` : 'Nothing yet';

  host.innerHTML = `
    <div class="st-section" style="margin-bottom:1.25rem;">
      <div class="st-toolbar">
        <div><h2 class="st-h1" style="margin:0 0 0.2rem;">Tasks</h2><p class="st-muted" style="margin:0;">${esc(summary)}</p></div>
        ${isManager() ? `<button type="button" class="st-btn st-btn--primary" id="st-new-task">New task</button>` : ''}
      </div>
      <div class="st-chips" style="margin-top:0.9rem;">
        ${(['all', 'mine', 'open', 'done'] as Filter[]).map(f => `<button type="button" class="st-chip${filter === f ? ' is-active' : ''}" data-filter="${f}">${f === 'all' ? 'All' : f === 'mine' ? 'Mine' : f === 'open' ? 'Open' : 'Done'}</button>`).join('')}
      </div>
      ${isManager() ? `
      <form class="st-quickadd" id="st-quickadd" novalidate>
        <span class="st-tcheck" data-status="todo" aria-hidden="true"></span>
        <input class="st-quickadd__input" name="title" placeholder="Add a task and press Enter" autocomplete="off" />
        <div class="st-quickadd__section">${select('quick_section', SECTIONS.map(s => ({ value: s.key, label: s.name, selected: s.key === quickSection })), 'class="st-select st-select--inline"')}</div>
      </form>` : ''}
    </div>
    ${tasks.length === 0 ? `<p class="st-group__empty">No tasks yet.${isManager() ? ' Add the first one above.' : ''}</p>` : ''}
    ${SECTIONS.map(s => {
      const all = tasks.filter(t => t.section === s.key);
      const shown = visible.filter(t => t.section === s.key);
      if (!all.length || !shown.length) return '';
      const done = all.filter(t => t.status === 'done').length;
      return `
        <section class="st-tgroup">
          <div class="st-group__head">
            <h3 class="st-group__title">${esc(s.name)}</h3>
            <span class="st-group__count">${done} of ${all.length} done</span>
          </div>
          <div class="st-tlist">${shown.map(t => taskRowHtml(t, now)).join('')}</div>
        </section>`;
    }).join('')}`;

  host.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter as Filter; void render(host); }));
  host.querySelector('#st-new-task')?.addEventListener('click', () => editTask(host, null));

  const quick = host.querySelector<HTMLFormElement>('#st-quickadd');
  if (quick) {
    const { enhanceSelects } = await import('./ui');
    enhanceSelects(quick);
    quick.querySelector<HTMLSelectElement>('select')!.addEventListener('change', e => { quickSection = (e.target as HTMLSelectElement).value; });
    quick.addEventListener('submit', async e => {
      e.preventDefault();
      const inputEl = quick.querySelector<HTMLInputElement>('input[name="title"]')!;
      const title = inputEl.value.trim();
      if (!title) return;
      inputEl.disabled = true;
      try {
        await api.createTask({ title, section: quickSection, assignee_id: null, due_date: null, details: null, link: null });
        await refreshBadges();
        await render(host);
        host.querySelector<HTMLInputElement>('#st-quickadd input')?.focus();
      } catch (err) {
        toast((err as Error).message, 'danger');
        inputEl.disabled = false;
      }
    });
  }

  bindRows(host, tasks, () => render(host));
}

/** One task row. Also used on the Overview. */
export function taskRowHtml(t: Task, now: number, compact = false) {
  const late = t.status !== 'done' && t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < now;
  const owner = t.assignee_id ? memberName(t.assignee_id) : '';
  const canMove = isManager() || t.assignee_id === state.me?.user_id;
  const sub = compact ? sectionName(t.section) : '';
  return `
    <div class="st-trow${t.status === 'done' ? ' is-done' : ''}" data-task="${t.id}" role="button" tabindex="0">
      <button type="button" class="st-tcheck" data-status="${t.status}" ${canMove ? `data-cycle="${t.id}"` : 'disabled'} aria-label="${t.status === 'todo' ? 'Mark in progress' : t.status === 'doing' ? 'Mark done' : 'Mark to do'}"></button>
      <div class="st-trow__main">
        <p class="st-trow__title">${esc(t.title)}</p>
        ${sub ? `<p class="st-trow__sub${late ? ' is-late' : ''}">${esc(sub)}</p>` : ''}
      </div>
      <div class="st-trow__side">
        ${t.link ? `<a class="st-trow__link" href="${esc(t.link)}" target="_blank" rel="noopener" data-stop title="Open link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></a>` : ''}
        ${t.due_date ? `<span class="st-trow__due${late ? ' is-late' : ''}" title="${late ? 'Past due' : 'Due'}">${esc(fmtDate(t.due_date + 'T12:00:00', { month: 'short', day: 'numeric' }))}</span>` : ''}
        ${owner ? `<span class="st-avatar-sm" title="${esc(owner)}">${esc(initials(owner))}</span>` : ''}
      </div>
    </div>`;
}

export function bindRows(host: HTMLElement, tasks: Task[], after: () => Promise<void>) {
  host.querySelectorAll<HTMLElement>('[data-cycle]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const t = tasks.find(x => x.id === b.dataset.cycle)!;
    const next: Task['status'] = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
    b.dataset.status = next;
    try {
      await api.updateTask(t.id, { status: next }, t);
      await refreshBadges();
      await after();
    } catch (err) {
      toast((err as Error).message, 'danger');
      b.dataset.status = t.status;
    }
  }));
  host.querySelectorAll<HTMLElement>('[data-stop]').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(row => {
    const open = () => { const t = tasks.find(x => x.id === row.dataset.task)!; editTask(host, t, after); };
    row.addEventListener('click', e => { if ((e.target as HTMLElement).closest('button, a')) return; open(); });
    row.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
  });
}

function editTask(host: HTMLElement, existing: Task | null, after?: () => Promise<void>) {
  const canEdit = isManager();
  const canMove = existing ? (isManager() || existing.assignee_id === state.me?.user_id) : true;
  const done = after || (() => render(host));
  openModal({
    title: existing ? (canEdit ? 'Task' : existing.title) : 'New task',
    body: canEdit ? `
      ${field('title', 'Task', input('title', `type="text" required value="${esc(existing?.title || '')}" placeholder="Draft the abstract"`))}
      <div class="st-row">
        ${field('section', 'Proposal section', select('section', SECTIONS.map(s => ({ value: s.key, label: s.name, selected: (existing?.section || quickSection) === s.key }))))}
        ${field('assignee', 'Owner', select('assignee', [{ value: '', label: 'Unassigned', selected: !existing?.assignee_id }, ...state.members.map(m => ({ value: m.user_id, label: m.display_name, selected: existing?.assignee_id === m.user_id }))]))}
      </div>
      <div class="st-row">
        ${field('due', 'Due', input('due', `type="date" value="${existing?.due_date || ''}"`))}
        ${existing ? field('status', 'Status', select('status', [{ value: 'todo', label: 'To do', selected: existing.status === 'todo' }, { value: 'doing', label: 'In progress', selected: existing.status === 'doing' }, { value: 'done', label: 'Done', selected: existing.status === 'done' }])) : ''}
      </div>
      ${field('details', 'Details', textarea('details', 'rows="3" placeholder="What done looks like"'))}
      ${field('link', 'Link', input('link', `type="url" value="${esc(existing?.link || '')}" placeholder="The Doc, Sheet, or Figma file this task lives in"`))}
      ${existing ? `<p style="margin:0.25rem 0 0;"><button type="button" class="st-btn st-btn--small st-btn--danger" data-task-delete>Delete task</button></p>` : ''}`
    : `
      <dl class="st-kv" style="margin:0 0 1rem;">
        <dt>Section</dt><dd>${esc(sectionName(existing!.section))}</dd>
        <dt>Owner</dt><dd>${esc(existing!.assignee_id ? memberName(existing!.assignee_id) : 'Unassigned')}</dd>
        <dt>Due</dt><dd>${esc(existing!.due_date ? fmtDate(existing!.due_date + 'T12:00:00') : 'No date')}</dd>
        ${existing!.details ? `<dt>Details</dt><dd style="white-space:pre-wrap;">${esc(existing!.details)}</dd>` : ''}
        ${existing!.link ? `<dt>Link</dt><dd><a href="${esc(existing!.link)}" target="_blank" rel="noopener" style="color:inherit;">${esc(existing!.link)}</a></dd>` : ''}
      </dl>
      ${canMove ? field('status', 'Status', select('status', [{ value: 'todo', label: 'To do', selected: existing!.status === 'todo' }, { value: 'doing', label: 'In progress', selected: existing!.status === 'doing' }, { value: 'done', label: 'Done', selected: existing!.status === 'done' }])) : ''}`,
    submitLabel: canEdit ? (existing ? 'Save' : 'Create task') : (canMove ? 'Save' : 'Close'),
    cancelLabel: 'Cancel',
    onSubmit: async (form, close) => {
      if (!canEdit) {
        if (canMove && existing) await api.updateTask(existing.id, { status: formValue(form, 'status') as Task['status'] }, existing);
        close();
        await refreshBadges();
        await done();
        return;
      }
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give the task a name.');
      let link = formValue(form, 'link') || null;
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const payload = { title, section: formValue(form, 'section'), assignee_id: formValue(form, 'assignee') || null, due_date: formValue(form, 'due') || null, details: formValue(form, 'details') || null, link };
      if (existing) await api.updateTask(existing.id, { ...payload, status: (formValue(form, 'status') as Task['status']) || existing.status }, existing);
      else await api.createTask(payload);
      close();
      toast(existing ? 'Saved.' : 'Task created.');
      await refreshBadges();
      await done();
    },
  });
  setTimeout(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('#f-details');
    if (ta && existing) ta.value = existing.details || '';
    document.querySelector('[data-task-delete]')?.addEventListener('click', async () => {
      if (!existing || !(await confirmModal('Delete this task?', `"${existing.title}" will be removed.`, 'Delete task'))) return;
      await api.deleteTask(existing.id, existing);
      document.querySelector('.st-modal [data-modal-cancel]')?.dispatchEvent(new Event('click'));
      await refreshBadges();
      await done();
    });
  }, 0);
}
