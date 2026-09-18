// Documents: everything the team works from, grouped by role. Anyone can add a
// file or a link; each one is mirrored to the club's Google Drive and shared
// with the whole team.
import { db, api, state, isManager, isLead, type TeamDocument } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, select, formValue, fmtDate, fmtRelative } from './ui';
import { READER_ROLES } from './reader-content';

const BUCKET = 'suits-docs';
const GROUPS = [{ key: 'team', name: 'Everyone' }, ...READER_ROLES.map(r => ({ key: r.key, name: r.name }))];
const groupName = (key: string) => GROUPS.find(g => g.key === key)?.name ?? 'Everyone';

interface DriveStatus { configured: boolean; serviceEmail: string | null; folder: { id: string; name: string; url: string } | null }

let filter = 'all';
let driveStatus: DriveStatus | null = null;

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
  const counts = new Map<string, number>();
  for (const g of GROUPS) counts.set(g.key, docs.filter(d => d.role === g.key).length);

  const order = filter === 'all' ? GROUPS : filter === 'team' ? GROUPS.filter(g => g.key === 'team') : [GROUPS.find(g => g.key === filter)!, GROUPS[0]];

  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <h2 class="st-h1" style="margin:0;">Documents</h2>
        <button type="button" class="st-btn st-btn--primary" id="st-doc-add">Add a document</button>
      </div>
      <div class="st-reader__roles" style="margin-top:0.9rem;">
        <span class="st-reader__roles-label">Show</span>
        <button type="button" class="st-chip${filter === 'all' ? ' is-active' : ''}" data-filter="all">Everything</button>
        ${GROUPS.map(g => `<button type="button" class="st-chip${filter === g.key ? ' is-active' : ''}" data-filter="${g.key}">${esc(g.name)}${g.key === mine ? ' (you)' : ''}</button>`).join('')}
      </div>
      <div id="st-drive-card"></div>
    </div>
    ${order.map(g => groupHtml(g, docs.filter(d => d.role === g.key))).join('')}`;

  host.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter!; void render(host); }));
  host.querySelector('#st-doc-add')!.addEventListener('click', () => addDocument(host));
  host.querySelectorAll<HTMLElement>('[data-open-path]').forEach(b => b.addEventListener('click', () => openStored(b.dataset.openPath!, b as HTMLButtonElement)));
  host.querySelectorAll<HTMLElement>('[data-remove-doc]').forEach(b => b.addEventListener('click', async () => {
    const d = docs.find(x => x.id === b.dataset.removeDoc)!;
    if (!(await confirmModal('Remove this document?', `"${d.title}" is removed from the dashboard and its copy in Drive goes to the trash.`, 'Remove'))) return;
    try {
      if (d.kind === 'file' && d.storage_path) await db.storage.from(BUCKET).remove([d.storage_path]).catch(() => { /* the row is what matters */ });
      if (d.drive_file_id) await api.drive('remove', { driveFileId: d.drive_file_id }).catch(() => { /* Drive copy stays if it cannot be trashed */ });
      await api.deleteDocument(d.id);
      await render(host);
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  }));
  host.querySelectorAll<HTMLElement>('[data-retry-doc]').forEach(b => b.addEventListener('click', () => syncToDrive(host, b.dataset.retryDoc!)));

  void renderDriveCard(host);
}

function groupHtml(g: { key: string; name: string }, docs: TeamDocument[]) {
  return `
    <div class="st-list-group">
      <p class="st-list-group__label"><span>${esc(g.name)}</span><span>${docs.length}</span></p>
      ${docs.length ? `<div class="st-files">${docs.map(docRow).join('')}</div>` : `<div class="st-empty">Nothing here yet.</div>`}
    </div>`;
}

function docRow(d: TeamDocument) {
  const kind = d.kind === 'link' ? kindOfUrl(d.url || '') : kindOfName(d.storage_path || d.title, d.mime);
  const who = d.created_by ? esc(memberFirst(d.created_by)) : '';
  const meta = [who, fmtRelative(d.created_at), d.size ? fmtSize(d.size) : ''].filter(Boolean).join(', ');
  const drive = d.drive_status === 'synced' && d.drive_url ? `<a class="st-file__drive" href="${esc(d.drive_url)}" target="_blank" rel="noopener">In Drive</a>`
    : d.drive_status === 'pending' ? `<span class="st-file__drive">Sending to Drive</span>`
    : d.drive_status === 'error' ? `<button type="button" class="st-file__drive is-error" data-retry-doc="${d.id}" title="${esc(d.drive_error || '')}">Drive failed, retry</button>`
    : d.drive_status === 'not_connected' && driveStatus?.configured && driveStatus.folder ? `<button type="button" class="st-file__drive" data-retry-doc="${d.id}">Send to Drive</button>`
    : '';
  const canRemove = isManager() || d.created_by === state.me?.user_id;
  const open = d.kind === 'link'
    ? `<a class="st-btn st-btn--small" href="${esc(d.url || '#')}" target="_blank" rel="noopener">Open</a>`
    : `<button type="button" class="st-btn st-btn--small" data-open-path="${esc(d.storage_path || '')}">Open</button>`;
  return `
    <div class="st-file">
      <span class="st-file__badge" data-kind="${kind}">${esc(badgeLabel(kind))}</span>
      <span class="st-file__body">
        <span class="st-file__name">${esc(d.title)}</span>
        <span class="st-file__meta">${esc(meta)}${d.notes ? `. ${esc(d.notes)}` : ''}${drive ? ` ${drive}` : ''}</span>
      </span>
      <span class="st-file__actions">${open}${canRemove ? `<button type="button" class="st-btn st-btn--small st-btn--danger" data-remove-doc="${d.id}">Remove</button>` : ''}</span>
    </div>`;
}

function memberFirst(id: string) {
  const m = state.members.find(x => x.user_id === id);
  return m ? m.display_name.split(' ')[0] : 'Someone';
}

// ---------------------------------------------------------------------------
// Adding
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

  // Wire the modal after it is in the DOM
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

/** Mirror one document into the team's Google Drive and refresh its row. */
async function syncToDrive(host: HTMLElement, id: string) {
  try {
    const r = await api.drive<{ drive_status: string; error?: string }>('sync', { documentId: id });
    if (r.drive_status === 'error') toast(`Saved here, but Drive said: ${r.error}`, 'danger');
  } catch (err) {
    toast(`Saved here, but Drive could not be reached: ${(err as Error).message}`, 'danger');
  }
  if (host.isConnected && !host.closest('.st-view')?.hasAttribute('hidden')) await render(host);
}

// ---------------------------------------------------------------------------
// Drive card: connection state for the lead, folder link for everyone
// ---------------------------------------------------------------------------
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
    const waiting = isManager() ? Array.from(host.querySelectorAll<HTMLElement>('[data-retry-doc]')).map(b => b.dataset.retryDoc!) : [];
    card.innerHTML = `<p class="st-muted" style="margin:0.9rem 0 0; font-size:0.92rem;">Everything added here is copied to the team's Google Drive folder and shared with the whole team. <a class="st-link" href="${esc(st.folder.url)}" target="_blank" rel="noopener">Open the folder</a>${waiting.length ? ` <button type="button" class="st-link" id="st-drive-sync-all">Send ${waiting.length} waiting document${waiting.length === 1 ? '' : 's'} to Drive</button>` : ''}</p>`;
    card.querySelector('#st-drive-sync-all')?.addEventListener('click', async () => {
      const btn = card.querySelector('#st-drive-sync-all') as HTMLButtonElement;
      btn.disabled = true;
      for (const id of waiting) {
        try { await api.drive('sync', { documentId: id }); } catch { /* shown on the row */ }
      }
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
// Helpers
// ---------------------------------------------------------------------------
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

type Kind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'video' | 'figma' | 'drive' | 'link' | 'file';

function kindOfName(name: string, mime?: string | null): Kind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'txt', 'md', 'rtf', 'pages'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'image';
  if (mime?.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function kindOfUrl(url: string): Kind {
  if (/docs\.google\.com\/document/i.test(url)) return 'doc';
  if (/docs\.google\.com\/spreadsheets/i.test(url)) return 'sheet';
  if (/docs\.google\.com\/presentation/i.test(url)) return 'slides';
  if (/drive\.google\.com/i.test(url)) return 'drive';
  if (/figma\.com/i.test(url)) return 'figma';
  if (/youtube\.com|youtu\.be|vimeo\.com|\.mp4($|\?)/i.test(url)) return 'video';
  if (/\.pdf($|\?)/i.test(url)) return 'pdf';
  return 'link';
}

function badgeLabel(kind: Kind) {
  return { pdf: 'PDF', doc: 'Doc', sheet: 'Sheet', slides: 'Slides', image: 'Image', video: 'Video', figma: 'Figma', drive: 'Drive', link: 'Link', file: 'File' }[kind];
}

function titleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (/figma\.com/.test(host)) return 'Figma file';
    if (/docs\.google\.com/.test(host)) return u.pathname.includes('/document/') ? 'Google Doc' : u.pathname.includes('/spreadsheets/') ? 'Google Sheet' : u.pathname.includes('/presentation/') ? 'Google Slides' : 'Google Drive file';
    if (/drive\.google\.com/.test(host)) return 'Google Drive file';
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

void fmtDate;
