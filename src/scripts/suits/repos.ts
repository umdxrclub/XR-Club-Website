// Team code on GitHub, shown inside the dashboard: repository cards on the
// Documents page and a full screen view with the README, a file browser that
// previews text, Markdown and images, and recent commits. Public repositories
// only; data comes from the GitHub REST API in the viewer's browser.
import { esc, fmtRelative } from './ui';

export interface RepoRef { owner: string; repo: string }

/** Repositories every teammate sees under Code on the Documents page. */
export const TEAM_REPOS: RepoRef[] = [
  { owner: 'SUITS-Techteam', repo: 'TSS2027' },
  { owner: 'umdxrclub', repo: 'TerpVISIOInterface-NASASUITS2023' },
];

interface RepoInfo { full_name: string; description: string | null; pushed_at: string; default_branch: string; html_url: string }
interface RepoEntry { name: string; path: string; type: 'file' | 'dir' | 'symlink' | 'submodule'; size: number; download_url: string | null; html_url: string }
interface RepoCommit { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null }; author: { login: string } | null }

const API = 'https://api.github.com';
const CACHE_MS = 15 * 60 * 1000;
const memory = new Map<string, Promise<unknown>>();

/** GitHub request with a short per-session cache, since unauthenticated calls are limited to 60 an hour. */
function gh<T>(path: string, accept = 'application/vnd.github+json'): Promise<T> {
  const key = `xr-gh:${accept}:${path}`;
  const hit = memory.get(key);
  if (hit) return hit as Promise<T>;
  const request = (async () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null') as { at: number; body: T } | null;
      if (saved && Date.now() - saved.at < CACHE_MS) return saved.body;
    } catch { /* storage unavailable */ }
    const r = await fetch(`${API}${path}`, { headers: { Accept: accept } });
    if (r.status === 404) throw new Error('This repository is private or no longer exists.');
    if (r.status === 403 || r.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
    if (!r.ok) throw new Error(`GitHub returned ${r.status}.`);
    const body = (accept.includes('html') ? await r.text() : await r.json()) as T;
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), body })); } catch { /* storage full */ }
    return body;
  })();
  memory.set(key, request);
  request.catch(() => memory.delete(key));
  return request;
}

/** Recent changes read as "3 days ago"; anything older than a month shows its date. */
const when = (iso: string) => Date.now() - Date.parse(iso) < 30 * 864e5 ? fmtRelative(iso) : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const repoInfo = (r: RepoRef) => gh<RepoInfo>(`/repos/${r.owner}/${r.repo}`);
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** github.com/owner/repo links, with or without a trailing path. */
export function parseRepoUrl(url: string | null | undefined): RepoRef | null {
  const m = (url || '').match(/^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/);
  if (!m || ['orgs', 'settings', 'topics', 'features'].includes(m[1])) return null;
  return { owner: m[1], repo: m[2] };
}

// ---------------------------------------------------------------------------
// Icons (GitHub Octicons, MIT)
// ---------------------------------------------------------------------------
const icon = (d: string, cls = '') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const MARK = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';
const FOLDER = 'M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z';
const FILE = 'M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z';
const COMMIT = 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z';

// ---------------------------------------------------------------------------
// Documents page cards
// ---------------------------------------------------------------------------
export function repoSectionHtml() {
  return `
    <section class="st-group st-repos" aria-label="Code">
      <div class="st-group__head"><h3 class="st-group__title">Code</h3></div>
      <div class="st-repogrid">${TEAM_REPOS.map(r => `
        <article class="st-repocard" data-repo="${esc(`${r.owner}/${r.repo}`)}" role="button" tabindex="0" aria-label="Open ${esc(r.repo)}">
          <div class="st-repocard__top">${icon(MARK)}<span>${esc(r.owner)}</span></div>
          <p class="st-repocard__name">${esc(r.repo)}</p>
          <p class="st-repocard__desc" data-repo-desc></p>
          <p class="st-repocard__meta" data-repo-meta></p>
        </article>`).join('')}</div>
    </section>`;
}

