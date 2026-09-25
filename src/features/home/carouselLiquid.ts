export type PhotoBox = { left: number; top: number; width: number; height: number };
export type PhotoRegion = { left: number; top: number; right: number; bottom: number; edge: number; compact: boolean };
type Point = { x: number; y: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const LIQUID_PHOTO_DURATION = 1200;
export const PHOTO_REST_DURATION = 240;

export function photoPlacement(ratio: number, index: number, region: PhotoRegion): PhotoBox {
  const room = Math.max(0, region.edge - region.left - region.top);
  const shift = Math.min(room * .22, (region.bottom - region.top) * .28, region.compact ? 62 : 180);
  const places = [[0, 0], [0, shift], [shift, shift * .10]];
  const [dx, dy] = places[index % places.length];
  const left = region.left + dx, top = region.top + dy;
  const width = Math.max(1, Math.min(
    region.right - left,
    (region.edge - left - top) / (1 + 1 / ratio),
    (region.bottom - top) * ratio,
  ));
  return { left, top, width, height: width / ratio };
}

export function liquidPhotoPose(progress: number, from: PhotoBox, to: PhotoBox) {
  const p = clamp(progress), travel = ease(.22, .80, p);
  const liquid = ease(0, .30, p) * (1 - ease(.70, 1, p));
  const sx = from.left + from.width / 2, sy = from.top + from.height / 2;
  const ex = to.left + to.width / 2, ey = to.top + to.height / 2;
  const dx = ex - sx, dy = ey - sy, distance = Math.hypot(dx, dy);
  const angle = distance > .1 ? Math.atan2(dy, dx) : Math.PI / 2;
  const arc = Math.sin(travel * Math.PI) * Math.min(28, distance * .12);
  const cx = mix(sx, ex, travel) - Math.sin(angle) * arc;
  const cy = mix(sy, ey, travel) + Math.cos(angle) * arc;
  const diameter = Math.max(68, Math.min(124, Math.sqrt(Math.min(from.width * from.height, to.width * to.height)) * .46));
  const flow = Math.sin(travel * Math.PI);
  const width = mix(mix(from.width, to.width, travel), diameter * (1 + .12 * flow), liquid);
  const height = mix(mix(from.height, to.height, travel), diameter * (1.08 + .12 * flow), liquid);
  return {
    box: { left: cx - width / 2, top: cy - height / 2, width, height },
    liquid, travel, angle,
    blend: ease(.38, .66, p),
  };
}

export function sampleFolder(path: SVGPathElement): Point[] {
  const length = path.getTotalLength();
  return Array.from({ length: 128 }, (_, i) => {
    const point = path.getPointAtLength(i / 128 * length);
    return { x: point.x, y: point.y };
  });
}

export function liquidPhotoPath(points: Point[], amount: number, travel: number, direction: number, destination = points) {
  const tail = direction + Math.PI;
  const shaped = points.map((source, index) => {
    const point = { x: mix(source.x, destination[index].x, travel), y: mix(source.y, destination[index].y, travel) };
    const angle = Math.atan2(point.y - .5, point.x - .5);
    const delta = Math.atan2(Math.sin(angle - tail), Math.cos(angle - tail));
    const neck = .075 * Math.exp(-delta * delta / .24);
    const ripple = .018 * Math.sin(travel * Math.PI) * Math.sin(3 * angle - travel * 2);
    const radius = .415 + neck + ripple;
    return { x: mix(point.x, .5 + Math.cos(angle) * radius, amount), y: mix(point.y, .5 + Math.sin(angle) * radius, amount) };
  });
  const n = (value: number) => value.toFixed(5);
  let d = `M${n(shaped[0].x)} ${n(shaped[0].y)}`;
  for (let i = 0; i < shaped.length; i++) {
    const before = shaped[(i + shaped.length - 1) % shaped.length], start = shaped[i];
    const end = shaped[(i + 1) % shaped.length], after = shaped[(i + 2) % shaped.length];
    d += `C${n(start.x + (end.x - before.x) / 6)} ${n(start.y + (end.y - before.y) / 6)} ${n(end.x - (after.x - start.x) / 6)} ${n(end.y - (after.y - start.y) / 6)} ${n(end.x)} ${n(end.y)}`;
  }
  return d + 'Z';
}
