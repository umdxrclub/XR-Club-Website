// Team: the roster, your profile, and (for the lead) who is a product manager.
import { db, api, state, isLead, type Role } from './api';
import { esc, toast, confirmModal, avatarHtml, roleLabel, fmtDate } from './ui';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  state.members = await api.members();
  const me = state.me!;

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Team</h2>
      <p class="st-lead">${state.members.length} ${state.members.length === 1 ? 'person has' : 'people have'} joined the dashboard. Anyone with a UMD Google account can sign in; the team lead decides who is a product manager.</p>
      <div class="st-table-wrap">
        <table class="st-table">
          <thead><tr><th></th><th>Name</th><th>Email</th><th>Discord</th><th>Role</th><th>Joined</th>${isLead() ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${state.members.map(m => `
              <tr>
                <td>${avatarHtml(m.display_name, m.avatar_url)}</td>
                <td><strong>${esc(m.display_name)}</strong>${m.user_id === me.user_id ? ' <span class="st-muted">(you)</span>' : ''}</td>
                <td>${esc(m.email)}</td>
                <td>${esc(m.discord_username || '')}</td>
                <td>${isLead() && m.user_id !== me.user_id ? `<select class="st-select" style="min-height:38px; font-size:0.9rem; padding-right:2.2rem;" data-role-for="${m.user_id}">${(['member', 'product_manager', 'lead'] as Role[]).map(r => `<option value="${r}"${m.role === r ? ' selected' : ''}>${roleLabel(r)}</option>`).join('')}</select>` : esc(roleLabel(m.role))}</td>
                <td>${esc(fmtDate(m.created_at))}</td>
                ${isLead() ? `<td>${m.user_id !== me.user_id ? `<button type="button" class="st-btn st-btn--small st-btn--danger" data-remove="${m.user_id}">Remove</button>` : ''}</td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
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
          <span class="st-muted" style="font-size:0.9rem;">${me.discord_id ? 'Discord account connected.' : 'Connect your Discord account so chat messages from the dashboard use your Discord name and avatar.'}</span>
          <div class="st-toolbar__group">
            ${me.discord_id ? '' : `<button type="button" class="st-btn" id="st-link-discord">Connect Discord</button>`}
            <button type="submit" class="st-btn st-btn--primary">Save</button>
          </div>
        </div>
      </form>
    </div>`;

  host.querySelector<HTMLFormElement>('#st-profile-form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const name = (form.elements.namedItem('display_name') as HTMLInputElement).value.trim();
    const discord = (form.elements.namedItem('discord_username') as HTMLInputElement).value.trim();
    if (!name) { toast('Your name cannot be empty.', 'danger'); return; }
    try {
      await api.updateProfile({ display_name: name, discord_username: discord || null });
      state.me = { ...me, display_name: name, discord_username: discord || null };
      document.getElementById('st-whoami')!.innerHTML = `${esc(name)} · ${esc(roleLabel(me.role))}`;
      toast('Profile saved.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  });

  host.querySelector('#st-link-discord')?.addEventListener('click', async () => {
    const { error } = await db.auth.linkIdentity({ provider: 'discord', options: { redirectTo: `${location.origin}${state.base}suits/team#team` } });
    if (error) toast(`Could not start Discord sign in: ${error.message}`, 'danger');
  });

  host.querySelectorAll<HTMLSelectElement>('[data-role-for]').forEach(sel => sel.addEventListener('change', async () => {
    try {
      await api.setRole(sel.dataset.roleFor!, sel.value as Role);
      toast('Role updated.');
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
}
