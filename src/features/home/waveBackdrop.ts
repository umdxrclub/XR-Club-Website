import { OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { createAngledWaves } from './angledWaves';

/**
 * The home page's moving waves as a fixed backdrop behind another page: the same shader, colours, pace and spectrum,
 * with none of the home page's story, sky or scene coupling. The host is the fixed full-viewport layer holding the
 * still SVG and the canvas; once the shader has compiled the host gets `is-ready` and the canvas takes over. Resolves
 * to a dispose function. Under reduced motion it draws one frame and holds still.
 */
export async function mountWaveBackdrop(host: HTMLElement, canvas: HTMLCanvasElement, isCurrent: () => boolean = () => host.isConnected) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .01, 20);
  camera.position.z = 8;
  const waves = createAngledWaves();
  scene.add(waves.mesh);
  const listeners = new AbortController();
  const observer = new ResizeObserver(() => resize());
  let frame = 0, disposed = false, ready = false, width = 1, height = 1, time = 0, last = 0;
  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame); frame = 0;
    listeners.abort(); observer.disconnect();
    waves.mesh.geometry.dispose();
    (waves.mesh.material as { dispose(): void }).dispose();
    renderer.dispose();
    host.classList.remove('is-ready');
  }
  function draw() { waves.update(time, width, height, 1); renderer.render(scene, camera); }
  function resize() {
    if (disposed) return;
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    // Bound fragment work on large, high density screens without lowering the frame rate.
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(3000000 / (width * height))));
    renderer.setSize(width, height, false);
    if (ready) draw();
    wake();
  }
  function wake() {
    if (disposed || !ready || document.hidden || reduced.matches || frame) return;
    last = performance.now(); frame = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    // Active frame time only, so the waves do not jump ahead after the tab was hidden.
    time += Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    draw();
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  try {
    resize();
    waves.update(0, width, height, 1);
    await renderer.compileAsync(scene, camera);
    if (disposed || !isCurrent()) { cleanup(); return cleanup; }
    ready = true; draw(); host.classList.add('is-ready');
    observer.observe(host);
    addEventListener('resize', resize, { passive: true, signal: listeners.signal });
    document.addEventListener('visibilitychange', wake, { signal: listeners.signal });
    reduced.addEventListener('change', () => { if (!disposed) { draw(); wake(); } }, { signal: listeners.signal });
    // A lost context (a driver reset, a backgrounded phone) leaves the still waves showing.
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cleanup(); }, { signal: listeners.signal });
    wake();
  } catch (error) { cleanup(); throw error; }
  return cleanup;
}
