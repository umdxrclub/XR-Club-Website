// Documents: the workspace links list (the PDFs are static markup on the page).
import { api, isManager } from './api';
import { esc, toast, openModal, confirmModal, field, input, formValue } from './ui';

export async function render(host: HTMLElement) {
  const container = document.getElementById('st-links')!;
  container.innerHTML = `<p class="st-muted">Loading.</p>`;
  const links = await api.links();
  container.innerHTML = `
    ${links.length ? `<div class="st-stack" style="gap:0.5rem; margin-bottom:1rem;">${links.map(l => `
      <div class="st-doc" style="padding:0.85rem 1rem;">
        <div><p class="st-doc__title" style="font-size:1rem;"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></p>${l.note ? `<p class="st-doc__meta">${esc(l.note)}</p>` : ''}</div>
        <div class="st-doc__actions"><a class="st-btn st-btn--small" href="${esc(l.url)}" target="_blank" rel="noopener">Open</a>${isManager() ? `<button type="button" class="st-btn st-btn--small st-btn--danger" data-delete-link="${l.id}">Remove</button>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="st-empty" style="margin-bottom:1rem;">No links yet. ${isManager() ? 'Add the Google Drive folder, the Figma file, the NASA STEM Gateway page, and the Discord invite.' : 'A product manager will add the Drive, Figma, and Gateway links.'}</div>`}
    ${isManager() ? `<button type="button" class="st-btn" id="st-add-link">Add a link</button>` : ''}`;

  container.querySelector('#st-add-link')?.addEventListener('click', () => {
    openModal({
      title: 'Add a link',
      body: `
        ${field('title', 'Name', input('title', 'type="text" required placeholder="Google Drive folder"'))}
        ${field('url', 'Address', input('url', 'type="url" required placeholder="https://"'))}
        ${field('note', 'Note', input('note', 'type="text" placeholder="Optional, one line"'))}`,
      submitLabel: 'Add link',
      onSubmit: async (form, close) => {
        const title = formValue(form, 'title');
        let url = formValue(form, 'url');
        if (!title || !url) throw new Error('Name and address are both needed.');
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        await api.createLink({ title, url, note: formValue(form, 'note') || null });
        close();
        toast('Link added.');
        await render(host);
      },
    });
  });

  container.querySelectorAll<HTMLElement>('[data-delete-link]').forEach(b => b.addEventListener('click', async () => {
    if (!(await confirmModal('Remove this link?', 'It disappears from the dashboard for everyone.', 'Remove'))) return;
    await api.deleteLink(b.dataset.deleteLink!);
    await render(host);
  }));
}
