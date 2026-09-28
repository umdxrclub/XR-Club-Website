import { api, state, canManageSubteam, memberName, type Task, type WorkingRole, type WorkingRoleAssignment } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtDate, initials } from './ui';
import { GROUPS, sectionName } from './content';
import { SUBTEAMS, defaultSubteam } from '../../lib/suitsCalendar';
import { datePicker, bindPickers } from './pickers';
import { refreshBadges } from './index';

type Filter = 'open' | 'mine' | 'overdue' | 'done' | 'all';
let filter: Filter = 'open';
let team = '', search = '', identity = '';
let tab: 'work' | 'people' = 'work';
let version = 0;
const statusName = { todo: 'To do', doing: 'In progress', done: 'Done' };
export function leave() { version++; }
const isLate = (t: Task) => t.status !== 'done' && !!t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now();
const safeLink = (url: string | null) => url && /^https?:\/\//i.test(url) ? url : '';

export async function render(host: HTMLElement) {
  const ticket = ++version;
  const key = `${state.me?.user_id}:${state.me?.proposal_role}`;
  if (identity !== key) { identity = key; team = defaultSubteam(state.me?.proposal_role); filter = 'open'; tab = 'work'; search = ''; }
  host.innerHTML = '<p class="st-muted">Loading tasks…</p>';
  const [tasks, roles, assignments] = await Promise.all([api.tasks(), api.workingRoles(), api.workingRoleAssignments()]);
  if (ticket !== version || !state.me) return;
  const redraw = () => {
    const scoped = tasks.filter(t => !team || t.section === team || t.section === 'team');
    const canCreate = !!state.me;
    host.innerHTML = `<div class="sw-work">
      <header class="st-page-head"><h1 class="st-page-title">Tasks</h1>${canCreate ? '<div class="st-page-actions"><button type="button" class="st-btn st-btn--primary" data-new-task>New task</button></div>' : ''}</header>
      <div class="sw-context"><label class="sw-team-select">Subteam<select class="sw-native" data-work-team aria-label="Subteam"><option value="">All subteams</option>${SUBTEAMS.map(s => `<option value="${s.key}"${team === s.key ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
      <div class="sw-tabs" aria-label="Task views"><button type="button" data-work-tab="work" aria-pressed="${tab === 'work'}">Work</button><button type="button" data-work-tab="people" aria-pressed="${tab === 'people'}">Roles</button></div>
      ${tab === 'work' ? `<div class="sw-work-toolbar"><div class="sw-filters" aria-label="Filter tasks">${(['open','mine','overdue','done','all'] as Filter[]).map(f => `<button type="button" data-work-filter="${f}" aria-pressed="${filter === f}">${{open:'Open',mine:'Assigned to me',overdue:'Past due',done:'Done',all:'All'}[f]}</button>`).join('')}</div><input class="sw-search" type="search" placeholder="Search tasks or people" aria-label="Search tasks or people" value="${esc(search)}" data-work-search /></div><div data-work-results aria-live="polite"></div>` : peopleHtml(roles, assignments)}
    </div>`;
    const drawResults = () => {
      const visible = scoped.filter(t => (filter === 'all' || filter === 'mine' && t.assignee_id === state.me?.user_id && t.status !== 'done' || filter === 'open' && t.status !== 'done' || filter === 'done' && t.status === 'done' || filter === 'overdue' && isLate(t)) && `${t.title} ${t.details || ''} ${memberName(t.assignee_id)} ${roles.find(r => r.id === t.responsibility_id)?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
      const results = host.querySelector<HTMLElement>('[data-work-results]');
      if (!results) return;
      results.innerHTML = visible.length ? GROUPS.map(group => {
        const rows = visible.filter(t => t.section === group.key).sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        return rows.length ? `<section class="sw-task-group"><header><h3>${esc(group.name)}</h3></header><div class="st-tlist">${rows.map(t => taskRowHtml(t, Date.now(), false, roles.find(r => r.id === t.responsibility_id)?.name)).join('')}</div></section>` : '';
      }).join('') : `<div class="sw-empty"><span class="sw-empty-icon" aria-hidden="true">✓</span><h3>${search ? 'No matching tasks' : filter === 'overdue' ? 'Nothing past due' : filter === 'mine' ? 'Nothing assigned to you' : filter === 'done' ? 'No completed tasks' : 'No tasks yet'}</h3>${canCreate && !search ? '<button class="st-btn" type="button" data-empty-create>New task</button>' : ''}</div>`;
      bindRows(results, tasks, () => render(host));
      results.querySelector('[data-empty-create]')?.addEventListener('click', () => void editTask(host, null));
    };
    drawResults();
    host.querySelector<HTMLSelectElement>('[data-work-team]')!.addEventListener('change', e => { team = (e.target as HTMLSelectElement).value; search = ''; redraw(); });
    host.querySelectorAll<HTMLElement>('[data-work-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.workTab as typeof tab; redraw(); }));
    host.querySelectorAll<HTMLElement>('[data-work-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.workFilter as Filter; redraw(); }));
    host.querySelector<HTMLInputElement>('[data-work-search]')?.addEventListener('input', e => { search = (e.target as HTMLInputElement).value; drawResults(); });
    host.querySelector('[data-new-task]')?.addEventListener('click', () => void editTask(host, null));
    host.querySelectorAll<HTMLElement>('[data-new-role]').forEach(b => b.addEventListener('click', () => editRole(host, b.dataset.newRole!, null)));
    host.querySelectorAll<HTMLElement>('[data-edit-role]').forEach(b => b.addEventListener('click', () => { const r = roles.find(r => r.id === b.dataset.editRole)!; editRole(host, r.subteam, r); }));
    host.querySelectorAll<HTMLElement>('[data-assign-role]').forEach(b => b.addEventListener('click', () => assignRole(host, roles.find(r => r.id === b.dataset.assignRole)!, assignments)));
  };
  redraw();
}

function peopleHtml(roles: WorkingRole[], assignments: WorkingRoleAssignment[]) {
  return SUBTEAMS.filter(s => !team || s.key === team).map(s => {
    const people = state.members.filter(m => m.proposal_role === s.key);
    const ownRoles = roles.filter(r => r.subteam === s.key);
    const canEdit = canManageSubteam(s.key);
    return `<section class="sw-team-roles"><header class="sw-group-heading"><div><h3>${esc(s.name)}</h3></div>${canEdit ? `<button type="button" class="st-btn st-btn--small" data-new-role="${s.key}">New role</button>` : '<span class="sw-label">View only</span>'}</header>
    <div class="sw-role-grid">${ownRoles.map(r => {
      const holders = people.filter(m => assignments.some(a => a.role_id === r.id && a.user_id === m.user_id));
      return `<article class="sw-role-card"><div class="sw-role-card__head"><h4>${esc(r.name)}</h4>${canEdit ? `<button type="button" class="sw-text-button" data-edit-role="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">Edit</button>` : ''}</div><p>${esc(r.description || 'No description')}</p><div class="sw-person-chips">${holders.length ? holders.map(m => `<span><i aria-hidden="true">${esc(initials(m.display_name))}</i>${esc(m.display_name)}</span>`).join('') : '<span class="sw-unassigned">No one assigned</span>'}</div>${canEdit ? `<footer><button type="button" class="sw-text-button" data-assign-role="${esc(r.id)}">Assign people</button></footer>` : ''}</article>`;
    }).join('') || '<div class="sw-role-empty"><h4>No roles yet</h4></div>'}</div>
    <div class="sw-people-list">${people.map(m => {
      const memberRoles = ownRoles.filter(r => assignments.some(a => a.role_id === r.id && a.user_id === m.user_id));
      return `<div class="sw-person-row"><span class="sw-person-avatar" aria-hidden="true">${esc(initials(m.display_name))}</span><strong>${esc(m.display_name)}${m.user_id === state.me?.user_id ? '<small>You</small>' : ''}</strong><div class="sw-person-roles">${memberRoles.map(r => `<span>${esc(r.name)}</span>`).join('') || '<span class="sw-unassigned">No roles</span>'}</div></div>`;
    }).join('') || '<p class="sw-footnote">No members in this subteam</p>'}</div></section>`;
  }).join('');
}

function editRole(host: HTMLElement, subteam: string, existing: WorkingRole | null) {
  void openModal({ title: existing ? 'Edit role' : 'New role',
    body: `<p class="st-muted">${esc(sectionName(subteam))}</p>${field('name', 'Name', input('name', `required maxlength="60" placeholder="Model evaluation" value="${esc(existing?.name || '')}"`))}${field('description', 'Responsibilities', textarea('description', 'rows="3" maxlength="500" placeholder="What does this role own?"'))}${existing ? '<button type="button" class="sw-text-button sw-danger" data-delete-role>Delete role</button>' : ''}`,
    submitLabel: existing ? 'Save role' : 'Create role',
    onSubmit: async (form, close) => {
      const name = formValue(form, 'name'); if (!name) throw new Error('Enter a role name.');
      await api.saveWorkingRole(existing?.id || null, { name, subteam, description: formValue(form, 'description') });
      close(); toast(existing ? 'Role saved' : 'Role created'); await render(host);
    },
  });
  const modal = document.querySelector('.st-modal:last-child')!;
  modal.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = existing?.description || '';
  modal.querySelector('[data-delete-role]')?.addEventListener('click', async () => {
    if (!existing || !(await confirmModal('Delete role?', 'Everyone is unassigned from this role. Its tasks are kept.', 'Delete role'))) return;
    try { await api.deleteWorkingRole(existing.id); (modal.querySelector('[data-modal-cancel]') as HTMLElement).click(); await render(host); }
    catch (err) { toast((err as Error).message, 'danger'); }
  });
}

function assignRole(host: HTMLElement, role: WorkingRole, assignments: WorkingRoleAssignment[]) {
  const people = state.members.filter(m => m.proposal_role === role.subteam);
  void openModal({ title: `Assign ${role.name}`, body: `<p class="st-muted">${esc(sectionName(role.subteam))}</p><fieldset class="sw-assign-list"><legend class="sw-sr-only">People in this role</legend>${people.map(m => `<label><input type="checkbox" name="people" value="${esc(m.user_id)}"${assignments.some(a => a.role_id === role.id && a.user_id === m.user_id) ? ' checked' : ''}/><span class="sw-person-avatar" aria-hidden="true">${esc(initials(m.display_name))}</span><span><strong>${esc(m.display_name)}</strong><small>${esc(m.email)}</small></span></label>`).join('') || '<p>No members in this subteam</p>'}</fieldset>`, submitLabel: 'Save assignments',
    onSubmit: async (form, close) => { await api.assignWorkingRole(role.id, new FormData(form).getAll('people').map(String)); close(); toast('Assignments saved'); await render(host); },
  });
}

/** Separate real buttons keep keyboard focus inside the row, including on Overview. */
export function taskRowHtml(t: Task, now: number, compact = false, workingRole?: string) {
  const late = t.status !== 'done' && t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < now;
  const owner = t.assignee_id ? memberName(t.assignee_id) : '';
  const canMove = canManageSubteam(t.section) || t.assignee_id === state.me?.user_id;
  const sub = [compact ? sectionName(t.section) : '', workingRole].filter(Boolean).join(', ');
  return `<div class="st-trow sw-task-row${t.status === 'done' ? ' is-done' : ''}"><button type="button" class="st-tcheck" data-status="${t.status}" ${canMove ? `data-cycle="${esc(t.id)}"` : 'disabled'} aria-label="${esc(t.title)}: ${t.status === 'todo' ? 'mark in progress' : t.status === 'doing' ? 'mark done' : 'mark to do'}"></button><button type="button" class="st-trow__main sw-task-open" data-task="${esc(t.id)}"><span class="st-trow__title">${esc(t.title)}</span>${sub ? `<span class="st-trow__sub">${esc(sub)}</span>` : ''}</button><span class="sw-status" data-status="${t.status}">${statusName[t.status]}</span><div class="st-trow__side">${safeLink(t.link) ? `<a class="st-trow__link" href="${esc(safeLink(t.link))}" target="_blank" rel="noopener" aria-label="Open link for ${esc(t.title)}">Open link</a>` : ''}${t.due_date ? `<span class="st-trow__due${late ? ' is-late' : ''}" title="${late ? 'Past due' : 'Due'}">${esc(fmtDate(t.due_date + 'T12:00:00', { month: 'short', day: 'numeric' }))}</span>` : ''}<span class="st-avatar-sm${owner ? '' : ' sw-no-owner is-empty'}" title="${esc(owner || 'Unassigned')}" aria-label="${esc(owner || 'Unassigned')}">${esc(owner ? initials(owner) : '')}</span></div></div>`;
}

export function bindRows(host: HTMLElement, tasks: Task[], after: () => Promise<void>) {
  host.querySelectorAll<HTMLButtonElement>('[data-cycle]').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === b.dataset.cycle)!;
    const next: Task['status'] = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
    b.disabled = true;
    try { await api.updateTask(t.id, { status: next }, t); await refreshBadges(); await after(); }
    catch (err) { toast((err as Error).message, 'danger'); b.disabled = false; }
  }));
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(b => b.addEventListener('click', () => void editTask(host, tasks.find(t => t.id === b.dataset.task)!, after)));
}

