// The original swim loop moves left to right without rotating, mirroring, or fading.
// Each pass leaves the screen completely before another starts off the left edge.

export type AxolotlSheet = { src: string; frameWidth: number; frameHeight: number; frames: number; columns: number; fps: number };
export const axolotlSheets = {
  large: { src: 'scenes/apply/axolotl-480.webp', frameWidth: 480, frameHeight: 343, frames: 48, columns: 8, fps: 24 },
  small: { src: 'scenes/apply/axolotl-300.webp', frameWidth: 300, frameHeight: 214, frames: 48, columns: 8, fps: 24 },
} satisfies Record<string, Omit<AxolotlSheet, 'src'> & { src: string }>;

export type AxolotlOptions = {
  sheet: AxolotlSheet;
  /** Display width in CSS pixels. */
  width: number;
  reduced?: boolean;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function mountAxolotl(canvas: HTMLCanvasElement, options: AxolotlOptions) {
  const { sheet, width, reduced = false } = options;
  const height = Math.round(width * sheet.frameHeight / sheet.frameWidth);
  const context = canvas.getContext('2d');
  if (!context) return null;
  canvas.width = sheet.frameWidth; canvas.height = sheet.frameHeight;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.style.opacity = '1';
  const image = new Image();
  image.decoding = 'async';
  image.src = sheet.src;
  let loaded = false, failed = false;
  void image.decode().then(() => { loaded = true; }).catch(() => { failed = true; });

  // Coordinates use the sprite's left edge and vertical centre. Leave room for its shadow at each wrap.
  let viewW = innerWidth, viewH = innerHeight, insetTop = 0, insetBottom = 0;
  const shadowMargin = 64;
  const water = () => {
    const top = insetTop + height / 2 + 24;
    return { top, bottom: Math.max(top, viewH - insetBottom - height / 2 - 36) };
  };
  const seed = Math.random() * 100;
  let x = viewW * .12, y = viewH * .55, time = 0, swim = 0;
  let fright = 0, nudgeY = 0;
  const cruise = () => clamp(viewW / 32, 36, 56); // CSS px/s

  const advance = (dt: number) => {
    time += dt;
    const box = water();
    fright = Math.max(0, fright - dt / 1.3);
    nudgeY *= Math.exp(-dt * 1.8);
    const speed = cruise() * (1 + .14 * Math.sin(time * Math.PI)) * (1 + 1.8 * fright);
    // Draw at least one frame fully beyond the right edge before placing it beyond the left edge.
    if (x >= viewW + shadowMargin) x = -width - shadowMargin;
    else x += speed * dt;
    const drift = Math.sin(time * .23 + seed) * .7 + Math.sin(time * .071 + seed * 2) * .3;
    const targetY = (box.top + box.bottom) / 2 + drift * Math.min(36, (box.bottom - box.top) * .18) + nudgeY;
    y = clamp(lerp(y, targetY, 1 - Math.exp(-dt * 2)), box.top, box.bottom);
    swim += dt * (1 + fright * .6);
  };

  let frame = 0, last = performance.now(), hidden = document.hidden, disposed = false;
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Without its sheet (no WebP, offline) there is no swimmer; stop rather than show nothing moving.
    if (failed) { canvas.style.visibility = 'hidden'; return; }
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!hidden) {
      if (reduced) {
        const box = water();
        x = clamp(viewW * .82 - width / 2, 0, Math.max(0, viewW - width));
        y = clamp(viewH * .6, box.top, box.bottom);
      } else advance(dt);
      canvas.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0)`;
      canvas.style.opacity = '1';
      canvas.style.visibility = loaded ? 'visible' : 'hidden';
      if (loaded) {
        const index = reduced ? 0 : Math.floor(swim * sheet.fps) % sheet.frames;
        const sx = (index % sheet.columns) * sheet.frameWidth, sy = Math.floor(index / sheet.columns) * sheet.frameHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, sx, sy, sheet.frameWidth, sheet.frameHeight, 0, 0, canvas.width, canvas.height);
      }
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
    /** A nearby pointer briefly speeds up the swimmer and nudges it vertically without changing direction. */
    startle(px: number, py: number) {
      if (reduced || Math.hypot(px - (x + width / 2), py - y) > Math.max(width * .75, 110)) return;
      if (fright <= 0) nudgeY = py >= y ? -24 : 24;
      fright = 1;
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); removeEventListener('resize', onResize); },
  };
}
