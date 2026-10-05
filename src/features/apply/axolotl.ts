// The funding page's little swimmer: a 2-second swim loop (public/scenes/apply/axolotl-*.webp) crossing the
// screen slowly, trailing behind its own target so each turn and drift feels unhurried, and leaving a wake in the fluid.

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
  /** Called every frame with the centre (CSS px) and velocity (CSS px/s) while the swimmer is on screen. */
  onWake?: (x: number, y: number, dx: number, dy: number) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mountAxolotl(canvas: HTMLCanvasElement, options: AxolotlOptions) {
  const { sheet, width, reduced = false } = options;
  const height = Math.round(width * sheet.frameHeight / sheet.frameWidth);
  const context = canvas.getContext('2d');
  if (!context) return null;
  canvas.width = sheet.frameWidth; canvas.height = sheet.frameHeight;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const image = new Image();
  image.decoding = 'async';
  image.src = sheet.src;
  let loaded = false, failed = false;
  void image.decode().then(() => { loaded = true; }).catch(() => { failed = true; });

  // A crossing: enter off the left edge, swim right at a lazy pace, leave, rest, then come back at a new height.
  let viewW = innerWidth, viewH = innerHeight;
  let crossing = 0, x = -width, y = viewH * .62, tx = x, ty = y, vx = 0, vy = 0, tilt = 0;
  let waitUntil = 0, start = performance.now();
  const plan = (now: number) => {
    crossing++;
    const lane = .55 + .28 * Math.random();
    ty = viewH * lane; y = ty; x = -width * 1.3; tx = x; vx = 0; vy = 0;
    start = now;
  };
  const speed = () => Math.max(28, viewW / 52); // CSS px/s: about 50 s per crossing on a laptop
  let scrollLag = 0;
  // The reading column: under it the swimmer dims so it never fights the text.
  let keepOut: DOMRect | null = null, dim = 1;
  let frame = 0, last = performance.now(), hidden = document.hidden, disposed = false;
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Without its sheet (no WebP, offline) there is no swimmer; stop rather than stir the fluid invisibly.
    if (failed) { canvas.style.visibility = 'hidden'; return; }
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!hidden) {
      if (reduced) {
        // A still swimmer, resting near the lower right.
        x = viewW - width * 1.25; y = viewH * .68;
      } else {
        if (now >= waitUntil) {
          // Off the right edge: park at the left straight away and rest a while before the next crossing.
          if (x > viewW + width * .3) { plan(now); waitUntil = now + 6000 + Math.random() * 9000; }
          else {
            tx += speed() * dt;
            // Gentle bob plus a wandering lane, so no two crossings look alike.
            const t = (now - start) / 1000;
            const bob = Math.sin(t * .9 + crossing) * viewH * .02 + Math.sin(t * .23 + crossing * 2) * viewH * .05;
            const targetY = ty + bob - scrollLag;
            // The swimmer trails its target: velocity eases toward the gap, so it lags and glides.
            const ax = (tx - x) * 1.1 - vx * 1.6, ay = (targetY - y) * 1.2 - vy * 1.7;
            vx += ax * dt; vy += ay * dt;
            x += vx * dt; y += vy * dt;
          }
        }
        tilt = lerp(tilt, Math.atan2(vy, Math.max(20, vx)) * .5, 1 - Math.exp(-dt * 3));
      }
      const onScreen = x > -width && x < viewW + width;
      const under = !!keepOut && x < keepOut.right && x + width > keepOut.left && y < keepOut.bottom && y + height > keepOut.top;
      dim = lerp(dim, under ? .3 : 1, 1 - Math.exp(-dt * 5));
      canvas.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(3)}rad)`;
      canvas.style.opacity = dim.toFixed(3);
      canvas.style.visibility = onScreen && loaded ? 'visible' : 'hidden';
      if (loaded) {
        const index = reduced ? 0 : Math.floor((now / 1000) * sheet.fps) % sheet.frames;
        const sx = (index % sheet.columns) * sheet.frameWidth, sy = Math.floor(index / sheet.columns) * sheet.frameHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, sx, sy, sheet.frameWidth, sheet.frameHeight, 0, 0, canvas.width, canvas.height);
      }
      if (onScreen && loaded && !reduced && options.onWake) options.onWake(x + width * .5, y + height * .55, vx, vy);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const onVisibility = () => { hidden = document.hidden; if (!hidden) last = performance.now(); };
  const onResize = () => { viewW = innerWidth; viewH = innerHeight; };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', onResize);
  return {
    /** Scrolling the page nudges the swimmer the other way, caught up with a lag. */
    setScroll(progress: number) { scrollLag = progress * viewH * .18; },
    /** The box (viewport px) the swimmer dims under: the step being read. */
    setKeepOut(rect: DOMRect | null) { keepOut = rect; },
    dispose() { disposed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); removeEventListener('resize', onResize); },
  };
}
