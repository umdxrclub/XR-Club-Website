export type StoryBox = { x: number; y: number; width: number; height: number };
export type LiquidOrigin = { x: number; y: number; radius: number };
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
export function phase(start: number, end: number, progress: number) {
  const t = clamp((progress - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function projectFlight(progress: number, source: StoryBox, landing: StoryBox) {
  const move = phase(.18, .94, progress);
  const turn = phase(.18, .7, progress);
  // Resize the reverse face after the photo has passed edge-on.
  const resize = phase(.445, .88, progress);
  const width = mix(source.width, landing.width, resize);
  const height = mix(source.height, landing.height, resize);
  const cx = mix(source.x + source.width / 2, landing.x + landing.width / 2, move);
  const cy = mix(source.y + source.height / 2, landing.y + landing.height / 2, move);
  return {
    x: cx - width / 2, y: cy - height / 2, width, height,
    rotateY: 180 * turn, rotateZ: -3 * Math.sin(Math.PI * move),
    background: phase(0, .93, progress),
  };
}

// The DOM content and shader use the same organic reveal boundary.
export function liquidRadius(progress: number, width: number, height: number, origin: LiquidOrigin) {
  const aspect = width / height;
  const maximum = Math.hypot(Math.max(origin.x, 1 - origin.x) * aspect, Math.max(origin.y, 1 - origin.y)) * 1.13 * height;
  return mix(origin.radius, maximum, progress);
}
export function liquidPath(progress: number, width: number, height: number, origin: LiquidOrigin, offsetX = 0, offsetY = 0) {
  const radius = liquidRadius(progress, width, height, origin);
  const fluid = phase(.005, .12, progress) * (1 - phase(.75, 1, progress));
  const points = Array.from({ length: 160 }, (_, i) => {
    const angle = i / 160 * Math.PI * 2;
    const r = radius * (1 + fluid * (.18 * Math.sin(angle * 3 + progress * 2) + .07 * Math.sin(angle * 5 - progress * 3) + .045 * Math.sin(angle * 9 + progress * 4)));
    return `${(origin.x * width + Math.cos(angle) * r - offsetX).toFixed(2)} ${(origin.y * height - Math.sin(angle) * r - offsetY).toFixed(2)}`;
  });
  return `M${points.join('L')}Z`;
}
