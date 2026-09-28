import { api, isLead, state, type MembershipRequest } from './api';
import { esc, field, select, formValue, openModal, toast, fmtDate } from './ui';
import { SUBTEAMS } from '../../lib/suitsCalendar';
import { refreshBadges } from './index';

let version = 0;
let filter: MembershipRequest['status'] = 'pending';
export function leave() { version++; }

export async function render(host: HTMLElement) {
  const ticket = ++version;
  if (!isLead()) { host.innerHTML = '<div class="sw-work"><header class="st-page-head"><h1 class="st-page-title">Team access</h1></header><p class="st-muted">Only the team owner can manage access.</p></div>'; return; }
  host.innerHTML = '<p class="st-muted">Loading requests…</p>';
  const requests = await api.membershipRequests();
  if (ticket !== version) return;
  const shown = requests.filter(r => r.status === filter);
  host.innerHTML = `<div class="sw-work">
    <header class="st-page-head"><h1 class="st-page-title">Team access</h1></header>
    <div class="sw-tabs" aria-label="Access status">${(['pending','approved','rejected'] as const).map(s => `<button type="button" data-access-filter="${s}" aria-pressed="${filter === s}">${s === 'pending' ? 'Requests' : s === 'approved' ? 'Approved' : 'Declined'}</button>`).join('')}</div>
    <div class="sw-access-list">${shown.length ? shown.map(r => `<article class="sw-access-person"><div><h3>${esc(r.display_name)}</h3><p>${esc(r.email)}</p><small>${r.status === 'pending' ? 'Requested' : 'Reviewed'} ${esc(fmtDate(r.reviewed_at || r.requested_at))}</small></div><div class="sw-actions">${r.user_id === state.me?.user_id ? '<span class="sw-label">Team owner</span>' : `${r.status !== 'approved' ? `<button class="st-btn st-btn--primary st-btn--small" data-access-approve="${esc(r.user_id)}">Approve</button>` : ''}${r.status !== 'rejected' ? `<button class="st-btn st-btn--small" data-access-reject="${esc(r.user_id)}">${r.status === 'approved' ? 'Revoke access' : 'Decline'}</button>` : ''}`}</div></article>`).join('') : `<div class="sw-empty"><h3>${filter === 'pending' ? 'No pending requests' : filter === 'approved' ? 'No approved members' : 'No declined requests'}</h3></div>`}</div>
  </div>`;
  host.querySelectorAll<HTMLElement>('[data-access-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.accessFilter as MembershipRequest['status']; void render(host).catch(err => toast(err.message, 'danger')); }));
  host.querySelectorAll<HTMLElement>('[data-access-approve],[data-access-reject]').forEach(b => b.addEventListener('click', () => {
    const approve = !!b.dataset.accessApprove;
    const person = requests.find(r => r.user_id === (b.dataset.accessApprove || b.dataset.accessReject))!;
    void openModal({
      title: approve ? `Approve ${person.display_name}?` : `${person.status === 'approved' ? 'Revoke access for' : 'Decline'} ${person.display_name}?`,
      body: `<p class="st-p">${esc(person.email)}</p>${approve ? '' : '<p class="st-muted">They won’t be able to open the workspace. You can approve them later.</p>'}${approve ? field('subteam', 'Subteam', select('subteam', [{ value: '', label: 'Assign later' }, ...SUBTEAMS.map(s => ({ value: s.key, label: s.name, selected: state.members.find(m => m.user_id === person.user_id)?.proposal_role === s.key }))])) : ''}`,
      submitLabel: approve ? 'Approve' : person.status === 'approved' ? 'Revoke access' : 'Decline', danger: !approve,
      onSubmit: async (form, close) => {
        await api.reviewMembership(person.user_id, approve ? 'approved' : 'rejected', approve ? formValue(form, 'subteam') || null : null);
        state.members = await api.members();
        close(); toast(approve ? 'Member approved' : person.status === 'approved' ? 'Access revoked' : 'Request declined');
        await refreshBadges(); await render(host);
      },
    });
  }));
}
