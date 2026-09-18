// Documents: everything the team works from, as cards grouped by role. Anyone
// can add a file or a link; each one is mirrored to the club's Google Drive
// and anything placed in Drive shows up here too.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db, api, state, isManager, isLead, type TeamDocument } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtRelative } from './ui';
import { READER_ROLES } from './reader-content';
import { openViewer } from './viewer';

GlobalWorkerOptions.workerSrc = workerUrl;

const BUCKET = 'suits-docs';
const GROUPS = [{ key: 'team', name: 'Everyone' }, ...READER_ROLES.map(r => ({ key: r.key, name: r.name }))];
const groupName = (key: string) => GROUPS.find(g => g.key === key)?.name ?? 'Everyone';

interface DriveStatus { configured: boolean; serviceEmail: string | null; folder: { id: string; name: string; url: string } | null }

let filter = 'all';
let driveStatus: DriveStatus | null = null;
let roleFolders: Record<string, { id: string; url: string }> = {};
let pulling = false;
let lastPull = 0;
const signedCache = new Map<string, { url: string; until: number }>();
const thumbCache = new Map<string, string>();

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  let docs: TeamDocument[] = [];
  try {
    docs = await api.documents();
  } catch (err) {
    host.innerHTML = `<p class="st-notice st-notice--danger">${esc((err as Error).message)}</p>`;
    return;
  }

  const mine = state.me?.proposal_role || null;
  const order = filter === 'all' ? GROUPS : filter === 'team' ? GROUPS.filter(g => g.key === 'team') : [GROUPS.find(g => g.key === filter)!, GROUPS[0]];

  host.innerHTML = `
    <div class="st-section" style="margin-bottom:1.5rem;">
      <div class="st-toolbar">
        <h2 class="st-h1" style="margin:0;">Documents</h2>
        <div class="st-toolbar__group">
          ${driveStatus?.folder ? `<a class="st-btn" href="${esc(driveStatus.folder.url)}" target="_blank" rel="noopener">Open Drive folder</a>` : `<span id="st-drive-open"></span>`}
          <button type="button" class="st-btn st-btn--primary" id="st-doc-add">Add</button>
        </div>
      </div>
      <div class="st-chips" style="margin-top:0.9rem;">
        <button type="button" class="st-chip${filter === 'all' ? ' is-active' : ''}" data-filter="all">All</button>
        ${GROUPS.map(g => `<button type="button" class="st-chip${filter === g.key ? ' is-active' : ''}" data-filter="${g.key}">${esc(g.name)}${g.key === mine ? ' (you)' : ''}</button>`).join('')}
      </div>
      <div id="st-drive-card"></div>
    </div>
    ${order.map(g => groupHtml(g, docs.filter(d => d.role === g.key))).join('')}`;

  host.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter!; void render(host); }));
  host.querySelector('#st-doc-add')!.addEventListener('click', () => addDocument(host));
  host.querySelectorAll<HTMLElement>('[data-view-doc]').forEach(card => {
    const open = () => { const d = docs.find(x => x.id === card.dataset.viewDoc)!; void openViewer(d, { subtitle: `${groupName(d.role)}${d.notes ? `. ${d.notes}` : ''}` }); };
    card.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-doc-menu]')) return; open(); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  host.querySelectorAll<HTMLElement>('[data-doc-menu]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openMenu(host, b, docs.find(x => x.id === b.dataset.docMenu)!); }));

  void fillCovers(host, docs);
  void renderDriveCard(host);
  void pullFromDrive(host);
}

function groupHtml(g: { key: string; name: string }, docs: TeamDocument[]) {
  const folder = roleFolders[g.key];
  return `
    <section class="st-group">
      <div class="st-group__head">
        <h3 class="st-group__title">${esc(g.name)}</h3>
        <span class="st-group__count">${docs.length}</span>
        <span class="st-group__drive" data-role-folder="${g.key}">${folder ? `<a class="st-link" href="${esc(folder.url)}" target="_blank" rel="noopener">Drive folder</a>` : ''}</span>
      </div>
      ${docs.length ? `<div class="st-docgrid">${docs.map(cardHtml).join('')}</div>` : `<p class="st-group__empty">Nothing here yet.</p>`}
    </section>`;
}

