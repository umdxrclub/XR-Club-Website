// Google Drive: the team folder, new documents, and the proposal document.
import { api, state, isManager, isLead } from './api';
import { esc, toast, openModal, confirmModal, field, input, select, formValue, fmtRelative, fmtDateTime } from './ui';

export interface DriveFile {
  id: string;
  name: string;
  kind: 'folder' | 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'video' | 'form' | 'file';
  mimeType: string;
  modifiedTime: string;
  createdTime: string;
  url: string;
  size: number | null;
  editor: string | null;
  editorPhoto: string | null;
}

export interface DriveStatus {
  configured: boolean;
  serviceEmail: string | null;
  folder: { id: string; name: string; url: string } | null;
  proposal: { id: string; name: string; url: string } | null;
  access: 'already' | 'granted' | null;
  accessError?: string | null;
}

export interface ProposalCheck {
  proposal: { id: string; name: string; url: string; modifiedTime: string; editor: string | null };
  totalWords: number;
  techWords: number;
  techPages: number;
  abstractWords: number;
  sections: Array<{ heading: string; level: number; present: boolean; words: number }>;
  headings: Array<{ heading: string; level: number; words: number }>;
}

const KIND_LABEL: Record<DriveFile['kind'], string> = { folder: 'Folder', doc: 'Doc', sheet: 'Sheet', slides: 'Slides', pdf: 'PDF', image: 'Image', video: 'Video', form: 'Form', file: 'File' };

let statusCache: DriveStatus | null = null;
let path: Array<{ id: string; name: string }> = [];

