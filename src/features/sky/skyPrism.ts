import { mountPointerTilt } from '../../lib/pointerTilt';
import { createSkyCapture } from './prismCapture';
import { createPrismRenderer } from './prismShader';
import { heroSpinFor, prismPose, prismTimeline, type PrismGuide } from './prismMotion';

export type PrismState = {
  cloud: number; beat: number; width: number; height: number; active: boolean; reduced: boolean;
  guide: PrismGuide; headerBottom: number; footerHeight: number;
};

const style = (element: HTMLElement, key: string, value: string) => {
  if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
};

export function mountSkyPrism(root: HTMLElement) {
  const layer = root.querySelector<HTMLElement>('[data-sky-prism]');
  const world = root.querySelector<HTMLElement>('[data-sky-world]');
  if (!layer || !world) return null;
  const canvas = layer.querySelector<HTMLCanvasElement>('[data-prism-canvas]')!;
  const title = layer.querySelector<HTMLElement>('[data-prism-title]')!;
  const lines = [...title.querySelectorAll<HTMLElement>('[data-prism-line]')];
  const ideas = [...layer.querySelectorAll<HTMLElement>('[data-prism-idea]')];
  const capture = createSkyCapture(world);
  const renderer = createPrismRenderer(canvas);
  const listeners = new AbortController();
  const idle = { spin: 0, time: 0 };
  let state: PrismState | undefined, heroSpin = 0;
  let frame = 0, last = 0, disposed = false, shown = false;
  const tilt = mountPointerTilt(() => request());
  const visible = () => Boolean(state?.active && state.cloud > 0 && !document.hidden);

  function request() {
    if (!frame && visible() && !disposed) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || !state || !visible()) return;
    const dt = last ? Math.min(.05, Math.max(0, (now - last) / 1000)) : 0;
    last = now;
    // The tumble is integrated, so it stops in place for the fracture.
    if (!state.reduced) { idle.time += dt; idle.spin += dt * .28 * (1 - prismTimeline(state.beat).settle); }
    render();
    if (!state.reduced) frame = requestAnimationFrame(tick);
  }
  function render() {
    if (!state || !world) return;
    const current = 1.9 * state.cloud + idle.spin;
    // Latch the hero angle before the approach, so the blend stays continuous.
    if (state.beat <= .03) heroSpin = heroSpinFor(current);
    const pose = prismPose({ ...state, idle, heroSpin, pointer: tilt.value });
    style(title, 'font-size', `${pose.title.size.toFixed(2)}px`);
    style(title, 'opacity', pose.title.opacity.toFixed(4));
    style(title, 'visibility', pose.title.opacity > .001 ? 'visible' : 'hidden');
    style(title, 'transform', `translate3d(${pose.title.x.toFixed(2)}px,${pose.title.y.toFixed(2)}px,0) translate(-50%,-50%)`);
    ideas.forEach((idea, i) => {
      const p = pose.ideas[i];
      style(idea, 'opacity', p.opacity.toFixed(4));
      style(idea, 'visibility', p.opacity > .001 ? 'visible' : 'hidden');
      style(idea, 'width', `${p.width.toFixed(2)}px`);
      style(idea, 'transform', `translate3d(${p.x.toFixed(2)}px,${(p.y + p.lift).toFixed(2)}px,0)${p.align === 'middle' ? ' translateY(-50%)' : ''}`);
    });
    if (!renderer.available) return;
    const origin = world.getBoundingClientRect();
    const paint = pose.title.opacity > .001 ? {
      size: pose.title.size, opacity: pose.title.opacity,
      lines: lines.map(line => {
        const box = line.getBoundingClientRect();
        return { text: line.textContent ?? '', x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 };
      }),
    } : undefined;
    const captured = capture.capture(pose.region, 1024, paint);
    renderer.draw({ width: state.width, height: state.height, ratio: renderer.ratio(state.width, state.height), pose, background: captured ? capture.canvas : null, supersample: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (visible()) request(); else { cancelAnimationFrame(frame); frame = 0; }
  }, { signal: listeners.signal });

  return {
    update(next: PrismState) {
      state = next;
      const show = visible();
      if (show !== shown) {
        shown = show;
        layer.hidden = !show;
        if (!show) { cancelAnimationFrame(frame); frame = 0; }
      }
      tilt.setEnabled(show && !next.reduced);
      if (!show) return;
      if (next.reduced) render(); else request();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); listeners.abort();
      tilt.dispose(); renderer.dispose(); capture.dispose();
      layer.hidden = true;
      for (const element of [title, ...ideas]) for (const property of ['font-size', 'opacity', 'visibility', 'transform', 'width']) element.style.removeProperty(property);
    },
  };
}
