// In page viewer for team documents: PDFs, images, video, audio, text, office
// files, Google Docs and Drive files, Figma, YouTube, Loom, and a link card for
// everything else. Each document's preview is built ahead of time in its own
// pane on one hidden stage, and opening a document shows that pane in place:
// moving a loaded frame anywhere else in the page would load it again.
import { getDocument, GlobalWorkerOptions, PDFWorker, type PDFDocumentProxy, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { type TeamDocument } from './api';
import { esc } from './ui';
import { bindDriveLinks, isGoogleDriveUrl, prepareDriveAccess, driveAccountUrl } from './drive-access';
import { documentUrl, documentUrlUntil } from './document-files';

GlobalWorkerOptions.workerSrc = workerUrl;

interface Preview {
  key: string;
  pane: HTMLElement;
  ready: Promise<void>;
  url?: string;
  until?: number;
  failed?: boolean;
  pdf?: PDFDocumentLoadingTask;
  observer?: IntersectionObserver;
  wake?: () => void;
}

const previews = new Map<string, Preview>();
let overlay: HTMLElement | null = null;
let shown: Preview | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let pdfWorker: PDFWorker | null = null;
let warming = 0;

const previewKey = (d: TeamDocument) => [d.kind, d.url, d.storage_path, d.mime].join('|');
// PDFs and media keep reading from their signed link, so they are rebuilt once it runs out
const stale = (p: Preview) => p.until !== undefined && p.until < Date.now();
const idle = () => new Promise<void>(resolve => { if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 2000 }); else setTimeout(resolve, 200); });

/** One viewer for the page. It stays in place, hidden, between documents so prepared previews survive. */
function stage() {
  if (overlay?.isConnected) return overlay;
  if (overlay) disposePreviews();
  overlay = document.createElement('div');
  overlay.className = 'st-viewer is-idle';
  overlay.inert = true;
  overlay.innerHTML = `<div class="st-viewer__bar"></div><div class="st-viewer__stage"></div>`;
  document.body.appendChild(overlay);
  bindDriveLinks(overlay);
  overlay.addEventListener('click', e => { if ((e.target as Element).closest('#st-viewer-close')) closeViewer(); });
  return overlay;
}

/** The document's preview: the one already loaded or loading, or a new one. */
function prepare(d: TeamDocument) {
  const host = stage().querySelector<HTMLElement>('.st-viewer__stage')!;
  const key = previewKey(d);
  const hit = previews.get(d.id);
  if (hit && hit.key === key && !hit.failed && !stale(hit)) return hit;
  void drop(d.id);
  const pane = document.createElement('div');
  pane.className = 'st-viewer__pane';
  pane.innerHTML = '<p class="st-viewer__note">Loading</p>';
  host.appendChild(pane);
  const p: Preview = { key, pane, ready: Promise.resolve() };
  previews.set(d.id, p);
  // A failed preview shows its reason but is not kept, so opening it again tries again
  p.ready = build(p, d).catch(err => {
    p.failed = true;
    if (pane.isConnected) pane.innerHTML = `<p class="st-viewer__note">${esc((err as Error).message)}</p>`;
  });
  return p;
}

async function build(p: Preview, d: TeamDocument) {
  const { pane } = p;
  if (d.kind === 'link') {
    if (isGoogleDriveUrl(d.url || '')) await prepareDriveAccess();
    if (!pane.isConnected) return;
    renderLink(pane, d);
  } else {
    if (!d.storage_path) throw new Error('This document has no file.');
    const url = await documentUrl(d.storage_path);
    if (!pane.isConnected) return;
    p.url = url;
    if (shown === p) overlay?.querySelector('#st-viewer-open')?.setAttribute('href', url);
    await renderFile(p, d, url);
  }
  await loaded(pane);
}

