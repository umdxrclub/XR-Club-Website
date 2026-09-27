import { liquidPath, phase, type LiquidOrigin } from '../features/projects/projectStoryMotion';
import '../styles/sceneNavigation.css';

// The browser captures both rendered scenes, including their WebGL canvases.
// Reuse the Design period's boundary to expose the destination through the
// outgoing scene, without running through unrelated scroll chapters.
export async function morphHomeScene(stage: HTMLElement, origin: LiquidOrigin, apply: () => void, signal: AbortSignal) {
  const html = document.documentElement;
  const width = stage.clientWidth, height = stage.clientHeight;
  const compact = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  const cx = width * origin.x, cy = height * origin.y;
  const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) * 1.6;
  // Rounded basic shapes avoid repainting a 160-edge path on every mobile frame.
  // Uneven corner radii retain the liquid swell without scaling the page itself.
  const rounds = [
    '50% 50% 50% 50% / 50% 50% 50% 50%',
    '42% 58% 46% 54% / 56% 44% 58% 42%',
    '54% 46% 58% 42% / 43% 57% 44% 56%',
    '47% 53% 45% 55% / 54% 46% 52% 48%',
    '50% 50% 50% 50% / 50% 50% 50% 50%',
  ];
  const frames = compact ? rounds.map((round, index) => {
    const offset = index / (rounds.length - 1);
    const radius = Math.max(.1, reach * phase(0, 1, offset));
    return { clipPath: `inset(${cy - radius}px ${width - cx - radius}px ${height - cy - radius}px ${cx - radius}px round ${round})`, offset };
  }) : Array.from({ length: 61 }, (_, index) => ({
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
    const reveal = stage.animate(frames, { duration: compact ? 700 : 1000, fill: 'both' });
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
      .filter(image => {
        if (image.complete || image.closest('[hidden], [data-story-chapter][aria-hidden="true"]')) return false;
        const box = image.getBoundingClientRect();
        return box.width > 0 && box.bottom > 0 && box.top < height && box.right > 0 && box.left < width
          && getComputedStyle(image).visibility !== 'hidden';
      });
    await Promise.race([
      Promise.all(images.map(image => image.decode().catch(() => {}))),
      new Promise<void>(resolve => setTimeout(resolve, compact ? 80 : 240)),
    ]);
  });
  let animation: Animation | undefined;
  const abort = () => { animation?.cancel(); transition.skipTransition(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await transition.ready;
    if (!signal.aborted) {
      document.dispatchEvent(new CustomEvent('xr:scene-captured', { detail: true }));
      animation = html.animate(frames, { duration: compact ? 800 : 1250, easing: 'linear', fill: 'both', pseudoElement: '::view-transition-new(home-scene)' });
      await animation.finished;
    }
  } catch { /* A resize or page change can skip a browser snapshot. */ }
  finally {
    transition.skipTransition();
    await transition.finished.catch(() => {});
    animation?.cancel();
    html.removeAttribute('data-scene-navigation');
    document.dispatchEvent(new CustomEvent('xr:scene-captured', { detail: false }));
    signal.removeEventListener('abort', abort);
  }
}
