import type { SuitsApplication, SuitsStatus } from '../../lib/types';
import { api, canReviewApplications } from './api';
import '../../styles/suits-applications.css';

const review = <T = unknown>(action: string, params: Record<string, unknown> = {}) => api.review<T>(action, params);

const STATUS_LABEL: Record<SuitsStatus, string> = { new: 'New', interview: 'Interview', accepted: 'Accepted', rejected: 'Rejected' };
const HOURS_RANK: Record<string, number> = { 'Less than 3 hours': 1, '3 to 5 hours': 2, '5 to 7 hours': 3, '7 to 10 hours': 4, '10 or more hours': 5 };
const DAY_LABEL: Record<string, string> = { '2026-09-18': 'Fri, Sep 18', '2026-09-19': 'Sat, Sep 19', '2026-09-20': 'Sun, Sep 20', '2026-09-21': 'Mon, Sep 21', '2026-09-22': 'Tue, Sep 22', '2026-09-23': 'Wed, Sep 23', '2026-09-24': 'Thu, Sep 24', '2026-09-25': 'Fri, Sep 25' };

const QUESTIONS: Array<[keyof SuitsApplication, string]> = [
  ['bring_to_table', 'What would you bring to the table as a member of this year’s NASA SUITS team?'],
  ['why_join', 'Why do you want to be on this year’s NASA SUITS team?'],
  ['teamwork_story', 'Tell us about a time you worked closely with a team on a project.'],
  ['team_environment', 'How would you contribute to creating a strong and collaborative team environment?'],
];

