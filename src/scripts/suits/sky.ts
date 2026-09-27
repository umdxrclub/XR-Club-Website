// Recreates the supplied scene's shine, magic-charge rays, lens flares and dust.
// The original painting remains a full-resolution, stationary image underneath.
let dispose: (() => void) | undefined;
export function stopSky() { dispose?.(); dispose = undefined; }

export function startSky() {
  stopSky();
  const canvas = document.querySelector<HTMLCanvasElement>('.st-sky-motion');
  const ctx = canvas?.getContext('2d');
  const painting = document.querySelector<HTMLImageElement>('.st-bg__sky');
  if (!canvas || !ctx || !painting) return;
  const surface = canvas, context = ctx;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController(), signal = abort.signal;
  let frame = 0, last = 0, elapsed = 0, width = 0, height = 0, dpr = 1, reported = -1;
  const wrap = (n: number, size: number) => (n % size + size) % size;

  // Soft sprites are cached once, instead of rebuilding gradients for every mote.
  function sprite(color: string) {
    const image = document.createElement('canvas'); image.width = image.height = 96;
    const c = image.getContext('2d')!;
    const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(.12, `rgba(${color},.85)`);
    g.addColorStop(.38, `rgba(${color},.22)`); g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g; c.fillRect(0, 0, 96, 96); return image;
  }
  const cool = sprite('137,228,255'), warm = sprite('255,190,147'), white = sprite('241,248,255');
  const beams = new Map<string, HTMLCanvasElement>();
  function beam(color: string) {
    const existing = beams.get(color); if (existing) return existing;
    const image = document.createElement('canvas'); image.width = 128; image.height = 64;
    const c = image.getContext('2d')!;
    const length = c.createLinearGradient(0, 0, 128, 0);
    length.addColorStop(0, `rgba(${color},0)`); length.addColorStop(.16, `rgba(${color},1)`);
    length.addColorStop(.5, `rgba(${color},.7)`); length.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = length; c.fillRect(0, 0, 128, 64);
    c.globalCompositeOperation = 'destination-in';
    const edges = c.createLinearGradient(0, 0, 0, 64);
    edges.addColorStop(0, 'transparent'); edges.addColorStop(.5, '#fff'); edges.addColorStop(1, 'transparent');
    c.fillStyle = edges; c.fillRect(0, 0, 128, 64); beams.set(color, image); return image;
  }
  function glow(image: HTMLCanvasElement, x: number, y: number, radius: number, alpha: number) {
    context.globalAlpha = alpha;
    context.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  }

  // Original lens textures and positions from Workshop 2335369259, not its preview.
  const flares = [
    { name: 'flare-small', x: 1795, y: 496, w: 68, h: 68, strength: .7 },
    { name: 'flare-soft', x: 1586, y: 610, w: 113, h: 107, strength: .45 },
    { name: 'flare-ring', x: 1250, y: 728, w: 576, h: 554, strength: .13 },
    { name: 'flare-rainbow', x: 765, y: 944, w: 1233, h: 978, strength: .16 },
  ].map(f => {
    const image = new Image(); image.src = new URL(`${f.name}.png`, painting.src).href;
    return { ...f, image };
  });
  const particles = Array.from({ length: 128 }, (_, i) => ({
    x: (i * 139.71 + 43) % 2560, y: (i * 87.37 + 91) % 1440,
    speed: 14 + (i % 7) * 3, radius: 3 + (i % 5) * 1.15, phase: i * 1.83,
    life: 8 + (i % 6) * 1.4,
  }));

  function resize() {
    const rect = surface.getBoundingClientRect();
    width = rect.width || innerWidth; height = rect.height || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
  }
  function ray(x: number, y: number, angle: number, length: number, spread: number, color: string, alpha: number) {
    context.save(); context.translate(x, y); context.rotate(angle);
    context.globalAlpha = alpha;
    context.drawImage(beam(color), 0, -spread, length, spread * 2); context.restore();
  }
  function draw(t: number) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    const scale = Math.max(width / 2560, height / 1440);
    context.translate((width - 2560 * scale) / 2, (height - 1440 * scale) / 2); context.scale(scale, scale);
    context.globalCompositeOperation = 'screen';
    const pulse = .5 + .5 * Math.sin(t * 1.2);
    glow(cool, 1276, 360, 370 + pulse * 100, .38 + pulse * .3);
    glow(warm, 1276, 750, 630, .19 + .1 * Math.sin(t * .65));

    // Long, changing rays remain visible in the sky around the workspace.
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6 + Math.sin(t * .22 + i) * .11;
      ray(1276, 360, angle, 1000 + 220 * Math.sin(t * .48 + i), 24 + i % 3 * 24,
        '133,222,255', .025 + .035 * (.5 + .5 * Math.sin(t * .9 + i * 2)));
    }
    for (let i = 0; i < 5; i++) {
      ray(1276, 750, .24 + i * .67 + Math.sin(t * .2 + i) * .16, 1600, 40 + i * 14,
        '255,208,166', .055 + .035 * Math.sin(t * .45 + i));
    }
    // The source's short, expanding magic-charge rays, eased rather than flashing.
    for (let i = 0; i < 6; i++) {
      const age = wrap(t * .48 + i / 6, 1), alpha = Math.sin(age * Math.PI) * .28;
      ray(1276, 360, i * 2.4 + Math.sin(t * .14 + i) * .4, 60 + age * 540, 2 + age * 5, '198,245,255', alpha);
    }
    // A breathing highlight along the existing blue star trail.
    for (let i = 0; i < 5; i++) {
      const age = wrap(t * .3 + i / 5, 1), x = 1276 + age * 360, y = 360 + age * 48;
      glow(cool, x, y + Math.sin(age * 16 + t) * 8, 18 + age * 15, Math.sin(age * Math.PI) * .65);
    }
    for (let i = 0; i < flares.length; i++) {
      const f = flares[i]; if (!f.image.complete || !f.image.naturalWidth) continue;
      context.globalAlpha = f.strength * (.65 + .35 * Math.sin(t * .6 + i));
      const drift = Math.sin(t * .25 + i) * 12;
      context.drawImage(f.image, f.x - f.w / 2 + drift, f.y - f.h / 2 - drift * .4, f.w, f.h);
    }
    // The source dust uses much larger sprites than single-pixel stars.
    for (const p of particles) {
      const life = wrap(t + p.phase, p.life) / p.life;
      const alpha = Math.sin(life * Math.PI) ** 2 * (.4 + .35 * Math.sin(t * .8 + p.phase) ** 2);
      const x = wrap(p.x + t * p.speed + Math.sin(t * .45 + p.phase) * 12, 2560);
      const y = wrap(p.y - t * p.speed * .5, 1440);
      glow(white, x, y, p.radius, alpha);
    }
    context.globalAlpha = 1;
    if (Math.floor(t * 2) !== reported) {
      reported = Math.floor(t * 2); surface.dataset.motionTime = t.toFixed(1);
    }
  }
  function tick(now: number) {
    if (!surface.isConnected) { stopSky(); return; }
    if (now - last >= 1000 / 30) {
      elapsed += last ? Math.min((now - last) / 1000, .1) : 0;
      last = now; draw(elapsed);
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); last = 0;
    const play = !document.hidden && !reduced.matches;
    surface.dataset.motion = play ? 'playing' : 'paused';
    if (play) { draw(elapsed); frame = requestAnimationFrame(tick); }
    else { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, surface.width, surface.height); }
  }
  resize(); sync();
  window.addEventListener('resize', resize, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  reduced.addEventListener('change', sync, { signal });
  dispose = () => {
    abort.abort(); cancelAnimationFrame(frame); surface.dataset.motion = 'paused';
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, surface.width, surface.height);
  };
}
