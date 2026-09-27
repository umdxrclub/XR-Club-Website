import { api, isLead, state, type MembershipRequest } from './api';
import { esc, field, select, formValue, openModal, toast, fmtDate } from './ui';
import { SUBTEAMS } from '../../lib/suitsCalendar';
import { refreshBadges } from './index';

let version = 0;
let filter: MembershipRequest['status'] = 'pending';
export function leave() { version++; }

export async function render(host: HTMLElement) {
  const ticket = ++version;
  if (!isLead()) { host.innerHTML = '<p class="st-muted">Only the team owner can manage access.</p>'; return; }
  host.innerHTML = '<p class="st-muted">Loading access requests…</p>';
  const requests = await api.membershipRequests();
  if (ticket !== version) return;
  const shown = requests.filter(r => r.status === filter);
  host.innerHTML = `<div class="sw-work">
    <header class="sw-heading"><div><p class="sw-eyebrow">OWNER CONTROLS</p><h2>Team access</h2><p>Review who can enter the NASA SUITS workspace.</p></div><span class="sw-label">Owner only</span></header>
    <div class="sw-tabs" aria-label="Access status">${(['pending','approved','rejected'] as const).map(s => `<button type="button" data-access-filter="${s}" aria-pressed="${filter === s}">${s === 'pending' ? 'Requests' : s === 'approved' ? 'Approved' : 'Declined'}<span>${requests.filter(r => r.status === s).length}</span></button>`).join('')}</div>
    <div class="sw-access-list">${shown.length ? shown.map(r => `<article class="sw-access-person"><div><h3>${esc(r.display_name)}</h3><p>${esc(r.email)}</p><small>${r.status === 'pending' ? 'Requested' : 'Reviewed'} ${esc(fmtDate(r.reviewed_at || r.requested_at))}</small></div><div class="sw-actions">${r.user_id === state.me?.user_id ? '<span class="sw-label">Team owner</span>' : `${r.status !== 'approved' ? `<button class="st-btn st-btn--primary st-btn--small" data-access-approve="${esc(r.user_id)}">Approve</button>` : ''}${r.status !== 'rejected' ? `<button class="st-btn st-btn--small" data-access-reject="${esc(r.user_id)}">${r.status === 'approved' ? 'Revoke access' : 'Decline'}</button>` : ''}`}</div></article>`).join('') : `<div class="sw-empty"><h3>${filter === 'pending' ? 'You’re all caught up' : 'No members here yet'}</h3><p>${filter === 'pending' ? 'New UMD sign-ins will appear here for your review.' : 'Members will appear here after you review their request.'}</p></div>`}</div>
    <p class="sw-footnote">Pending and declined accounts cannot access workspace data. Existing team members have kept their approval.</p>
  </div>`;
  host.querySelectorAll<HTMLElement>('[data-access-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.accessFilter as MembershipRequest['status']; void render(host).catch(err => toast(err.message, 'danger')); }));
  host.querySelectorAll<HTMLElement>('[data-access-approve],[data-access-reject]').forEach(b => b.addEventListener('click', () => {
    const approve = !!b.dataset.accessApprove;
    const person = requests.find(r => r.user_id === (b.dataset.accessApprove || b.dataset.accessReject))!;
    void openModal({
      title: approve ? `Approve ${person.display_name}?` : `${person.status === 'approved' ? 'Revoke access for' : 'Decline'} ${person.display_name}?`,
      body: `<p class="st-p">${esc(person.email)}</p><p class="st-muted">${approve ? 'They will be able to enter the workspace as a team member.' : 'They will not be able to enter the workspace. You can approve them later.'}</p>${approve ? field('subteam', 'Subteam', select('subteam', [{ value: '', label: 'Assign later' }, ...SUBTEAMS.map(s => ({ value: s.key, label: s.name, selected: state.members.find(m => m.user_id === person.user_id)?.proposal_role === s.key }))])) : ''}`,
      submitLabel: approve ? 'Approve member' : person.status === 'approved' ? 'Revoke access' : 'Decline request', danger: !approve,
      onSubmit: async (form, close) => {
        await api.reviewMembership(person.user_id, approve ? 'approved' : 'rejected', approve ? formValue(form, 'subteam') || null : null);
        state.members = await api.members();
        close(); toast(approve ? 'Member approved.' : 'Access removed.');
        await refreshBadges(); await render(host);
      },
    });
  }));
}
