// Roles: each member submits first, second, and third choice from the six
// proposal roles. Managers see everyone's choices in one table.
import { api, state, isManager, memberName } from './api';
import { esc, fmtDate, toast, select, textarea, field } from './ui';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const choices = await api.roleChoices();
  const mine = choices.find(c => c.user_id === state.me!.user_id) || null;
  const roleName = (key: string | null) => state.roles.find(r => r.key === key)?.name ?? '';

  const options = (selected: string | null, blank: boolean) => [
    ...(blank ? [{ value: '', label: 'No preference', selected: !selected }] : []),
    ...state.roles.map(r => ({ value: r.key, label: `${r.name} (${r.count})`, selected: r.key === selected })),
  ];

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Your role choices</h2>
      <p class="st-lead">Pick the proposal roles you would most like to take, in order. These are temporary roles for research, design, and planning; if the proposal is selected, roles shift to everyone's strengths.</p>
      ${mine ? `<p class="st-notice st-notice--ok">Saved ${esc(fmtDate(mine.updated_at))}. You can change your choices any time before roles are assigned.</p>` : ''}
      <form class="st-card" id="st-role-form" novalidate>
        ${field('first_choice', 'First choice', select('first_choice', options(mine?.first_choice ?? null, false)))}
        ${field('second_choice', 'Second choice', select('second_choice', options(mine?.second_choice ?? null, true)))}
        ${field('third_choice', 'Third choice', select('third_choice', options(mine?.third_choice ?? null, true)))}
        ${field('notes', 'Anything the leads should know', textarea('notes', 'rows="3"'), 'Experience that fits a role, a role you would rather not take, or availability that matters.')}
        <button type="submit" class="st-btn st-btn--primary" style="margin-top:0.5rem;">${mine ? 'Update choices' : 'Save choices'}</button>
      </form>
    </div>

    <div class="st-section">
      <h3 class="st-h2">The roles</h3>
      <div class="st-grid st-grid--2">
        ${state.roles.map(r => {
          const firsts = choices.filter(c => c.first_choice === r.key).length;
          return `<div class="st-role"><div class="st-role__head"><h4 class="st-role__name">${esc(r.name)}</h4><span class="st-role__count">${r.count} ${r.count === 1 ? 'spot' : 'spots'}</span></div><p class="st-role__text st-muted">${firsts} ${firsts === 1 ? 'person has' : 'people have'} this as first choice.</p></div>`;
        }).join('')}
      </div>
    </div>

    ${isManager() ? `
    <div class="st-section">
      <h3 class="st-h2">Everyone's choices</h3>
      <p class="st-p">${choices.length} of ${state.members.length} members have submitted.</p>
      <div class="st-table-wrap">
        <table class="st-table">
          <thead><tr><th>Member</th><th>First</th><th>Second</th><th>Third</th><th>Notes</th></tr></thead>
          <tbody>
            ${state.members.map(m => {
              const c = choices.find(x => x.user_id === m.user_id);
              return `<tr><td><strong>${esc(m.display_name)}</strong></td>${c ? `<td>${esc(roleName(c.first_choice))}</td><td>${esc(roleName(c.second_choice))}</td><td>${esc(roleName(c.third_choice))}</td><td>${esc(c.notes || '')}</td>` : `<td colspan="4" class="st-muted">Not submitted yet</td>`}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}`;

  const form = document.getElementById('st-role-form') as HTMLFormElement;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = (n: string) => ((form.elements.namedItem(n) as HTMLSelectElement | HTMLTextAreaElement).value || '').trim();
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    try {
      await api.saveRoleChoice({ first_choice: v('first_choice'), second_choice: v('second_choice') || null, third_choice: v('third_choice') || null, notes: v('notes') || null });
      toast('Role choices saved.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
      btn.disabled = false;
    }
  });

  void memberName;
}
