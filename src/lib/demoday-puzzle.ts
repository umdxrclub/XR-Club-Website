interface Rect { x: number; y: number; w: number; h: number }
interface Piece { points: Array<[number, number]> }

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bspSplit(rng: () => number, target: number): Rect[] {
  const rects: Rect[] = [{ x: 0, y: 0, w: 1, h: 1 }];
  while (rects.length < target) {
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    const r = rects.shift()!;
    const horizontal = r.w * 1.15 > r.h ? rng() < 0.72 : rng() < 0.28;
    const ratio = 0.32 + rng() * 0.36;
    if (horizontal) {
      rects.push({ x: r.x, y: r.y, w: r.w * ratio, h: r.h });
      rects.push({ x: r.x + r.w * ratio, y: r.y, w: r.w * (1 - ratio), h: r.h });
    } else {
      rects.push({ x: r.x, y: r.y, w: r.w, h: r.h * ratio });
      rects.push({ x: r.x, y: r.y + r.h * ratio, w: r.w, h: r.h * (1 - ratio) });
    }
  }
  return rects;
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rectToPiece(r: Rect): Piece {
  return {
    points: [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ],
  };
}

function rectToTriangles(r: Rect, dir: boolean): [Piece, Piece] {
  if (dir) {
    return [
      { points: [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h]] },
      { points: [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] },
    ];
  }
  return [
    { points: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h]] },
    { points: [[r.x, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] },
  ];
}

function generatePieces(seed: number, total: number): Piece[] {
  const rng = mulberry32(seed);
  const triCount = Math.max(2, Math.floor(total / 3));
  const baseCount = total - triCount;
  const baseRects = bspSplit(rng, baseCount);

  const triIdx = new Set<number>();
  while (triIdx.size < triCount) triIdx.add(Math.floor(rng() * baseRects.length));

  const pieces: Piece[] = [];
  baseRects.forEach((r, i) => {
    if (triIdx.has(i)) {
      const [a, b] = rectToTriangles(r, rng() < 0.5);
      pieces.push(a, b);
    } else {
      pieces.push(rectToPiece(r));
    }
  });
  while (pieces.length > total) pieces.pop();
  while (pieces.length < total) pieces.push(rectToPiece({ x: 0, y: 0, w: 1, h: 1 }));
  return pieces;
}

function pointsAttr(p: Piece): string {
  return p.points.map(([x, y]) => `${(x * 100).toFixed(3)},${(y * 100).toFixed(3)}`).join(' ');
}

export interface PuzzleOptions {
  imageUrl: string;
  totalPieces: number;
  initialRevealed: number;
  seedKey: string;
}

let instanceCounter = 0;

export class PuzzleReveal {
  private wrap: HTMLElement;
  private svg: SVGSVGElement;
  private polygons: SVGPolygonElement[] = [];
  private revealOrder: number[] = [];
  private currentRevealed = 0;
  private destroyed = false;

  constructor(wrap: HTMLElement, opts: PuzzleOptions) {
    this.wrap = wrap;
    while (this.wrap.firstChild) this.wrap.removeChild(this.wrap.firstChild);

    const seed = hashStr(opts.seedKey);
    const rng = mulberry32(seed ^ 0xa1f3c9);
    const pieces = generatePieces(seed, opts.totalPieces);
    this.revealOrder = shuffle(rng, pieces.map((_, i) => i));

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('dd-puzzle-svg');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const patternId = `dd-pattern-${++instanceCounter}`;
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', patternId);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('x', '0');
    pattern.setAttribute('y', '0');
    pattern.setAttribute('width', '100');
    pattern.setAttribute('height', '100');

    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttribute('href', opts.imageUrl);
    image.setAttributeNS(XLINK_NS, 'xlink:href', opts.imageUrl);
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('width', '100');
    image.setAttribute('height', '100');
    image.setAttribute('preserveAspectRatio', 'none');

    pattern.appendChild(image);
    defs.appendChild(pattern);
    svg.appendChild(defs);

    pieces.forEach((p) => {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', pointsAttr(p));
      poly.setAttribute('fill', `url(#${patternId})`);
      poly.setAttribute('class', 'dd-piece');
      poly.setAttribute('opacity', '0');
      svg.appendChild(poly);
      this.polygons.push(poly);
    });

    this.svg = svg;
    this.wrap.appendChild(svg);

    this.setRevealed(opts.initialRevealed);
  }

  setRevealed(count: number): void {
    const target = Math.max(0, Math.min(count, this.polygons.length));
    const visible = new Set(this.revealOrder.slice(0, target));
    this.polygons.forEach((p, i) => {
      p.setAttribute('opacity', visible.has(i) ? '1' : '0');
    });
    this.currentRevealed = target;
  }

  dispose(): void {
    this.destroyed = true;
    this.polygons.forEach((p) => p.remove());
    this.polygons.length = 0;
    this.svg.remove();
  }
}
