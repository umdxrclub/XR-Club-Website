import { OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { createAngledWaves } from './angledWaves';
import { createCleanWaves } from './cleanWaves';

export async function mountHomeWaves(root: HTMLElement, isCurrent: () => boolean) {
  const stage = root.querySelector<HTMLElement>('[data-home-waves-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-home-waves-canvas]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  const scene = new Scene();
  const revealScene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .01, 20);
  camera.position.z = 8;
  const waves = createAngledWaves();
  let clean: Awaited<ReturnType<typeof createCleanWaves>> | undefined;
  let pendingClean: Awaited<ReturnType<typeof createCleanWaves>> | undefined;
  let cleanCompiled = false;
  let compilation: Promise<unknown> | undefined;
  let background = Number(root.style.getPropertyValue('--project-background')) || 0;
  const readOrigin = () => ({ x: Number(root.style.getPropertyValue('--project-origin-x')) || .72,
    y: Number(root.style.getPropertyValue('--project-origin-y')) || .54,
    radius: Number(root.style.getPropertyValue('--project-origin-radius')) || 4 });
  let origin = readOrigin();
  scene.add(waves.mesh);
  const listeners = new AbortController();
  let frame = 0, disposed = false, ready = false, active = true, storyAnimating = false;
  let covered = root.dataset.skyCovered === 'true';
  let width = 1, height = 1, time = 0, lastTime = 0;
  let fill = 0;
  const observer = new ResizeObserver(resize);
  const visibility = new IntersectionObserver(entries => { active = entries[0].isIntersecting; wake(); });
  function cleanup() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame);
    listeners.abort(); observer.disconnect(); visibility.disconnect();
    const release = () => {
      waves.mesh.geometry.dispose(); waves.mesh.material.dispose();
      clean?.dispose();
      pendingClean?.dispose(); pendingClean = undefined;
      renderer.dispose();
    };
    // Three polls the compiling material until its GPU program is ready.
    // Stop the UI immediately, but retain that program until polling finishes.
    if (compilation) void compilation.then(release, release); else release();
    root.classList.remove('is-ready', 'has-clean-waves');
    root.dispatchEvent(new CustomEvent('xr:clean-waves-ready'));
  }
  async function compile(target: Scene) {
    const job = renderer.compileAsync(target, camera);
    compilation = job;
    try { await job; } finally { if (compilation === job) compilation = undefined; }
  }
  function draw() {
    // A late texture never changes the reveal technique halfway through the
    // wipe. Install only while the image is hidden beneath either scene.
    if (!clean && pendingClean && cleanCompiled && (background <= 0 || covered)) {
      clean = pendingClean; pendingClean = undefined;
      revealScene.add(clean.mesh);
      root.classList.add('has-clean-waves');
      root.dispatchEvent(new CustomEvent('xr:clean-waves-ready'));
    }
    waves.mesh.visible = background < 1 || !clean;
    waves.update(reduced.matches ? 0 : time, width, height, reduced.matches ? 1 : fill);
    clean?.update(reduced.matches ? 0 : time, width, height, background, origin);
    canvas.style.opacity = '1';
    renderer.render(scene, camera);
    if (clean && background > 0) {
      renderer.autoClear = false;
      renderer.render(revealScene, camera);
      renderer.autoClear = true;
    }
  }
  function resize() {
    if (disposed) return;
    width = stage.clientWidth; height = stage.clientHeight;
    // Bound fragment work on large / high-DPI screens without reducing frame rate.
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(3000000 / (width * height))));
    renderer.setSize(width, height, false);
    if (ready) draw();
    wake();
  }
  function wake() {
    if (disposed || !ready || !active || covered || document.hidden || storyAnimating || frame) return;
    lastTime = performance.now(); frame = requestAnimationFrame(tick);
  }
  function advanceTime(now: number) {
    const dt = lastTime ? Math.min(.05, Math.max(0, (now - lastTime) / 1000)) : 0;
    lastTime = Math.max(lastTime, now);
    time += dt;
    // Reveal once from the upper right, then keep the spectrum and waves flowing.
    // Active frame time avoids jumping ahead after the tab has been hidden.
    const progress = Math.max(0, Math.min(1, (time - .2) / 4.8));
    fill = progress * progress * (3 - 2 * progress);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || !active || covered || document.hidden || storyAnimating) return;
    advanceTime(now);
    draw();
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  try {
    resize();
    // Start the next scene's download alongside the homepage shader compile.
    const cleanLoad = root.querySelector('[data-project-scene]') ? createCleanWaves().then(layer => {
      if (disposed || !isCurrent()) { layer.dispose(); return undefined; }
      pendingClean = layer;
      return layer;
    }).catch(error => {
      if (!disposed) console.warn('Showing the still project background.', error);
      return undefined;
    }) : undefined;
    waves.update(0, width, height, reduced.matches ? 1 : fill);
    await compile(scene);
    if (!isCurrent()) { cleanup(); return cleanup; }
    background = Number(root.style.getPropertyValue('--project-background')) || 0;
    origin = readOrigin();
    ready = true; draw(); root.classList.add('is-ready');
    if (cleanLoad) {
      void cleanLoad.then(async layer => {
        if (!layer || disposed) return;
        if (!isCurrent()) { cleanup(); return; }
        // Compile and upload offstage, before the scroll reveal needs them.
        const preparationScene = new Scene();
        preparationScene.add(layer.mesh);
        renderer.initTexture(layer.texture);
        await compile(preparationScene);
        preparationScene.remove(layer.mesh);
        if (disposed) return;
        if (!isCurrent()) { cleanup(); return; }
        cleanCompiled = true;
        draw(); wake();
      }).catch(error => {
        if (pendingClean) { revealScene.remove(pendingClean.mesh); pendingClean.dispose(); pendingClean = undefined; }
        if (!disposed) console.warn('Showing the still project background.', error);
      });
    }
    observer.observe(stage); visibility.observe(root);
    window.addEventListener('resize', resize, { passive: true, signal: listeners.signal });
    document.addEventListener('visibilitychange', wake, { signal: listeners.signal });
    covered = root.dataset.skyCovered === 'true';
    root.addEventListener('xr:sky-coverage', event => {
      covered = (event as CustomEvent<{ opaque: boolean }>).detail.opaque;
      if (covered) {
        cancelAnimationFrame(frame); frame = 0;
        if (ready && pendingClean && cleanCompiled) draw();
      } else { if (ready) draw(); wake(); }
    }, { signal: listeners.signal });
    root.addEventListener('xr:project-progress', event => {
      const detail = (event as CustomEvent<{ background: number; origin: { x: number; y: number; radius: number }; frameTime: number; animating: boolean }>).detail;
      background = detail.background; origin = detail.origin;
      storyAnimating = detail.animating && !reduced.matches;
      // The story has just updated its DOM masks. Render their GPU counterpart
      // in that same callback; the story owns the clock until easing settles.
      cancelAnimationFrame(frame); frame = 0;
      if (ready && active && !covered && !document.hidden) {
        advanceTime(detail.frameTime); draw();
      } else lastTime = detail.frameTime;
      if (!storyAnimating && !reduced.matches) wake();
    }, { signal: listeners.signal });
    reduced.addEventListener('change', () => { resize(); wake(); }, { signal: listeners.signal });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); cleanup(); }, { signal: listeners.signal });
    wake();
    return cleanup;
  } catch (error) { cleanup(); throw error; }
}
