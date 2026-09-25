import masks from '../../data/aria-parts.json';
import type { AriaAssemblyWorkerResult } from './ariaAssemblyWorker';

type Layer = { id: string; canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const crop = masks.crop;
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const smooth = (p: number) => { const t = clamp(p); return t * t * (3 - 2 * t); };
const sideParts = new Set(['left-panels', 'right-panels', 'temple-cushions', 'nose-pads', 'small-hardware']);
let prepared: Promise<{ full: HTMLCanvasElement; layers: Layer[] }> | undefined;

function canvas(width: number, height: number) {
  const node = document.createElement('canvas'); node.width = width; node.height = height;
  return node;
}
function prepare(source: string) {
  if (prepared) return prepared;
  // One shared job serves the settled folder and its sky-transition copy.
  // Mount disposal only skips attachment; it must not cancel another consumer.
  prepared = new Promise<{ full: HTMLCanvasElement; layers: Layer[] }>((resolve, reject) => {
    let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
    };
    const fail = (error: unknown) => { if (!settled) { settled = true; stop(); reject(error); } };
    const copy = (bitmap: ImageBitmap) => {
      const node = canvas(bitmap.width, bitmap.height), context = node.getContext('2d');
      if (!context) throw new Error('Could not create a glasses layer.');
      context.drawImage(bitmap, 0, 0); return node;
    };
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
        throw new Error('Off-thread image preparation is unavailable.');
      }
      worker = new Worker(new URL('./ariaAssemblyWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<AriaAssemblyWorkerResult>) => {
        const result = event.data;
        if (!result.ok) { fail(new Error(result.error)); return; }
        try {
          const full = copy(result.full);
          const layers = result.layers.map(({ bitmap, ...layer }) => ({ ...layer, canvas: copy(bitmap) }));
          settled = true; stop(); resolve({ full, layers });
        } catch (error) { fail(error); }
        finally { result.full.close(); result.layers.forEach(layer => layer.bitmap.close()); }
      };
      worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Glasses preparation failed.')); };
      worker.onmessageerror = () => fail(new Error('Could not receive the prepared glasses layers.'));
      timer = setTimeout(() => fail(new Error('Glasses preparation timed out.')), 15000);
      worker.postMessage({ source: new URL(source, document.baseURI).href });
    } catch (error) { fail(error); }
  }).catch(error => { prepared = undefined; throw error; });
  return prepared;
}

/** Original-resolution part layers, animated only by transforms during scroll. */
export function mountAriaAssembly() {
  const listeners = new AbortController(), options = { signal: listeners.signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups: (() => void)[] = [];
  document.querySelectorAll<HTMLElement>('[data-aria-assembly]').forEach(slot => {
    const mode = slot.dataset.ariaMode;
    if (mode === 'hidden') return;
    const art = slot.querySelector<HTMLElement>('[data-aria-art]')!;
    const fallback = slot.querySelector<SVGElement>('.aria-assembly__fallback');
    const story = mode === 'scroll' ? slot.closest<HTMLElement>('[data-home-waves]') : null;
    let progress = Number(story?.dataset.ariaProgress) || 0, scale = 1;
    let disposed = false;
    let complete: HTMLCanvasElement | undefined;
    let parts: { node: HTMLCanvasElement; layer: Layer; start: number; end: number }[] = [];
    function render() {
      const p = mode === 'complete' || reduced.matches ? 1 : progress;
      if (complete) complete.style.visibility = p >= .97 ? 'inherit' : 'hidden';
      for (const { node, start, end } of parts) {
        node.style.visibility = complete && p >= .97 ? 'hidden' : 'inherit';
        const t = smooth((p - start) / (end - start));
        // The artwork is mirrored, so negative local X travels from the right.
        // Every piece follows the same upper-right diagonal into its final spot.
        const offset = -Math.max(crop.width, crop.height) * .35 * scale * (1 - t);
        node.style.transform = `translate3d(${offset}px, ${offset}px, 0)`;
        node.style.opacity = String(smooth((p - start) / ((end - start) * .25)));
      }
      slot.dataset.ariaProgress = p.toFixed(4);
    }
    function measure() {
      scale = Math.min(slot.clientWidth / crop.width, slot.clientHeight / crop.height);
      art.style.width = `${crop.width * scale}px`; art.style.height = `${crop.height * scale}px`;
      render();
    }
    function setProgress(value: number) { progress = clamp(value); render(); }
    const size = new ResizeObserver(measure); size.observe(slot);
    prepare(slot.dataset.ariaSource!).then(({ full, layers }) => {
      if (disposed) return;
      const entries = mode === 'complete' ? [{ id: 'complete', canvas: full, x: 0, y: 0, width: crop.width, height: crop.height }] : layers;
      // Mirroring puts larger source X farther left on screen. Rank along the
      // bottom-left diagonal, then finish each arrival before starting the next.
      const position = (layer: Layer) => layer.x + layer.width / 2 + layer.y + layer.height / 2;
      const ordered = [...entries].sort((a, b) => position(b) - position(a));
      const step = .94 / ordered.length;
      parts = ordered.map((layer, i) => {
        const node = canvas(layer.width, layer.height);
        node.getContext('2d')!.drawImage(layer.canvas, 0, 0);
        Object.assign(node.style, { left: `${layer.x / crop.width * 100}%`, top: `${layer.y / crop.height * 100}%`, width: `${layer.width / crop.width * 100}%`, height: `${layer.height / crop.height * 100}%`, zIndex: layer.id === 'complete' ? '3' : sideParts.has(layer.id) ? '0' : layer.id === 'chassis' ? '1' : '2' });
        node.dataset.ariaPart = layer.id; art.append(node);
        const start = i * step;
        return { node, layer, start, end: start + step };
      });
      if (mode === 'scroll') {
        complete = canvas(crop.width, crop.height); complete.getContext('2d')!.drawImage(full, 0, 0);
        Object.assign(complete.style, { inset: '0', width: '100%', height: '100%', zIndex: '3' });
        complete.dataset.ariaFinal = ''; art.append(complete);
      }
      measure(); slot.setAttribute('data-aria-ready', '');
    }).catch(error => {
      if (disposed) return;
      // Keep the original still available without synchronous pixel processing.
      art.replaceChildren(); slot.removeAttribute('data-aria-ready');
      if (fallback) fallback.style.visibility = 'inherit';
      console.warn('Showing the original glasses illustration.', error);
    });
    if (story) story.addEventListener('xr:aria-progress', event => setProgress((event as CustomEvent<{ progress: number }>).detail.progress), options);
    reduced.addEventListener('change', render, options);
    measure(); render();
    cleanups.push(() => {
      disposed = true; size.disconnect(); art.replaceChildren();
      slot.removeAttribute('data-aria-ready'); delete slot.dataset.ariaProgress;
      fallback?.style.removeProperty('visibility');
    });
  });
  return () => { listeners.abort(); cleanups.forEach(cleanup => cleanup()); };
}
