// Board review of what the projects page collects: funding proposals and applications to join a project.
// Two dashboard tabs, each a filterable list that opens into the full submission with a status and reviewer notes,
// plus a CSV export of the current list.
import { supabase } from '../lib/supabase';
import type { FundingPitch, TeamApplication } from '../lib/types';
import { availabilityOptions, teams } from '../features/apply/applyContent';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const money = (value: unknown) => { const n = Number(value) || 0; return `$${Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
const teamName = (slug: string) => teams.find(team => team.slug === slug)?.name ?? slug;
const availability = (code: string) => availabilityOptions.find(option => option.value === code)?.label ?? code;
// The database only admits lists of objects, but the reader stays defensive: one odd row must never blank the tab.
const list = (value: unknown) => (Array.isArray(value) ? value : []).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');

const pitchStatuses = ['new', 'reviewing', 'chosen', 'waitlisted', 'declined'] as const;
const teamStatuses = ['new', 'contacted', 'joined', 'declined'] as const;

type Kind = 'pitches' | 'team';
type Row = FundingPitch | TeamApplication;
const config = {
  pitches: { table: 'funding_pitches' as const, statuses: pitchStatuses, file: 'proposals.csv' },
  team: { table: 'team_applications' as const, statuses: teamStatuses, file: 'project-applications.csv' },
};

function field(label: string, value: unknown) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return `<div class="dash__detail-field"><div class="dash__detail-label">${esc(label)}</div><div class="dash__detail-value" style="white-space:pre-wrap">${esc(text)}</div></div>`;
}
const members = (p: FundingPitch) => list(p.members).map(m => [m.name, m.detail].filter(Boolean).map(String).join(', ')).join('\n');
const budget = (p: FundingPitch) => list(p.budget_items).map(item => `${item.name || 'Item'}: ${money(item.cost)} (${item.priority === 'must' ? 'must have' : 'nice to have'})${item.link ? ` ${item.link}` : ''}`).join('\n');
function pitchDetail(p: FundingPitch) {
  const items = budget(p);
  return field('Summary', p.idea) + field('Topic', p.topic) + field('Lead', `${p.lead_name}, ${p.lead_email}, Discord ${p.lead_discord}`) + field('Team', members(p))
    + field('Outline and MVP', p.outline) + field('Plan without funding', p.zero_dollar_plan) + field('Timeline', p.timeline) + field('Deliverable', p.deliverable)
    + field('Lab equipment', p.lab_equipment) + field('Budget', items ? `${items}\nTotal requested ${money(p.requested_total)}` : 'Lab equipment only') + field('Agreed to the funding rules', p.agreed_to_rules ? 'Yes' : 'No');
}
function teamDetail(a: TeamApplication) {
  return field('Project', teamName(a.team)) + field('Applicant', `${a.full_name}, ${a.email}, Discord ${a.discord_username}`) + field('Year and major', `${a.year}, ${a.major}`)
    + field('Fit', a.pitch) + field('Tools', Array.isArray(a.tools) ? a.tools : []) + field('Link', a.link) + field('Availability', availability(a.availability)) + field('Anything else', a.anything_else);
}

// One CSV line per submission, with the list columns flattened.
const csvCell = (value: unknown) => { const text = Array.isArray(value) ? value.join('; ') : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
function csv(kind: Kind, rows: Row[]) {
  const lines = kind === 'pitches'
    ? [['Submitted', 'Status', 'Project', 'Summary', 'Topic', 'Lead', 'Lead email', 'Lead Discord', 'Team', 'Outline and MVP', 'Plan without funding', 'Timeline', 'Deliverable', 'Lab equipment', 'Budget', 'Total requested', 'Agreed to rules', 'Reviewer notes'],
      ...(rows as FundingPitch[]).map(p => [p.created_at, p.status, p.project_title, p.idea, p.topic, p.lead_name, p.lead_email, p.lead_discord, members(p).replace(/\n/g, '; '), p.outline, p.zero_dollar_plan, p.timeline, p.deliverable, p.lab_equipment, budget(p).replace(/\n/g, '; '), p.requested_total, p.agreed_to_rules ? 'yes' : 'no', p.reviewer_notes])]
    : [['Submitted', 'Status', 'Project', 'Name', 'Email', 'Discord', 'Year', 'Major', 'Fit', 'Tools', 'Link', 'Availability', 'Anything else', 'Reviewer notes'],
      ...(rows as TeamApplication[]).map(a => [a.created_at, a.status, teamName(a.team), a.full_name, a.email, a.discord_username, a.year, a.major, a.pitch, a.tools, a.link, availability(a.availability), a.anything_else, a.reviewer_notes])];
  return lines.map(line => line.map(csvCell).join(',')).join('\n');
}

export function mountApplyReviews() {
  const views = { pitches: document.getElementById('pitches-view'), team: document.getElementById('team-apps-view') };
  if (!views.pitches || !views.team) return;
  const loaded: Partial<Record<Kind, boolean>> = {};
  const rows: Record<Kind, Row[]> = { pitches: [], team: [] };
  const show = (kind: Kind | null) => {
    views.pitches!.style.display = kind === 'pitches' ? 'block' : 'none';
    views.team!.style.display = kind === 'team' ? 'block' : 'none';
    if (kind && !loaded[kind]) { loaded[kind] = true; void load(kind); }
  };
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    show(target === 'pitches' ? 'pitches' : target === 'team-apps' ? 'team' : null);
  }));

  const row = (kind: Kind, item: Row) => {
    const isPitch = kind === 'pitches';
    const title = isPitch ? (item as FundingPitch).project_title : (item as TeamApplication).full_name;
    const sub = isPitch ? `${(item as FundingPitch).lead_name}, ${money((item as FundingPitch).requested_total)} requested` : `${teamName((item as TeamApplication).team)}, ${(item as TeamApplication).year}`;
    return `<details class="dash__review" data-id="${esc(item.id)}">
      <summary class="dash__review-summary">
        <span class="dash__review-title">${esc(title)}</span>
        <span class="dash__review-sub">${esc(sub)}</span>
        <span class="status-badge status-badge--${esc(item.status)}">${esc(item.status)}</span>
        <span class="dash__review-when">${esc(when(item.created_at))}</span>
      </summary>
      <div class="dash__review-body">
        ${isPitch ? pitchDetail(item as FundingPitch) : teamDetail(item as TeamApplication)}
        <div class="dash__detail-field"><div class="dash__detail-label">Status</div>
          <select class="dash__detail-status" data-review-status>${config[kind].statuses.map(s => `<option value="${s}"${s === item.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="dash__detail-field"><div class="dash__detail-label">Reviewer notes</div>
          <textarea class="dash__note-input" data-review-notes placeholder="Notes for the board">${esc(item.reviewer_notes || '')}</textarea>
          <button type="button" class="dash__note-btn" data-review-save>Save</button> <span class="dash__review-saved" data-review-saved></span></div>
      </div>
    </details>`;
  };

  // The toolbar narrows the list: free text over the names, plus the status (and, for applications, the project).
  const matches = (kind: Kind, item: Row, search: string, filters: Record<string, string>) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.team && (item as TeamApplication).team !== filters.team) return false;
    if (!search) return true;
    const hay = kind === 'pitches'
      ? [(item as FundingPitch).project_title, (item as FundingPitch).lead_name, (item as FundingPitch).lead_email, (item as FundingPitch).topic]
      : [(item as TeamApplication).full_name, (item as TeamApplication).email, (item as TeamApplication).discord_username, (item as TeamApplication).major];
    return hay.some(value => String(value ?? '').toLowerCase().includes(search));
  };
  const visible = (kind: Kind) => {
    const view = views[kind]!;
    const search = view.querySelector<HTMLInputElement>('[data-review-search]')?.value.trim().toLowerCase() ?? '';
    const filters: Record<string, string> = {};
    view.querySelectorAll<HTMLSelectElement>('[data-review-filter]').forEach(select => { filters[select.dataset.reviewFilter!] = select.value; });
    return rows[kind].filter(item => matches(kind, item, search, filters));
  };

  function render(kind: Kind) {
    const view = views[kind]!;
    const target = view.querySelector<HTMLElement>('[data-review-list]')!;
    const empty = view.querySelector<HTMLElement>('[data-review-empty]')!;
    const count = view.querySelector<HTMLElement>('[data-review-count]');
    const shown = visible(kind);
    empty.style.display = rows[kind].length ? 'none' : 'block';
    if (count) count.textContent = rows[kind].length ? (shown.length === rows[kind].length ? `${rows[kind].length} total` : `${shown.length} of ${rows[kind].length}`) : '';
    target.innerHTML = shown.map(item => { try { return row(kind, item); } catch { return `<p class="dash__empty">Could not show submission ${esc(item.id)}.</p>`; } }).join('')
      || (rows[kind].length ? '<p class="dash__empty">Nothing matches these filters.</p>' : '');
    target.querySelectorAll<HTMLElement>('[data-review-save]').forEach(button => button.addEventListener('click', async () => {
      const item = button.closest<HTMLElement>('.dash__review')!;
      const status = item.querySelector<HTMLSelectElement>('[data-review-status]')!.value;
      const notes = item.querySelector<HTMLTextAreaElement>('[data-review-notes]')!.value.trim() || null;
      const saved = item.querySelector<HTMLElement>('[data-review-saved]')!;
      button.setAttribute('disabled', '');
      const { error: fail } = await supabase.from(config[kind].table).update({ status: status as never, reviewer_notes: notes, updated_at: new Date().toISOString() }).eq('id', item.dataset.id!);
      button.removeAttribute('disabled');
      saved.textContent = fail ? fail.message : 'Saved';
      if (!fail) {
        const stored = rows[kind].find(entry => entry.id === item.dataset.id);
        if (stored) { stored.status = status as never; stored.reviewer_notes = notes; }
        const badge = item.querySelector('.status-badge')!; badge.className = `status-badge status-badge--${status}`; badge.textContent = status;
      }
      setTimeout(() => { saved.textContent = ''; }, 2500);
    }));
  }

  async function load(kind: Kind) {
    const view = views[kind]!;
    const target = view.querySelector<HTMLElement>('[data-review-list]')!;
    target.innerHTML = '<p class="dash__empty">Loading</p>';
    try {
      const { data, error } = await supabase.from(config[kind].table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      rows[kind] = (data || []) as Row[];
      render(kind);
    } catch (fail) {
      // Opening the tab again retries.
      loaded[kind] = false;
      target.innerHTML = `<p class="dash__empty">${esc((fail as Error).message || 'Could not load the list.')}</p>`;
    }
  }

  for (const kind of ['pitches', 'team'] as Kind[]) {
    const view = views[kind]!;
    view.querySelector('[data-review-search]')?.addEventListener('input', () => render(kind));
    view.querySelectorAll('[data-review-filter]').forEach(select => select.addEventListener('change', () => render(kind)));
    view.querySelector('[data-review-export]')?.addEventListener('click', () => {
      const blob = new Blob([csv(kind, visible(kind))], { type: 'text/csv;charset=utf-8' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: config[kind].file });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  }
}
