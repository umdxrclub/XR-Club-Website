import { clamp, mix, phase } from '../projects/projectStoryMotion';

/** Scroll distance, in viewport heights, for the camera pivot, fracture and reveal. */
export const SKY_PRISM_DISTANCE = 3.6;
export const PRISM_HALF_HEIGHT = 2.3;
export const PRISM_INRADIUS = .5;
export const CAMERA_DISTANCE = 7.5;
/** The refracted scene sits on a plane this far behind the prism's center. */
export const BACKDROP_DEPTH = 1.9;
export const SHARD_CUTS = 4;

export type Vec3 = [number, number, number];
/** Column-major 3x3, the layout uniformMatrix3fv expects. */
export type Mat3 = number[];

export const vec = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  normalize(a: Vec3): Vec3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

export const mat3 = {
  multiply(a: Mat3, b: Mat3): Mat3 {
    const out: Mat3 = new Array(9).fill(0);
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++)
      out[col * 3 + row] = a[row] * b[col * 3] + a[3 + row] * b[col * 3 + 1] + a[6 + row] * b[col * 3 + 2];
    return out;
  },
  apply: (m: Mat3, v: Vec3): Vec3 => [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2]],
  /** Multiplies by the transpose: the inverse of a rotation. */
  unapply: (m: Mat3, v: Vec3): Vec3 => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]],
  rotation(axis: Vec3, angle: number): Mat3 {
    const [x, y, z] = vec.normalize(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [t * x * x + c, t * x * y + s * z, t * x * z - s * y,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c];
  },
};

export type Plane = { n: Vec3; d: number };
const plane = (n: Vec3, d: number): Plane => ({ n: vec.normalize(n), d });
/** A solid keeps n·p ≤ d; flipping the plane keeps the other side. */
const beyond = (p: Plane): Plane => ({ n: vec.scale(p.n, -1), d: -p.d });

/** Equilateral cross-section in XZ with circumradius 1; the long axis is Y. */
export const prismPlanes: Plane[] = [
  ...[0, 1, 2].map(k => { const a = Math.PI / 2 + k * Math.PI * 2 / 3; return plane([Math.cos(a), 0, Math.sin(a)], PRISM_INRADIUS); }),
  plane([0, 1, 0], PRISM_HALF_HEIGHT), plane([0, -1, 0], PRISM_HALF_HEIGHT),
];
// Fracture: two diagonal breaks across the body, both tips, and one chip.
const crack = {
  top: plane([.30, .92, -.25], 1.55),
  bottom: plane([-.20, .95, .22], -1.45),
  upper: plane([.62, .72, .31], .30),
  lower: plane([.55, .78, -.30], -.42),
  chip: plane([.90, .10, .42], .58),
};
export type ShardRole = { kind: 'idea' | 'debris'; index: number };
type ShardCell = { key: string; role: ShardRole; planes: Plane[]; axis: Vec3; turn: number };
// The three body pieces each carry an idea; the tips and chip are debris.
const cells: ShardCell[] = [
  { key: 'upper', role: { kind: 'idea', index: 0 }, planes: [crack.top, beyond(crack.bottom), beyond(crack.upper), crack.chip], axis: [.2, 1, .3], turn: .34 },
  { key: 'middle', role: { kind: 'idea', index: 1 }, planes: [crack.top, beyond(crack.bottom), crack.upper, beyond(crack.lower)], axis: [.1, 1, -.2], turn: -.26 },
  { key: 'lower', role: { kind: 'idea', index: 2 }, planes: [crack.top, beyond(crack.bottom), crack.upper, crack.lower], axis: [-.3, 1, .1], turn: .30 },
  { key: 'tip-top', role: { kind: 'debris', index: 0 }, planes: [beyond(crack.top)], axis: [.3, .2, 1], turn: .9 },
  { key: 'tip-bottom', role: { kind: 'debris', index: 1 }, planes: [crack.bottom], axis: [-.2, .3, 1], turn: -1.1 },
  { key: 'chip', role: { kind: 'debris', index: 2 }, planes: [crack.top, beyond(crack.bottom), beyond(crack.upper), beyond(crack.chip)], axis: [.5, 1, .2], turn: 1.4 },
];

