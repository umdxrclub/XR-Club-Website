// Overview: what matters right now for the signed in member.
import { api, state, memberName } from './api';
import { esc, fmtDate, fmtDateTime, fmtRelative } from './ui';
import { datesHtml, checklistStats } from './checklist';
import { sectionName } from './content';
import { rsvpControlHtml, bindRsvp } from './meetings';
import { status as driveStatus, proposalSummaryHtml, type ProposalCheck } from './drive';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const [tasks, meetings, rsvps, announcements, links, checklist] = await Promise.all([
    api.tasks(), api.meetings(), api.rsvps(), api.announcements(), api.links(), checklistStats(),
  ]);

  const me = state.me!;
  const first = me.display_name.split(' ')[0];
  const now = Date.now();
  const nextMeeting = meetings.find(m => new Date(m.ends_at).getTime() > now);
  const myTasks = tasks.filter(t => t.assignee_id === me.user_id && t.status !== 'done');
  const lateCount = myTasks.filter(t => t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < now).length;
  const openTasks = tasks.filter(t => t.status !== 'done').length;
  const doneTasks = tasks.length - openTasks;

  const proposalDue = Math.ceil((new Date('2026-10-22T23:59:59').getTime() - now) / 86400000);

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Hello, ${esc(first)}.</h2>
      <p class="st-lead">${proposalDue > 0 ? `${proposalDue} days until the proposal is due.` : 'The proposal deadline has passed.'} ${myTasks.length ? `You have ${myTasks.length} open task${myTasks.length === 1 ? '' : 's'}${lateCount ? `, ${lateCount} past due` : ''}.` : 'You have no open tasks.'}</p>
    </div>

    <div class="st-grid st-grid--2" style="margin-bottom:1rem;">
      <div class="st-card">
        <h3 class="st-h3">Next meeting</h3>
        ${nextMeeting ? `
          <p class="st-p" style="margin:0 0 0.25rem;"><strong>${esc(nextMeeting.title)}</strong></p>
          <p class="st-muted" style="margin:0 0 0.75rem;">${esc(fmtDateTime(nextMeeting.starts_at))}, ${esc(fmtRelative(nextMeeting.starts_at))}${nextMeeting.location ? ` · ${esc(nextMeeting.location)}` : ''}</p>
          ${rsvpControlHtml(nextMeeting, rsvps)}
          <p style="margin:0.9rem 0 0;"><button type="button" class="st-link" data-go="meetings">All meetings</button></p>
        ` : `<p class="st-muted" style="margin:0;">Nothing scheduled yet.${state.me!.role !== 'member' ? ' Create one from the Meetings section.' : ''}</p>`}
      </div>

      <div class="st-card">
        <h3 class="st-h3">Your tasks</h3>
        ${myTasks.length ? `<div>${myTasks.slice(0, 5).map(t => {
          const late = t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < now;
          return `<div class="st-task" style="margin-bottom:0.4rem;"><span class="st-task__status" data-status="${t.status}" style="cursor:default;"></span><div><p class="st-task__title">${esc(t.title)}</p><p class="st-task__meta${late ? ' is-late' : ''}">${esc(sectionName(t.section))}${t.due_date ? ` · due ${esc(fmtDate(t.due_date + 'T12:00:00'))}` : ''}</p></div></div>`;
        }).join('')}</div>` : `<p class="st-muted" style="margin:0;">Nothing assigned to you right now.</p>`}
        <p style="margin:0.9rem 0 0;"><button type="button" class="st-link" data-go="tasks">Open the task board</button></p>
      </div>

      <div class="st-card">
        <h3 class="st-h3">Proposal progress</h3>
        <div class="st-progress" style="margin:0.5rem 0 0.5rem;"><div class="st-progress__bar" style="width:${Math.round((checklist.count / checklist.total) * 100)}%"></div></div>
        <p class="st-muted" style="margin:0 0 0.75rem;">${checklist.count} of ${checklist.total} required components done. ${doneTasks} of ${tasks.length} tasks done.</p>
        <p style="margin:0;"><button type="button" class="st-link" data-go="proposal">Open the checklist</button></p>
      </div>

      <div class="st-card">
        <h3 class="st-h3">Latest announcements</h3>
        ${announcements.length ? announcements.slice(0, 3).map(a => `<p class="st-p" style="margin:0 0 0.6rem; font-size:1rem;">${esc(a.body)}<br><span class="st-muted" style="font-size:0.88rem;">${esc(memberName(a.created_by))}, ${esc(fmtDate(a.created_at))}</span></p>`).join('') : `<p class="st-muted" style="margin:0;">No announcements yet.</p>`}
        <p style="margin:0.5rem 0 0;"><button type="button" class="st-link" data-go="announcements">All announcements</button></p>
      </div>
    </div>

    <div class="st-section" id="st-overview-proposal" hidden></div>

    <div class="st-grid st-grid--2">
      <div class="st-card">
        <h3 class="st-h3">Coming up</h3>
        ${datesHtml(3)}
      </div>
      <div class="st-card">
        <h3 class="st-h3">Workspace</h3>
        ${links.length ? `<div class="st-stack" style="gap:0.5rem;">${links.map(l => `<a class="st-btn" style="justify-content:flex-start;" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('')}</div>` : `<p class="st-muted" style="margin:0;">No links yet.${state.me!.role !== 'member' ? ' Add the Drive, Figma, and Gateway links from Documents.' : ''}</p>`}
      </div>
    </div>`;

  bindRsvp(host, async () => render(host));
  void renderProposal(host);
}

/** The proposal Doc, if one is chosen. Loads after the rest so the page never waits on Google. */
async function renderProposal(host: HTMLElement) {
  const el = host.querySelector<HTMLElement>('#st-overview-proposal');
  if (!el) return;
  try {
    const st = await driveStatus();
    if (!st.configured || !st.folder) return;
    el.hidden = false;
    if (!st.proposal) {
      el.innerHTML = `<div class="st-card"><h3 class="st-h3">The proposal document</h3><p class="st-muted" style="margin:0 0 0.75rem;">${state.me!.role !== 'member' ? 'Not created yet. Start it from the Drive section and it opens with every required section in place.' : 'A product manager has not created it yet.'}</p><p style="margin:0;"><button type="button" class="st-link" data-go="drive">Open Drive</button></p></div>`;
      return;
    }
    el.innerHTML = `<div class="st-card"><h3 class="st-h3">The proposal document</h3><p class="st-muted">Reading the document.</p></div>`;
    const check = await api.drive<ProposalCheck>('proposal');
    if (!host.contains(el)) return;
    el.innerHTML = `<div class="st-card">${proposalSummaryHtml(check, false)}<p style="margin:0.9rem 0 0;"><button type="button" class="st-link" data-go="drive">Section check and the team folder</button></p></div>`;
  } catch {
    el.hidden = true;
  }
}
