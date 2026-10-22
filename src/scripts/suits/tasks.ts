import { api, state, canManageSubteam, memberName, type Task, type TaskStatus, type TaskLabel, type ChecklistItem, type TeamDocument, type WorkingRole, type WorkingRoleAssignment } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtDate, initials } from './ui';
import { GROUPS, sectionName } from './content';
import { SUBTEAMS } from '../../lib/suitsCalendar';
import { datePicker, bindPickers } from './pickers';
import { refreshBadges } from './index';
import { crewAvatar } from './avatar';

// The Tasks view: a board (To Do, Doing, Iteration, Done) of cards that carry a label, a due date, a checklist, the
// people on them, the document they are worked in, and sometimes a cover photo; some cards are milestones. The same
// cards can be read as a list grouped by subteam.
type Filter = 'open' | 'mine' | 'overdue' | 'done' | 'all';
type Layout = 'board' | 'list';
let filter: Filter = 'all', layout: Layout = 'board';
let team = '', search = '', identity = '';
let tab: 'work' | 'people' = 'work';
let version = 0;
export const statusName: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', iteration: 'Iteration', done: 'Done' };
const COLUMNS: TaskStatus[] = ['todo', 'doing', 'iteration', 'done'];
const nextStatus: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'iteration', iteration: 'done', done: 'todo' };
export const LABELS: TaskLabel[] = ['Interface', 'AI', 'Navigation', 'Hardware', 'HITL Testing', 'All'];
export function leave() { version++; }
const isLate = (t: Task) => t.status !== 'done' && !!t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now();
const safeLink = (url: string | null) => url && /^https?:\/\//i.test(url) ? url : '';
const safeImage = (url: string | null) => url && /^(https?:\/\/|\/)/i.test(url) && !/^\/\//.test(url) ? url : '';
const checklistOf = (t: Task): ChecklistItem[] => Array.isArray(t.checklist) ? t.checklist.filter(i => i && typeof i.text === 'string') : [];
const membersOf = (t: Task) => [...new Set([t.assignee_id, ...(t.members || [])].filter((id): id is string => !!id))];
const byPlace = (a: Task, b: Task) => a.position - b.position || (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at);