export type Shard = ShardCell & { centroid: Vec3; radius: number; volume: number; cuts: number[] };
function measure(): Shard[] {
  let seed = 2027;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const within = (p: Vec3, planes: Plane[]) => planes.every(({ n, d }) => vec.dot(n, p) <= d);
  const points = cells.map(() => [] as Vec3[]);
  let total = 0;
  for (let i = 0; i < 30000; i++) {
    const p: Vec3 = [random() * 2 - 1, (random() * 2 - 1) * PRISM_HALF_HEIGHT, random() * 2 - 1];
    if (!within(p, prismPlanes)) continue;
    total++;
    const owner = cells.findIndex(cell => within(p, cell.planes));
    if (owner >= 0) points[owner].push(p);
  }
  return cells.map((cell, i) => {
    const samples = points[i], count = Math.max(1, samples.length);
    const centroid = vec.scale(samples.reduce((sum, p) => vec.add(sum, p), [0, 0, 0] as Vec3), 1 / count);
    const radius = samples.reduce((max, p) => Math.max(max, vec.length(vec.sub(p, centroid))), 0) * 1.08 + .04;
    // Unused cut slots keep every point: a zero normal never rejects.
    const cuts = Array.from({ length: SHARD_CUTS }, (_, k) => cell.planes[k] ? [...cell.planes[k].n, cell.planes[k].d] : [0, 0, 0, 1]).flat();
    return { ...cell, axis: vec.normalize(cell.axis), centroid, radius, volume: samples.length / total, cuts };
  });
}
export const shards: Shard[] = measure();

export function prismTimeline(progress: number) {
  const beat = clamp(progress);
  return {
    beat,
    settle: phase(0, .18, beat),
    approach: phase(.03, .36, beat),
    focus: phase(.12, .30, beat),
    fracture: phase(.38, .47, beat),
    open: phase(.50, .84, beat),
    grow: phase(.52, .88, beat),
    exit: phase(0, .34, beat),
    idea: (index: number) => phase(.64 + index * .07, .82 + index * .07, beat),
  };
}
export type PrismTimeline = ReturnType<typeof prismTimeline>;

export type Box = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
type Target = Point & { back: number };
/** Where the story leaves room for the prism, as viewport fractions, plus a paper ceiling in px. */
export type PrismGuide = { x: number; y: number; ceiling: number };

export function prismLayout(width: number, height: number, headerBottom: number, footerHeight: number) {
  const narrow = width <= 640;
  const top = headerBottom + 12, bottom = height - footerHeight - 12, span = Math.max(120, bottom - top);
  const at = (fraction: number) => top + span * fraction;
  const readingSize = narrow ? Math.min(height * .30, width * .60) : Math.min(height * .46, width * .36);
  const heroSize = narrow ? Math.min(span * .56, width * .95) : Math.min(span * .70, width * .50);
  const titleSize = narrow ? Math.max(36, Math.min(width * .105, 66)) : Math.max(44, Math.min(width * .064, height * .11, 120));
  const reach = Math.min(width, 1400);
  const ideaWidth = narrow ? width * .62 : Math.min(width * .26, 330);
  const column = Math.min(width * .29, 430);
  const ideas = [0, 1, 2].map(i => narrow
    ? { shard: { x: width * .17, y: at(.50 + i * .16), back: 0 }, label: { x: width * .31, y: at(.50 + i * .16), width: ideaWidth, align: 'middle' as const } }
    : { shard: { x: width / 2 + (i - 1) * column, y: at(.66), back: 0 }, label: { x: width / 2 + (i - 1) * column - ideaWidth / 2, y: at(.775), width: ideaWidth, align: 'top' as const } });
  const debris: Target[] = narrow
    ? [{ x: width * .14, y: at(.05), back: 1.6 }, { x: width * .86, y: at(.09), back: 1.4 }, { x: width * .78, y: at(.30), back: 2.2 }]
    : [{ x: width / 2 - reach * .27, y: at(.10), back: 1.6 }, { x: width / 2 + reach * .29, y: at(.14), back: 1.4 }, { x: width / 2 + reach * .13, y: at(.02), back: 2.4 }];
  return {
    narrow, top, bottom, readingSize, heroSize, ideas, debris,
    hero: { x: width / 2, y: at(narrow ? .40 : .47) },
    title: { size: titleSize, x: width / 2, y: at(narrow ? .25 : .36) },
  };
}

/** Camera yaw at the fracture, without the pointer. */
const HERO_YAW = -.35 + .8 + .6;
/** The nearest spin that turns a long edge toward the camera, offset for two unequal faces. */
export function heroSpinFor(current: number) {
  const base = HERO_YAW - Math.PI / 3 + .25, period = Math.PI * 2 / 3;
  return base + Math.round((current - base) / period) * period;
}

function orbit(yaw: number, pitch: number) {
  const position = vec.scale([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], CAMERA_DISTANCE);
  const forward = vec.normalize(vec.scale(position, -1));
  const right = vec.normalize(vec.cross(forward, [0, 1, 0]));
  const up = vec.cross(right, forward);
  return { position, forward, right, up };
}

function box(left: number, top: number, right: number, bottom: number, width: number, height: number): Box {
  const x = Math.max(0, Math.floor(left)), y = Math.max(0, Math.floor(top));
  return { x, y, width: Math.max(0, Math.min(width, Math.ceil(right)) - x), height: Math.max(0, Math.min(height, Math.ceil(bottom)) - y) };
}