export async function status(force = false) {
  if (!statusCache || force) statusCache = await api.drive<DriveStatus>('status');
  return statusCache;
}

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Opening Drive.</p>`;
  let st: DriveStatus;
  try {
    st = await status(true);
  } catch (err) {
    host.innerHTML = `<div class="st-section"><h2 class="st-h1">Drive</h2><p class="st-notice st-notice--danger">${esc((err as Error).message)}</p></div>`;
    return;
  }

  if (!st.configured) {
    host.innerHTML = `
      <div class="st-section">
        <h2 class="st-h1">Drive</h2>
        <p class="st-lead">Google Drive is not connected yet.${isLead() ? ' One setup, about ten minutes, and the whole team works out of one folder from here.' : ' The team lead is connecting it.'}</p>
        ${isLead() ? `
        <ol class="st-steps">
          <li class="st-step"><span class="st-step__num">1</span><div><h4 class="st-step__title">Make a service account</h4><p class="st-step__text">Open console.cloud.google.com and pick the project that holds the Google sign in for this site. Under APIs and Services, Library, enable the Google Drive API and the Google Docs API. Then under IAM and Admin, Service Accounts, create one named suits-dashboard. Open it, choose Keys, Add key, JSON. A key file downloads.</p></div></li>
          <li class="st-step"><span class="st-step__num">2</span><div><h4 class="st-step__title">Save the key</h4><p class="st-step__text">From the project folder run: npx supabase secrets set SUITS_GOOGLE_SERVICE_ACCOUNT="$(cat path/to/key.json)" on Mac, or in PowerShell: npx supabase secrets set "SUITS_GOOGLE_SERVICE_ACCOUNT=$(Get-Content path\\to\\key.json -Raw)". Reload this page.</p></div></li>
          <li class="st-step"><span class="st-step__num">3</span><div><h4 class="st-step__title">Share the team folder</h4><p class="st-step__text">Create the team folder in your Google Drive, share it with the service account email as an Editor, and paste the folder link here. Everyone who signs in to this dashboard gets edit access to the folder on their own.</p></div></li>
        </ol>` : ''}
      </div>`;
    return;
  }

  if (!st.folder) {
    host.innerHTML = `
      <div class="st-section">
        <h2 class="st-h1">Drive</h2>
        <p class="st-lead">${isManager() ? 'Drive is connected. Point it at the team folder.' : 'Drive is connected. A product manager is choosing the team folder.'}</p>
        ${isManager() ? `
        <div class="st-card">
          <p class="st-p">In Google Drive, create the folder the team will work in. Share it with <strong>${esc(st.serviceEmail || '')}</strong> as an Editor. Then paste the folder link below.</p>
          <form id="st-folder-form" novalidate>
            ${field('url', 'Folder link', input('url', 'type="url" required placeholder="https://drive.google.com/drive/folders/..."'))}
            <button type="submit" class="st-btn st-btn--primary">Use this folder</button>
          </form>
        </div>` : ''}
      </div>`;
    host.querySelector<HTMLFormElement>('#st-folder-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const btn = form.querySelector('button') as HTMLButtonElement;
      btn.disabled = true;
      try {
        await api.drive('setFolder', { url: formValue(form, 'url') });
        toast('Team folder saved.');
        path = [];
        await render(host);
      } catch (err) {
        toast((err as Error).message, 'danger');
        btn.disabled = false;
      }
    });
    return;
  }

  // Folder is set
  if (!path.length || path[0].id !== st.folder.id) path = [{ id: st.folder.id, name: st.folder.name }];
  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <div>
          <h2 class="st-h1">Drive</h2>
          <p class="st-lead" style="margin:0;">The team folder, <strong>${esc(st.folder.name)}</strong>. Everything the proposal needs lives here.</p>
        </div>
        <div class="st-toolbar__group">
          <a class="st-btn" href="${esc(st.folder.url)}" target="_blank" rel="noopener">Open in Google Drive</a>
          ${isManager() ? `<button type="button" class="st-btn st-btn--small" id="st-change-folder">Change folder</button>` : ''}
        </div>
      </div>
      ${st.access === 'granted' ? `<p class="st-notice st-notice--ok">You now have edit access to the folder as ${esc(state.me!.email)}.</p>` : ''}
      ${st.accessError ? `<p class="st-notice st-notice--danger">Could not confirm your access to the folder: ${esc(st.accessError)}</p>` : ''}
    </div>

    <div class="st-section" id="st-proposal-card"></div>

    <div class="st-section">
      <div class="st-toolbar">
        <h3 class="st-h2" style="margin:0;">Files</h3>
        <div class="st-toolbar__group">
          <button type="button" class="st-btn st-btn--small" data-new="doc">New Doc</button>
          <button type="button" class="st-btn st-btn--small" data-new="sheet">New Sheet</button>
          <button type="button" class="st-btn st-btn--small" data-new="slides">New Slides</button>
          <button type="button" class="st-btn st-btn--small" data-new="folder">New folder</button>
        </div>
      </div>
      <div class="st-crumbs" id="st-crumbs"></div>
      <div id="st-files"><p class="st-muted">Loading.</p></div>
    </div>

    <div class="st-section">
      <h3 class="st-h2">Edited this week</h3>
      <div id="st-recent"><p class="st-muted">Loading.</p></div>
    </div>`;

  host.querySelectorAll<HTMLElement>('[data-new]').forEach(b => b.addEventListener('click', () => createFile(host, b.dataset.new as 'doc' | 'sheet' | 'slides' | 'folder')));
  host.querySelector('#st-change-folder')?.addEventListener('click', () => {
    openModal({
      title: 'Change the team folder',
      body: `<p class="st-p">Share the new folder with <strong>${esc(st.serviceEmail || '')}</strong> as an Editor first.</p>${field('url', 'Folder link', input('url', 'type="url" required placeholder="https://drive.google.com/drive/folders/..."'))}`,
      submitLabel: 'Use this folder',
      onSubmit: async (form, close) => {
        await api.drive('setFolder', { url: formValue(form, 'url') });
        close();
        path = [];
        await render(host);
      },
    });
  });

  await Promise.all([renderProposalCard(host, st), renderFiles(host), renderRecent(host)]);
}

async function renderFiles(host: HTMLElement) {
  const filesEl = host.querySelector<HTMLElement>('#st-files')!;
  const crumbs = host.querySelector<HTMLElement>('#st-crumbs')!;
  const current = path[path.length - 1];
  crumbs.innerHTML = path.map((p, i) => i === path.length - 1 ? `<span class="st-crumbs__here">${esc(p.name)}</span>` : `<button type="button" class="st-link" data-crumb="${i}">${esc(p.name)}</button><span class="st-crumbs__sep">/</span>`).join('');
  crumbs.querySelectorAll<HTMLElement>('[data-crumb]').forEach(b => b.addEventListener('click', () => { path = path.slice(0, Number(b.dataset.crumb) + 1); renderFiles(host); }));

  filesEl.innerHTML = `<p class="st-muted">Loading.</p>`;
  try {
    const { files } = await api.drive<{ files: DriveFile[] }>('list', { folderId: current.id });
    filesEl.innerHTML = files.length ? `<div class="st-files">${files.map(fileRow).join('')}</div>` : `<div class="st-empty">This folder is empty. Create the first document with the buttons above.</div>`;
    filesEl.querySelectorAll<HTMLElement>('[data-open-folder]').forEach(b => b.addEventListener('click', () => {
      path = [...path, { id: b.dataset.openFolder!, name: b.dataset.name! }];
      renderFiles(host);
    }));
  } catch (err) {
    filesEl.innerHTML = `<p class="st-notice st-notice--danger">${esc((err as Error).message)}</p>`;
  }
}

