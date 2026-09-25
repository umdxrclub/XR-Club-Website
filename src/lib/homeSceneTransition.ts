import { liquidPath, phase, type LiquidOrigin } from '../features/projects/projectStoryMotion';
import '../styles/sceneNavigation.css';

// The browser captures both rendered scenes, including their WebGL canvases.
// Reuse the Design period's boundary to expose the destination through the
// outgoing scene, without running through unrelated scroll chapters.
export async function morphHomeScene(stage: HTMLElement, origin: LiquidOrigin, apply: () => void, signal: AbortSignal) {
  const html = document.documentElement;
  const width = stage.clientWidth, height = stage.clientHeight;
  const frames = Array.from({ length: 61 }, (_, index) => ({
    clipPath: "path('" + liquidPath(phase(0, 1, index / 60), width, height, { ...origin, radius: 0 }) + "')",
    offset: index / 60,
  }));
  if (!document.startViewTransition) {
    const out = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
    const abort = () => out.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try { await out.finished; } catch { return; }
    finally { signal.removeEventListener('abort', abort); out.cancel(); }
    if (signal.aborted) return;
    apply();
    const reveal = stage.animate(frames, { duration: 1000, fill: 'both' });
    const cancel = () => reveal.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try { await reveal.finished; } catch { /* interrupted by navigation cleanup */ }
    finally { reveal.cancel(); signal.removeEventListener('abort', cancel); }
    return;
  }
  html.setAttribute('data-scene-navigation', '');
  const transition = document.startViewTransition(async () => {
    if (signal.aborted) return;
    apply();
    // Scene poses and WebGL are rendered synchronously by the story seek.
    // Decode freshly loaded products without waiting for animation frames while
    // the browser has suspended rendering for its snapshot.
    const images = [...stage.querySelectorAll<HTMLImageElement>('img')]
      .filter(image => !image.complete && image.getBoundingClientRect().width > 0 && !image.closest('[hidden]'));
    await Promise.race([
      Promise.all(images.map(image => image.decode().catch(() => {}))),
      new Promise<void>(resolve => setTimeout(resolve, 240)),
    ]);
  });
  let animation: Animation | undefined;
  const abort = () => { animation?.cancel(); transition.skipTransition(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await transition.ready;
    if (!signal.aborted) {
      animation = html.animate(frames, { duration: 1250, easing: 'linear', fill: 'both', pseudoElement: '::view-transition-new(home-scene)' });
      await animation.finished;
    }
  } catch { /* A resize or page change can skip a browser snapshot. */ }
  finally {
    transition.skipTransition();
    await transition.finished.catch(() => {});
    animation?.cancel();
    html.removeAttribute('data-scene-navigation');
    signal.removeEventListener('abort', abort);
  }
}