export type PrismInput = {
  cloud: number; beat: number; width: number; height: number; headerBottom: number; footerHeight: number;
  guide: PrismGuide; idle: { spin: number; time: number }; heroSpin: number; pointer: Point; reduced: boolean;
};

export function prismPose(input: PrismInput) {
  const { width, height, cloud, beat, guide, idle, pointer, reduced } = input;
  const layout = prismLayout(width, height, input.headerBottom, input.footerHeight);
  const t = prismTimeline(beat);
  const entrance = phase(0, .12, cloud);
  const live = reduced ? 0 : 1 - t.settle;
  // The camera pushes in for the fracture, then pulls back as the pieces spread.
  const size = mix(layout.readingSize, layout.heroSize, t.approach) * (1 - .42 * t.open);
  // While reading, keep clear of the recognition paper and the header.
  const readY = Math.max(layout.top + layout.readingSize * .5, Math.min(height * guide.y + height * .05 * cloud, guide.ceiling - layout.readingSize * .55));
  const center = {
    x: mix(width * guide.x, layout.hero.x, t.approach),
    y: mix(readY - height * .3 * (1 - entrance), layout.hero.y, t.approach) + size * .02 * Math.sin(idle.time * .9) * live,
  };
  const focal = size * CAMERA_DISTANCE / (2 * PRISM_HALF_HEIGHT);
  const camera = orbit(-.35 + .8 * cloud + .6 * t.approach + pointer.x * .07, .17 - .1 * cloud - .06 * t.approach - pointer.y * .06);
  const spin = mix(1.9 * cloud + idle.spin, input.heroSpin, t.approach);
  const lean = mix(.22 + .05 * Math.sin(idle.time * .7) * live, .10, t.approach);
  const tilt = .07 * Math.sin(idle.time * .53) * live;
  const prism = mat3.multiply(mat3.rotation([0, 1, 0], spin), mat3.multiply(mat3.rotation([0, 0, 1], lean), mat3.rotation([1, 0, 0], tilt)));
  const project = (world: Vec3) => {
    const rel = vec.sub(world, camera.position), depth = Math.max(.001, vec.dot(rel, camera.forward));
    return { x: center.x + focal * vec.dot(rel, camera.right) / depth, y: center.y - focal * vec.dot(rel, camera.up) / depth, depth };
  };
  // A screen point on a plane parallel to the image, `back` units behind the prism's center.
  const unproject = (target: Target): Vec3 => {
    const depth = CAMERA_DISTANCE + target.back;
    return vec.add(vec.scale(camera.forward, target.back),
      vec.add(vec.scale(camera.right, (target.x - center.x) / focal * depth), vec.scale(camera.up, (center.y - target.y) / focal * depth)));
  };
  const upLocal = mat3.unapply(prism, [0, 1, 0]);
  const gap = t.fracture * .022;
  const pieces = shards.map((shard, i) => {
    const target = shard.role.kind === 'idea' ? layout.ideas[shard.role.index].shard : layout.debris[shard.role.index];
    const rest = vec.scale(vec.normalize(shard.centroid), gap);
    const goal = vec.sub(mat3.unapply(prism, unproject(target)), shard.centroid);
    const arc = Math.sin(Math.PI * t.open) * (shard.role.kind === 'idea' ? .25 : .8);
    const move = vec.add(vec.add(rest, vec.scale(vec.sub(goal, rest), t.open)), vec.scale(upLocal, arc));
    const wobble = reduced ? 0 : Math.sin(idle.time * .5 + i * 1.7) * .06 * t.open;
    const rotation = mat3.rotation(shard.axis, shard.turn * t.open + wobble);
    const screen = project(mat3.apply(prism, vec.add(shard.centroid, move)));
    return { move, rotation, screen, radius: shard.radius * focal / screen.depth };
  });
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const piece of pieces) {
    left = Math.min(left, piece.screen.x - piece.radius); right = Math.max(right, piece.screen.x + piece.radius);
    top = Math.min(top, piece.screen.y - piece.radius); bottom = Math.max(bottom, piece.screen.y + piece.radius);
  }
  const pad = 6 + size * .02, reach = size * .55;
  return {
    layout, timeline: t, center, size, focal, camera, prism, pieces,
    alpha: phase(0, .08, cloud),
    bounds: box(left - pad, top - pad, right + pad, bottom + pad, width, height),
    region: box(left - reach, top - reach, right + reach, bottom + reach, width, height),
    title: { size: mix(size * .082, layout.title.size, t.grow), x: mix(center.x, layout.title.x, t.grow), y: mix(center.y - size * .04, layout.title.y, t.grow), opacity: t.focus },
    ideas: layout.ideas.map((idea, i) => ({ ...idea.label, opacity: t.idea(i), lift: (1 - t.idea(i)) * 16 })),
  };
}
export type PrismPose = ReturnType<typeof prismPose>;
