// In page viewer for team documents: PDFs, images, video, audio, text, office
// files, Google Docs and Drive files, Figma, YouTube, Loom, and a link card for
// everything else.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db, type TeamDocument } from './api';
import { esc } from './ui';

GlobalWorkerOptions.workerSrc = workerUrl;

const BUCKET = 'suits-docs';
let overlay: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let pdfDoc: PDFDocumentProxy | null = null;
let pdfTask: PDFDocumentLoadingTask | null = null;
let observer: IntersectionObserver | null = null;

export function closeViewer() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  observer?.disconnect();
  observer = null;
  try { void pdfTask?.destroy(); } catch { /* already gone */ }
  pdfTask = null;
  pdfDoc = null;
  overlay?.remove();
  overlay = null;
  document.body.style.overflow = '';
}

export async function openViewer(d: TeamDocument, extras: { subtitle?: string } = {}) {
  closeViewer();
  overlay = document.createElement('div');
  overlay.className = 'st-viewer';
  overlay.innerHTML = `
    <div class="st-viewer__bar">
      <div class="st-viewer__title">
        <span class="st-viewer__name">${esc(d.title)}</span>
        ${extras.subtitle ? `<span class="st-viewer__sub">${esc(extras.subtitle)}</span>` : ''}
      </div>
      <div class="st-viewer__actions">
        ${d.drive_url ? `<a class="st-btn st-btn--small" href="${esc(d.drive_url)}" target="_blank" rel="noopener">In Drive</a>` : ''}
        <a class="st-btn st-btn--small" id="st-viewer-open" href="${esc(d.kind === 'link' ? d.url || '#' : '#')}" target="_blank" rel="noopener">Open in new tab</a>
        <button type="button" class="st-btn st-btn--small st-btn--primary" id="st-viewer-close">Close</button>
      </div>
    </div>
    <div class="st-viewer__body" id="st-viewer-body"><p class="st-viewer__note">Loading.</p></div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.querySelector('#st-viewer-close')!.addEventListener('click', closeViewer);
  keyHandler = e => { if (e.key === 'Escape') closeViewer(); };
  window.addEventListener('keydown', keyHandler);

  const body = overlay.querySelector<HTMLElement>('#st-viewer-body')!;
  const openLink = overlay.querySelector<HTMLAnchorElement>('#st-viewer-open')!;
  try {
    if (d.kind === 'link') {
      renderLink(body, d);
      return;
    }
    if (!d.storage_path) throw new Error('This document has no file.');
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 3600);
    if (error || !data) throw error || new Error('Could not open the file');
    if (!overlay) return;
    openLink.href = data.signedUrl;
    await renderFile(body, d, data.signedUrl);
  } catch (err) {
    body.innerHTML = `<p class="st-viewer__note">${esc((err as Error).message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
async function renderFile(body: HTMLElement, d: TeamDocument, url: string) {
  const ext = ((d.storage_path || '').split('.').pop() || '').toLowerCase();
  const mime = d.mime || '';
  if (ext === 'pdf' || mime === 'application/pdf') { await renderPdf(body, url); return; }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) {
    body.innerHTML = `<div class="st-viewer__center"><img class="st-viewer__img" src="${esc(url)}" alt="${esc(d.title)}" /></div>`;
    return;
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
    body.innerHTML = `<div class="st-viewer__center"><video class="st-viewer__video" controls playsinline src="${esc(url)}"></video></div>`;
    return;
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) {
    body.innerHTML = `<div class="st-viewer__center"><audio controls src="${esc(url)}"></audio></div>`;
    return;
  }
  if (['txt', 'md', 'log', 'json', 'csv', 'tsv'].includes(ext) || mime.startsWith('text/') || mime === 'application/json') {
    const text = await (await fetch(url)).text();
    if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv') { body.innerHTML = `<div class="st-viewer__sheet">${csvTable(text, ext === 'tsv' ? '\t' : ',')}</div>`; return; }
    let shown = text;
    if (ext === 'json' || mime === 'application/json') { try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ } }
    body.innerHTML = `<pre class="st-viewer__text">${esc(shown.slice(0, 200000))}</pre>`;
    return;
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    // Office files render through Microsoft's document viewer from the signed link
    const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    body.innerHTML = `<iframe class="st-viewer__frame" src="${esc(src)}" allowfullscreen></iframe><p class="st-viewer__hint">Rendered by the Office viewer. If it stays blank, use Open in new tab.</p>`;
    return;
  }
  body.innerHTML = `<div class="st-viewer__center"><div class="st-viewer__card"><p class="st-viewer__note">No preview for this file type.</p><a class="st-btn st-btn--primary" href="${esc(url)}" target="_blank" rel="noopener">Open in new tab</a></div></div>`;
}

async function renderPdf(body: HTMLElement, url: string) {
  pdfTask = getDocument({ url });
  pdfDoc = await pdfTask.promise;
  if (!overlay) return;
  const doc = pdfDoc;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  body.innerHTML = `<div class="st-viewer__pages" id="st-viewer-pages"></div>`;
  const pages = body.querySelector<HTMLElement>('#st-viewer-pages')!;
  const width = Math.min(pages.clientWidth || 800, 900);
  const scale = width / base.width;
  const height = Math.round(base.height * scale);
  for (let p = 1; p <= doc.numPages; p++) {
    const holder = document.createElement('div');
    holder.className = 'st-viewer__page';
    holder.dataset.page = String(p);
    holder.style.width = `${width}px`;
    holder.style.height = `${height}px`;
    holder.innerHTML = `<span class="st-viewer__pagenum">${p} of ${doc.numPages}</span>`;
    pages.appendChild(holder);
  }
  const rendered = new Set<number>();
  const renderPage = async (holder: HTMLElement) => {
    const p = Number(holder.dataset.page);
    if (rendered.has(p) || !pdfDoc) return;
    rendered.add(p);
    const page = await pdfDoc.getPage(p);
    if (!overlay) return;
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
  observer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) void renderPage(e.target as HTMLElement);
  }, { root: body, rootMargin: '600px 0px' });
  pages.querySelectorAll<HTMLElement>('.st-viewer__page').forEach(h => observer!.observe(h));
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
  if (!head) return '<p class="st-viewer__note">Empty file.</p>';
  return `<table class="st-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
function renderLink(body: HTMLElement, d: TeamDocument) {
  const url = d.url || '';
  const embed = embedFor(url);
  if (embed) {
    body.innerHTML = `<iframe class="st-viewer__frame" src="${esc(embed.src)}" allow="autoplay; fullscreen; clipboard-write" allowfullscreen></iframe><p class="st-viewer__hint">${esc(embed.hint)}</p>`;
    return;
  }
  body.innerHTML = `
    <div class="st-viewer__center">
      <div class="st-viewer__card">
        <p class="st-viewer__note" style="margin-bottom:0.4rem;">This site does not allow itself to be shown inside another page.</p>
        <p class="st-viewer__url">${esc(url)}</p>
        ${d.notes ? `<p class="st-viewer__note">${esc(d.notes)}</p>` : ''}
        <a class="st-btn st-btn--primary" href="${esc(url)}" target="_blank" rel="noopener">Open in new tab</a>
      </div>
    </div>`;
}

function embedFor(url: string): { src: string; hint: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const drivePreview = 'Shown with your Google account. If it asks you to sign in, use Open in new tab.';
  let m: RegExpMatchArray | null;
  if (host === 'docs.google.com' && (m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`, hint: drivePreview };
  }
  if (host === 'drive.google.com' && (m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://drive.google.com/file/d/${m[1]}/preview`, hint: drivePreview };
  }
  if (host === 'drive.google.com' && (m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://drive.google.com/embeddedfolderview?id=${m[1]}#list`, hint: drivePreview };
  }
  if (host === 'figma.com' && /^\/(file|design|proto|board|slides|deck)\//.test(u.pathname)) {
    return { src: `https://www.figma.com/embed?embed_host=xrclub&url=${encodeURIComponent(url)}`, hint: 'Figma viewer. Anyone with the file link can pan and zoom here.' };
  }
  if ((host === 'youtube.com' || host === 'm.youtube.com') && u.searchParams.get('v')) {
    return { src: `https://www.youtube.com/embed/${u.searchParams.get('v')}`, hint: '' };
  }
  if (host === 'youtu.be') return { src: `https://www.youtube.com/embed/${u.pathname.slice(1)}`, hint: '' };
  if (host === 'vimeo.com' && (m = u.pathname.match(/^\/(\d+)/))) return { src: `https://player.vimeo.com/video/${m[1]}`, hint: '' };
  if (host === 'loom.com' && (m = u.pathname.match(/^\/share\/([A-Za-z0-9]+)/))) return { src: `https://www.loom.com/embed/${m[1]}`, hint: '' };
  if (host === 'canva.com' && /\/design\//.test(u.pathname)) return { src: url.replace(/\/(edit|view).*$/, '/view?embed'), hint: 'Canva viewer.' };
  if (host === 'miro.com' && (m = u.pathname.match(/\/app\/board\/([A-Za-z0-9_=-]+)/))) return { src: `https://miro.com/app/live-embed/${m[1]}/`, hint: 'Miro board.' };
  if (/\.pdf($|\?)/i.test(url)) return { src: url, hint: '' };
  return null;
}