async function editTask(host: HTMLElement, existing: Task | null, after?: () => Promise<void>) {
  try {
    const roles = await api.workingRoles();
    if (!state.me || !host.isConnected || host.closest<HTMLElement>('.st-view')?.hidden) return;
    const section = existing?.section || (team && canManageSubteam(team) ? team : defaultSubteam(state.me.proposal_role) || 'team');
    const canEdit = canManageSubteam(section);
    const canMove = !!existing && (canEdit || existing.assignee_id === state.me.user_id);
    if (!existing && !canEdit) return;
    const done = after || (() => render(host));
    const statusField = field('status', 'Status', select('status', Object.entries(statusName).map(([value,label]) => ({ value, label, selected: (existing?.status || 'todo') === value }))));
    void openModal({ title: existing ? canEdit ? 'Edit task' : existing.title : 'New task',
      body: canEdit ? `${field('title','Title',input('title', `required maxlength="240" value="${esc(existing?.title || '')}" placeholder="What needs to be done?"`))}<div class="st-row">${field('section','Subteam',select('section',GROUPS.filter(s => canManageSubteam(s.key)).map(s => ({value:s.key,label:s.name,selected:s.key === section}))))}${field('assignee','Owner',select('assignee',[]))}</div><div class="st-row">${field('responsibility','Role',select('responsibility',[]))}${field('due','Due date',datePicker('due',existing?.due_date || '',{placeholder:'No date',clearable:true}))}</div>${existing ? statusField : ''}${field('details','Details',textarea('details','rows="3" placeholder="What does done look like?"'))}${field('link','Link',input('link',`type="url" value="${esc(existing?.link || '')}" placeholder="https://"`))}${existing ? '<button class="sw-text-button sw-danger" type="button" data-task-delete>Delete task</button>' : ''}` : `<dl class="st-kv"><dt>Subteam</dt><dd>${esc(sectionName(section))}</dd><dt>Owner</dt><dd>${esc(memberName(existing!.assignee_id))}</dd><dt>Role</dt><dd>${esc(roles.find(r => r.id === existing!.responsibility_id)?.name || 'None')}</dd><dt>Due date</dt><dd>${esc(existing!.due_date ? fmtDate(existing!.due_date + 'T12:00:00', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date')}</dd><dt>Details</dt><dd class="sw-prewrap">${esc(existing!.details || 'No details')}</dd>${safeLink(existing!.link) ? `<dt>Link</dt><dd><a href="${esc(safeLink(existing!.link))}" target="_blank" rel="noopener">Open link</a></dd>` : ''}</dl>${canMove ? statusField : ''}`,
      submitLabel: canEdit ? existing ? 'Save task' : 'Create task' : canMove ? 'Save status' : 'Close',
      onSubmit: async (form, close) => {
        if (canEdit) {
          const title = formValue(form, 'title'); if (!title) throw new Error('Enter a title.');
          const link = formValue(form, 'link') || null;
          if (link && !/^https?:\/\//i.test(link)) throw new Error('Enter a link that starts with https:// or http://.');
          const payload = { title, section: formValue(form, 'section'), assignee_id: formValue(form, 'assignee') || null, responsibility_id: formValue(form, 'responsibility') || null, due_date: formValue(form, 'due') || null, details: formValue(form, 'details') || null, link };
          if (existing) await api.updateTask(existing.id, { ...payload, status: formValue(form, 'status') as Task['status'] }, existing);
          else await api.createTask(payload);
        } else if (canMove) await api.updateTask(existing!.id, { status: formValue(form, 'status') as Task['status'] }, existing!);
        close(); await refreshBadges(); await done();
      },
    });
    const modal = document.querySelector('.st-modal:last-child')!;
    if (canEdit) {
      modal.querySelector<HTMLTextAreaElement>('[name="details"]')!.value = existing?.details || '';
      const sectionSelect = modal.querySelector<HTMLSelectElement>('[name="section"]')!;
      const populate = (initial: boolean) => {
        const assignee = modal.querySelector<HTMLSelectElement>('[name="assignee"]')!;
        const responsibility = modal.querySelector<HTMLSelectElement>('[name="responsibility"]')!;
        assignee.innerHTML = `<option value="">Unassigned</option>${state.members.filter(m => sectionSelect.value === 'team' || m.proposal_role === sectionSelect.value || initial && m.user_id === existing?.assignee_id).map(m => `<option value="${esc(m.user_id)}">${esc(m.display_name)}</option>`).join('')}${initial && existing?.assignee_id && !state.members.some(m => m.user_id === existing.assignee_id) ? `<option value="${esc(existing.assignee_id)}" disabled>Former member</option>` : ''}`;
        responsibility.innerHTML = `<option value="">No role</option>${roles.filter(r => r.subteam === sectionSelect.value).map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}`;
        if (initial) { assignee.value = existing?.assignee_id || ''; responsibility.value = existing?.responsibility_id || ''; }
        if (!assignee.value) assignee.value = ''; if (!responsibility.value) responsibility.value = '';
        assignee.dispatchEvent(new Event('change')); responsibility.dispatchEvent(new Event('change'));
      };
      populate(true); sectionSelect.addEventListener('change', () => populate(false)); bindPickers(modal);
      modal.querySelector('[data-task-delete]')?.addEventListener('click', async () => {
        if (!existing || !(await confirmModal('Delete task?', `“${existing.title}” will be permanently deleted.`, 'Delete task'))) return;
        try { await api.deleteTask(existing.id, existing); (modal.querySelector('[data-modal-cancel]') as HTMLElement).click(); await refreshBadges(); await done(); }
        catch (err) { toast((err as Error).message, 'danger'); }
      });
    }
  } catch (err) { toast((err as Error).message, 'danger'); }
}
