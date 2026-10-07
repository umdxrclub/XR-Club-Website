import { mountFluid, fluidColor, type Fluid } from './fluid';
import { mountAxolotl, axolotlSheets } from './axolotl';

export function mountApplyBackground(root: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const listeners = new AbortController(), options = { signal: listeners.signal };
  const disposers: (() => void)[] = [];
  const headerBottom = () => document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 90;
  // --- Background -------------------------------------------------------------------------------------
  const fluidCanvas = root.querySelector<HTMLCanvasElement>('[data-apply-fluid]')!;
  let swimmer: ReturnType<typeof mountAxolotl> = null;
  const phone = Math.min(innerWidth, innerHeight) < 700;
  let fluid: Fluid | null = null;
  // Open on colour, not on an empty dark field. With reduced motion the field settles once and then holds still.
  const startFluid = (): Fluid | null => {
    try {
      const started = mountFluid(fluidCanvas, {
        simResolution: phone ? 128 : 192, dyeResolution: phone ? 512 : 1024, pressureIterations: phone ? 14 : 18, densityDissipation: .992, pixelRatio: Math.min(devicePixelRatio || 1, phone ? 1 : 1.25),
        // A lost GPU context (a backgrounded phone tab, a driver reset) comes back as a fresh simulation.
        onRestore: () => { fluid = startFluid(); },
      });
      if (!started) return null;
      started.randomSplats(phone ? 8 : 14, 900);
      if (reduced) { started.settle(90); started.setPaused(true); }
      return started;
    } catch (error) { console.warn('The fluid background could not start.', error); return null; }
  };
  fluid = startFluid();
  root.dataset.fluid = fluid ? 'on' : 'off';
  if (fluid) {
    let idle = 0;
    // An idle burst somewhere in the field; the swimmer feels it when it is close.
    const burst = () => {
      const sx = Math.random() * fluidCanvas.clientWidth, sy = Math.random() * fluidCanvas.clientHeight;
      const dx = 560 * (Math.random() - .5) / 6, dy = 560 * (Math.random() - .5) / 6;
      fluid?.splat(sx, sy, dx, dy, fluidColor().map(c => c * 10) as [number, number, number]);
      swimmer?.nudge(sx, sy, dx * 2.5, dy * 2.5);
    };
    const idleSplat = () => {
      if (!document.hidden && !reduced) { burst(); if (Math.random() < .3) burst(); }
      idle = window.setTimeout(idleSplat, 420 + Math.random() * 900);
    };
    idle = window.setTimeout(idleSplat, 700);
    let lastPointer: { x: number; y: number; t: number } | null = null;
    // Pointer splats would never fade on a held-still field, so reduced motion leaves them out.
    if (!reduced) addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' && !event.isPrimary) return;
      const now = performance.now();
      if (lastPointer) {
        const dt = Math.max(8, now - lastPointer.t) / 1000;
        const dx = (event.clientX - lastPointer.x) / dt, dy = (event.clientY - lastPointer.y) / dt;
        if (Math.abs(dx) + Math.abs(dy) > 40) { fluid?.splat(event.clientX, event.clientY, dx * .55, dy * .55, undefined, .22); swimmer?.nudge(event.clientX, event.clientY, dx * .35, dy * .35); }
      }
      lastPointer = { x: event.clientX, y: event.clientY, t: now };
    }, { ...options, passive: true });
    if (!reduced) addEventListener('pointerdown', event => {
      const dx = (Math.random() - .5) * 600, dy = (Math.random() - .5) * 600;
      fluid?.splat(event.clientX, event.clientY, dx, dy, fluidColor().map(c => c * 6) as [number, number, number], .6);
      swimmer?.nudge(event.clientX, event.clientY, dx, dy);
    }, { ...options, passive: true });
    document.addEventListener('visibilitychange', () => fluid?.setPaused(document.hidden || reduced), options);
    disposers.push(() => { clearTimeout(idle); fluid?.dispose(); });
  }
  const swimmerCanvas = root.querySelector<HTMLCanvasElement>('[data-apply-swimmer]')!;
  const base = (document.querySelector('base')?.getAttribute('href') ?? '/').replace(/\/?$/, '/');
  const sheet = phone ? axolotlSheets.small : axolotlSheets.large;
  swimmer = mountAxolotl(swimmerCanvas, { sheet: { ...sheet, src: base + sheet.src }, width: phone ? 150 : Math.round(Math.min(160, innerWidth * .12)), reduced });
  disposers.push(() => swimmer?.dispose());
  // The swimmer keeps clear of the header and the footer.
  const placeSwimmer = () => swimmer?.setInsets(headerBottom() + 8, (parseFloat(getComputedStyle(root).getPropertyValue('--site-footer-height')) || 0) + 8);
  placeSwimmer();

  const content = root.querySelector<HTMLElement>('.apply__content');
  const placeKeepOut = () => swimmer?.setKeepOut(content?.getBoundingClientRect() ?? null);
  const observer = new ResizeObserver(placeKeepOut);
  if (content) observer.observe(content);
  placeKeepOut();
  addEventListener('scroll', placeKeepOut, { ...options, passive: true });
  addEventListener('resize', placeKeepOut, options);
  disposers.push(() => observer.disconnect());


  addEventListener('resize', placeSwimmer, options);
  return { ready: fluid?.ready, dispose: () => { listeners.abort(); disposers.forEach(dispose => dispose()); } };
}