async function renderRecent(host: HTMLElement) {
  const el = host.querySelector<HTMLElement>('#st-recent')!;
  try {
    const { files } = await api.drive<{ files: DriveFile[] }>('recent');
    el.innerHTML = files.length ? `<div class="st-files">${files.map(fileRow).join('')}</div>` : `<p class="st-muted" style="margin:0;">Nothing edited in the last seven days.</p>`;
  } catch (err) {
    el.innerHTML = `<p class="st-muted" style="margin:0;">${esc((err as Error).message)}</p>`;
  }
}

export function fileRow(f: DriveFile) {
  const when = f.modifiedTime ? fmtRelative(f.modifiedTime) : '';
  const meta = [f.editor ? `${f.editor} edited ${when}` : (when ? `Edited ${when}` : '')].filter(Boolean).join(' · ');
  if (f.kind === 'folder') {
    return `<button type="button" class="st-file" data-open-folder="${esc(f.id)}" data-name="${esc(f.name)}">
      <span class="st-file__badge" data-kind="folder">${KIND_LABEL.folder}</span>
      <span class="st-file__body"><span class="st-file__name">${esc(f.name)}</span><span class="st-file__meta">${esc(meta || 'Folder')}</span></span>
      <span class="st-file__go">Open</span>
    </button>`;
  }
  return `<a class="st-file" href="${esc(f.url)}" target="_blank" rel="noopener">
    <span class="st-file__badge" data-kind="${f.kind}">${KIND_LABEL[f.kind]}</span>
    <span class="st-file__body"><span class="st-file__name">${esc(f.name)}</span><span class="st-file__meta">${esc(meta)}</span></span>
    <span class="st-file__go">Open</span>
  </a>`;
}

function createFile(host: HTMLElement, kind: 'doc' | 'sheet' | 'slides' | 'folder') {
  const label = { doc: 'Google Doc', sheet: 'Google Sheet', slides: 'Google Slides', folder: 'folder' }[kind];
  const current = path[path.length - 1];
  openModal({
    title: `New ${label}`,
    body: `${field('name', 'Name', input('name', `type="text" required placeholder="${kind === 'folder' ? 'Research' : 'HITL test plan'}"`))}<p class="st-help">Created inside ${esc(current.name)}. It opens in a new tab when it is ready.</p>`,
    submitLabel: 'Create',
    onSubmit: async (form, close) => {
      const name = formValue(form, 'name');
      if (!name) throw new Error('Give it a name.');
      const { file } = await api.drive<{ file: DriveFile }>('create', { kind, name, parentId: current.id });
      close();
      toast(`${label} created.`);
      if (file.kind !== 'folder') window.open(file.url, '_blank', 'noopener');
      await renderFiles(host);
    },
  });
}

