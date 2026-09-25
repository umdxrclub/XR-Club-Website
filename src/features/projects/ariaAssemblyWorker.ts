import masks from '../../data/aria-parts.json';

type Point = number[];
type Group = { id: string; label: string; polygons: Point[][] };
type Layer = { id: string; canvas: OffscreenCanvas; x: number; y: number; width: number; height: number };
export type AriaBitmapLayer = Omit<Layer, 'canvas'> & { bitmap: ImageBitmap };
export type AriaAssemblyWorkerResult =
  | { ok: true; full: ImageBitmap; layers: AriaBitmapLayer[] }
  | { ok: false; error: string };

const crop = masks.crop;
const smooth = (p: number) => { const t = Math.max(0, Math.min(1, p)); return t * t * (3 - 2 * t); };
const sideParts = new Set(['left-panels', 'right-panels', 'temple-cushions', 'nose-pads', 'small-hardware']);
const canvas = (width: number, height: number) => new OffscreenCanvas(width, height);

function outline(context: OffscreenCanvasRenderingContext2D, polygons: Point[][]) {
  context.beginPath();
  for (const points of polygons) {
    points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
  }
}

async function prepare(source: string) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not load the glasses source (${response.status}).`);
    const image = await createImageBitmap(await response.blob());
    const full = canvas(crop.width, crop.height), context = full.getContext('2d', { willReadFrequently: true })!;
    try { context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height); }
    finally { image.close(); }
    // Flood from the known backdrop into its compression fringe. Enclosed
    // white reflections stay opaque; loose white background halos disappear.
    const pixels = context.getImageData(0, 0, crop.width, crop.height), data = pixels.data;
    const background = [249, 254, 253];
    const count = crop.width * crop.height, queue = new Uint32Array(count), backdrop = new Uint8Array(count);
    const distanceAt = (pixel: number) => Math.max(Math.abs(data[pixel * 4] - 249), Math.abs(data[pixel * 4 + 1] - 254), Math.abs(data[pixel * 4 + 2] - 253));
    let tail = 0, cursor = 0;
    for (let i = 0; i < count; i++) if (distanceAt(i) <= 2) { backdrop[i] = 1; queue[tail++] = i; }
    while (cursor < tail) {
      const pixel = queue[cursor++], x = pixel % crop.width, y = Math.floor(pixel / crop.width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= crop.width || ny >= crop.height) continue;
        const next = ny * crop.width + nx;
        if (!backdrop[next] && distanceAt(next) <= 11) { backdrop[next] = 1; queue[tail++] = next; }
      }
    }
    for (let i = 0; i < data.length; i += 4) {
      const pixel = i / 4;
      const edge = backdrop[pixel - 1] || backdrop[pixel + 1] || backdrop[pixel - crop.width] || backdrop[pixel + crop.width];
      const alpha = backdrop[pixel] ? 0 : edge ? smooth((distanceAt(pixel) - 11) / 13) : 1;
      if (alpha > 0 && alpha < 1) for (let c = 0; c < 3; c++) data[i + c] = (data[i + c] - (1 - alpha) * background[c]) / alpha;
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }
    context.putImageData(pixels, 0, 0);
    const groups = (masks.groups as Group[]).filter(group => group.polygons.length);
    const hints = canvas(crop.width, crop.height), hintContext = hints.getContext('2d')!;
    hintContext.translate(-crop.x, -crop.y);
    groups.forEach((group, i) => { hintContext.fillStyle = `rgb(${i + 1},0,0)`; outline(hintContext, group.polygons); hintContext.fill(); });
    const hintPixels = hintContext.getImageData(0, 0, crop.width, crop.height).data;
    const ids = ['chassis', ...groups.map(group => group.id)];
    const hardwareIndex = ids.indexOf('small-hardware');
    const frontIndices = ['front-frame', 'lenses'].map(id => ids.indexOf(id));
    const assigned = new Uint8Array(count).fill(255);
    // Masks nominate modules; connected silhouettes stay whole. This avoids
    // cutting a lens rim or a thin rail where the source parts touch.
    for (let seed = 0; seed < count; seed++) {
      if (assigned[seed] !== 255 || data[seed * 4 + 3] === 0) continue;
      let length = 1, head = 0; queue[0] = seed; assigned[seed] = 254;
      const votes = new Uint32Array(ids.length);
      let left = crop.width, top = crop.height, right = -1, bottom = -1;
      while (head < length) {
        const pixel = queue[head++], x = pixel % crop.width, y = Math.floor(pixel / crop.width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        votes[Math.min(groups.length, hintPixels[pixel * 4])] += data[pixel * 4 + 3];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= crop.width || ny >= crop.height) continue;
          const next = ny * crop.width + nx;
          if (assigned[next] === 255 && data[next * 4 + 3] > 0) { assigned[next] = 254; queue[length++] = next; }
        }
      }
      let owner = 0;
      for (let i = 1; i < votes.length; i++) if (votes[i] > votes[owner]) owner = i;
      const total = votes.reduce((sum, value) => sum + value, 0);
      // Detached screws outside the authored masks otherwise inherit the
      // chassis rise. Keep compact hardware whole, including mask-edge pixels,
      // while explicit front-optics votes and the large body stay untouched.
      const detachedHardware = hardwareIndex >= 0
        && length <= count * .003
        && right - left + 1 <= crop.width * .09
        && bottom - top + 1 <= crop.height * .12
        && !frontIndices.some(index => index >= 0 && votes[index] > 0)
        && (owner === 0 || sideParts.has(ids[owner]));
      if (detachedHardware && owner === 0) owner = hardwareIndex;
      // A source overlap can join several real modules into one silhouette.
      // Keep the authored split there; repair only tiny accidental edge cuts.
      for (let i = 0; i < length; i++) assigned[queue[i]] = detachedHardware || votes[owner] / total > .98 ? owner : Math.min(groups.length, hintPixels[queue[i] * 4]);
    }
    // Authored splits can leave a few front-rim pixels in the chassis even
    // though the original source silhouette was connected. Inspect the final
    // assignment and return those islands to their adjoining optical layer.
    const chassisSeen = new Uint8Array(count);
    const chassisIslands: { pixels: Uint32Array; votes: Uint32Array; compact: boolean }[] = [];
    let mainBody: Uint32Array | undefined;
    for (let seed = 0; seed < count; seed++) {
      if (assigned[seed] !== 0 || chassisSeen[seed]) continue;
      let length = 1, head = 0; queue[0] = seed; chassisSeen[seed] = 1;
      let left = crop.width, top = crop.height, right = -1, bottom = -1;
      const votes = new Uint32Array(ids.length);
      while (head < length) {
        const pixel = queue[head++], x = pixel % crop.width, y = Math.floor(pixel / crop.width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= crop.width || ny >= crop.height) continue;
          const next = ny * crop.width + nx;
          if (assigned[next] === 0) {
            if (!chassisSeen[next]) { chassisSeen[next] = 1; queue[length++] = next; }
          } else if (frontIndices.includes(assigned[next])) votes[assigned[next]]++;
        }
      }
      const pixels = queue.slice(0, length);
      chassisIslands.push({ pixels, votes, compact: length <= count * .003
        && right - left + 1 <= crop.width * .09 && bottom - top + 1 <= crop.height * .12 });
      if (!mainBody || length > mainBody.length) mainBody = pixels;
    }
    for (const island of chassisIslands) {
      if (island.pixels === mainBody || !island.compact) continue;
      let owner = 0;
      for (const index of frontIndices) if (index >= 0 && island.votes[index] > island.votes[owner]) owner = index;
      if (owner > 0) for (const pixel of island.pixels) assigned[pixel] = owner;
    }
    const bounds = ids.map(() => ({ left: crop.width, top: crop.height, right: -1, bottom: -1 }));
    for (let i = 0; i < count; i++) {
      if (assigned[i] === 255) continue;
      const box = bounds[assigned[i]], x = i % crop.width, y = Math.floor(i / crop.width);
      box.left = Math.min(box.left, x); box.right = Math.max(box.right, x); box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y);
    }
    const layers: Layer[] = [];
    ids.forEach((id, index) => {
      const box = bounds[index]; if (box.right < 0) return;
      const part = canvas(box.right - box.left + 1, box.bottom - box.top + 1), ctx = part.getContext('2d')!;
      const pixels = ctx.createImageData(part.width, part.height);
      for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
        const input = y * crop.width + x; if (assigned[input] !== index) continue;
        const output = ((y - box.top) * part.width + x - box.left) * 4;
        for (let c = 0; c < 4; c++) pixels.data[output + c] = data[input * 4 + c];
      }
      ctx.putImageData(pixels, 0, 0);
      layers.push({ id, canvas: part, x: box.left, y: box.top, width: part.width, height: part.height });
    });
    return { full, layers };
}

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<{ source: string }>) => void;
  postMessage: (message: AriaAssemblyWorkerResult, transfer: Transferable[]) => void;
};
workerScope.onmessage = async event => {
  const bitmaps: ImageBitmap[] = [];
  try {
    const { full, layers } = await prepare(event.data.source);
    const fullBitmap = full.transferToImageBitmap(); bitmaps.push(fullBitmap);
    const transferred = layers.map(({ canvas, ...layer }) => {
      const bitmap = canvas.transferToImageBitmap(); bitmaps.push(bitmap);
      return { ...layer, bitmap };
    });
    workerScope.postMessage({ ok: true, full: fullBitmap, layers: transferred }, bitmaps);
  } catch (error) {
    bitmaps.forEach(bitmap => bitmap.close());
    workerScope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
