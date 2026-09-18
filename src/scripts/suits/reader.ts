// The Proposal reader: both NASA PDFs, one page at a time, with the parts that
// matter for the reader's chosen role marked on the page.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { state } from './api';
import { esc } from './ui';
import { READER_DOCS, READER_ROLES, type DocKey, type Highlight } from './reader-content';

GlobalWorkerOptions.workerSrc = workerUrl;

const ROLE_KEY = 'xr-suits-role';

interface TextItem { str: string; transform: number[]; width: number; height: number }

let roleKey: string | null = null;
let docKey: DocKey = 'guidelines';
let pageNo = 1;
let onlyMine = false;
const docs = new Map<DocKey, Promise<PDFDocumentProxy>>();
const texts = new Map<string, Promise<TextItem[]>>();
let renderTask: RenderTask | null = null;
let renderSeq = 0;
let mounted: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let resizeTimer = 0;

try { roleKey = localStorage.getItem(ROLE_KEY); } catch { /* ignore */ }

function role() {
  return READER_ROLES.find(r => r.key === roleKey) || null;
}

function doc() {
  return READER_DOCS.find(d => d.key === docKey)!;
}

function highlightsFor(d: DocKey, p: number): Highlight[] {
  const r = role();
  return r ? r.sections.filter(s => s.doc === d && s.page === p) : [];
}

function pagesFor(d: DocKey) {
  const r = role();
  return r ? [...new Set(r.sections.filter(s => s.doc === d).map(s => s.page))].sort((a, b) => a - b) : [];
}

function getDoc(key: DocKey) {
  if (!docs.has(key)) {
    const file = READER_DOCS.find(d => d.key === key)!.file;
    docs.set(key, getDocument({ url: `${state.base}${encodeURIComponent(file)}` }).promise);
  }
  return docs.get(key)!;
}

async function getText(key: DocKey, p: number, page: PDFPageProxy) {
  const id = `${key}:${p}`;
  if (!texts.has(id)) texts.set(id, page.getTextContent().then(t => (t.items as TextItem[]).filter(i => 'str' in i)));
  return texts.get(id)!;
}

export function leave() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  mounted = null;
  renderTask?.cancel();
  renderTask = null;
}

export async function render(host: HTMLElement) {
  leave();
  mounted = host;
  host.innerHTML = `
    <div class="st-reader">
      <div class="st-reader__head">
        <div>
          <h2 class="st-h1">Proposal</h2>
          <p class="st-lead" style="margin:0;">Both NASA documents, a page at a time. Pick your role and the parts written for you are marked on each page.</p>
        </div>
      </div>
      <div class="st-reader__roles" id="st-reader-roles"></div>
      <div class="st-reader__tools">
        <div class="st-segment" id="st-reader-docs">${READER_DOCS.map(d => `<button type="button" data-doc="${d.key}">${esc(d.short)}</button>`).join('')}</div>
        <label class="st-reader__only" id="st-reader-only"><input type="checkbox" /><span class="st-reader__only-box"></span><span>Only my pages</span></label>
      </div>
      <div class="st-reader__stage" id="st-reader-stage">
        <button type="button" class="st-reader__flip st-reader__flip--prev" id="st-reader-prev" aria-label="Previous page"><span></span></button>
        <div class="st-reader__page" id="st-reader-page">
          <canvas id="st-reader-canvas"></canvas>
          <div class="st-reader__marks" id="st-reader-marks"></div>
          <div class="st-reader__loading" id="st-reader-loading">Loading page</div>
        </div>
        <button type="button" class="st-reader__flip st-reader__flip--next" id="st-reader-next" aria-label="Next page"><span></span></button>
      </div>
      <div class="st-reader__bar">
        <div class="st-reader__flipbtns">
          <button type="button" class="st-btn st-btn--small" data-flip="-1">Previous</button>
          <span class="st-reader__count" id="st-reader-count"></span>
          <button type="button" class="st-btn st-btn--small" data-flip="1">Next</button>
        </div>
        <div class="st-reader__dots" id="st-reader-dots"></div>
      </div>
      <div class="st-reader__sections" id="st-reader-sections"></div>
    </div>`;

  // Roles
  const rolesEl = host.querySelector<HTMLElement>('#st-reader-roles')!;
  const drawRoles = () => {
    rolesEl.innerHTML = `<span class="st-reader__roles-label">${role() ? 'Your role' : 'Choose your role'}</span>` + READER_ROLES.map(r => `<button type="button" class="st-chip${r.key === roleKey ? ' is-active' : ''}" data-role="${r.key}">${esc(r.name)}</button>`).join('');
  };
  drawRoles();
  rolesEl.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-role]');
    if (!b) return;
    roleKey = b.dataset.role === roleKey ? null : b.dataset.role!;
    try { roleKey ? localStorage.setItem(ROLE_KEY, roleKey) : localStorage.removeItem(ROLE_KEY); } catch { /* ignore */ }
    drawRoles();
    if (onlyMine && roleKey && !pagesFor(docKey).includes(pageNo)) pageNo = pagesFor(docKey)[0] || 1;
    void show();
  });

  // Document switch
  host.querySelector('#st-reader-docs')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-doc]');
    if (!b || b.dataset.doc === docKey) return;
    docKey = b.dataset.doc as DocKey;
    pageNo = onlyMine && pagesFor(docKey).length ? pagesFor(docKey)[0] : 1;
    void show();
  });

  // Only my pages
  const only = host.querySelector<HTMLInputElement>('#st-reader-only input')!;
  only.checked = onlyMine;
  only.addEventListener('change', () => {
    onlyMine = only.checked;
    if (onlyMine && role() && !pagesFor(docKey).includes(pageNo)) {
      const next = pagesFor(docKey).find(p => p >= pageNo) ?? pagesFor(docKey)[0];
      if (next) pageNo = next;
    }
    void show();
  });

  // Flipping: buttons, keys, swipe
  host.querySelectorAll<HTMLElement>('[data-flip], #st-reader-prev, #st-reader-next').forEach(b => b.addEventListener('click', () => flip(b.dataset.flip ? Number(b.dataset.flip) : b.id.endsWith('prev') ? -1 : 1)));
  keyHandler = e => {
    if (!mounted || mounted.closest('.st-view')?.hasAttribute('hidden')) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); flip(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); flip(-1); }
  };
  window.addEventListener('keydown', keyHandler);
  const stage = host.querySelector<HTMLElement>('#st-reader-stage')!;
  let startX = 0, startY = 0, tracking = false;
  stage.addEventListener('pointerdown', e => { startX = e.clientX; startY = e.clientY; tracking = true; });
  stage.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 80) flip(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { tracking = false; });

  window.addEventListener('resize', onResize);
  await show();
}

