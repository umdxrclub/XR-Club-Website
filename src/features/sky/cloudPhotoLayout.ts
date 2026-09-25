export type CollageBox = { x: number; y: number; width: number; height: number; roll: number };
export type CollageCopyBox = { x: number; y: number; width: number; height: number };

/** Axis-aligned bounds include the tilt, so spacing protects the visible corners. */
export function collageBounds(box: CollageBox) {
  const angle = Math.abs(box.roll) * Math.PI / 180;
  const width = box.width * Math.cos(angle) + box.height * Math.sin(angle);
  const height = box.height * Math.cos(angle) + box.width * Math.sin(angle);
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

export function collageLayout(ratios: number[], width: number, compact: boolean, id = 'about', availableHeight = width * .52, copy?: CollageCopyBox) {
  const boxes: CollageBox[] = new Array(ratios.length);
  const gutter = compact ? 8 : 12;
  const gap = compact ? 18 : Math.max(24, Math.min(38, width * .028));
  const rolls = [-1.5, 1.5, -1, 1.25, -1.25, 1];

  // A justified row preserves every photo's proportions. Its envelope includes
  // rotation so every row stays level with equal gaps between photographs.
  const row = (indices: number[], x: number, y: number, rowWidth: number, maxHeight = Infinity) => {
    const angle = 1.5 * Math.PI / 180;
    const weights = indices.map(index => ratios[index] * Math.cos(angle) + Math.sin(angle));
    const height = Math.min(maxHeight, (rowWidth - gap * (indices.length - 1)) / weights.reduce((sum, value) => sum + value, 0));
    let cursor = x, bottom = y;
    indices.forEach(index => {
      const roll = compact ? rolls[index] * .65 : rolls[index];
      const box = { x: 0, y: 0, width: ratios[index] * height, height, roll };
      const bounds = collageBounds(box);
      box.x = cursor - bounds.x;
      box.y = y - bounds.y;
      boxes[index] = box;
      cursor += bounds.width + gap;
      bottom = Math.max(bottom, y + bounds.height);
    });
    return bottom;
  };

  let bottom = gutter;
  if (compact) {
    for (let first = 0; first < ratios.length; first += 2) {
      const indices = ratios.slice(first, first + 2).map((_, offset) => first + offset);
      bottom = row(indices, gutter, bottom, width - gutter * 2) + gap;
    }
  } else {
    const rightCopy = id === 'community' || id === 'sponsors';
    const text = copy ?? { x: rightCopy ? width * .54 : 0, y: 0, width: width * .44, height: 260 };
    const safeGap = Math.max(32, gap);
    const sideX = rightCopy ? gutter : text.x + text.width + safeGap;
    const sideRight = rightCopy ? text.x - safeGap : width - gutter;
    const sideWidth = Math.max(1, sideRight - sideX);
    if (ratios.length === 1) {
      const maxHeight = Math.max(260, availableHeight - 100);
      bottom = row([0], sideX, gutter, sideWidth, maxHeight);
      bottom = Math.max(bottom, text.y + text.height);
    } else {
      const topBottom = row([0, 1], sideX, gutter, sideWidth);
      // The lower row starts after both the copy and the upper photos.
      const lowerY = Math.max(topBottom, text.y + text.height) + safeGap;
      bottom = row(ratios.slice(2).map((_, index) => index + 2), gutter, lowerY, width - gutter * 2);
    }
  }
  return { boxes, height: bottom + gutter + (compact ? 0 : 14) };
}
