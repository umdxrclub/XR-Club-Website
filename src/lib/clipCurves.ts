// Exact clipping of a closed outline made of cubic Bézier segments to a rectangle. Inside the
// rectangle the outline is untouched: segments are split where they cross an edge and the cut
// ends are joined along that edge. Used to keep animated SVG clip and shadow paths from growing
// far beyond the screen, which makes Chrome repaint a mask layer as large as the whole outline.

export type Point = { x: number; y: number };
export type Cubic = [Point, Point, Point, Point];
export type Rect = { left: number; top: number; right: number; bottom: number };
type Edge = { axis: 'x' | 'y'; limit: number; below: boolean };

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const line = (a: Point, b: Point): Cubic => [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];

function split([p0, p1, p2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
  const d = lerp(a, b, t), e = lerp(b, c, t), m = lerp(d, e, t);
  return [[p0, a, d, m], [m, e, c, p3]];
}

function coordinate([p0, p1, p2, p3]: Cubic, axis: 'x' | 'y', t: number) {
  const u = 1 - t;
  return u * u * u * p0[axis] + 3 * u * u * t * p1[axis] + 3 * u * t * t * p2[axis] + t * t * t * p3[axis];
}

/** Parameters in (0, 1) where the segment crosses the edge's line, found by sampling and bisection. */
function crossings(cubic: Cubic, { axis, limit }: Edge) {
  // A segment lies within its control points' hull, so one entirely on one side cannot cross.
  const a = cubic[0][axis], b = cubic[1][axis], c = cubic[2][axis], d = cubic[3][axis];
  if ((a > limit && b > limit && c > limit && d > limit) || (a < limit && b < limit && c < limit && d < limit)) return [];
  const found: number[] = [];
  const steps = 24;
  let t0 = 0, f0 = coordinate(cubic, axis, 0) - limit;
  for (let i = 1; i <= steps; i++) {
    const t1 = i / steps, f1 = coordinate(cubic, axis, t1) - limit;
    if ((f0 < 0 && f1 > 0) || (f0 > 0 && f1 < 0)) {
      let lo = t0, hi = t1, flo = f0;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2, fm = coordinate(cubic, axis, mid) - limit;
        if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      found.push((lo + hi) / 2);
    }
    t0 = t1; f0 = f1;
  }
  return found;
}

/** Sutherland–Hodgman for one half-plane, carried over to curved segments. */
function clipToEdge(segments: Cubic[], edge: Edge): Cubic[] {
  const keeps = (p: Point) => edge.below ? p[edge.axis] <= edge.limit : p[edge.axis] >= edge.limit;
  const onEdge = (p: Point): Point => ({ ...p, [edge.axis]: edge.limit });
  const pieces: { cubic: Cubic; kept: boolean }[] = [];
  for (const segment of segments) {
    let rest = segment, previous = 0;
    for (const t of crossings(segment, edge)) {
      const [head, tail] = split(rest, (t - previous) / (1 - previous));
      head[3] = onEdge(head[3]); tail[0] = head[3];
      pieces.push({ cubic: head, kept: keeps(split(head, .5)[0][3]) });
      rest = tail; previous = t;
    }
    pieces.push({ cubic: rest, kept: keeps(split(rest, .5)[0][3]) });
  }
  if (pieces.every(piece => piece.kept)) return segments;
  if (!pieces.some(piece => piece.kept)) return [];
  // Start at a point where the outline enters the kept side, then join each exit to the next entry along the edge.
  const start = pieces.findIndex((piece, i) => piece.kept && !pieces[(i + pieces.length - 1) % pieces.length].kept);
  const out: Cubic[] = [];
  let exit: Point | null = null;
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[(start + k) % pieces.length];
    if (piece.kept) {
      if (exit) { out.push(line(exit, piece.cubic[0])); exit = null; }
      out.push(piece.cubic);
    } else if (!exit) exit = piece.cubic[0];
  }
  if (exit) out.push(line(exit, out[0][0]));
  return out;
}

/** The closed outline restricted to the rectangle; the same segments when it already fits inside. */
export function clipCubics(segments: Cubic[], rect: Rect): Cubic[] {
  // Every frame calls this; most outlines fit, so only edges the control points reach are clipped.
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const cubic of segments) for (const p of cubic) {
    if (p.x < left) left = p.x; if (p.x > right) right = p.x;
    if (p.y < top) top = p.y; if (p.y > bottom) bottom = p.y;
  }
  const edges: Edge[] = [];
  if (left < rect.left) edges.push({ axis: 'x', limit: rect.left, below: false });
  if (right > rect.right) edges.push({ axis: 'x', limit: rect.right, below: true });
  if (top < rect.top) edges.push({ axis: 'y', limit: rect.top, below: false });
  if (bottom > rect.bottom) edges.push({ axis: 'y', limit: rect.bottom, below: true });
  return edges.reduce((current, edge) => current.length ? clipToEdge(current, edge) : current, segments);
}

/** SVG path data for a closed outline, with the precision the sky scene already uses. */
export function cubicsPath(segments: Cubic[]) {
  if (!segments.length) return 'M0 0Z';
  const n = (v: number) => v.toFixed(3);
  let path = `M${n(segments[0][0].x)} ${n(segments[0][0].y)}`;
  for (const [, a, b, c] of segments) path += `C${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)}`;
  return `${path}Z`;
}