// Icons (Lucide, ISC)
const svg = (d: string, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CLOCK = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const CHECKS = svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>');
const DONE = svg('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="m8 12 3 3 5-6" stroke="#0f1a12"/>', 'sw-card__done');
const FLAG = svg('<path d="M5 21V4h11l-1.5 4L16 12H5"/>', 'sw-card__flag');
const LINK = svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
/** A Google document, sheet, slides or Drive file glyph in its own colour. */
function docIcon(url: string) {
  const kind = /spreadsheets/.test(url) ? 'sheet' : /presentation/.test(url) ? 'slides' : /\/document\//.test(url) ? 'doc' : 'file';
  const color = { sheet: '#188038', slides: '#e8a100', doc: '#2b6fd6', file: '#5f6368' }[kind];
  return `<svg class="sw-badge__doc" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l5 5v15H6z" fill="${color}"/><path d="M14 2v5h5" fill="#fff" fill-opacity=".6"/><path d="M9 12h7M9 15h7M9 18h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

/** The Drive id in a Google link, so a task links to the team document that shares it. */
const driveId = (url: string | null) => { const m = (url || '').match(/\/(?:d|file\/d|document\/d|spreadsheets\/d|presentation\/d|folders)\/([-\w]{10,})/); return m ? m[1] : ''; };
function documentFor(link: string | null, documents: TeamDocument[]) {
  const id = driveId(link);
  return id ? documents.find(d => driveId(d.drive_url) === id || driveId(d.url) === id) || null : null;
}

export async function render(host: HTMLElement) {
  const ticket = ++version;
  const key = `${state.me?.user_id}:${state.me?.proposal_role}`;
  if (identity !== key) { identity = key; team = ''; filter = 'all'; layout = 'board'; tab = 'work'; search = ''; }
  host.innerHTML = '<p class="st-muted">Loading tasks…</p>';
  const [tasks, roles, assignments, documents] = await Promise.all([api.tasks(), api.workingRoles(), api.workingRoleAssignments(), api.documents().catch(() => [] as TeamDocument[])]);
  if (ticket !== version || !state.me) return;
  const redraw = () => {
    const scoped = tasks.filter(t => !team || t.section === team || t.section === 'team');
    const canCreate = !!state.me;
    const filters: Filter[] = layout === 'board' ? ['all', 'mine', 'overdue'] : ['open', 'mine', 'overdue', 'done', 'all'];
    // The board is the page: the title, two words to reach the list and the roles, the button. Filters only in the list.
    const links = tab === 'people' ? '<button type="button" class="sw-link" data-work-tab="work">Board</button>'
      : `<button type="button" class="sw-link" data-work-layout="${layout === 'board' ? 'list' : 'board'}">${layout === 'board' ? 'List' : 'Board'}</button><button type="button" class="sw-link" data-work-tab="people">Roles</button>`;
    const toolbar = tab === 'work' && layout === 'list' ? `<div class="sw-work-toolbar"><div class="sw-work-toolbar__left"><div class="sw-filters" aria-label="Filter tasks">${filters.map(f => `<button type="button" data-work-filter="${f}" aria-pressed="${filter === f}">${{ open: 'Open', mine: 'Assigned to me', overdue: 'Past due', done: 'Done', all: 'All' }[f]}</button>`).join('')}</div></div><div class="sw-work-toolbar__right"><select class="sw-native" data-work-team aria-label="Subteam"><option value="">All subteams</option>${SUBTEAMS.map(s => `<option value="${s.key}"${team === s.key ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select><input class="sw-search" type="search" placeholder="Search cards or people" aria-label="Search cards or people" value="${esc(search)}" data-work-search /></div></div>` : '';
    host.innerHTML = `<div class="sw-work">
      <header class="st-page-head"><h1 class="st-page-title">${tab === 'people' ? 'Roles' : 'Tasks'}</h1><div class="st-page-actions">${links}${canCreate ? '<button type="button" class="st-btn st-btn--primary" data-new-task>New card</button>' : ''}</div></header>
      ${tab === 'work' ? `${toolbar}<div data-work-results aria-live="polite"></div>` : peopleHtml(roles, assignments)}
    </div>`;
    const drawResults = () => {
      const me = state.me?.user_id;
      const visible = scoped.filter(t => (filter === 'all' || filter === 'mine' && membersOf(t).includes(me || '') && t.status !== 'done' || filter === 'open' && t.status !== 'done' || filter === 'done' && t.status === 'done' || filter === 'overdue' && isLate(t))
        && `${t.title} ${t.details || ''} ${t.label || ''} ${membersOf(t).map(memberName).join(' ')} ${roles.find(r => r.id === t.responsibility_id)?.name || ''} ${documentFor(t.link, documents)?.title || ''}`.toLowerCase().includes(search.toLowerCase()));
      const results = host.querySelector<HTMLElement>('[data-work-results]');
      if (!results) return;
      const now = Date.now();
      if (layout === 'board') {
        results.innerHTML = `<div class="sw-board-wrap"><div class="sw-board">${COLUMNS.map(status => {
          const cards = visible.filter(t => t.status === status).sort(byPlace);
          return `<section class="sw-col" data-status="${status}" aria-label="${statusName[status]}"><header class="sw-col__head"><h3>${statusName[status]}</h3><span class="sw-col__count">${cards.length}</span></header><div class="sw-col__cards">${cards.map(t => cardHtml(t, documents, now)).join('') || '<p class="sw-col__empty">No cards</p>'}</div>${canCreate && canManageSubteam(team || 'team') ? `<button type="button" class="sw-col__add" data-add-card="${status}">+ Add a card</button>` : ''}</section>`;
        }).join('')}</div></div>`;
        results.querySelectorAll<HTMLElement>('[data-task]').forEach(card => {
          const open = () => void editTask(host, tasks.find(t => t.id === card.dataset.task)!, () => render(host));
          card.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('a')) open(); });
          card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
        });
        results.querySelectorAll<HTMLElement>('[data-add-card]').forEach(b => b.addEventListener('click', () => void editTask(host, null, undefined, { status: b.dataset.addCard as TaskStatus, position: Math.max(0, ...tasks.filter(t => t.status === b.dataset.addCard).map(t => t.position)) + 1 })));
      } else {
        results.innerHTML = visible.length ? GROUPS.map(group => {
          const rows = visible.filter(t => t.section === group.key).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
          return rows.length ? `<section class="sw-task-group"><header><h3>${esc(group.name)}</h3></header><div class="st-tlist">${rows.map(t => taskRowHtml(t, now, false, roles.find(r => r.id === t.responsibility_id)?.name)).join('')}</div></section>` : '';
        }).join('') : `<div class="sw-empty"><span class="sw-empty-icon" aria-hidden="true">✓</span><h3>${search ? 'No matching cards' : filter === 'overdue' ? 'Nothing past due' : filter === 'mine' ? 'Nothing assigned to you' : filter === 'done' ? 'No completed cards' : 'No cards yet'}</h3>${canCreate && !search ? '<button class="st-btn" type="button" data-empty-create>New card</button>' : ''}</div>`;
        bindRows(results, tasks, () => render(host));
        results.querySelector('[data-empty-create]')?.addEventListener('click', () => void editTask(host, null));
      }
    };
    drawResults();
    host.querySelector<HTMLSelectElement>('[data-work-team]')?.addEventListener('change', e => { team = (e.target as HTMLSelectElement).value; search = ''; redraw(); });
    host.querySelectorAll<HTMLElement>('[data-work-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.workTab as typeof tab; redraw(); }));
    host.querySelectorAll<HTMLElement>('[data-work-layout]').forEach(b => b.addEventListener('click', () => { layout = b.dataset.workLayout as Layout; filter = layout === 'board' ? 'all' : 'open'; redraw(); }));
    host.querySelectorAll<HTMLElement>('[data-work-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.workFilter as Filter; redraw(); }));
    host.querySelector<HTMLInputElement>('[data-work-search]')?.addEventListener('input', e => { search = (e.target as HTMLInputElement).value; drawResults(); });
    host.querySelector('[data-new-task]')?.addEventListener('click', () => void editTask(host, null));
    host.querySelectorAll<HTMLElement>('[data-new-role]').forEach(b => b.addEventListener('click', () => editRole(host, b.dataset.newRole!, null)));
    host.querySelectorAll<HTMLElement>('[data-edit-role]').forEach(b => b.addEventListener('click', () => { const r = roles.find(r => r.id === b.dataset.editRole)!; editRole(host, r.subteam, r); }));
    host.querySelectorAll<HTMLElement>('[data-assign-role]').forEach(b => b.addEventListener('click', () => assignRole(host, roles.find(r => r.id === b.dataset.assignRole)!, assignments)));
  };
  redraw();
}

/** One card on the board. */
function cardHtml(t: Task, documents: TeamDocument[], now: number) {
  const items = checklistOf(t), ticked = items.filter(i => i.done).length;
  const due = t.due_date ? new Date(t.due_date + 'T23:59:59').getTime() : 0;
  const late = t.status !== 'done' && due && due < now, soon = !late && t.status !== 'done' && due && due - now < 36 * 3600e3;
  const document = documentFor(t.link, documents), link = safeLink(t.link), cover = safeImage(t.cover_url);
  const people = membersOf(t).map(id => state.members.find(m => m.user_id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  return `<article class="sw-card${t.status === 'done' ? ' is-done' : ''}${t.kind === 'milestone' ? ' is-milestone' : ''}" data-task="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.title)}${t.kind === 'milestone' ? ', milestone' : ''}">
    ${cover ? `<img class="sw-card__cover" src="${esc(cover)}" alt="" loading="lazy" decoding="async" />` : ''}
    ${t.label ? `<span class="sw-card__label" data-label="${esc(t.label)}" title="${esc(t.label)}"><span class="sw-sr-only">${esc(t.label)}</span></span>` : ''}
    <h4 class="sw-card__title">${t.status === 'done' ? DONE : t.kind === 'milestone' ? FLAG : ''}<span>${esc(t.title)}</span></h4>
    ${t.kind === 'milestone' || t.due_date || items.length || document || link ? `<div class="sw-card__badges">
      ${t.kind === 'milestone' ? '<span class="sw-badge sw-badge--milestone">Milestone</span>' : ''}
      ${t.due_date ? `<span class="sw-badge sw-badge--due${t.status === 'done' ? ' is-done' : late ? ' is-late' : soon ? ' is-soon' : ''}" title="${t.status === 'done' ? 'Complete' : late ? 'Past due' : 'Due'}">${CLOCK}<span>${esc(fmtDate(t.due_date + 'T12:00:00', { month: 'short', day: 'numeric' }))}</span></span>` : ''}
      ${items.length ? `<span class="sw-badge sw-badge--check${ticked === items.length ? ' is-done' : ''}" title="Checklist">${CHECKS}<span>${ticked}/${items.length}</span></span>` : ''}
      ${document ? `<a class="sw-badge sw-badge--doc" href="${esc(document.drive_url || document.url || '')}" target="_blank" rel="noopener" title="Open ${esc(document.title)}">${docIcon(document.drive_url || document.url || '')}<span>${esc(document.title)}</span></a>` : link ? `<a class="sw-badge sw-badge--doc" href="${esc(link)}" target="_blank" rel="noopener" title="Open link">${LINK}<span>${esc(new URL(link).hostname.replace(/^www\./, ''))}</span></a>` : ''}
    </div>` : ''}
    ${people.length ? `<div class="sw-card__people" aria-label="${esc(people.map(m => m.display_name).join(', '))}">${people.map(m => crewAvatar(m)).join('')}</div>` : ''}
  </article>`;
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
  const canMove = canManageSubteam(t.section) || membersOf(t).includes(state.me?.user_id || '');
  const sub = [compact ? sectionName(t.section) : '', workingRole].filter(Boolean).join(', ');
  return `<div class="st-trow sw-task-row${t.status === 'done' ? ' is-done' : ''}"><button type="button" class="st-tcheck" data-status="${t.status}" ${canMove ? `data-cycle="${esc(t.id)}"` : 'disabled'} aria-label="${esc(t.title)}: move to ${statusName[nextStatus[t.status]].toLowerCase()}"></button><button type="button" class="st-trow__main sw-task-open" data-task="${esc(t.id)}"><span class="st-trow__title">${esc(t.title)}</span>${sub ? `<span class="st-trow__sub">${esc(sub)}</span>` : ''}</button><span class="sw-status" data-status="${t.status}">${statusName[t.status]}</span><div class="st-trow__side">${safeLink(t.link) ? `<a class="st-trow__link" href="${esc(safeLink(t.link))}" target="_blank" rel="noopener" aria-label="Open link for ${esc(t.title)}">Open link</a>` : ''}${t.due_date ? `<span class="st-trow__due${late ? ' is-late' : ''}" title="${late ? 'Past due' : 'Due'}">${esc(fmtDate(t.due_date + 'T12:00:00', { month: 'short', day: 'numeric' }))}</span>` : ''}<span class="st-avatar-sm${owner ? '' : ' sw-no-owner is-empty'}" title="${esc(owner || 'Unassigned')}" aria-label="${esc(owner || 'Unassigned')}">${esc(owner ? initials(owner) : '')}</span></div></div>`;
}

export function bindRows(host: HTMLElement, tasks: Task[], after: () => Promise<void>) {
  host.querySelectorAll<HTMLButtonElement>('[data-cycle]').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === b.dataset.cycle)!;
    b.disabled = true;
    try { await api.updateTask(t.id, { status: nextStatus[t.status] }, t); await refreshBadges(); await after(); }
    catch (err) { toast((err as Error).message, 'danger'); b.disabled = false; }
  }));
  host.querySelectorAll<HTMLElement>('[data-task]').forEach(b => b.addEventListener('click', () => void editTask(host, tasks.find(t => t.id === b.dataset.task)!, after)));
}