// ---------------------------------------------------------------------------
// Proposal document
// ---------------------------------------------------------------------------
async function renderProposalCard(host: HTMLElement, st: DriveStatus) {
  const card = host.querySelector<HTMLElement>('#st-proposal-card')!;
  if (!st.proposal) {
    card.innerHTML = `
      <div class="st-card">
        <h3 class="st-h3">The proposal document</h3>
        ${isManager() ? `
          <p class="st-p">Start it here and the Doc opens with every section NASA requires already in place, in their order, with their instructions under each heading. Or choose a Doc that already exists.</p>
          <div class="st-toolbar__group">
            <button type="button" class="st-btn st-btn--primary" id="st-make-proposal">Create the proposal document</button>
            <button type="button" class="st-btn" id="st-pick-proposal">Choose an existing Doc</button>
          </div>` : `<p class="st-muted" style="margin:0;">A product manager has not chosen the proposal document yet.</p>`}
      </div>`;
    card.querySelector('#st-make-proposal')?.addEventListener('click', () => {
      openModal({
        title: 'Create the proposal document',
        body: `${field('name', 'Document name', input('name', 'type="text" required value="NASA SUITS 2027 Proposal"'))}${field('team', 'Team name on the first page', input('team', 'type="text" value="University of Maryland XR Club"'))}`,
        submitLabel: 'Create',
        onSubmit: async (form, close) => {
          const { file } = await api.drive<{ file: DriveFile }>('create', { kind: 'doc', name: formValue(form, 'name'), template: 'proposal', teamName: formValue(form, 'team') });
          close();
          toast('Proposal document created.');
          window.open(file.url, '_blank', 'noopener');
          await render(host);
        },
      });
    });
    card.querySelector('#st-pick-proposal')?.addEventListener('click', async () => {
      const { files } = await api.drive<{ files: DriveFile[] }>('list');
      const docs = files.filter(f => f.kind === 'doc');
      if (!docs.length) { toast('There are no Docs in the team folder yet.', 'danger'); return; }
      openModal({
        title: 'Choose the proposal document',
        body: field('fileId', 'Google Doc', select('fileId', docs.map(d => ({ value: d.id, label: d.name })))),
        submitLabel: 'Use this Doc',
        onSubmit: async (form, close) => {
          await api.drive('setProposal', { fileId: formValue(form, 'fileId') });
          close();
          await render(host);
        },
      });
    });
    return;
  }

  card.innerHTML = `<div class="st-card"><h3 class="st-h3">The proposal document</h3><p class="st-muted">Reading the document.</p></div>`;
  try {
    const check = await api.drive<ProposalCheck>('proposal');
    card.innerHTML = `<div class="st-card">${proposalSummaryHtml(check, true)}</div>`;
    card.querySelector('#st-unset-proposal')?.addEventListener('click', async () => {
      if (!(await confirmModal('Stop tracking this Doc?', 'The document stays in Drive. You can choose it again later.', 'Stop tracking'))) return;
      await api.drive('setProposal', { fileId: null });
      await render(host);
    });
  } catch (err) {
    card.innerHTML = `<div class="st-card"><h3 class="st-h3">The proposal document</h3><p class="st-p"><a class="st-link" href="${esc(st.proposal.url)}" target="_blank" rel="noopener">${esc(st.proposal.name)}</a></p><p class="st-notice st-notice--danger">${esc((err as Error).message)}</p></div>`;
  }
}

export function proposalSummaryHtml(check: ProposalCheck, full: boolean) {
  const p = check.proposal;
  const missing = check.sections.filter(s => !s.present);
  const over = check.techPages > 12;
  const abstractOver = check.abstractWords > 500;
  return `
    <div class="st-toolbar" style="margin-bottom:0.6rem;">
      <div>
        <h3 class="st-h3" style="margin:0 0 0.2rem;">${esc(p.name)}</h3>
        <p class="st-muted" style="margin:0;">${p.editor ? `${esc(p.editor)} edited ` : 'Edited '}${esc(fmtRelative(p.modifiedTime))}, ${esc(fmtDateTime(p.modifiedTime))}</p>
      </div>
      <div class="st-toolbar__group">
        <a class="st-btn st-btn--primary" href="${esc(p.url)}" target="_blank" rel="noopener">Open the proposal</a>
        ${full && isManager() ? `<button type="button" class="st-btn st-btn--small" id="st-unset-proposal">Stop tracking</button>` : ''}
      </div>
    </div>
    <div class="st-stats">
      <div class="st-stat"><span class="st-stat__num">${check.totalWords.toLocaleString()}</span><span class="st-stat__label">words in the document</span></div>
      <div class="st-stat${over ? ' is-warn' : ''}"><span class="st-stat__num">${check.techPages ? check.techPages.toFixed(1) : '0'}</span><span class="st-stat__label">of 12 technical pages, estimated from ${check.techWords.toLocaleString()} words</span></div>
      <div class="st-stat${abstractOver ? ' is-warn' : ''}"><span class="st-stat__num">${check.abstractWords}</span><span class="st-stat__label">of 500 abstract words</span></div>
      <div class="st-stat${missing.length ? ' is-warn' : ''}"><span class="st-stat__num">${check.sections.length - missing.length}</span><span class="st-stat__label">of ${check.sections.length} required sections have a heading</span></div>
    </div>
    ${full ? `
    <p class="st-help" style="margin-top:0.6rem;">Sections are found by their headings, so keep the required headings as Heading 1 and Heading 2 in the Doc. The page estimate assumes 12 point text and does not count figures; the Doc's own page count is the final word.</p>
    <div class="st-sections">
      ${check.sections.map(s => `<div class="st-sectionrow${s.present ? ' is-present' : ''}${s.level === 2 ? ' is-sub' : ''}"><span class="st-sectionrow__mark"></span><span class="st-sectionrow__name">${esc(s.heading)}</span><span class="st-sectionrow__words">${s.present ? `${s.words.toLocaleString()} words` : 'missing'}</span></div>`).join('')}
    </div>` : ''}`;
}
