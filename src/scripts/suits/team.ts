// Team: the roster with everyone's proposal role, your profile, and (for the
// lead) who has product manager or lead access.
import { db, api, state, isLead, type Role } from './api';
import { esc, toast, confirmModal, avatarHtml, roleLabel, enhanceSelects } from './ui';
import { READER_ROLES } from './reader-content';

const roleName = (key: string | null) => READER_ROLES.find(r => r.key === key)?.name ?? '';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  state.members = await api.members();
  const me = state.me!;
  const canEditRole = (userId: string) => isLead() || userId === me.user_id;
  const roleSelect = (userId: string, current: string | null) => `<select class="st-select st-select--inline" data-proposal-for="${userId}"><option value=""${current ? '' : ' selected'}>Not set</option>${READER_ROLES.map(r => `<option value="${r.key}"${r.key === current ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Team</h2>
      <div class="st-roster">
        ${state.members.map(m => `
          <div class="st-member">
            ${avatarHtml(m.display_name, m.avatar_url)}
            <div class="st-member__who">
              <p class="st-member__name">${esc(m.display_name)}${m.user_id === me.user_id ? ' <span class="st-muted">(you)</span>' : ''}</p>
              <p class="st-member__email">${esc(m.email)}</p>
            </div>
            <div class="st-member__role">${canEditRole(m.user_id) ? roleSelect(m.user_id, m.proposal_role) : `<span class="st-member__pill">${esc(roleName(m.proposal_role)) || 'No role yet'}</span>`}</div>
            <div class="st-member__access">${isLead() && m.user_id !== me.user_id ? `<select class="st-select st-select--inline" data-role-for="${m.user_id}">${(['member', 'product_manager', 'lead'] as Role[]).map(r => `<option value="${r}"${m.role === r ? ' selected' : ''}>${roleLabel(r)}</option>`).join('')}</select>` : `<span class="st-member__pill">${esc(roleLabel(m.role))}</span>`}</div>
            ${isLead() && m.user_id !== me.user_id ? `<button type="button" class="st-btn st-btn--small st-btn--danger st-member__remove" data-remove="${m.user_id}">Remove</button>` : ''}
          </div>`).join('')}
      </div>
    </div>

    <div class="st-section">
      <h3 class="st-h2">Your profile</h3>
      <form class="st-card" id="st-profile-form" novalidate>
        <div class="st-row">
          <div class="st-field"><label class="st-label" for="f-name">Name shown to the team</label><input class="st-input" id="f-name" name="display_name" value="${esc(me.display_name)}" required /></div>
          <div class="st-field"><label class="st-label" for="f-discord">Discord username</label><input class="st-input" id="f-discord" name="discord_username" value="${esc(me.discord_username || '')}" placeholder="How you appear in Discord" /></div>
        </div>
        <div class="st-toolbar" style="margin:0;">
          <span></span>
          <button type="submit" class="st-btn st-btn--primary">Save</button>
        </div>
      </form>
    </div>`;

  enhanceSelects(host);

  host.querySelector<HTMLFormElement>('#st-profile-form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const name = (form.elements.namedItem('display_name') as HTMLInputElement).value.trim();
    const discord = (form.elements.namedItem('discord_username') as HTMLInputElement).value.trim();
    if (!name) { toast('Your name cannot be empty.', 'danger'); return; }
    try {
      await api.updateProfile({ display_name: name, discord_username: discord || null });
      state.me = { ...me, display_name: name, discord_username: discord || null };
      document.getElementById('st-whoami')!.innerHTML = `${esc(name)}, ${esc(roleLabel(me.role))}`;
      toast('Profile saved.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  });

  host.querySelectorAll<HTMLSelectElement>('[data-proposal-for]').forEach(sel => sel.addEventListener('change', async () => {
    const userId = sel.dataset.proposalFor!;
    const value = sel.value || null;
    try {
      if (userId === me.user_id) {
        await api.updateProfile({ proposal_role: value });
        state.me = { ...state.me!, proposal_role: value };
        try { value ? localStorage.setItem('xr-suits-role', value) : localStorage.removeItem('xr-suits-role'); } catch { /* ignore */ }
      } else {
        await api.setProposalRole(userId, value);
      }
      toast('Proposal role saved.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
      await render(host);
    }
  }));

  host.querySelectorAll<HTMLSelectElement>('[data-role-for]').forEach(sel => sel.addEventListener('change', async () => {
    try {
      await api.setRole(sel.dataset.roleFor!, sel.value as Role);
      toast('Access updated.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
      await render(host);
    }
  }));

  host.querySelectorAll<HTMLElement>('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    const m = state.members.find(x => x.user_id === b.dataset.remove)!;
    if (!(await confirmModal('Remove from the team?', `${m.display_name} loses access until they sign in again, and their answers and tasks are cleared.`, 'Remove'))) return;
    try {
      await api.removeMember(m.user_id);
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  }));

  void db;
}