/** "[x] item" or "[ ] item" per line, in the editor. */
const checklistText = (items: ChecklistItem[]) => items.map(i => `[${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
const parseChecklist = (text: string): ChecklistItem[] => text.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const m = line.match(/^\[(x|X| )?\]\s*(.*)$/); return m ? { text: m[2], done: /x/i.test(m[1] || '') } : { text: line, done: false }; }).filter(i => i.text);

async function editTask(host: HTMLElement, existing: Task | null, after?: () => Promise<void>, preset: Partial<Pick<Task, 'status' | 'position'>> = {}) {
  try {
    const roles = await api.workingRoles();
    if (!state.me || !host.isConnected || host.closest<HTMLElement>('.st-view')?.hidden) return;
    const section = existing?.section || (team && canManageSubteam(team) ? team : canManageSubteam('team') ? 'team' : GROUPS.find(g => canManageSubteam(g.key))?.key || 'team');
    const canEdit = canManageSubteam(section);
    const canMove = !!existing && (canEdit || membersOf(existing).includes(state.me.user_id));
    if (!existing && !canEdit) return;
    const done = after || (() => render(host));
    const items = existing ? checklistOf(existing) : [];
    const status = existing?.status || preset.status || 'todo';
    const statusField = field('status', 'Column', select('status', COLUMNS.map(value => ({ value, label: statusName[value], selected: status === value }))));
    const people = [...state.members].sort((a, b) => a.display_name.localeCompare(b.display_name));
    void openModal({ title: existing ? canEdit ? 'Edit card' : existing.title : 'New card',
      body: canEdit ? `${field('title', 'Title', input('title', `required maxlength="240" value="${esc(existing?.title || '')}" placeholder="What needs to be done?"`))}
        <div class="st-row">${field('kind', 'Kind', select('kind', [{ value: 'task', label: 'Task', selected: (existing?.kind || 'task') === 'task' }, { value: 'milestone', label: 'Milestone', selected: existing?.kind === 'milestone' }]))}${field('label', 'Label', select('label', [{ value: '', label: 'No label', selected: !existing?.label }, ...LABELS.map(l => ({ value: l, label: l, selected: existing?.label === l }))]))}</div>
        <div class="st-row">${field('section', 'Subteam', select('section', GROUPS.filter(s => canManageSubteam(s.key)).map(s => ({ value: s.key, label: s.name, selected: s.key === section }))))}${field('assignee', 'Owner', select('assignee', []))}</div>
        <div class="st-row">${field('responsibility', 'Role', select('responsibility', []))}${field('due', 'Due date', datePicker('due', existing?.due_date || '', { placeholder: 'No date', clearable: true }))}</div>
        ${statusField}
        <div class="st-field"><span class="st-label">Members</span><fieldset class="sw-assign-list sw-assign-list--compact"><legend class="sw-sr-only">People on this card</legend>${people.map(m => `<label><input type="checkbox" name="members" value="${esc(m.user_id)}"${existing?.members?.includes(m.user_id) ? ' checked' : ''}/><span class="sw-person-avatar" aria-hidden="true">${esc(initials(m.display_name))}</span><span><strong>${esc(m.display_name)}</strong></span></label>`).join('')}</fieldset></div>
        ${field('checklist', 'Checklist', textarea('checklist', 'rows="4" placeholder="One item per line. Start a line with [x] when it is done."'), 'One item per line; begin a line with [x] once it is done.')}
        ${field('details', 'Details', textarea('details', 'rows="3" placeholder="What does done look like?"'))}
        ${field('link', 'Document or link', input('link', `type="url" value="${esc(existing?.link || '')}" placeholder="https://docs.google.com/…"`), 'A team document link shows the document on the card.')}
        ${field('cover', 'Cover image', input('cover', `type="text" value="${esc(existing?.cover_url || '')}" placeholder="https://… or /suits/photo.jpg"`))}
        ${existing ? '<button class="sw-text-button sw-danger" type="button" data-task-delete>Delete card</button>' : ''}`
      : `<dl class="st-kv">${existing!.kind === 'milestone' ? '<dt>Kind</dt><dd>Milestone</dd>' : ''}${existing!.label ? `<dt>Label</dt><dd>${esc(existing!.label)}</dd>` : ''}<dt>Subteam</dt><dd>${esc(sectionName(section))}</dd><dt>Owner</dt><dd>${esc(memberName(existing!.assignee_id))}</dd>${existing!.members?.length ? `<dt>Members</dt><dd>${esc(existing!.members.map(memberName).join(', '))}</dd>` : ''}<dt>Role</dt><dd>${esc(roles.find(r => r.id === existing!.responsibility_id)?.name || 'None')}</dd><dt>Due date</dt><dd>${esc(existing!.due_date ? fmtDate(existing!.due_date + 'T12:00:00', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date')}</dd>${items.length ? `<dt>Checklist</dt><dd><ul class="sw-checklist">${items.map(i => `<li${i.done ? ' class="is-done"' : ''}>${esc(i.text)}</li>`).join('')}</ul></dd>` : ''}<dt>Details</dt><dd class="sw-prewrap">${esc(existing!.details || 'No details')}</dd>${safeLink(existing!.link) ? `<dt>Link</dt><dd><a href="${esc(safeLink(existing!.link))}" target="_blank" rel="noopener">Open link</a></dd>` : ''}</dl>${canMove ? statusField : ''}`,
      submitLabel: canEdit ? existing ? 'Save card' : 'Create card' : canMove ? 'Save column' : 'Close',
      onSubmit: async (form, close) => {
        if (canEdit) {
          const title = formValue(form, 'title'); if (!title) throw new Error('Enter a title.');
          const link = formValue(form, 'link') || null;
          if (link && !/^https?:\/\//i.test(link)) throw new Error('Enter a link that starts with https:// or http://.');
          const cover = formValue(form, 'cover') || null;
          if (cover && !safeImage(cover)) throw new Error('Enter an image address that starts with https:// or /.');
          const payload = {
            title, section: formValue(form, 'section'), assignee_id: formValue(form, 'assignee') || null, responsibility_id: formValue(form, 'responsibility') || null, due_date: formValue(form, 'due') || null, details: formValue(form, 'details') || null, link,
            kind: formValue(form, 'kind') === 'milestone' ? 'milestone' as const : 'task' as const, label: (formValue(form, 'label') || null) as TaskLabel | null, checklist: parseChecklist(formValue(form, 'checklist')), members: new FormData(form).getAll('members').map(String), cover_url: cover,
            status: formValue(form, 'status') as TaskStatus,
          };
          if (existing) await api.updateTask(existing.id, payload, existing);
          else await api.createTask({ ...payload, position: preset.position ?? 0 });
        } else if (canMove) await api.updateTask(existing!.id, { status: formValue(form, 'status') as TaskStatus }, existing!);
        close(); await refreshBadges(); await done();
      },
    });
    const modal = document.querySelector('.st-modal:last-child')!;
    if (canEdit) {
      modal.querySelector<HTMLTextAreaElement>('[name="details"]')!.value = existing?.details || '';
      modal.querySelector<HTMLTextAreaElement>('[name="checklist"]')!.value = checklistText(items);
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
        if (!existing || !(await confirmModal('Delete card?', `“${existing.title}” will be permanently deleted.`, 'Delete card'))) return;
        try { await api.deleteTask(existing.id, existing); (modal.querySelector('[data-modal-cancel]') as HTMLElement).click(); await refreshBadges(); await done(); }
        catch (err) { toast((err as Error).message, 'danger'); }
      });
    }
  } catch (err) { toast((err as Error).message, 'danger'); }
}