/** Frames load a couple at a time: wait for this one, or move on from a slow one. */
function loaded(pane: HTMLElement) {
  const frame = pane.querySelector('iframe');
  return frame ? new Promise<void>(resolve => { frame.addEventListener('load', () => resolve(), { once: true }); setTimeout(resolve, 15000); }) : Promise.resolve();
}

function drop(id: string) {
  const p = previews.get(id);
  if (!p) return;
  previews.delete(id);
  p.observer?.disconnect();
  p.pane.remove();
  return p.pdf?.destroy().catch(() => { /* already gone */ });
}

/** Hidden previews keep their page, but nothing may keep playing. */
function hide(p: Preview) {
  p.pane.classList.remove('is-shown');
  p.pane.querySelectorAll<HTMLMediaElement>('video, audio').forEach(m => m.pause());
  p.pane.querySelectorAll<HTMLIFrameElement>('iframe[data-media]').forEach(f => { f.src = f.src; });
}

/**
 * Build previews in the background, two at a time while the browser is idle, so
 * opening any of them is instant. Loaded previews are kept and never reloaded.
 * Phones prepare fewer and Save-Data none; the rest still build when opened.
 */
export function preparePreviews(docs: TeamDocument[]) {
  const run = ++warming;
  const wanted = new Set(docs.map(d => d.id));
  for (const [id, p] of previews) if (!wanted.has(id) && p !== shown) void drop(id);
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const limit = saveData ? 0 : matchMedia('(pointer: coarse)').matches ? 8 : 24;
  const queue = docs.filter(d => { const p = previews.get(d.id); return !p || (p !== shown && !p.failed && (p.key !== previewKey(d) || stale(p))); });
  const next = async (): Promise<void> => {
    const d = queue.shift();
    if (!d || run !== warming) return;
    if (previews.has(d.id) || previews.size < limit) {
      await idle();
      if (run === warming && previews.get(d.id) !== shown) await prepare(d).ready;
    }
    return next();
  };
  void next(); void next();
}

/** Drop every prepared preview: on sign out, account changes, and before Astro swaps the page. */
export function disposePreviews() {
  closeViewer();
  warming++;
  const gone = [...previews.keys()].map(drop);
  overlay?.remove();
  overlay = null;
  const worker = pdfWorker;
  pdfWorker = null;
  if (worker) void Promise.allSettled(gone).then(() => worker.destroy());
}

export function closeViewer() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  if (!shown) return;
  hide(shown);
  shown = null;
  overlay?.classList.add('is-idle');
  if (overlay) overlay.inert = true;
  document.body.style.overflow = '';
}

