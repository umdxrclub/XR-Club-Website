// The projects page's swimmer: a 2-second swim loop (public/scenes/apply/axolotl-*.webp) that lives inside the
// screen like a fish in a tank. It steers: a slow wander bends its course, the edges and (on wide screens) the
// reading column push it into smooth arcs, it faces the way it swims, flipping edge-on through a turn, and its
// body pitches with its course. It is always on screen, its tail leaves a wake in the fluid, and a burst of water
// nearby (the pointer, an idle splat) carries it along for a moment before it recovers its course.

export type AxolotlSheet = { src: string; frameWidth: number; frameHeight: number; frames: number; columns: number; fps: number };
export const axolotlSheets = {
  large: { src: 'scenes/apply/axolotl-480.webp', frameWidth: 480, frameHeight: 333, frames: 48, columns: 8, fps: 24 },
  small: { src: 'scenes/apply/axolotl-300.webp', frameWidth: 300, frameHeight: 208, frames: 48, columns: 8, fps: 24 },
} satisfies Record<string, Omit<AxolotlSheet, 'src'> & { src: string }>;

export type AxolotlOptions = {
  sheet: AxolotlSheet;
  /** Display width in CSS pixels. */
  width: number;
  reduced?: boolean;
  /** Called every frame with the tail's position (CSS px) and the swimmer's velocity (CSS px/s) while it is drawn. */
  onWake?: (x: number, y: number, dx: number, dy: number) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The shortest signed turn from one heading to another, in radians. */
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function mountAxolotl(canvas: HTMLCanvasElement, options: AxolotlOptions) {
  const { sheet, width, reduced = false } = options;
  const height = Math.round(width * sheet.frameHeight / sheet.frameWidth);
  const context = canvas.getContext('2d');
  if (!context) return null;
  canvas.width = sheet.frameWidth; canvas.height = sheet.frameHeight;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.style.transformOrigin = '50% 50%';
  const image = new Image();
  image.decoding = 'async';
  image.src = sheet.src;
  let loaded = false, failed = false;
  void image.decode().then(() => { loaded = true; }).catch(() => { failed = true; });

  // The tank: the screen minus the header and footer, with room for the body, so nothing is ever clipped.
  let viewW = innerWidth, viewH = innerHeight, insetTop = 0, insetBottom = 0;
  const roomX = width * .5 + 12, roomY = height * .5 + 12;
  const tank = () => ({ left: roomX, right: Math.max(roomX, viewW - roomX), top: insetTop + roomY, bottom: Math.max(insetTop + roomY, viewH - insetBottom - roomY) });
  const seed = Math.random() * 100;
  // Centre, heading (radians, screen coordinates), which way the body faces, the drawn flip and pitch, and the
  // current carrying it after a nearby burst.
  let x = viewW * .72, y = viewH * .6, heading = Math.PI * .94, facing = -1, flip = -1, pitch = 0, time = 0, driftX = 0, driftY = 0;
  const speed = () => clamp(viewW / 40, 32, 52); // CSS px/s: a lap of a laptop screen in about half a minute
  let keepOut: DOMRect | null = null, dim = 1;

  const steer = (dt: number) => {
    time += dt;
    const box = tank();
    // The course it would like: where it is going, bent by a slow wander, the current, and pushes off the walls and the text.
    let dx = Math.cos(heading) + driftX / speed() * .4, dy = Math.sin(heading) * .6 + driftY / speed() * .4;
    dy += (Math.sin(time * .31 + seed) * .55 + Math.sin(time * .077 + seed * 2) * .45) * .35;
    const push = (distance: number, nx: number, ny: number, range: number) => {
      if (distance >= range) return;
      const k = 1 - Math.max(0, distance) / range;
      dx += nx * k * 2.4; dy += ny * k * 2.4;
    };
    push(x - box.left, 1, 0, 150); push(box.right - x, -1, 0, 150); push(y - box.top, 0, 1, 120); push(box.bottom - y, 0, -1, 120);
    if (keepOut) {
      // Swim around the reading column rather than under it, leaving toward whichever side of the tank has room
      // for the body; where no side has room (phones) it stays and softens instead.
      const sides = [
        { nx: 1, ny: 0, space: box.right - keepOut.right }, { nx: -1, ny: 0, space: keepOut.left - box.left },
        { nx: 0, ny: 1, space: box.bottom - keepOut.bottom }, { nx: 0, ny: -1, space: keepOut.top - box.top },
      ];
      const exit = sides.reduce((best, side) => (side.space > best.space ? side : best));
      if (exit.space >= (exit.nx ? width : height) * .5) {
        const px = clamp(x, keepOut.left, keepOut.right), py = clamp(y, keepOut.top, keepOut.bottom);
        const ax = x - px, ay = y - py, distance = Math.hypot(ax, ay), range = width * .9;
        if (distance === 0) { dx += exit.nx * 2; dy += exit.ny * 2; }
        else if (distance < range) { const k = 1 - distance / range; dx += (ax / distance) * k * 2; dy += (ay / distance) * k * 2; }
      }
    }
    heading += clamp(turnTo(heading, Math.atan2(dy, dx)), -1.4 * dt, 1.4 * dt);
    // A stroke every two seconds, the length of the sheet's loop; the current fades in a second or two.
    const v = speed() * (1 + .18 * Math.sin(time * Math.PI));
    const decay = Math.exp(-dt * 2.2);
    driftX *= decay; driftY *= decay;
    x = clamp(x + (Math.cos(heading) * v + driftX) * dt, box.left, box.right);
    y = clamp(y + (Math.sin(heading) * v + driftY) * dt, box.top, box.bottom);
    // It faces the way it swims, flipping edge-on through a turn, and pitches with its course.
    if (Math.cos(heading) > .2) facing = 1; else if (Math.cos(heading) < -.2) facing = -1;
    flip = lerp(flip, facing, 1 - Math.exp(-dt * 7));
    const vx = Math.cos(heading) * v + driftX, vy = Math.sin(heading) * v + driftY;
    pitch = lerp(pitch, clamp(Math.atan2(facing * vy, Math.abs(vx) + 1e-3), -.5, .5), 1 - Math.exp(-dt * 5));
    return { vx, vy };
  };

  let frame = 0, last = performance.now(), hidden = document.hidden, disposed = false;
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Without its sheet (no WebP, offline) there is no swimmer; stop rather than stir the fluid invisibly.
    if (failed) { canvas.style.visibility = 'hidden'; return; }
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!hidden) {
      let vx = 0, vy = 0;
      if (reduced) { x = viewW * .75; y = viewH * .65; facing = 1; flip = 1; pitch = 0; }
      else ({ vx, vy } = steer(dt));
      // Under the reading column (phones, where it cannot swim around it) the swimmer softens so the text stays legible.
      const under = !!keepOut && x + width / 2 > keepOut.left && x - width / 2 < keepOut.right && y + height / 2 > keepOut.top && y - height / 2 < keepOut.bottom;
      dim = lerp(dim, under ? .5 : 1, 1 - Math.exp(-dt * 5));
      canvas.style.transform = `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${pitch.toFixed(3)}rad) scale(${flip.toFixed(3)}, 1)`;
      canvas.style.opacity = dim.toFixed(3);
      canvas.style.visibility = loaded ? 'visible' : 'hidden';
      if (loaded) {
        const index = reduced ? 0 : Math.floor((now / 1000) * sheet.fps) % sheet.frames;
        const sx = (index % sheet.columns) * sheet.frameWidth, sy = Math.floor(index / sheet.columns) * sheet.frameHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, sx, sy, sheet.frameWidth, sheet.frameHeight, 0, 0, canvas.width, canvas.height);
      }
      // The wake starts at the tail, behind the body.
      if (loaded && !reduced && options.onWake) options.onWake(x - Math.cos(heading) * width * .34, y - Math.sin(heading) * width * .34, vx, vy);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const onVisibility = () => { hidden = document.hidden; if (!hidden) last = performance.now(); };
  const onResize = () => { viewW = innerWidth; viewH = innerHeight; };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', onResize);
  return {
    /** The header and footer heights (CSS px) the swimmer keeps clear of. */
    setInsets(top: number, bottom: number) { insetTop = top; insetBottom = bottom; },
    /** The box (viewport px) of the step being read: swum around on wide screens, softened under elsewhere. */
    setKeepOut(rect: DOMRect | null) { keepOut = rect; },
    /** A burst of water at (px, py) moving at (dx, dy) CSS px/s: nearby, it carries the swimmer along for a moment. */
    nudge(px: number, py: number, dx: number, dy: number) {
      const range = Math.max(width * 1.6, 220), distance = Math.hypot(px - x, py - y);
      if (distance > range) return;
      const k = (1 - distance / range) * .2, cap = speed() * 2.5;
      driftX = clamp(driftX + dx * k, -cap, cap); driftY = clamp(driftY + dy * k, -cap, cap);
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); removeEventListener('resize', onResize); },
  };
}