function onResize() {
  if (!mounted) { window.removeEventListener('resize', onResize); return; }
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { void show(); }, 150);
}

/** Order of pages when flipping: this document's pages (or only the role's), then the next document. */
function sequence(): Array<{ doc: DocKey; page: number }> {
  const out: Array<{ doc: DocKey; page: number }> = [];
  for (const d of READER_DOCS) {
    const pages = onlyMine && role() ? pagesFor(d.key) : Array.from({ length: d.pages }, (_, i) => i + 1);
    for (const p of pages) out.push({ doc: d.key, page: p });
  }
  return out;
}

function flip(dir: number) {
  const seq = sequence();
  let i = seq.findIndex(s => s.doc === docKey && s.page === pageNo);
  if (i < 0) i = dir > 0 ? -1 : seq.length;
  const next = seq[i + dir];
  if (!next) return;
  docKey = next.doc;
  pageNo = next.page;
  void show();
}

async function show() {
  const host = mounted;
  if (!host) return;
  const seq = renderSeq = renderSeq + 1;
  const d = doc();
  pageNo = Math.max(1, Math.min(d.pages, pageNo));

  host.querySelectorAll<HTMLElement>('#st-reader-docs [data-doc]').forEach(b => b.classList.toggle('is-active', b.dataset.doc === docKey));
  host.querySelector<HTMLElement>('#st-reader-only')!.hidden = !role();
  host.querySelector<HTMLElement>('#st-reader-count')!.textContent = `Page ${pageNo} of ${d.pages}`;

  const order = sequence();
  const idx = order.findIndex(s => s.doc === docKey && s.page === pageNo);
  (host.querySelector('#st-reader-prev') as HTMLButtonElement).disabled = idx <= 0;
  (host.querySelector('#st-reader-next') as HTMLButtonElement).disabled = idx < 0 || idx >= order.length - 1;
  host.querySelectorAll<HTMLButtonElement>('[data-flip]').forEach(b => { b.disabled = Number(b.dataset.flip) < 0 ? idx <= 0 : idx < 0 || idx >= order.length - 1; });

  // Dots
  const mine = new Set(pagesFor(docKey));
  const dots = host.querySelector<HTMLElement>('#st-reader-dots')!;
  dots.innerHTML = Array.from({ length: d.pages }, (_, i) => i + 1).map(p => `<button type="button" class="st-reader__dot${p === pageNo ? ' is-current' : ''}${mine.has(p) ? ' is-mine' : ''}" data-page="${p}" aria-label="Page ${p}"></button>`).join('');
  dots.querySelectorAll<HTMLElement>('[data-page]').forEach(b => b.addEventListener('click', () => { pageNo = Number(b.dataset.page); void show(); }));

  // Sections list
  const list = host.querySelector<HTMLElement>('#st-reader-sections')!;
  const r = role();
  if (r) {
    const inDoc = r.sections.filter(s => s.doc === docKey);
    const seen = new Set<string>();
    const rows = inDoc.filter(s => { const k = `${s.label}:${s.page}`; if (seen.has(k)) return false; seen.add(k); return true; });
    list.innerHTML = rows.length
      ? `<p class="st-reader__sections-label">For ${esc(r.name)} in the ${esc(d.short)}</p><div class="st-reader__seclist">${rows.map(s => `<button type="button" class="st-reader__sec${s.page === pageNo ? ' is-current' : ''}" data-page="${s.page}"><span>${esc(s.label)}</span><span class="st-reader__sec-page">p. ${s.page}</span></button>`).join('')}</div>`
      : `<p class="st-reader__sections-label">Nothing in the ${esc(d.short)} is aimed at ${esc(r.name)} specifically. Read it once for context.</p>`;
    list.querySelectorAll<HTMLElement>('[data-page]').forEach(b => b.addEventListener('click', () => { pageNo = Number(b.dataset.page); void show(); }));
  } else {
    list.innerHTML = '';
  }

  // Page
  const pageEl = host.querySelector<HTMLElement>('#st-reader-page')!;
  const canvas = host.querySelector<HTMLCanvasElement>('#st-reader-canvas')!;
  const marks = host.querySelector<HTMLElement>('#st-reader-marks')!;
  const loading = host.querySelector<HTMLElement>('#st-reader-loading')!;
  loading.hidden = false;
  marks.innerHTML = '';
  try {
    const pdf = await getDoc(docKey);
    if (seq !== renderSeq) return;
    const page = await pdf.getPage(pageNo);
    if (seq !== renderSeq) return;
    const width = pageEl.clientWidth || 600;
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    pageEl.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderTask?.cancel();
    renderTask = page.render({ canvasContext: ctx, viewport, canvas });
    await renderTask.promise.catch(() => { /* cancelled */ });
    if (seq !== renderSeq) return;
    loading.hidden = true;

    // Highlights
    const items = await getText(docKey, pageNo, page);
    if (seq !== renderSeq) return;
    marks.innerHTML = bands(items, viewport, highlightsFor(docKey, pageNo));

    // Warm the next page
    const next = order[idx + 1];
    if (next && next.doc === docKey) void pdf.getPage(next.page);
  } catch (err) {
    if (seq !== renderSeq) return;
    loading.hidden = false;
    loading.textContent = `Could not load the page: ${(err as Error).message}`;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Translucent bands over the page for each highlight, positioned from the page's text. */
function bands(items: TextItem[], viewport: { convertToViewportPoint(x: number, y: number): number[]; width: number }, highlights: Highlight[]) {
  if (!highlights.length || !items.length) return '';
  const normed = items.map(i => norm(i.str));
  const starts: number[] = [];
  let joined = '';
  for (const n of normed) { starts.push(joined.length); joined += n; }
  const itemAt = (phrase: string, after = 0) => {
    const idx = joined.indexOf(norm(phrase), after);
    if (idx < 0) return null;
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= idx) i++;
    return { item: items[i], index: i, at: idx };
  };
  const top = (it: TextItem) => viewport.convertToViewportPoint(it.transform[4], it.transform[5] + it.height)[1];
  const bottom = (it: TextItem) => viewport.convertToViewportPoint(it.transform[4], it.transform[5])[1];
  const content = items.filter(i => i.str.trim());
  const left = Math.max(0, Math.min(...content.map(i => viewport.convertToViewportPoint(i.transform[4], i.transform[5])[0])) - 8);
  const right = Math.min(viewport.width, Math.max(...content.map(i => viewport.convertToViewportPoint(i.transform[4] + i.width, i.transform[5])[0])) + 8);
  const header = normed[0] === 'nationalaeronauticsandspaceadministration' ? 1 : 0;
  const pageBottom = Math.max(...content.map(bottom)) + 4;

  return highlights.map(h => {
    let y1: number;
    let fromIdx = header;
    if (h.from) {
      const f = itemAt(h.from);
      if (!f) return '';
      y1 = top(f.item) - 6;
      fromIdx = f.index;
    } else {
      y1 = top(content[header] || content[0]) - 6;
    }
    let y2 = pageBottom;
    if (h.to) {
      const t = itemAt(h.to, starts[fromIdx] + 1);
      if (t && t.index > fromIdx) y2 = top(t.item) - 4;
    }
    if (y2 <= y1) return '';
    return `<div class="st-reader__mark" style="top:${y1.toFixed(1)}px; left:${left.toFixed(1)}px; width:${(right - left).toFixed(1)}px; height:${(y2 - y1).toFixed(1)}px;"><span class="st-reader__mark-label">${esc(h.label)}</span></div>`;
  }).join('');
}