export function openViewer(d: TeamDocument, extras: { subtitle?: string } = {}) {
  const view = stage();
  if (shown) hide(shown);
  const p = prepare(d);
  view.querySelector('.st-viewer__bar')!.innerHTML = `
      <div class="st-viewer__title">
        <span class="st-viewer__name">${esc(d.title)}</span>
        ${extras.subtitle ? `<span class="st-viewer__sub">${esc(extras.subtitle)}</span>` : ''}
      </div>
      <div class="st-viewer__actions">
        ${d.drive_url ? `<a class="st-btn st-btn--small" data-team-drive href="${esc(d.drive_url)}" target="_blank" rel="noopener" title="Open in Google Drive">Open Drive</a>` : ''}
        <a class="st-btn st-btn--small" id="st-viewer-open" ${d.kind === 'link' && isGoogleDriveUrl(d.url || '') ? 'data-team-drive' : ''} href="${esc(d.kind === 'link' ? d.url || '#' : p.url || '#')}" target="_blank" rel="noopener" title="Open in new tab">Open</a>
        <button type="button" class="st-btn st-btn--small st-btn--primary" id="st-viewer-close">Close</button>
      </div>`;
  shown = p;
  p.pane.classList.add('is-shown');
  p.wake?.();
  view.classList.remove('is-idle');
  view.inert = false;
  document.body.style.overflow = 'hidden';
  if (!keyHandler) {
    keyHandler = e => { if (e.key === 'Escape') closeViewer(); };
    window.addEventListener('keydown', keyHandler);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
async function renderFile(p: Preview, d: TeamDocument, url: string) {
  const { pane } = p;
  const ext = ((d.storage_path || '').split('.').pop() || '').toLowerCase();
  const mime = d.mime || '';
  const until = documentUrlUntil(d.storage_path || '');
  if (ext === 'pdf' || mime === 'application/pdf') { p.until = until; await renderPdf(p, url); return; }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) {
    pane.innerHTML = `<div class="st-viewer__center"><img class="st-viewer__img" src="${esc(url)}" alt="${esc(d.title)}" /></div>`;
    return;
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
    p.until = until;
    pane.innerHTML = `<div class="st-viewer__center"><video class="st-viewer__video" controls playsinline preload="metadata" src="${esc(url)}"></video></div>`;
    return;
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) {
    p.until = until;
    pane.innerHTML = `<div class="st-viewer__center"><audio controls preload="metadata" src="${esc(url)}"></audio></div>`;
    return;
  }
  if (['txt', 'md', 'log', 'json', 'csv', 'tsv'].includes(ext) || mime.startsWith('text/') || mime === 'application/json') {
    const text = await (await fetch(url)).text();
    if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv') { pane.innerHTML = `<div class="st-viewer__sheet">${csvTable(text, ext === 'tsv' ? '\t' : ',')}</div>`; return; }
    let shownText = text;
    if (ext === 'json' || mime === 'application/json') { try { shownText = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ } }
    pane.innerHTML = `<pre class="st-viewer__text">${esc(shownText.slice(0, 200000))}</pre>`;
    return;
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    // Office files render through Microsoft's document viewer from the signed link
    const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    pane.innerHTML = `<iframe class="st-viewer__frame" src="${esc(src)}" allowfullscreen></iframe><p class="st-viewer__hint">If this stays blank, open it in a new tab.</p>`;
    return;
  }
  pane.innerHTML = `<div class="st-viewer__center"><div class="st-viewer__card"><p class="st-viewer__note">No preview for this file type</p><a class="st-btn st-btn--primary" href="${esc(url)}" target="_blank" rel="noopener" title="Open in new tab">Open</a></div></div>`;
}

async function renderPdf(p: Preview, url: string) {
  const { pane } = p;
  // Prepared PDFs share one worker thread instead of one each
  const worker = pdfWorker ||= new PDFWorker();
  p.pdf = getDocument({ url, worker, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536 });
  let doc: PDFDocumentProxy;
  try {
    doc = await p.pdf.promise;
  } catch {
    if (!pane.isConnected) return;
    p.pdf = getDocument({ url, worker, disableRange: true, disableStream: true });
    doc = await p.pdf.promise;
  }
  if (!pane.isConnected) return;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  pane.innerHTML = `<div class="st-viewer__pages"></div>`;
  const pages = pane.firstElementChild as HTMLElement;
  const width = Math.min(pages.clientWidth || 800, 900);
  const scale = width / base.width;
  const height = Math.round(base.height * scale);
  for (let n = 1; n <= doc.numPages; n++) {
    const holder = document.createElement('div');
    holder.className = 'st-viewer__page';
    holder.dataset.page = String(n);
    holder.style.width = `${width}px`;
    holder.style.height = `${height}px`;
    holder.innerHTML = `<span class="st-viewer__pagenum">${n} of ${doc.numPages}</span>`;
    pages.appendChild(holder);
  }
  const rendered = new Set<number>();
  const renderPage = async (holder: HTMLElement) => {
    const n = Number(holder.dataset.page);
    if (rendered.has(n)) return;
    rendered.add(n);
    const page = await doc.getPage(n);
    if (!pane.isConnected) return;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    holder.style.height = `${viewport.height}px`;
    holder.prepend(canvas);
  };
  // Only the first page draws ahead of time; the rest draw as they scroll into view once opened
  const holders = [...pages.children] as HTMLElement[];
  p.wake = () => {
    if (p.observer) return;
    p.observer = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) void renderPage(e.target as HTMLElement).catch(() => { /* dropped */ });
    }, { root: pane, rootMargin: '600px 0px' });
    holders.forEach(h => p.observer!.observe(h));
  };
  await renderPage(holders[0]);
  if (shown === p) p.wake();
}

