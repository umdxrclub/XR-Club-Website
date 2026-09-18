// Announcements: managers post, everyone reads, Discord gets a copy.
import { api, isManager, memberName } from './api';
import { esc, toast, confirmModal, fmtDateTime } from './ui';

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const list = await api.announcements();

  host.innerHTML = `
    <div class="st-section">
      <h2 class="st-h1">Announcements</h2>
      <p class="st-lead">Decisions, deadlines, and anything the whole team must read.</p>
      ${isManager() ? `
        <form class="st-card" id="st-announce-form" novalidate>
          <div class="st-field">
            <label class="st-label" for="f-body">New announcement</label>
            <textarea class="st-textarea" id="f-body" name="body" rows="3" placeholder="Keep it short and specific."></textarea>
          </div>
          <div class="st-toolbar" style="margin:0;">
            <label class="st-check"><input type="checkbox" name="discord" checked /><span class="st-check__box"></span><span>Also post to Discord</span></label>
            <button type="submit" class="st-btn st-btn--primary">Post</button>
          </div>
        </form>` : ''}
    </div>
    <div class="st-section">
      ${list.length ? `<div class="st-stack">${list.map(a => `
        <div class="st-card">
          <p class="st-p" style="margin:0 0 0.5rem; white-space:pre-wrap;">${esc(a.body)}</p>
          <div class="st-toolbar" style="margin:0;">
            <span class="st-muted" style="font-size:0.9rem;">${esc(memberName(a.created_by))}, ${esc(fmtDateTime(a.created_at))}${a.posted_to_discord ? ' · posted to Discord' : ''}</span>
            ${isManager() ? `<button type="button" class="st-btn st-btn--small st-btn--danger" data-delete="${a.id}">Remove</button>` : ''}
          </div>
        </div>`).join('')}</div>` : `<div class="st-empty">No announcements yet.</div>`}
    </div>`;

  const form = host.querySelector<HTMLFormElement>('#st-announce-form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const body = (form.elements.namedItem('body') as HTMLTextAreaElement).value.trim();
    if (!body) { toast('Write the announcement first.', 'danger'); return; }
    const toDiscord = (form.elements.namedItem('discord') as HTMLInputElement).checked;
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    try {
      let posted = false;
      if (toDiscord) {
        try {
          await api.discord('announce', { text: body });
          posted = true;
        } catch (err) {
          toast(`Posted here, but Discord was not notified: ${(err as Error).message}`, 'danger');
        }
      }
      await api.createAnnouncement(body, posted);
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
      btn.disabled = false;
    }
  });

  host.querySelectorAll<HTMLElement>('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!(await confirmModal('Remove this announcement?', 'It is removed from the dashboard only. Discord keeps its copy.', 'Remove'))) return;
    await api.deleteAnnouncement(b.dataset.delete!);
    await render(host);
  }));
}
