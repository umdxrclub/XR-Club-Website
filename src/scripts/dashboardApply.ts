// Board review of what the funding page collects: funding pitches and applications to join a team.
// Two dashboard tabs, each a list that opens into the full submission with a status and reviewer notes.
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
const config = {
  pitches: { table: 'funding_pitches' as const, title: 'Funding pitches', statuses: pitchStatuses, empty: 'No pitches yet.' },
  team: { table: 'team_applications' as const, title: 'Team applications', statuses: teamStatuses, empty: 'No team applications yet.' },
};

function field(label: string, value: unknown) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return `<div class="dash__detail-field"><div class="dash__detail-label">${esc(label)}</div><div class="dash__detail-value" style="white-space:pre-wrap">${esc(text)}</div></div>`;
}
function pitchDetail(p: FundingPitch) {
  const members = list(p.members).map(m => [m.name, m.detail].filter(Boolean).map(String).join(' — ')).join('\n');
  const budget = list(p.budget_items).map(item => `${item.name || 'Item'}: ${money(item.cost)} (${item.priority === 'must' ? 'must-have' : 'nice-to-have'})${item.link ? ` ${item.link}` : ''}`).join('\n');
  return field('Idea', p.idea) + field('Topic', p.topic) + field('Lead', `${p.lead_name} · ${p.lead_email} · Discord ${p.lead_discord}`) + field('Team', members)
    + field('Outline and MVP', p.outline) + field('$0 version', p.zero_dollar_plan) + field('Timeline', p.timeline) + field('Deliverable', p.deliverable)
    + field('Lab equipment', p.lab_equipment) + field('Budget', budget ? `${budget}\nRequested ${money(p.requested_total)}` : 'Lab equipment only') + field('Agreed to the funding rules', p.agreed_to_rules ? 'Yes' : 'No');
}
function teamDetail(a: TeamApplication) {
  return field('Team', teamName(a.team)) + field('Applicant', `${a.full_name} · ${a.email} · Discord ${a.discord_username}`) + field('Year and major', `${a.year} · ${a.major}`)
    + field('Why this team', a.pitch) + field('Tools', Array.isArray(a.tools) ? a.tools : []) + field('Link', a.link) + field('Availability', availability(a.availability)) + field('Anything else', a.anything_else);
}

export function mountApplyReviews() {
  const loaded: Partial<Record<Kind, boolean>> = {};
  const views = { pitches: document.getElementById('pitches-view'), team: document.getElementById('team-apps-view') };
  if (!views.pitches || !views.team) return;
  const show = (kind: Kind | null) => {
    views.pitches!.style.display = kind === 'pitches' ? 'block' : 'none';
    views.team!.style.display = kind === 'team' ? 'block' : 'none';
    if (kind && !loaded[kind]) { loaded[kind] = true; void load(kind); }
  };
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    show(target === 'pitches' ? 'pitches' : target === 'team-apps' ? 'team' : null);
  }));

  const row = (kind: Kind, item: FundingPitch | TeamApplication) => {
    const isPitch = kind === 'pitches';
    const title = isPitch ? (item as FundingPitch).project_title : (item as TeamApplication).full_name;
    const sub = isPitch ? `${(item as FundingPitch).lead_name} · ${money((item as FundingPitch).requested_total)} requested` : `${teamName((item as TeamApplication).team)} · ${(item as TeamApplication).year}`;
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
          <textarea class="dash__note-input" data-review-notes placeholder="Notes for the board…">${esc(item.reviewer_notes || '')}</textarea>
          <button type="button" class="dash__note-btn" data-review-save>Save</button> <span class="dash__review-saved" data-review-saved></span></div>
      </div>
    </details>`;
  };

  async function load(kind: Kind) {
    const view = views[kind]!;
    const list = view.querySelector<HTMLElement>('[data-review-list]')!;
    const empty = view.querySelector<HTMLElement>('[data-review-empty]')!;
    list.innerHTML = '<p class="dash__empty">Loading…</p>';
    try {
      const { data, error } = await supabase.from(config[kind].table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as (FundingPitch | TeamApplication)[];
      empty.style.display = rows.length ? 'none' : 'block';
      list.innerHTML = rows.map(item => {
        try { return row(kind, item); } catch { return `<p class="dash__empty">Could not show submission ${esc(item.id)}.</p>`; }
      }).join('');
    } catch (fail) {
      // Opening the tab again retries.
      loaded[kind] = false;
      list.innerHTML = `<p class="dash__empty">${esc((fail as Error).message || 'Could not load the list.')}</p>`;
      return;
    }
    list.querySelectorAll<HTMLElement>('[data-review-save]').forEach(button => button.addEventListener('click', async () => {
      const item = button.closest<HTMLElement>('.dash__review')!;
      const status = item.querySelector<HTMLSelectElement>('[data-review-status]')!.value;
      const notes = item.querySelector<HTMLTextAreaElement>('[data-review-notes]')!.value.trim() || null;
      const saved = item.querySelector<HTMLElement>('[data-review-saved]')!;
      button.setAttribute('disabled', '');
      const { error: fail } = await supabase.from(config[kind].table).update({ status: status as never, reviewer_notes: notes, updated_at: new Date().toISOString() }).eq('id', item.dataset.id!);
      button.removeAttribute('disabled');
      saved.textContent = fail ? fail.message : 'Saved';
      if (!fail) { const badge = item.querySelector('.status-badge')!; badge.className = `status-badge status-badge--${status}`; badge.textContent = status; }
      setTimeout(() => { saved.textContent = ''; }, 2500);
    }));
  }
}