function csvTable(text: string, sep: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length && rows.length < 2000; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...rest] = rows;
  if (!head) return '<p class="st-viewer__note">Empty file</p>';
  return `<table class="st-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
function renderLink(pane: HTMLElement, d: TeamDocument) {
  const url = d.url || '';
  const embed = embedFor(url);
  if (embed) {
    // Players reload when hidden, so a video never keeps playing behind the page
    const media = embed.media && !/^(application|image|text)\//.test(d.mime || '');
    pane.innerHTML = `<iframe class="st-viewer__frame" src="${esc(driveAccountUrl(embed.src))}" title="${esc(d.title)}" allow="autoplay; fullscreen; clipboard-write" allowfullscreen${media ? ' data-media' : ''}></iframe><p class="st-viewer__hint">${esc(embed.hint)}</p>`;
    return;
  }
  pane.innerHTML = `
    <div class="st-viewer__center">
      <div class="st-viewer__card">
        <p class="st-viewer__note" style="margin-bottom:0.4rem;">This site can’t be previewed here.</p>
        <p class="st-viewer__url">${esc(url)}</p>
        ${d.notes ? `<p class="st-viewer__note">${esc(d.notes)}</p>` : ''}
        <a class="st-btn st-btn--primary" ${isGoogleDriveUrl(url) ? 'data-team-drive' : ''} href="${esc(url)}" target="_blank" rel="noopener" title="Open in new tab">Open</a>
      </div>
    </div>`;
}

function embedFor(url: string): { src: string; hint: string; media?: boolean } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const drivePreview = 'If Google asks you to sign in, open it in a new tab.';
  let m: RegExpMatchArray | null;
  if (host === 'docs.google.com' && (m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`, hint: drivePreview };
  }
  if (host === 'drive.google.com' && (m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://drive.google.com/file/d/${m[1]}/preview`, hint: drivePreview, media: true };
  }
  if (host === 'drive.google.com' && (m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://drive.google.com/embeddedfolderview?id=${m[1]}#list`, hint: drivePreview };
  }
  if (host === 'figma.com' && /^\/(file|design|proto|board|slides|deck)\//.test(u.pathname)) {
    return { src: `https://www.figma.com/embed?embed_host=xrclub&url=${encodeURIComponent(url)}`, hint: '' };
  }
  if ((host === 'youtube.com' || host === 'm.youtube.com') && u.searchParams.get('v')) {
    return { src: `https://www.youtube.com/embed/${u.searchParams.get('v')}`, hint: '', media: true };
  }
  if (host === 'youtu.be') return { src: `https://www.youtube.com/embed/${u.pathname.slice(1)}`, hint: '', media: true };
  if (host === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) return { src: `https://player.vimeo.com/video/${m[1]}`, hint: '', media: true };
  if (host === 'loom.com' && (m = u.pathname.match(/^\/share\/([A-Za-z0-9]+)/))) return { src: `https://www.loom.com/embed/${m[1]}`, hint: '', media: true };
  if (host === 'canva.com' && /\/design\//.test(u.pathname)) return { src: url.replace(/\/(edit|view).*$/, '/view?embed'), hint: '' };
  if (host === 'miro.com' && (m = u.pathname.match(/\/app\/board\/([A-Za-z0-9_=-]+)/))) return { src: `https://miro.com/app/live-embed/${m[1]}/`, hint: '' };
  if (/\.pdf($|\?)/i.test(url)) return { src: url, hint: '' };
  return null;
}