export function bindRepoCards(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>('.st-repocard').forEach(card => {
    const [owner, repo] = card.dataset.repo!.split('/');
    const open = () => void openRepo({ owner, repo });
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    repoInfo({ owner, repo }).then(info => {
      if (!card.isConnected) return;
      card.querySelector('[data-repo-desc]')!.textContent = info.description || 'No description';
      card.querySelector('[data-repo-meta]')!.textContent = `Updated ${when(info.pushed_at)}`;
    }).catch(() => {
      if (card.isConnected) card.querySelector('[data-repo-desc]')!.textContent = 'Open to view on GitHub';
    });
  });
}

// ---------------------------------------------------------------------------
// Repository view
// ---------------------------------------------------------------------------
let overlay: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeRepo() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  overlay?.remove();
  overlay = null;
  document.body.style.overflow = '';
}

const TEXT_EXT = /\.(c|h|cc|cpp|hpp|cs|js|mjs|cjs|ts|tsx|jsx|py|java|kt|go|rs|rb|php|swift|sh|bat|ps1|json|jsonc|yml|yaml|toml|ini|cfg|conf|txt|csv|xml|html|css|scss|shader|cginc|hlsl|glsl|compute|uss|uxml|asmdef|meta|unity|prefab|mat|asset|gitignore|gitattributes|editorconfig|vsconfig|log|sql|env|lock|cmake|make|mk)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;
const MARKDOWN_EXT = /\.(md|markdown)$/i;
const MAX_PREVIEW = 400 * 1024;
const size = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** GitHub renders Markdown to sanitized HTML; this also fixes relative links and images, then shows it in a sandboxed frame. */
function markdownFrame(html: string, ref: RepoRef, branch: string, dir: string) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta, a.anchor').forEach(n => n.remove());
  const prefix = dir ? `${dir}/` : '';
  const raw = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${prefix}`;
  const blob = `https://github.com/${ref.owner}/${ref.repo}/blob/${encodeURIComponent(branch)}/${prefix}`;
  const absolute = (value: string, base: string) => { try { return new URL(value, base).href; } catch { return ''; } };
  doc.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => {
    if (/^on/i.test(a.name) || (/^(href|src|srcset)$/i.test(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value))) el.removeAttribute(a.name);
  }));
  doc.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src')!;
    if (!/^(https?:|data:image\/)/i.test(src)) img.setAttribute('src', absolute(src, raw));
    img.setAttribute('loading', 'lazy');
  });
  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) return;
    a.setAttribute('href', /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : absolute(href, blob));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  const body = doc.body.firstElementChild!.innerHTML;
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:32px 40px 56px;color:#1f2328;background:#fff;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;overflow-wrap:break-word}
    article,.markdown-body{max-width:880px;margin:0 auto}
    h1,h2,h3,h4{margin:1.4em 0 .6em;line-height:1.25;font-weight:600}h1{font-size:1.9em}h2{font-size:1.45em}h1,h2{padding-bottom:.3em;border-bottom:1px solid #d1d9e0}h3{font-size:1.2em}
    p,ul,ol,table,pre,blockquote{margin:0 0 1em}a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
    img{max-width:100%;height:auto;border-radius:6px}code{padding:.2em .4em;border-radius:6px;background:#eff2f5;font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    pre{padding:16px;border-radius:8px;background:#f6f8fa;overflow:auto;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}pre code{padding:0;background:none;font-size:inherit}
    table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}th,td{padding:6px 13px;border:1px solid #d1d9e0}tr:nth-child(2n){background:#f6f8fa}
    blockquote{padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}hr{height:1px;border:0;background:#d1d9e0;margin:24px 0}
    .octicon{width:16px;height:16px;fill:currentColor;vertical-align:text-bottom}.markdown-alert{padding:8px 16px;margin-bottom:16px;border-left:.25em solid #0969da}
    @media(max-width:640px){body{padding:20px 18px 40px}}
  </style></head><body><article>${body}</article></body></html>`;
  // No scripts and no same origin access; links may open new tabs only.
  return `<iframe class="st-repo__md" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Rendered Markdown" srcdoc="${esc(page)}"></iframe>`;
}

export async function openRepo(ref: RepoRef) {
  closeRepo();
  const home = `https://github.com/${ref.owner}/${ref.repo}`;
  overlay = document.createElement('div');
  overlay.className = 'st-viewer st-repo';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', `${ref.repo} repository`);
  overlay.innerHTML = `
    <div class="st-viewer__bar">
      <div class="st-viewer__title">
        <span class="st-viewer__name">${icon(MARK, 'st-repo__mark')}${esc(ref.owner)} / ${esc(ref.repo)}</span>
        <span class="st-viewer__sub" data-repo-sub></span>
      </div>
      <div class="st-viewer__actions">
        <a class="st-btn st-btn--small" href="${esc(home)}" target="_blank" rel="noopener">Open on GitHub</a>
        <button type="button" class="st-btn st-btn--small st-btn--primary" data-repo-close>Close</button>
      </div>
    </div>
    <div class="st-repo__tabs" role="tablist">
      <button type="button" role="tab" data-tab="readme" aria-selected="true">README</button>
      <button type="button" role="tab" data-tab="files" aria-selected="false">Files</button>
      <button type="button" role="tab" data-tab="commits" aria-selected="false">Commits</button>
    </div>
    <div class="st-viewer__body st-repo__panel" data-panel role="tabpanel"><p class="st-viewer__note">Loading</p></div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const view = overlay;
  const panel = view.querySelector<HTMLElement>('[data-panel]')!;
  view.querySelector('[data-repo-close]')!.addEventListener('click', closeRepo);
  keyHandler = e => { if (e.key === 'Escape') closeRepo(); };
  window.addEventListener('keydown', keyHandler);

  let tab = 'readme', dir = '', token = 0;
  const failed = (err: unknown) => `<div class="st-repo__empty"><p>${esc((err as Error).message)}</p><a class="st-btn st-btn--small" href="${esc(home)}" target="_blank" rel="noopener">Open on GitHub</a></div>`;

  const info = await repoInfo(ref).catch(err => { panel.innerHTML = failed(err); return null; });
  if (!info || !view.isConnected) return;
  view.querySelector('[data-repo-sub]')!.textContent = info.description || '';
  const branch = info.default_branch;

  const crumbs = (path: string) => {
    const parts = path ? path.split('/') : [];
    return `<nav class="st-repo__crumbs" aria-label="Folder">${[`<button type="button" data-dir="">${esc(ref.repo)}</button>`, ...parts.map((p, i) => i === parts.length - 1 ? `<strong>${esc(p)}</strong>` : `<button type="button" data-dir="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`)].join('<span aria-hidden="true">/</span>')}</nav>`;
  };

  const show = async (next: string, path = dir) => {
    tab = next; dir = path;
    const mine = ++token;
    view.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    panel.classList.toggle('is-readme', tab === 'readme');
    panel.innerHTML = '<p class="st-viewer__note">Loading</p>';
    try {
      if (tab === 'readme') {
        const html = await gh<string>(`/repos/${ref.owner}/${ref.repo}/readme`, 'application/vnd.github.html+json').catch(() => '');
        if (mine !== token) return;
        panel.innerHTML = html ? markdownFrame(html, ref, branch, '') : '<div class="st-repo__empty"><p>This repository has no README</p></div>';
      } else if (tab === 'files') {
        const entries = await gh<RepoEntry[]>(`/repos/${ref.owner}/${ref.repo}/contents/${encodePath(dir)}?ref=${encodeURIComponent(branch)}`);
        if (mine !== token) return;
        const sorted = [...entries].sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
        panel.innerHTML = `<div class="st-repo__list">${crumbs(dir)}<div class="st-repo__rows">${sorted.map(e => e.type === 'dir'
          ? `<button type="button" class="st-repo__row is-dir" data-dir="${esc(e.path)}">${icon(FOLDER)}<span>${esc(e.name)}</span></button>`
          : `<button type="button" class="st-repo__row" data-file="${esc(e.path)}">${icon(FILE)}<span>${esc(e.name)}</span><small>${e.type === 'file' ? esc(size(e.size)) : ''}</small></button>`).join('') || '<p class="st-repo__none">This folder is empty</p>'}</div></div>`;
      } else {
        const commits = await gh<RepoCommit[]>(`/repos/${ref.owner}/${ref.repo}/commits?per_page=20&sha=${encodeURIComponent(branch)}`);
        if (mine !== token) return;
        panel.innerHTML = `<div class="st-repo__list"><div class="st-repo__rows">${commits.map(c => `
          <a class="st-repo__row st-repo__commit" href="${esc(c.html_url)}" target="_blank" rel="noopener">${icon(COMMIT)}
            <span><strong>${esc(c.commit.message.split('\n')[0])}</strong><small>${esc(c.author?.login || c.commit.author?.name || 'Unknown')}, ${esc(c.commit.author ? when(c.commit.author.date) : '')}</small></span>
            <code>${esc(c.sha.slice(0, 7))}</code></a>`).join('')}</div></div>`;
      }
    } catch (err) {
      if (mine === token) panel.innerHTML = failed(err);
    }
  };

  const openFile = async (path: string) => {
    const mine = ++token;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const name = path.split('/').pop()!;
    panel.classList.remove('is-readme');
    panel.innerHTML = '<p class="st-viewer__note">Loading</p>';
    try {
      const entry = await gh<RepoEntry>(`/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
      if (mine !== token) return;
      const head = `<div class="st-repo__filehead">${crumbs(path)}<div><small>${esc(size(entry.size))}</small><a class="st-btn st-btn--small" href="${esc(entry.html_url)}" target="_blank" rel="noopener">Open on GitHub</a></div></div>`;
      let content: string;
      if (MARKDOWN_EXT.test(name) && entry.size <= MAX_PREVIEW) {
        const html = await gh<string>(`/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, 'application/vnd.github.html+json');
        content = `<div class="st-repo__mdwrap">${markdownFrame(html, ref, branch, parent)}</div>`;
      } else if (IMAGE_EXT.test(name) && entry.download_url) {
        content = `<div class="st-repo__image"><img src="${esc(entry.download_url)}" alt="${esc(name)}" /></div>`;
      } else if ((TEXT_EXT.test(name) || !name.includes('.')) && entry.download_url && entry.size <= MAX_PREVIEW) {
        const r = await fetch(entry.download_url);
        if (!r.ok) throw new Error(`GitHub returned ${r.status}.`);
        const text = await r.text();
        content = `<pre class="st-repo__code">${esc(text)}</pre>`;
      } else {
        content = `<div class="st-repo__empty"><p>${entry.size > MAX_PREVIEW ? 'This file is too large to preview' : 'No preview for this file type'}</p></div>`;
      }
      if (mine !== token) return;
      panel.innerHTML = `<div class="st-repo__list st-repo__file">${head}${content}</div>`;
    } catch (err) {
      if (mine === token) panel.innerHTML = failed(err);
    }
  };

  view.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const tabButton = target.closest<HTMLElement>('[data-tab]');
    if (tabButton) { void show(tabButton.dataset.tab!, tabButton.dataset.tab === 'files' ? '' : dir); return; }
    const folder = target.closest<HTMLElement>('[data-dir]');
    if (folder) { void show('files', folder.dataset.dir!); return; }
    const file = target.closest<HTMLElement>('[data-file]');
    if (file) void openFile(file.dataset.file!);
  });
  await show('readme');
}
