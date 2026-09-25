import type { PhotoBox, PhotoRegion } from './carouselLiquid';

export type PhotoTile = { box: PhotoBox; path: string };
type Point = { x: number; y: number };

// Shared stepped seams give neighboring rows complementary folder edges.
const seams = [
  [[0, 0], [.075, 0], [.105, 7], [.17, 7], [.20, 0], [.43, 0], [.47, 7], [.72, 7], [.75, 0], [.91, 0], [.95, 7], [1, 7]],
  [[0, 0], [.26, 0], [.30, -6], [.61, -6], [.65, 6], [1, 6]],
  [[0, 0], [.36, 0], [.40, 7], [.73, 7], [.77, -5], [1, -5]],
  [[0, -7], [.04, -7], [.08, 0], [1, 0]],
];

function seamPoints(row: number, from: number, to: number, width: number, y: number, scale: number) {
  const seam = seams[row];
  const at = (x: number) => {
    const f = x / width;
    const i = Math.max(0, seam.findIndex((_, index) => index < seam.length - 1 && f <= seam[index + 1][0]));
    const a = seam[i], b = seam[i + 1];
    return { x, y: y + (a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0])) * scale };
  };
  return [at(from), ...seam.filter(([x]) => x * width > from && x * width < to).map(([x, dy]) => ({ x: x * width, y: y + dy * scale })), at(to)];
}

function roundedPath(points: Point[], box: PhotoBox, radius: number) {
  const n = (point: Point) => `${((point.x - box.left) / box.width).toFixed(5)} ${((point.y - box.top) / box.height).toFixed(5)}`;
  const corners = points.map((point, i) => {
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
    const toward = (other: Point) => {
      const length = Math.hypot(other.x - point.x, other.y - point.y);
      const t = Math.min(.3, radius / Math.max(.001, length));
      return { x: point.x + (other.x - point.x) * t, y: point.y + (other.y - point.y) * t };
    };
    return { point, start: toward(before), end: toward(after) };
  });
  return `M${n(corners[0].start)}` + corners.map(({ point, start, end }) => `L${n(start)}Q${n(point)} ${n(end)}`).join('') + 'Z';
}

export function arrangePhotos(ratios: number[], region: PhotoRegion): PhotoTile[] {
  const rows = [ratios.slice(0, 3), ratios.slice(3, 6), ratios.slice(6)];
  const sums = rows.map(row => row.reduce((sum, ratio) => sum + ratio, 0));
  const heightFactor = sums.reduce((sum, ratio) => sum + 1 / ratio, 0);
  // The whole composition stays in the original carousel's safe area.
  const width = Math.max(1, Math.min(720, region.right - region.left,
    (region.bottom - region.top) / heightFactor,
    (region.edge - region.left - region.top) / (1 + heightFactor)));
  const scale = Math.min(1, width / 600), gap = 7 * scale;
  const tiles: PhotoTile[] = [];
  let y = 0;
  rows.forEach((row, r) => {
    const height = width / sums[r];
    let x = 0;
    row.forEach(ratio => {
      const nextX = x + height * ratio;
      const left = x + gap / 2, right = nextX - gap / 2;
      const top = seamPoints(r, left, right, width, y + gap / 2, scale);
      const bottom = seamPoints(r + 1, left, right, width, y + height - gap / 2, scale).reverse();
      const points = [...top, ...bottom];
      const box = { left, top: Math.min(...points.map(point => point.y)), width: right - left,
        height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) };
      tiles.push({ path: roundedPath(points, box, 5 * scale), box: {
        ...box, left: box.left + region.left, top: box.top + region.top,
      } });
      x = nextX;
    });
    y += height;
  });
  return tiles;
}