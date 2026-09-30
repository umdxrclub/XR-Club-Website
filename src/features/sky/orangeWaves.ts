import type { OrthographicCamera, Scene, Texture, Vector2, WebGLRenderer } from 'three';
import { homeVisible } from '../home/homeReady';

// Keep the original orange palette and broad rolling motion. Contact shadows
// follow the warped artwork, so each seam reads as a raised, shaded layer.
export function mountOrangeWaves(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>('[data-orange-waves]')!;
  let gl: { renderer: WebGLRenderer; scene: Scene; camera: OrthographicCamera; time: { value: number }; resolution: Vector2; release: () => void } | undefined;
  let compilation: Promise<unknown> | undefined;
  let width = 1, height = 1, active = false, reduced = false, visible = true;
  let time = 0, lastTime = 0, frame = 0, ready = false, disposed = false;
  const listeners = new AbortController();
  const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; wake(); });
  visibility.observe(host);

  function size() {
    if (!gl) return;
    // Never undersample the viewport; retain up to 2x detail on dense screens.
    gl.renderer.setPixelRatio(Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(6000000 / (width * height)))));
    gl.renderer.setSize(width, height, false);
    gl.resolution.set(width, height);
  }
  function draw() {
    if (!gl || !ready || disposed) return;
    gl.time.value = reduced ? 0 : time;
    gl.renderer.render(gl.scene, gl.camera);
    host.classList.add('has-orange-waves');
  }
  function wake() {
    if (disposed || !ready || !active || !visible || document.hidden) {
      cancelAnimationFrame(frame); frame = 0; return;
    }
    if (reduced) { cancelAnimationFrame(frame); frame = 0; draw(); return; }
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(tick); }
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || !active || !visible || document.hidden) return;
    time += Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    draw();
    if (!reduced) frame = requestAnimationFrame(tick);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame); listeners.abort(); visibility.disconnect();
    host.classList.remove('has-orange-waves');
    const release = () => gl?.release();
    if (compilation) void compilation.then(release, release); else release();
  }
  document.addEventListener('visibilitychange', wake, { signal: listeners.signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); dispose(); }, { signal: listeners.signal });
  void (async () => {
    let texture: Texture | undefined;
    try {
      // This scene starts well below the opening frame. Load 3D and rasterize
      // its large artwork only after the page is shown and the browser is idle.
      await homeVisible();
      await new Promise<void>(resolve => typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 250));
      if (disposed) return;
      const { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, TextureLoader, Vector2, WebGLRenderer } = await import('three');
      if (disposed) return;
      texture = await new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/orange/orange-waves-shaded.svg`);
      if (disposed) { texture.dispose(); return; }
      const uniforms = { uTexture: { value: texture }, uTime: { value: 0 }, uResolution: { value: new Vector2(1600, 900) } };
      const geometry = new PlaneGeometry(2, 2);
      const material = new ShaderMaterial({
        uniforms, depthTest: false, depthWrite: false, toneMapped: false,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1., 1.); }`,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D uTexture;
          uniform float uTime;
          uniform vec2 uResolution;

          void main() {
            float aspect = uResolution.x / uResolution.y;
            vec2 crop = vec2(min(1., aspect / 1.7777778), min(1., 1.7777778 / aspect));
            vec2 uv = (vUv - .5) * crop * .90 + .5;
            // Preserve the stronger rolling bends and enough overscan to keep
            // the artwork edges outside the viewport throughout the motion.
            float time = uTime * .72;
            uv.x += .016 * sin(uv.y * 7. + time) + .008 * sin(uv.x * 11. - time * .65);
            uv.y += .026 * sin(uv.x * 6.5 - time) + .012 * sin(uv.y * 9. + time * .8);
            // Crisp vector contours and soft contact shadows share one sample.
            gl_FragColor = vec4(texture2D(uTexture, uv).rgb, 1.);
          }
        `,
      });
      const scene = new Scene();
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const camera = new OrthographicCamera(-1, 1, 1, -1, .01, 20);
      camera.position.z = 8;
      const loaded = texture;
      const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
      gl = { renderer, scene, camera, time: uniforms.uTime, resolution: uniforms.uResolution.value,
        release: () => { loaded.dispose(); material.dispose(); geometry.dispose(); renderer.dispose(); } };
      size();
      renderer.initTexture(texture);
      compilation = renderer.compileAsync(scene, camera);
      await compilation;
      compilation = undefined;
      if (disposed) return;
      ready = true;
      wake();
    } catch (error) {
      if (!gl) texture?.dispose();
      dispose();
      console.warn('Showing the still orange background.', error);
    }
  })();
  return {
    update(nextWidth: number, nextHeight: number, nextActive: boolean, nextReduced: boolean) {
      if (disposed) return;
      const resized = width !== nextWidth || height !== nextHeight;
      const changed = reduced !== nextReduced;
      width = Math.max(1, nextWidth); height = Math.max(1, nextHeight);
      active = nextActive; reduced = nextReduced;
      if (resized) size();
      if (active && (resized || changed)) draw();
      wake();
    },
    dispose,
  };
}
