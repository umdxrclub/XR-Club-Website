// The projects page's swimmer: a 2-second swim loop (public/scenes/apply/axolotl-*.webp) that hovers in the open
// water beside the reading column the way an axolotl hangs in a tank: it drifts up, down, a little forward and
// back, tilting with its motion, always facing the same way (it never turns around), and a burst of water nearby
// (the pointer, an idle splat) carries it along for a moment before it settles again. It is always on screen and
// adds nothing to the fluid itself.

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
  // Centre, velocity, the way it faces (fixed), its tilt, the current carrying it, and its own swim clock.
  let x = viewW * .9, y = viewH * .55, vx = 0, vy = 0, facing = -1, pitch = 0, time = 0, driftX = 0, driftY = 0, swim = 0;
  let keepOut: DOMRect | null = null, dim = 1;
  // Something to watch: the edge of the page beside the field being filled in.
  let interest: { x: number; y: number } | null = null;

  const hover = (dt: number) => {
    time += dt;
    const box = tank();
    // Its patch of water: the open strip beside the reading column, or the whole tank when there is none (phones,
    // where it softens under the text instead). It faces the column.
    let left = box.left, right = box.right;
    if (keepOut) {
      const rightRoom = box.right - (keepOut.right + width / 2), leftRoom = (keepOut.left - width / 2) - box.left;
      if (Math.max(rightRoom, leftRoom) >= 30) {
        if (rightRoom >= leftRoom) { left = Math.min(box.right, keepOut.right + width / 2); facing = -1; } else { right = Math.max(box.left, keepOut.left - width / 2); facing = 1; }
      }
    }
    const cx = (left + right) / 2, cy = (box.top + box.bottom) / 2, halfW = Math.max(0, (right - left) / 2), halfH = Math.max(0, (box.bottom - box.top) / 2);
    // Where it would like to be drifts slowly around the patch, so it is always moving a little and never the same
    // way twice; with something to watch it glides over and holds beside it, with a small idle sway.
    let tx = cx + (Math.sin(time * .21 + seed) * .6 + Math.sin(time * .053 + seed * 2) * .4) * halfW * .8;
    let ty = cy + (Math.sin(time * .17 + seed * 3) * .6 + Math.sin(time * .071 + seed * 4) * .4) * halfH * .85;
    if (interest) {
      tx = clamp(interest.x + (facing < 0 ? 1 : -1) * (width * .5 + 18) + Math.sin(time * .9) * 6, left, right);
      ty = clamp(interest.y + Math.sin(time * .7 + seed) * 10, box.top, box.bottom);
    }
    // It eases toward that point like something floating, and the current fades over a second or two.
    const decay = Math.exp(-dt * 2.2), pull = interest ? .9 : .35, damp = interest ? 1.9 : 1.1;
    driftX *= decay; driftY *= decay;
    vx += ((tx - x) * pull - vx * damp) * dt; vy += ((ty - y) * pull - vy * damp) * dt;
    x = clamp(x + (vx + driftX) * dt, left, right);
    y = clamp(y + (vy + driftY) * dt, box.top, box.bottom);
    // The tail works harder when it moves; the body tilts a little into rises and dives.
    const speed = Math.hypot(vx + driftX, vy + driftY);
    swim += dt * (.45 + Math.min(1.2, speed / 40));
    pitch = lerp(pitch, clamp(Math.atan2(facing * (vy + driftY), Math.max(30, Math.abs(vx + driftX))) * .9, -.4, .4), 1 - Math.exp(-dt * 3));
  };

  let frame = 0, last = performance.now(), hidden = document.hidden, disposed = false;
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Without its sheet (no WebP, offline) there is no swimmer; stop rather than stir the fluid invisibly.
    if (failed) { canvas.style.visibility = 'hidden'; return; }
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!hidden) {
      if (reduced) { x = viewW * .9; y = viewH * .6; pitch = 0; }
      else hover(dt);
      // Under the reading column (phones, where it has no patch of its own) the swimmer softens so the text stays legible.
      const under = !!keepOut && x + width / 2 > keepOut.left && x - width / 2 < keepOut.right && y + height / 2 > keepOut.top && y - height / 2 < keepOut.bottom;
      dim = lerp(dim, under ? .5 : 1, 1 - Math.exp(-dt * 5));
      canvas.style.transform = `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${pitch.toFixed(3)}rad) scale(${facing}, 1)`;
      canvas.style.opacity = dim.toFixed(3);
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
    /** The box (viewport px) of the step being read: hovered beside on wide screens, softened under elsewhere. */
    setKeepOut(rect: DOMRect | null) { keepOut = rect; },
    /** A point (viewport px) to glide to and watch from beside, or null to drift again. */
    setInterest(point: { x: number; y: number } | null) { interest = point; },
    /** A burst of water at (px, py) moving at (dx, dy) CSS px/s: nearby, it carries the swimmer along for a moment. */
    nudge(px: number, py: number, dx: number, dy: number) {
      const range = Math.max(width * 1.6, 220), distance = Math.hypot(px - x, py - y);
      if (distance > range) return;
      const k = (1 - distance / range) * .2, cap = 90;
      driftX = clamp(driftX + dx * k, -cap, cap); driftY = clamp(driftY + dy * k, -cap, cap);
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); removeEventListener('resize', onResize); },
  };
}
