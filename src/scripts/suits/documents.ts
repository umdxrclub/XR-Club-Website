// Documents: the reference files in the team's private bucket, and the
// workspace links list. The NASA PDFs are static markup on the page.
import { db, api, isManager } from './api';
import { esc, toast, openModal, confirmModal, field, input, formValue } from './ui';

const BUCKET = 'suits-docs';

export async function render(host: HTMLElement) {
  await Promise.all([renderStore(), renderLinks(host)]);
}

interface StoredFile { name: string; id: string | null; metadata?: { size?: number } | null }

async function renderStore() {
  const container = document.getElementById('st-docs-store');
  if (!container) return;
  container.innerHTML = `<p class="st-muted">Loading.</p>`;
  try {
    const { data: top, error } = await db.storage.from(BUCKET).list('', { sortBy: { column: 'name', order: 'desc' } });
    if (error) throw error;
    const folders = (top as StoredFile[]).filter(f => f.id === null);
    const groups = await Promise.all(folders.map(async f => {
      const { data } = await db.storage.from(BUCKET).list(f.name, { sortBy: { column: 'name', order: 'asc' } });
      return { name: f.name, files: ((data || []) as StoredFile[]).filter(x => x.id !== null && !x.name.startsWith('.')) };
    }));
    const shown = groups.filter(g => g.files.length);
    if (!shown.length) { container.innerHTML = `<div class="st-empty">Nothing here yet.</div>`; return; }
    container.innerHTML = shown.map(g => `
      <div class="st-list-group">
        <p class="st-list-group__label"><span>${esc(g.name)}</span><span>${g.files.length}</span></p>
        <div class="st-stack" style="gap:0.5rem;">
          ${g.files.map(f => {
            const ext = (f.name.split('.').pop() || '').toUpperCase();
            const title = f.name.replace(/\.[^.]+$/, '');
            const size = f.metadata?.size ? fmtSize(f.metadata.size) : '';
            return `<div class="st-doc" style="padding:0.85rem 1rem;">
              <span class="st-doc__icon" aria-hidden="true" style="width:44px; height:50px; font-size:0.66rem;">${esc(ext.slice(0, 4))}</span>
              <div><p class="st-doc__title" style="font-size:1rem;">${esc(title)}</p>${size ? `<p class="st-doc__meta">${esc(size)}</p>` : ''}</div>
              <div class="st-doc__actions"><button type="button" class="st-btn st-btn--small" data-open="${esc(`${g.name}/${f.name}`)}">Open</button></div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');
    container.querySelectorAll<HTMLElement>('[data-open]').forEach(b => b.addEventListener('click', () => openStored(b.dataset.open!, b as HTMLButtonElement)));
  } catch (err) {
    container.innerHTML = `<p class="st-notice st-notice--danger">${esc((err as Error).message)}</p>`;
  }
}

/** Open a private file: the tab is opened on the click itself so browsers allow it, then pointed at a signed link. */
async function openStored(path: string, btn: HTMLButtonElement) {
  const tab = window.open('', '_blank');
  btn.disabled = true;
  try {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) throw error || new Error('Could not open the file');
    if (tab) tab.location.href = data.signedUrl; else location.href = data.signedUrl;
  } catch (err) {
    tab?.close();
    toast((err as Error).message, 'danger');
  } finally {
    btn.disabled = false;
  }
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function renderLinks(host: HTMLElement) {
  const container = document.getElementById('st-links')!;
  container.innerHTML = `<p class="st-muted">Loading.</p>`;
  const links = await api.links();
  container.innerHTML = `
    ${links.length ? `<div class="st-stack" style="gap:0.5rem; margin-bottom:1rem;">${links.map(l => `
      <div class="st-doc" style="padding:0.85rem 1rem;">
        <div><p class="st-doc__title" style="font-size:1rem;"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></p>${l.note ? `<p class="st-doc__meta">${esc(l.note)}</p>` : ''}</div>
        <div class="st-doc__actions"><a class="st-btn st-btn--small" href="${esc(l.url)}" target="_blank" rel="noopener">Open</a>${isManager() ? `<button type="button" class="st-btn st-btn--small st-btn--danger" data-delete-link="${l.id}">Remove</button>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="st-empty" style="margin-bottom:1rem;">No links yet.</div>`}
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
        await renderLinks(host);
      },
    });
  });

  container.querySelectorAll<HTMLElement>('[data-delete-link]').forEach(b => b.addEventListener('click', async () => {
    if (!(await confirmModal('Remove this link?', 'It disappears from the dashboard for everyone.', 'Remove'))) return;
    await api.deleteLink(b.dataset.deleteLink!);
    await renderLinks(host);
  }));
}
