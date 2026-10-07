// The projects page's swimmer: a 2-second swim loop (public/scenes/apply/axolotl-*.webp) that swims the screen like
// a fish in open water. It always moves the way it points: it picks a spot in the open water, swims there in a
// gentle arc, then picks the next. Now and then it crosses to the other side of the reading column, going over or
// under the text where there is water (softened behind it where there is not), and a cursor coming close startles it
// into a quick dart away. It changes side only through a steep bank, where a mirrored body looks the same, and never
// emits anything.

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

  // The water: the screen minus the header and footer, with room for the body, so nothing is ever clipped.
  let viewW = innerWidth, viewH = innerHeight, insetTop = 0, insetBottom = 0;
  const room = Math.max(width, height) * .5 + 10;
  const water = () => ({ left: room, right: Math.max(room, viewW - room), top: insetTop + room, bottom: Math.max(insetTop + room, viewH - insetBottom - room) });
  const seed = Math.random() * 100;
  // Centre, heading (radians, screen coordinates), the side the body shows, its drawn flip, a startle, and its swim clock.
  let x = viewW * .82, y = viewH * .55, heading = Math.PI * 1.02, facing = -1, flip = -1, time = 0, swim = 0;
  let fright = 0, fleeHeading = 0, flee = false;
  // Where it is swimming to, the waypoints round the text on the way there, and when (and for which text) it chose.
  let goalX = viewW * .2, goalY = viewH * .5, route: { x: number; y: number }[] = [], chose = 0, chosenFor = -1, keepOutVersion = 0;
  const open = (px: number, py: number) => !keepOut || px < keepOut.left - width / 2 || px > keepOut.right + width / 2 || py < keepOut.top - height / 2 || py > keepOut.bottom + height / 2;
  const side = (px: number) => keepOut ? Math.sign(px - (keepOut.left + keepOut.right) / 2) : 0;
  const cruise = () => clamp(viewW / 32, 36, 56); // CSS px/s
  let keepOut: DOMRect | null = null, dim = 1;

  const steer = (dt: number) => {
    time += dt;
    const box = water();
    if (chose === 0 || time - chose > 40 || Math.hypot(goalX - x, goalY - y) < 64 || (chosenFor !== keepOutVersion && !open(goalX, goalY))) {
      // Somewhere new to go: open water, clear of the edges, a real journey away, more often on this side of the text than across it.
      const margin = 44, anyY = () => box.top + margin + Math.random() * Math.max(1, box.bottom - box.top - margin * 2);
      let found = false;
      for (let attempt = 0; attempt < 16 && !found; attempt++) {
        goalX = box.left + margin + Math.random() * Math.max(1, box.right - box.left - margin * 2);
        goalY = anyY();
        found = open(goalX, goalY) && Math.hypot(goalX - x, goalY - y) >= Math.max(150, width) && (flee ? ((goalX - x) * Math.cos(heading) + (goalY - y) * Math.sin(heading)) / Math.hypot(goalX - x, goalY - y) > .3 : side(goalX) === side(x) || Math.random() < .4);
      }
      if (!found && keepOut) {
        // No luck (the water is mostly text): the strip of open water beside the text on this side, if there is one.
        const leftStrip = keepOut.left - width / 2 - 12 - (box.left + margin), rightStrip = box.right - margin - (keepOut.right + width / 2 + 12);
        if (side(x) < 0 ? leftStrip > 0 : rightStrip > 0) {
          goalX = side(x) < 0 ? box.left + margin + Math.random() * leftStrip : box.right - margin - Math.random() * rightStrip;
          goalY = anyY();
        }
      }
      // Across the text it goes round, along the water over or under the column from the near corner to the far one;
      // straight through where there is no water to go round by.
      route = [];
      if (keepOut && side(goalX) !== side(x)) {
        const over = keepOut.top - height / 2 - 12, beneath = keepOut.bottom + height / 2 + 12;
        const canOver = over > box.top, canBeneath = beneath < box.bottom;
        if (canOver || canBeneath) {
          const goOver = canOver && (!canBeneath || Math.abs(y - over) <= Math.abs(y - beneath));
          const laneY = goOver ? (box.top + over) / 2 : (beneath + box.bottom) / 2;
          const leftOf = keepOut.left - width / 2 - 12, rightOf = keepOut.right + width / 2 + 12;
          route = side(x) < 0 ? [{ x: leftOf, y: laneY }, { x: rightOf, y: laneY }] : [{ x: rightOf, y: laneY }, { x: leftOf, y: laneY }];
        }
      }
      chose = time; chosenFor = keepOutVersion; flee = false;
    }
    while (route.length && Math.hypot(route[0].x - x, route[0].y - y) < 64) route.shift();
    const target = route[0] ?? { x: goalX, y: goalY };
    // The course it would like: toward the next point of its journey, with a slow meander so no two journeys look alike
    // (straightening as it arrives, none on the lane round the text), eased off the edges of the text and turned back before
    // the edges of the water.
    const reach = Math.hypot(target.x - x, target.y - y) || 1;
    const meander = route.length ? 0 : (Math.sin(time * .23 + seed) * .55 + Math.sin(time * .071 + seed * 2) * .45) * .5 * Math.min(1, reach / 220);
    const course = fright > 0 ? fleeHeading : Math.atan2(target.y - y, target.x - x) + meander;
    let dx = Math.cos(course), dy = Math.sin(course);
    const push = (distance: number, nx: number, ny: number) => {
      if (distance >= 80) return;
      const k = 1 - Math.max(0, distance) / 80;
      dx += nx * k * 1.4; dy += ny * k * 1.4;
    };
    // (Going round the text it swims the lane along the top or bottom of the water on purpose, so that edge does not push.)
    const lane = route.length ? route[0].y : null;
    push(x - box.left, 1, 0); push(box.right - x, -1, 0);
    if (lane === null || lane > (box.top + box.bottom) / 2) push(y - box.top, 0, 1);
    if (lane === null || lane < (box.top + box.bottom) / 2) push(box.bottom - y, 0, -1);
    if (keepOut && !route.length) {
      const px = clamp(x, keepOut.left, keepOut.right), py = clamp(y, keepOut.top, keepOut.bottom);
      const ax = x - px, ay = y - py, distance = Math.hypot(ax, ay), range = width * .75;
      if (distance > 0 && distance < range) { const k = 1 - distance / range; dx += (ax / distance) * k * 1.6; dy += (ay / distance) * k * 1.6; }
    }
    if (fright > 0) {
      // Startled, it holds its line of flight, fast, calming down over a second or so; then it wants somewhere new ahead.
      fright = Math.max(0, fright - dt / 1.3);
      if (fright === 0) chose = 0;
    }
    // Gentle, wide arcs: the turn is rate limited.
    const rate = fright > 0 ? 4.5 : 1.1;
    heading += clamp(turnTo(heading, Math.atan2(dy, dx)), -rate * dt, rate * dt);
    // It only ever moves the way it points. A stroke every two seconds, the length of the sheet's loop.
    const speed = cruise() * (1 + .14 * Math.sin(time * Math.PI)) * (1 + 1.8 * fright);
    const nx = x + Math.cos(heading) * speed * dt, ny = y + Math.sin(heading) * speed * dt;
    x = clamp(nx, box.left, box.right); y = clamp(ny, box.top, box.bottom);
    // Pressed against an edge of the water it comes round to swim along it, never into it.
    if ((ny > box.bottom && Math.sin(heading) > 0) || (ny < box.top && Math.sin(heading) < 0)) heading += clamp(turnTo(heading, Math.cos(heading) >= 0 ? 0 : Math.PI), -3 * dt, 3 * dt);
    if ((nx > box.right && Math.cos(heading) > 0) || (nx < box.left && Math.cos(heading) < 0)) heading += clamp(turnTo(heading, Math.sin(heading) >= 0 ? Math.PI / 2 : -Math.PI / 2), -3 * dt, 3 * dt);
    // The side it shows changes only while it points almost straight up or down, where the mirrored body looks the same.
    if (Math.cos(heading) > .3) facing = 1; else if (Math.cos(heading) < -.3) facing = -1;
    flip = lerp(flip, facing, 1 - Math.exp(-dt * 9));
    swim += dt * (.55 + Math.min(1.6, speed / 45));
  };

  let frame = 0, last = performance.now(), hidden = document.hidden, disposed = false;
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Without its sheet (no WebP, offline) there is no swimmer; stop rather than show nothing moving.
    if (failed) { canvas.style.visibility = 'hidden'; return; }
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!hidden) {
      if (reduced) { x = viewW * .82; y = viewH * .6; heading = Math.PI; facing = -1; flip = -1; }
      else steer(dt);
      // Behind the reading column it softens so the text stays legible.
      const under = !!keepOut && x + width / 2 - 12 > keepOut.left && x - width / 2 + 12 < keepOut.right && y + height / 2 - 12 > keepOut.top && y - height / 2 + 12 < keepOut.bottom;
      dim = lerp(dim, under ? .55 : 1, 1 - Math.exp(-dt * 5));
      // The sprite points along its heading; on the left-facing side it is the mirrored sprite turned the other way.
      const angle = facing > 0 ? heading : heading - Math.PI;
      canvas.style.transform = `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad) scale(${flip.toFixed(3)}, 1)`;
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
    /** The box (viewport px) of the step being read: steered around when it can be, softened behind otherwise. */
    setKeepOut(rect: DOMRect | null) { keepOut = rect; keepOutVersion++; },
    /** The pointer at (px, py): close enough, it startles the swimmer into a quick dart away. */
    startle(px: number, py: number) {
      if (reduced || Math.hypot(px - x, py - y) > Math.max(width * .75, 110)) return;
      if (fright <= 0) {
        // A fresh startle: it flees away from the pointer (straight on when touched on the body) and holds that line
        // until it is calm, when it picks a new destination ahead rather than turning straight back.
        const ax = x - px, ay = y - py;
        fleeHeading = Math.hypot(ax, ay) < 30 ? heading : Math.atan2(ay, ax);
        flee = true; route = [];
      }
      fright = 1;
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); removeEventListener('resize', onResize); },
  };
}
