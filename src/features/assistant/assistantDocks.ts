import type { DockPoint } from './dragSurface';

export type DockRect = { left: number; top: number; width: number; height: number };
const right = (box: DockRect) => box.left + box.width;
const bottom = (box: DockRect) => box.top + box.height;
const intersects = (a: DockRect, b: DockRect) => a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top;

/** Maximal empty rectangles retain the real column edges, not arbitrary slots. */
export function clearChatDocks(bounds: DockRect, obstacles: DockRect[], preferred = { width: 342, height: 418 }): DockPoint[] {
  let spaces: DockRect[] = [bounds];
  for (const obstacle of obstacles) {
    const next: DockRect[] = [];
    for (const space of spaces) {
      if (!intersects(space, obstacle)) { next.push(space); continue; }
      if (obstacle.left > space.left) next.push({ ...space, width: obstacle.left - space.left });
      if (right(obstacle) < right(space)) next.push({ ...space, left: right(obstacle), width: right(space) - right(obstacle) });
      if (obstacle.top > space.top) next.push({ ...space, height: obstacle.top - space.top });
      if (bottom(obstacle) < bottom(space)) next.push({ ...space, top: bottom(obstacle), height: bottom(space) - bottom(obstacle) });
    }
    spaces = next.filter((space, i) => space.width >= 176 && space.height >= 136 && !next.some((other, j) =>
      i !== j && other.left <= space.left && other.top <= space.top && right(other) >= right(space) && bottom(other) >= bottom(space)
      && (j < i || other.width * other.height > space.width * space.height)));
  }
  const seen = new Set<string>();
  return spaces.flatMap(space => {
    const width = Math.min(preferred.width, space.width), height = Math.min(preferred.height, space.height);
    return [space.left, right(space) - width].flatMap(left => [space.top, bottom(space) - height].flatMap(top => {
      const id = `clear-${Math.round(left)}-${Math.round(top)}-${Math.round(width)}-${Math.round(height)}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, label: 'Open space', left, top, width, height }];
    }));
  });
}

function chatDocks(): DockPoint[] {
  const visibleBox = (element: Element | null) => {
    if (!(element instanceof HTMLElement)) return undefined;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return undefined;
    }
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 ? box : undefined;
  };
  const header = visibleBox(document.querySelector('[data-header]'));
  const footer = visibleBox(document.querySelector('.site-footer'));
  const brand = visibleBox(document.querySelector('.site-header__brand'));
  const margin = Math.max(16, Math.min(brand?.left || 24, 64));
  const top = Math.max(12, (header?.bottom || 0) + 12), floor = Math.min(innerHeight - 12, (footer?.top || innerHeight) - 12);
  const viewportWidth = document.documentElement.clientWidth || innerWidth;
  const bounds = { left: margin, top, width: viewportWidth - margin * 2, height: Math.max(0, floor - top) };
  const selectors = ['[data-home-carousel]', '[data-home-funding]', '.home-statement__design', '.home-statement__engineer', '.home-statement__create', '[data-home-assistant]', '[data-home-artwork]'];
  const obstacles = selectors.flatMap(selector => {
    const box = visibleBox(document.querySelector(selector));
    return box ? [{ left: box.left - 18, top: box.top - 18, width: box.width + 36, height: box.height + 36 }] : [];
  });
  return clearChatDocks(bounds, obstacles);
}

export function assistantDocks(box: DOMRect, character: boolean): DockPoint[] {
  if (!character) return chatDocks();
  const footer = document.querySelector('.site-footer')?.getBoundingClientRect();
  const header = document.querySelector('[data-header]')?.getBoundingClientRect();
  const funding = document.querySelector('[data-home-funding]')?.getBoundingClientRect();
  const brand = document.querySelector('.site-header__brand')?.getBoundingClientRect();
  const photo = document.querySelector('[data-home-carousel]')?.getBoundingClientRect();
  const w = box.width, h = box.height;
  const left = Math.max(20, brand?.left || innerWidth * .05);
  const right = innerWidth - left - w;
  const floor = (footer?.top || innerHeight) - 14;
  const ceiling = (header?.bottom || 90) + 12;
  const points: DockPoint[] = [{ id: 'lower-left', label: 'Lower left', left, top: floor - h }];
  if (character && funding) {
    if (innerWidth > 900) {
      // The canvas includes a transparent margin below the character's feet.
      points.push({ id: 'above-funding', label: 'Above funding', left: funding.left + (funding.width - w) / 2, top: Math.max(ceiling - 12, funding.top - h + 22) });
      const spaceLeft = photo?.right || left + w;
      const middle = spaceLeft + (funding.left - spaceLeft - w) / 2;
      if (middle > left + w + 32) points.push({ id: 'lower-center', label: 'Between the columns', left: middle, top: floor - h });
    } else if (photo && photo.top - ceiling > h + 12) {
      points.push({ id: 'upper-left', label: 'Above the photos', left, top: ceiling + 8 });
      if (right - left > w + 12) points.push({ id: 'upper-right', label: 'Above the photos', left: right, top: ceiling + 8 });
    }
  }
  return points.filter(point => point.left >= 12 && point.left + w <= innerWidth - 12 && point.top >= 12 && point.top + h <= floor + 1);
}