function cardHtml(d: TeamDocument) {
  const kind = kindOf(d);
  const who = d.created_by ? memberFirst(d.created_by) : 'From Drive';
  const meta = `${who}, ${fmtRelative(d.created_at)}`;
  const status = d.drive_status === 'error' ? `<span class="st-doccard__flag" title="${esc(d.drive_error || '')}">Not in Drive</span>` : '';
  return `
    <article class="st-doccard" data-view-doc="${d.id}" data-kind="${kind}" role="button" tabindex="0" aria-label="${esc(d.title)}">
      <div class="st-doccard__cover" data-cover="${d.id}">${coverPlaceholder(d, kind)}</div>
      <div class="st-doccard__body">
        <p class="st-doccard__title">${esc(d.title)}</p>
        <p class="st-doccard__meta">${esc(meta)}${status}</p>
      </div>
      <button type="button" class="st-doccard__more" data-doc-menu="${d.id}" aria-label="More options"><span></span><span></span><span></span></button>
    </article>`;
}

/** What shows on the cover before (or instead of) a real preview. */
function coverPlaceholder(d: TeamDocument, kind: Kind) {
  const url = d.kind === 'link' ? d.url || '' : '';
  if (kind === 'youtube') {
    const id = youtubeId(url);
    if (id) return `<img class="st-doccard__img" src="https://img.youtube.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy" />`;
  }
  if (d.kind === 'link' && url) {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    const label = kind === 'doc' ? 'Google Doc' : kind === 'sheet' ? 'Google Sheet' : kind === 'slides' ? 'Google Slides' : kind === 'drive' ? 'Google Drive' : kind === 'figma' ? 'Figma' : host;
    return `<span class="st-doccard__site"><img class="st-doccard__favicon" src="https://www.google.com/s2/favicons?domain=${esc(host)}&sz=64" alt="" loading="lazy" /><span>${esc(label)}</span></span>`;
  }
  const ext = ((d.storage_path || '').split('.').pop() || '').toUpperCase();
  const label = kind === 'pdf' ? 'PDF' : kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : kind === 'doc' ? 'Document' : kind === 'sheet' ? 'Spreadsheet' : kind === 'slides' ? 'Slides' : ext || 'File';
  return `<span class="st-doccard__type">${esc(label)}</span>`;
}

/** Real previews, filled in after the grid is on screen: images and first pages of PDFs. */
async function fillCovers(host: HTMLElement, docs: TeamDocument[]) {
  const targets = docs.filter(d => d.kind === 'file' && d.storage_path && ['image', 'pdf'].includes(kindOf(d)));
  if (!targets.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(targets.map(d => [d.id, d]));
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const d = byId.get((e.target as HTMLElement).dataset.cover || '');
      if (d) void drawCover(e.target as HTMLElement, d);
    }
  }, { rootMargin: '300px 0px' });
  host.querySelectorAll<HTMLElement>('[data-cover]').forEach(el => { if (byId.has(el.dataset.cover || '')) io.observe(el); });
}

async function drawCover(el: HTMLElement, d: TeamDocument) {
  try {
    const cached = thumbCache.get(d.id);
    if (cached) { el.innerHTML = `<img class="st-doccard__img" src="${cached}" alt="" />`; return; }
    const url = await signedUrl(d.storage_path!);
    if (kindOf(d) === 'image') {
      el.innerHTML = `<img class="st-doccard__img" src="${esc(url)}" alt="" loading="lazy" />`;
      return;
    }
    // First page of the PDF, fetched in ranges so large files stay cheap
    const task = getDocument({ url, disableAutoFetch: true, rangeChunkSize: 65536 });
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 320 / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise;
    const data = canvas.toDataURL('image/jpeg', 0.8);
    thumbCache.set(d.id, data);
    void task.destroy();
    if (el.isConnected) el.innerHTML = `<img class="st-doccard__img st-doccard__img--page" src="${data}" alt="" />`;
  } catch { /* the type label stays */ }
}