function esc(s: string | null | undefined) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function words(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtSlot(slot: string) {
  const h = Number(slot.slice(11, 13));
  return `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

// Eligibility flags drive the warning badges and the "Has a flag" filter.
function flagsFor(a: SuitsApplication) {
  const flags: Array<{ text: string; bad: boolean }> = [];
  if (a.us_citizen_or_pr !== 'Yes') flags.push({ text: 'Not a citizen or PR: cannot travel for test week', bad: false });
  if (a.required_dates === 'No') flags.push({ text: 'Cannot attend required dates', bad: true });
  if (a.required_dates.startsWith('Unsure')) flags.push({ text: 'Unsure about required dates', bad: false });
  if (a.hours_per_week === 'Less than 3 hours') flags.push({ text: 'Under 3 hours a week', bad: false });
  return flags;
}

let cleanup: (() => void) | null = null;
export function leave() { cleanup?.(); cleanup = null; }

export async function render(host: HTMLElement) {
  leave();
  if (!canReviewApplications()) {
    host.innerHTML = '<div class="sd__error"><h1 class="st-h1">Applications</h1><p>Application reviews are available only to the SUITS owner account.</p></div>';
    return;
  }
  const controller = new AbortController();
  const signal = controller.signal;
  host.innerHTML = (document.getElementById('st-applications-template') as HTMLTemplateElement).innerHTML;
  const root = host.querySelector<HTMLElement>('#sd')!;
  const listEl = document.getElementById('sd-list')!;
  const emptyEl = document.getElementById('sd-empty')!;
  const detailEl = document.getElementById('sd-detail-content')!;
  const placeholder = document.getElementById('sd-placeholder')!;
  const countEl = document.getElementById('sd-count')!;
  const search = document.getElementById('sd-search') as HTMLInputElement;
  const yearSel = document.getElementById('sd-year') as HTMLSelectElement;
  const interestSel = document.getElementById('sd-interest') as HTMLSelectElement;
  const eligibleSel = document.getElementById('sd-eligible') as HTMLSelectElement;
  const sortSel = document.getElementById('sd-sort') as HTMLSelectElement;

  let all: SuitsApplication[] = [];
  let visible: SuitsApplication[] = [];
  let statusFilter = '';
  let selectedId: string | null = null;

  cleanup = () => { controller.abort(); all = []; visible = []; host.replaceChildren(); };
  root.hidden = true;
  const loading = document.createElement('p');
  loading.className = 'sd__error'; loading.textContent = 'Loading applications…'; host.prepend(loading);
  try {
    const result = await review<{ applications: SuitsApplication[] }>('list');
    if (signal.aborted) return;
    all = result.applications;
    loading.remove(); root.hidden = false;
  } catch (err) {
    if (signal.aborted) return;
    host.innerHTML = '<div class="sd__error" role="alert"><h1 class="st-h1">Applications</h1><p>' + esc((err as Error).message) + '</p><button type="button" class="st-btn">Try again</button></div>';
    host.querySelector('button')!.addEventListener('click', () => void render(host), { signal });
    return;
  }

  // -------------------------------------------------------------
  // Filtering and list
  // -------------------------------------------------------------
  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    visible = all.filter(a => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (yearSel.value && a.year !== yearSel.value) return false;
      if (interestSel.value && !a.interest_areas.includes(interestSel.value)) return false;
      if (eligibleSel.value === 'ok' && flagsFor(a).length) return false;
      if (eligibleSel.value === 'flag' && !flagsFor(a).length) return false;
      if (q) {
        const hay = `${a.full_name} ${a.email} ${a.discord_username} ${a.majors} ${a.minors ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sort = sortSel.value;
    visible.sort((x, y) => {
      if (sort === 'name') return x.full_name.localeCompare(y.full_name);
      if (sort === 'hours') return (HOURS_RANK[y.hours_per_week] || 0) - (HOURS_RANK[x.hours_per_week] || 0) || y.created_at.localeCompare(x.created_at);
      if (sort === 'oldest') return x.created_at.localeCompare(y.created_at);
      return y.created_at.localeCompare(x.created_at);
    });
  }

  function renderList() {
    if (signal.aborted) return;
    applyFilters();

    const counts: Record<string, number> = { all: all.length, new: 0, interview: 0, accepted: 0, rejected: 0 };
    all.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    document.querySelectorAll<HTMLElement>('[data-count]').forEach(el => { el.textContent = String(counts[el.dataset.count!] ?? 0); });
    countEl.textContent = `${visible.length} of ${all.length}`;

    listEl.innerHTML = visible.map(a => {
      const flags = flagsFor(a);
      const interests = a.interest_areas.slice(0, 3).map(i => `<span class="sd__tag">${esc(i)}</span>`).join('');
      const more = a.interest_areas.length > 3 ? `<span class="sd__tag">+${a.interest_areas.length - 3}</span>` : '';
      return `
        <button type="button" class="sd__card${a.id === selectedId ? ' is-selected' : ''}" data-id="${a.id}">
          <div class="sd__card-row">
            <span class="sd__card-name">${esc(a.full_name)}</span>
            <span class="sd__pill sd__pill--${a.status}">${STATUS_LABEL[a.status]}</span>
          </div>
          <div class="sd__card-meta">${esc(a.year)} · ${esc(a.majors)}</div>
          <div class="sd__card-foot">
            ${interests}${more}
          </div>
          <div class="sd__card-foot">
            <span>${esc(a.hours_per_week)}</span>
            ${flags.map(f => `<span class="sd__flag${f.bad ? ' sd__flag--bad' : ''}">${esc(f.text)}</span>`).join('')}
            <span style="margin-left:auto">${fmtDate(a.created_at)}</span>
          </div>
        </button>`;
    }).join('');

    emptyEl.hidden = visible.length > 0;
    listEl.classList.toggle('has-selection', !!selectedId);

    if (selectedId && !all.some(a => a.id === selectedId)) selectedId = null;
    renderDetail();
  }

  listEl.addEventListener('click', e => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.sd__card');
    if (!card) return;
    select(card.dataset.id!);
  });

  function select(id: string | null) {
    selectedId = id;
    listEl.querySelectorAll('.sd__card').forEach(c => c.classList.toggle('is-selected', (c as HTMLElement).dataset.id === id));
    listEl.classList.toggle('has-selection', !!id);
    renderDetail();
    listEl.querySelector<HTMLElement>('.sd__card.is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  function moveSelection(delta: number) {
    if (!visible.length) return;
    const idx = visible.findIndex(a => a.id === selectedId);
    const next = idx < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, idx + delta));
    select(visible[next].id);
  }

  // -------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------
  function renderDetail() {
    if (signal.aborted) return;
    const a = all.find(x => x.id === selectedId);
    if (!a) {
      detailEl.hidden = true;
      placeholder.hidden = false;
      return;
    }
    placeholder.hidden = true;
    detailEl.hidden = false;

    const flags = flagsFor(a);
    const idx = visible.findIndex(x => x.id === a.id);

    const slotsByDay: Record<string, string[]> = {};
    a.interview_slots.forEach(s => { const d = s.slice(0, 10); (slotsByDay[d] ||= []).push(fmtSlot(s)); });

    const eligibility = (label: string, value: string, good: boolean, unsure = false) =>
      `<dt>${label}</dt><dd class="${good ? 'sd__ok' : unsure ? 'sd__warn' : 'sd__bad'}">${esc(value)}</dd>`;

    detailEl.innerHTML = `
      <div class="sd__head">
        <div>
          <h2 class="sd__name">${esc(a.full_name)}</h2>
          <p class="sd__sub">${esc(a.year)} · ${esc(a.majors)}${a.minors ? ` · Minor: ${esc(a.minors)}` : ''} · Submitted ${fmtDate(a.created_at)}</p>
        </div>
        <div class="sd__nav">
          <button type="button" class="sd__btn" id="sd-prev" ${idx <= 0 ? 'disabled' : ''}>Previous</button>
          <button type="button" class="sd__btn" id="sd-next" ${idx >= visible.length - 1 ? 'disabled' : ''}>Next</button>
          <button type="button" class="sd__btn sd__btn--quiet" id="sd-close">Close</button>
        </div>
      </div>

      <div class="sd__actions">
        <div class="sd__status" id="sd-status">
          ${(['new', 'interview', 'accepted', 'rejected'] as SuitsStatus[]).map(s => `<button type="button" data-status="${s}" class="${a.status === s ? 'is-active' : ''}">${STATUS_LABEL[s]}</button>`).join('')}
        </div>
        ${a.resume_path ? '<button type="button" class="sd__btn sd__btn--primary" id="sd-resume">Open resume</button>' : '<span class="sd__btn sd__btn--quiet">No resume attached</span>'}
        <a class="sd__btn" href="mailto:${esc(a.email)}">Email</a>
        <button type="button" class="sd__btn" id="sd-copy-discord">Copy Discord</button>
        ${a.portfolio_url ? `<a class="sd__btn" href="${esc(/^https?:\/\//i.test(a.portfolio_url) ? a.portfolio_url : 'https://' + a.portfolio_url)}" target="_blank" rel="noopener">Portfolio</a>` : ''}
      </div>

      <div class="sd__grid">
        <div class="sd__panel">
          <p class="sd__panel-title">Contact</p>
          <dl class="sd__kv">
            <dt>Email</dt><dd><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd>
            <dt>Discord</dt><dd>${esc(a.discord_username)}</dd>
            <dt>Orgs</dt><dd>${esc(a.organizations)}</dd>
          </dl>
        </div>
        <div class="sd__panel">
          <p class="sd__panel-title">Eligibility</p>
          <dl class="sd__kv">
            ${eligibility('Citizen or PR', a.us_citizen_or_pr, a.us_citizen_or_pr === 'Yes', a.us_citizen_or_pr !== 'Yes')}
            ${eligibility('Required dates', a.required_dates, a.required_dates === 'Yes', a.required_dates.startsWith('Unsure'))}
            ${eligibility('Hours per week', a.hours_per_week, HOURS_RANK[a.hours_per_week] >= 3, HOURS_RANK[a.hours_per_week] === 2)}
          </dl>
          ${flags.length ? `<div class="sd__chips" style="margin-top:0.6rem">${flags.map(f => `<span class="sd__flag${f.bad ? ' sd__flag--bad' : ''}">${esc(f.text)}</span>`).join('')}</div>` : ''}
        </div>
      </div>

      <div class="sd__panel">
        <p class="sd__panel-title">Interested in</p>
        <div class="sd__chips">${a.interest_areas.map(i => `<span class="sd__tag">${esc(i === 'Other' && a.interest_other ? `Other: ${a.interest_other}` : i)}</span>`).join('')}</div>
      </div>

      <div class="sd__panel">
        <p class="sd__panel-title">Interview availability (Eastern, over Zoom)</p>
        <div class="sd__cal">
          ${Object.keys(DAY_LABEL).map(d => `
            <div class="sd__cal-day">
              <p class="sd__cal-dow">${DAY_LABEL[d]}</p>
              ${(slotsByDay[d] || []).length ? slotsByDay[d].map(s => `<div class="sd__cal-slot">${s}</div>`).join('') : '<div class="sd__cal-none">None</div>'}
            </div>`).join('')}
        </div>
      </div>

      <div class="sd__panel">
        <p class="sd__panel-title">Availability changes before May 2027</p>
        <p class="sd__a">${esc(a.availability_changes)}</p>
      </div>

      ${QUESTIONS.map(([key, q]) => `
        <div class="sd__panel">
          <p class="sd__q">${esc(q)}</p>
          <p class="sd__a">${esc(a[key] as string)}</p>
          <p class="sd__words">${words(a[key] as string)} words</p>
        </div>`).join('')}

      <div class="sd__panel">
        <p class="sd__panel-title">Anything else</p>
        <p class="sd__a${a.anything_else ? '' : ' sd__a--muted'}">${a.anything_else ? esc(a.anything_else) : 'Nothing added.'}</p>
      </div>

      <div class="sd__panel">
        <p class="sd__panel-title">Reviewer notes</p>
        <textarea class="sd__notes" id="sd-notes" aria-label="Private reviewer notes" placeholder="Private notes. Saved when you click away.">${esc(a.reviewer_notes)}</textarea>
        <p class="sd__notes-status" id="sd-notes-status"></p>
      </div>

      <div class="sd__danger">
        <button type="button" class="sd__btn sd__btn--danger" id="sd-delete">Delete application</button>
      </div>`;

    document.getElementById('sd-prev')!.addEventListener('click', () => moveSelection(-1));
    document.getElementById('sd-next')!.addEventListener('click', () => moveSelection(1));
    document.getElementById('sd-close')!.addEventListener('click', () => select(null));

    document.getElementById('sd-status')!.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-status]');
      if (btn) setStatus(a.id, btn.dataset.status as SuitsStatus);
    });

    document.getElementById('sd-resume')?.addEventListener('click', async () => {
      try {
        const { url } = await review<{ url: string }>('resume', { resume_path: a.resume_path });
        if (!signal.aborted) window.open(url, '_blank', 'noopener');
      } catch (err) {
        alert(`Could not open the resume: ${(err as Error).message}`);
      }
    });

    document.getElementById('sd-copy-discord')!.addEventListener('click', async e => {
      const btn = e.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(a.discord_username); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy Discord'; }, 1200); } catch { /* clipboard blocked */ }
    });

    const notes = document.getElementById('sd-notes') as HTMLTextAreaElement;
    const notesStatus = document.getElementById('sd-notes-status')!;
    notes.addEventListener('blur', async () => {
      const value = notes.value.trim() || null;
      if (value === (a.reviewer_notes || null)) return;
      notesStatus.textContent = 'Saving…';
      try {
        await review('update', { id: a.id, reviewer_notes: value });
        a.reviewer_notes = value;
        notesStatus.textContent = 'Saved.';
      } catch (err) {
        notesStatus.textContent = `Not saved: ${(err as Error).message}`;
      }
    });

    document.getElementById('sd-delete')!.addEventListener('click', async () => {
      if (!confirm(`Delete ${a.full_name}’s application? This also removes their resume and cannot be undone.`)) return;
      try {
        await review('delete', { id: a.id });
      } catch (err) {
        alert(`Could not delete: ${(err as Error).message}`);
        return;
      }
      all = all.filter(x => x.id !== a.id);
      selectedId = null;
      renderList();
    });
  }

  async function setStatus(id: string, status: SuitsStatus) {
    const a = all.find(x => x.id === id);
    if (!a || a.status === status) return;
    const previous = a.status;
    a.status = status;
    renderList();
    try {
      await review('update', { id, status });
    } catch (err) {
      a.status = previous;
      renderList();
      alert(`Could not update status: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------
  // Filters, keyboard, export
  // -------------------------------------------------------------
  document.getElementById('sd-status-filter')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.sd__seg');
    if (!btn) return;
    statusFilter = btn.dataset.status || '';
    document.querySelectorAll('.sd__seg').forEach(b => b.classList.toggle('is-active', b === btn));
    renderList();
  });
  [search, yearSel, interestSel, eligibleSel, sortSel].forEach(el => el.addEventListener('input', renderList));

  document.addEventListener('keydown', e => {
    if (signal.aborted || !root.isConnected || root.closest<HTMLElement>('[data-view]')?.hidden) return;
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); moveSelection(-1); }
    else if (selectedId) {
      const map: Record<string, SuitsStatus> = { i: 'interview', a: 'accepted', r: 'rejected', n: 'new' };
      const s = map[e.key.toLowerCase()];
      if (s) setStatus(selectedId, s);
    }
  }, { signal });

  document.getElementById('sd-export')!.addEventListener('click', () => {
    const cols: Array<keyof SuitsApplication> = ['full_name', 'email', 'discord_username', 'year', 'majors', 'minors', 'organizations', 'status', 'hours_per_week', 'us_citizen_or_pr', 'required_dates', 'availability_changes', 'interest_areas', 'interest_other', 'interview_slots', 'portfolio_url', 'bring_to_table', 'why_join', 'teamwork_story', 'team_environment', 'anything_else', 'reviewer_notes', 'resume_path', 'created_at'];
    const cell = (v: unknown) => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...visible.map(a => cols.map(c => cell(a[c])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `nasa-suits-applications-${new Date().toISOString().slice(0, 10)}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  });

  renderList();
}
