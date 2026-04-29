interface Rect { x: number; y: number; w: number; h: number }
interface Piece { points: Array<[number, number]> }

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
  // We want a mix of rectangles and triangles. Triangulating a rect gives 2.
  // BSP to base = total - triCount, then triangulate triCount of those.
  // base + 2 * triCount = total  =>  triCount up to floor(total / 2).
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
  // If math drifted, trim or pad.
  while (pieces.length > total) pieces.pop();
  while (pieces.length < total) pieces.push(rectToPiece({ x: 0, y: 0, w: 1, h: 1 }));
  return pieces;
}

function pieceToClip(p: Piece): string {
  return 'polygon(' + p.points.map(([x, y]) => `${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`).join(',') + ')';
}

function pieceCenter(p: Piece): [number, number] {
  let cx = 0, cy = 0;
  for (const [x, y] of p.points) { cx += x; cy += y; }
  return [cx / p.points.length, cy / p.points.length];
}

export interface PuzzleOptions {
  imageUrl: string;
  totalPieces: number;
  initialRevealed: number;
  seedKey: string;
  imageAspect?: number;
}

export class PuzzleReveal {
  private wrap: HTMLElement;
  private stage: HTMLDivElement;
  private pieces: HTMLDivElement[] = [];
  private revealOrder: number[] = [];
  private currentRevealed = 0;
  private destroyed = false;

  constructor(wrap: HTMLElement, opts: PuzzleOptions) {
    this.wrap = wrap;
    this.wrap.classList.add('dd-puzzle-wrap');

    if (opts.imageAspect) {
      this.wrap.style.aspectRatio = String(opts.imageAspect);
    }

    this.stage = document.createElement('div');
    this.stage.className = 'dd-puzzle-stage';
    this.wrap.appendChild(this.stage);

    const seed = hashStr(opts.seedKey);
    const rng = mulberry32(seed ^ 0xa1f3c9);
    const pieces = generatePieces(seed, opts.totalPieces);
    this.revealOrder = shuffle(rng, pieces.map((_, i) => i));

    pieces.forEach((p, i) => {
      const [cx, cy] = pieceCenter(p);
      const div = document.createElement('div');
      div.className = 'dd-piece';
      div.style.clipPath = pieceToClip(p);
      div.style.backgroundImage = `url("${opts.imageUrl}")`;
      div.style.setProperty('--dd-piece-cx', `${(cx * 100).toFixed(2)}%`);
      div.style.setProperty('--dd-piece-cy', `${(cy * 100).toFixed(2)}%`);
      div.style.setProperty('--dd-piece-depth', `${(rng() * 60 - 30).toFixed(1)}px`);
      this.stage.appendChild(div);
      this.pieces.push(div);
    });

    this.detectAspectIfNeeded(opts);
    this.setRevealed(opts.initialRevealed);
  }

  private detectAspectIfNeeded(opts: PuzzleOptions): void {
    if (opts.imageAspect) return;
    const img = new Image();
    img.onload = () => {
      if (this.destroyed) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        this.wrap.style.aspectRatio = (img.naturalWidth / img.naturalHeight).toFixed(4);
      }
    };
    img.src = opts.imageUrl;
  }

  setRevealed(count: number): void {
    const target = Math.max(0, Math.min(count, this.pieces.length));
    if (target === this.currentRevealed) return;
    const visible = new Set(this.revealOrder.slice(0, target));
    this.pieces.forEach((p, i) => {
      if (visible.has(i)) p.classList.add('is-revealed');
      else p.classList.remove('is-revealed');
    });
    this.currentRevealed = target;
  }

  dispose(): void {
    this.destroyed = true;
    this.pieces.forEach((p) => p.remove());
    this.pieces.length = 0;
    this.stage.remove();
    this.wrap.classList.remove('dd-puzzle-wrap');
  }
}