async function signedUrl(path: string) {
  const hit = signedCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw error || new Error('Could not open the file');
  signedCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

function memberFirst(id: string) {
  const m = state.members.find(x => x.user_id === id);
  return m ? m.display_name.split(' ')[0] : 'Someone';
}

// ---------------------------------------------------------------------------
// Card menu
// ---------------------------------------------------------------------------
function openMenu(host: HTMLElement, button: HTMLElement, d: TeamDocument) {
  document.querySelector('.st-menu')?.remove();
  const canEdit = isManager() || d.created_by === state.me?.user_id;
  const menu = document.createElement('div');
  menu.className = 'st-menu';
  menu.innerHTML = `
    <button type="button" data-act="view">View</button>
    <button type="button" data-act="tab">Open in new tab</button>
    ${d.drive_url ? `<button type="button" data-act="drive">Open in Drive</button>` : ''}
    ${canEdit ? `<button type="button" data-act="edit">Edit</button><button type="button" data-act="remove" class="is-danger">Remove</button>` : ''}`;
  // Inside the dashboard root so the theme tokens apply; positioned relative to it
  const root = document.getElementById('st') || document.body;
  root.appendChild(menu);
  const r = button.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = `${r.bottom + 6 - base.top}px`;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) - base.left}px`;
  const close = () => { menu.remove(); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); };
  const onDoc = (e: Event) => { if (!menu.contains(e.target as Node)) close(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); }, 0);
  menu.addEventListener('click', async e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'view') void openViewer(d, { subtitle: `${groupName(d.role)}${d.notes ? `. ${d.notes}` : ''}` });
    if (act === 'drive' && d.drive_url) window.open(d.drive_url, '_blank', 'noopener');
    if (act === 'tab') {
      if (d.kind === 'link') { window.open(d.url || '#', '_blank', 'noopener'); return; }
      const tab = window.open('', '_blank');
      try { const url = await signedUrl(d.storage_path!); if (tab) tab.location.href = url; } catch (err) { tab?.close(); toast((err as Error).message, 'danger'); }
    }
    if (act === 'edit') editDocument(host, d);
    if (act === 'remove') void removeDocument(host, d);
  });
}

async function removeDocument(host: HTMLElement, d: TeamDocument) {
  if (!(await confirmModal('Remove this document?', `"${d.title}" is removed from the dashboard and its copy in Drive goes to the trash.`, 'Remove'))) return;
  try {
    if (d.kind === 'file' && d.storage_path) await db.storage.from(BUCKET).remove([d.storage_path]).catch(() => { /* the row is what matters */ });
    if (d.drive_file_id) await api.drive('remove', { driveFileId: d.drive_file_id }).catch(() => { /* Drive copy stays if it cannot be trashed */ });
    await api.deleteDocument(d.id);
    await render(host);
  } catch (err) {
    toast((err as Error).message, 'danger');
  }
}

// ---------------------------------------------------------------------------
// Adding and editing
// ---------------------------------------------------------------------------
function addDocument(host: HTMLElement) {
  const defaultRole = state.me?.proposal_role && GROUPS.some(g => g.key === state.me!.proposal_role) ? state.me!.proposal_role! : 'team';
  openModal({
    title: 'Add a document',
    body: `
      <div class="st-segment" id="st-doc-kind" style="margin-bottom:1rem;"><button type="button" data-kind="file" class="is-active">Upload a file</button><button type="button" data-kind="link">Add a link</button></div>
      <div data-pane="file">
        <label class="st-drop" id="st-doc-drop">
          <input type="file" name="file" id="f-file" />
          <span class="st-drop__text" id="st-doc-dropname">Choose a file or drop it here. Anything up to 50 MB.</span>
        </label>
      </div>
      <div data-pane="link" hidden>
        ${field('url', 'Address', input('url', 'type="url" placeholder="https://"'), 'A Google Doc, Sheet, Figma file, video, anything with a link.')}
      </div>
      ${field('title', 'Name', input('title', 'type="text" placeholder="What the team will see"'))}
      ${field('role', 'For', select('role', GROUPS.map(g => ({ value: g.key, label: g.name, selected: g.key === defaultRole }))))}
      ${field('notes', 'Note', textarea('notes', 'rows="2" placeholder="Optional, one line"'))}`,
    submitLabel: 'Add',
    onSubmit: async (form, close) => {
      const kind = form.querySelector<HTMLElement>('#st-doc-kind .is-active')!.dataset.kind as 'file' | 'link';
      const role = formValue(form, 'role') || 'team';
      const notes = formValue(form, 'notes') || null;
      let title = formValue(form, 'title');
      let created: TeamDocument;
      if (kind === 'file') {
        const fileInput = form.querySelector<HTMLInputElement>('#f-file')!;
        const file = fileInput.files?.[0];
        if (!file) throw new Error('Choose a file first.');
        if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB.');
        if (!title) title = file.name.replace(/\.[^.]+$/, '');
        const safe = file.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'file';
        const path = `uploads/${role}/${Date.now()}-${safe}`;
        const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (error) throw new Error(error.message);
        created = await api.createDocument({ title, kind: 'file', url: null, storage_path: path, mime: file.type || null, size: file.size, role, notes });
      } else {
        let url = formValue(form, 'url');
        if (!url) throw new Error('Paste the link first.');
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (!title) title = titleFromUrl(url);
        created = await api.createDocument({ title, kind: 'link', url, storage_path: null, mime: null, size: null, role, notes });
      }
      close();
      toast('Added.');
      await render(host);
      void syncToDrive(host, created.id);
    },
  });

  setTimeout(() => {
    const seg = document.getElementById('st-doc-kind');
    const modal = seg?.closest('form');
    if (!seg || !modal) return;
    seg.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
      modal.querySelectorAll<HTMLElement>('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.kind; });
    });
    const fileInput = modal.querySelector<HTMLInputElement>('#f-file')!;
    const name = modal.querySelector<HTMLElement>('#st-doc-dropname')!;
    const titleInput = modal.querySelector<HTMLInputElement>('#f-title')!;
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      name.textContent = `${f.name} (${fmtSize(f.size)})`;
      if (!titleInput.value) titleInput.value = f.name.replace(/\.[^.]+$/, '');
    });
    const drop = modal.querySelector<HTMLElement>('#st-doc-drop')!;
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('is-over');
      if (e.dataTransfer?.files?.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); }
    });
    const urlInput = modal.querySelector<HTMLInputElement>('#f-url')!;
    urlInput.addEventListener('change', () => { if (!titleInput.value && urlInput.value) titleInput.value = titleFromUrl(urlInput.value); });
  }, 0);
}

function editDocument(host: HTMLElement, d: TeamDocument) {
  openModal({
    title: 'Edit document',
    body: `
      ${field('title', 'Name', input('title', `type="text" required value="${esc(d.title)}"`))}
      ${d.kind === 'link' ? `<p class="st-help" style="margin:-0.4rem 0 1rem;">Link: <a class="st-link" href="${esc(d.url || '#')}" target="_blank" rel="noopener">${esc(d.url || '')}</a></p>` : ''}
      ${field('role', 'For', select('role', GROUPS.map(g => ({ value: g.key, label: g.name, selected: g.key === d.role }))))}
      ${field('notes', 'Note', textarea('notes', 'rows="2" placeholder="Optional, one line"'))}`,
    submitLabel: 'Save',
    onSubmit: async (form, close) => {
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give it a name.');
      const role = formValue(form, 'role') || 'team';
      const notes = formValue(form, 'notes') || null;
      await api.updateDocument(d.id, { title, role, notes });
      close();
      toast('Saved.');
      await render(host);
      if (d.drive_file_id) {
        try { await api.drive('update', { documentId: d.id }); } catch { /* Drive copy keeps its old name until next sync */ }
      }
    },
  });
  setTimeout(() => { const ta = document.querySelector<HTMLTextAreaElement>('#f-notes'); if (ta) ta.value = d.notes || ''; }, 0);
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------
async function syncToDrive(host: HTMLElement, id: string) {
  try {
    const r = await api.drive<{ drive_status: string; error?: string }>('sync', { documentId: id });
    if (r.drive_status === 'error') toast(`Saved here, but Drive said: ${r.error}`, 'danger');
  } catch (err) {
    toast(`Saved here, but Drive could not be reached: ${(err as Error).message}`, 'danger');
  }
  if (host.isConnected && !host.closest('.st-view')?.hasAttribute('hidden')) await render(host);
}

/** Pick up anything added, renamed, moved, or removed directly in Drive. At most once a minute. */
async function pullFromDrive(host: HTMLElement) {
  if (pulling || Date.now() - lastPull < 60 * 1000) return;
  pulling = true;
  lastPull = Date.now();
  try {
    const r = await api.drive<{ added: number; updated: number; removed: number }>('pull');
    if ((r.added || r.updated || r.removed) && host.isConnected && !host.closest('.st-view')?.hasAttribute('hidden')) {
      pulling = false;
      await render(host);
      return;
    }
  } catch { /* Drive not connected or unreachable; the page still works */ }
  pulling = false;
}

async function renderDriveCard(host: HTMLElement) {
  const card = host.querySelector<HTMLElement>('#st-drive-card');
  if (!card) return;
  try {
    driveStatus = await api.drive<DriveStatus>('status');
  } catch {
    driveStatus = null;
  }
  if (!card.isConnected) return;
  const st = driveStatus;
  if (!st) { card.innerHTML = ''; return; }
  if (st.configured && st.folder) {
    const openSlot = host.querySelector<HTMLElement>('#st-drive-open');
    if (openSlot) openSlot.outerHTML = `<a class="st-btn" href="${esc(st.folder.url)}" target="_blank" rel="noopener">Open Drive folder</a>`;
    if (!Object.keys(roleFolders).length) {
      try { roleFolders = (await api.drive<{ folders: Record<string, { id: string; url: string }> }>('folders')).folders || {}; } catch { roleFolders = {}; }
    }
    host.querySelectorAll<HTMLElement>('[data-role-folder]').forEach(el => {
      const f = roleFolders[el.dataset.roleFolder!];
      if (f && !el.querySelector('a')) el.innerHTML = `<a class="st-link" href="${esc(f.url)}" target="_blank" rel="noopener">Drive folder</a>`;
    });
    const waiting = isManager() ? host.querySelectorAll('.st-doccard__flag').length : 0;
    card.innerHTML = waiting ? `<p class="st-muted" style="margin:0.9rem 0 0; font-size:0.92rem;">${waiting} document${waiting === 1 ? ' is' : 's are'} not in Drive. <button type="button" class="st-link" id="st-drive-sync-all">Send ${waiting === 1 ? 'it' : 'them'} now</button></p>` : '';
    card.querySelector('#st-drive-sync-all')?.addEventListener('click', async () => {
      const btn = card.querySelector('#st-drive-sync-all') as HTMLButtonElement;
      btn.disabled = true;
      const ids = Array.from(host.querySelectorAll<HTMLElement>('.st-doccard__flag')).map(f => f.closest<HTMLElement>('[data-view-doc]')!.dataset.viewDoc!);
      for (const id of ids) { try { await api.drive('sync', { documentId: id }); } catch { /* shown on the card */ } }
      await render(host);
    });
    return;
  }
  if (!isLead()) { card.innerHTML = ''; return; }
  if (!st.configured) {
    card.innerHTML = `
      <div class="st-card" style="margin-top:1rem;">
        <h3 class="st-h3">Google Drive is not connected</h3>
        <p class="st-p">Documents added here stay on the dashboard until Drive is connected. Three steps, once:</p>
        <ol class="st-list" style="margin:0;">
          <li>In console.cloud.google.com, in the project that holds the Google sign in for this site, enable the Google Drive API and the Google Docs API, then under IAM and Admin create a service account named suits-dashboard and download a JSON key for it.</li>
          <li>In PowerShell inside the project folder run: npx supabase secrets set "SUITS_GOOGLE_SERVICE_ACCOUNT=$(Get-Content path\\to\\key.json -Raw)"</li>
          <li>Reload this page and paste the team folder link.</li>
        </ol>
      </div>`;
    return;
  }
  card.innerHTML = `
    <div class="st-card" style="margin-top:1rem;">
      <h3 class="st-h3">Choose the team's Drive folder</h3>
      <p class="st-p">In Google Drive, share the folder with <strong>${esc(st.serviceEmail || '')}</strong> as an Editor, then paste its link.</p>
      <form id="st-folder-form" novalidate>
        ${field('url', 'Folder link', input('url', 'type="url" required placeholder="https://drive.google.com/drive/folders/..."'))}
        <button type="submit" class="st-btn st-btn--primary">Use this folder</button>
      </form>
    </div>`;
  card.querySelector<HTMLFormElement>('#st-folder-form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const btn = form.querySelector('button') as HTMLButtonElement;
    btn.disabled = true;
    try {
      await api.drive('setFolder', { url: formValue(form, 'url') });
      toast('Team folder saved.');
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Kinds and helpers
// ---------------------------------------------------------------------------
type Kind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'video' | 'audio' | 'figma' | 'drive' | 'youtube' | 'link' | 'file';

function kindOf(d: TeamDocument): Kind {
  if (d.kind === 'link') {
    const url = d.url || '';
    if (youtubeId(url)) return 'youtube';
    if (d.mime) {
      const m = d.mime;
      if (m === 'application/vnd.google-apps.document') return 'doc';
      if (m === 'application/vnd.google-apps.spreadsheet') return 'sheet';
      if (m === 'application/vnd.google-apps.presentation') return 'slides';
      if (m === 'application/pdf') return 'pdf';
      if (m.startsWith('image/')) return 'image';
      if (m.startsWith('video/')) return 'video';
      if (/spreadsheet|excel|csv/.test(m)) return 'sheet';
      if (/presentation|powerpoint/.test(m)) return 'slides';
      if (/word|text\//.test(m)) return 'doc';
    }
    if (/docs\.google\.com\/document/i.test(url)) return 'doc';
    if (/docs\.google\.com\/spreadsheets/i.test(url)) return 'sheet';
    if (/docs\.google\.com\/presentation/i.test(url)) return 'slides';
    if (/drive\.google\.com/i.test(url)) return 'drive';
    if (/figma\.com/i.test(url)) return 'figma';
    if (/vimeo\.com|loom\.com|\.mp4($|\?)/i.test(url)) return 'video';
    if (/\.pdf($|\?)/i.test(url)) return 'pdf';
    return 'link';
  }
  const ext = ((d.storage_path || '').split('.').pop() || '').toLowerCase();
  const mime = d.mime || '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'txt', 'md', 'rtf', 'pages'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'avif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
  return 'file';
}

function youtubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (/figma\.com/.test(host)) { const seg = u.pathname.split('/').filter(Boolean); return seg[2] ? decodeURIComponent(seg[2]).replace(/[-_]+/g, ' ') : 'Figma file'; }
    if (/docs\.google\.com/.test(host)) return u.pathname.includes('/document/') ? 'Google Doc' : u.pathname.includes('/spreadsheets/') ? 'Google Sheet' : u.pathname.includes('/presentation/') ? 'Google Slides' : 'Google Drive file';
    if (/drive\.google\.com/.test(host)) return 'Google Drive file';
    if (youtubeId(url)) return 'YouTube video';
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ');
    return last ? `${host}: ${last}` : host;
  } catch {
    return url;
  }
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
