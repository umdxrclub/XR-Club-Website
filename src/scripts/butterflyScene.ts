import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createButterflyRig } from './butterflyRig';
import { sampleBubblePath, sampleBubbleFlight } from './bubblePath';

const TRACE_START = 0.8;
const TRACE_END = 3.8;
const END = 4.9;
const PAINT_DELAY = 0.24;
const SEGMENTS = 56;
const smooth = (a: number, b: number, time: number) => THREE.MathUtils.smoothstep(time, a, b);
type Point = { x: number; y: number };

function bezier(a: Point, b: Point, c: Point, d: Point, t: number) {
  const s = 1 - t;
  return { x: s ** 3 * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t ** 3 * d.y,
    dx: 3 * s * s * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
    dy: 3 * s * s * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t * t * (d.y - c.y) };
}

function disposeScene(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export async function mountButterflyScene(host: HTMLElement) {
  const hero = host.closest<HTMLElement>('[data-hero-wrapper]')!;
  const bubble = hero.querySelector<HTMLElement>('[data-hero-bubble]')!;
  const artwork = bubble.querySelector<HTMLImageElement>('.hero-bubble__img')!;
  const replay = hero.querySelector<HTMLButtonElement>('[data-butterfly-replay]')!;
  const parameters = new URLSearchParams(location.search);
  const requestedTime = import.meta.env.DEV ? parameters.get('butterfly-time') : null;
  const previewTime = requestedTime !== null && Number.isFinite(Number(requestedTime)) ? Number(requestedTime) : null;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1280, 720, 0, 0.1, 2000);
  camera.position.z = 1000;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xf1eaff, 0x363962, 2.2));
  const key = new THREE.DirectionalLight(0xd4faff, 2.5);
  key.position.set(0, 500, 700);
  scene.add(key);
  let asset;
  try {
    [asset] = await Promise.all([
      new GLTFLoader().loadAsync(`${host.dataset.base || '/'}models/fantasy_butterfly_animation.glb`),
      artwork.decode().catch(() => {}),
    ]);
  } catch (error) {
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }
  asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = Math.min(material.emissiveIntensity, 1.8);
    }
  });
  const rig = createButterflyRig(asset.scene, asset.animations);
  scene.add(rig.root);

  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const colors = new Float32Array((SEGMENTS + 1) * 2 * 4);
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    for (let side = 0; side < 2; side++) { uvs[(i * 2 + side) * 2] = side; uvs[(i * 2 + side) * 2 + 1] = i / SEGMENTS; }
    if (i < SEGMENTS) { const v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('trailColor', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  trailGeometry.setIndex(indices);
  const trailMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 trailColor; varying vec4 vColor; varying vec2 vUv;
      void main(){ vColor=trailColor; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec4 vColor; varying vec2 vUv;
      void main(){ float edge=abs(vUv.x*2.0-1.0); float a=(1.0-smoothstep(0.12,1.0,edge))*vColor.a;
      gl_FragColor=vec4(mix(vColor.rgb,vec3(1.0),0.35*(1.0-edge)),a); }`,
  });
  const trail = new THREE.Mesh(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  scene.add(trail);
  const color = new THREE.Color();
  const heading = new THREE.Quaternion();
  const bank = new THREE.Quaternion();
  const topView = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const zAxis = new THREE.Vector3(0, 0, 1);
  let width = 1280, height = 720, hostLeft = 0, hostTop = 0;
  let elapsed = 0, lastTime = 0, frame = 0;
  let disposed = false, onScreen = true, finished = false;
  let paused = hero.querySelector<HTMLElement>('[data-minecraft-scene]')?.dataset.animationPaused === 'true';

  function begin() {
    finished = false;
    hero.dataset.bubbleIntro = 'drawing';
    bubble.classList.remove('is-drawn');
    artwork.style.removeProperty('mask-image');
    artwork.style.setProperty('--bubble-reveal', '0deg');
    document.dispatchEvent(new Event('xr:bubble-intro'));
  }
  function finish() {
    if (finished) return;
    finished = true;
    hero.dataset.bubbleIntro = 'complete';
    artwork.style.setProperty('--bubble-reveal', '360deg');
    artwork.style.setProperty('mask-image', 'none');
    bubble.classList.add('is-drawn');
    document.dispatchEvent(new Event('xr:bubble-intro'));
  }
  function renderPose(time: number) {
    const t = THREE.MathUtils.clamp(time, 0, END);
    const rect = artwork.getBoundingClientRect();
    const screenPoint = (progress: number) => {
      const p = sampleBubblePath(progress);
      return { x: rect.left - hostLeft + p.x * rect.width, y: rect.top - hostTop + p.y * rect.height, dx: p.tangentX, dy: p.tangentY };
    };
    const screenFlight = (progress: number) => {
      const p = sampleBubbleFlight(progress);
      return { x: rect.left - hostLeft + p.x * rect.width, y: rect.top - hostTop + p.y * rect.height, dx: p.tangentX, dy: p.tangentY, revealProgress: p.revealProgress };
    };
    const progress = THREE.MathUtils.clamp((t - TRACE_START) / (TRACE_END - TRACE_START), 0, 1);
    const paint = sampleBubbleFlight(THREE.MathUtils.clamp((t - TRACE_START - PAINT_DELAY) / (TRACE_END - TRACE_START), 0, 1)).revealProgress;
    artwork.style.setProperty('--bubble-reveal', `${paint * 360}deg`);
    if (paint >= 1) artwork.style.setProperty('mask-image', 'none');
    const size = THREE.MathUtils.clamp(rect.width * 0.23, 88, 130);
    const start = screenFlight(0);
    const joinMotion = (atEnd: boolean) => {
      // Match position, velocity AND acceleration to the corresponding side
      // of the orbit. One-sided samples also respect its distance lookup.
      const probe = 0.00001;
      const step = probe * (TRACE_END - TRACE_START);
      const a = screenFlight(atEnd ? 1 - probe : probe);
      const b = screenFlight(atEnd ? 1 - 2 * probe : 2 * probe);
      const sign = atEnd ? 1 : -1;
      return {
        velocity: { x: sign * (3 * start.x - 4 * a.x + b.x) / (2 * step), y: sign * (3 * start.y - 4 * a.y + b.y) / (2 * step) },
        acceleration: { x: (start.x - 2 * a.x + b.x) / (step * step), y: (start.y - 2 * a.y + b.y) / (step * step) },
      };
    };
    let flight: Point & { dx: number; dy: number } = screenFlight(progress);
    if (t < TRACE_START) {
      const { velocity: v, acceleration: a } = joinMotion(false);
      const duration = TRACE_START;
      const near = { x: start.x - v.x * duration / 3, y: start.y - v.y * duration / 3 };
      const far = { x: start.x - 2 * v.x * duration / 3 + a.x * duration ** 2 / 6,
        y: start.y - 2 * v.y * duration / 3 + a.y * duration ** 2 / 6 };
      // Arrive from the left and below with the orbit's existing bank. Keeping
      // the offscreen start below both controls prevents a downward detour.
      flight = bezier({ x: -size * 1.5, y: Math.max(start.y + 160, far.y + 40) }, far, near, start, t / duration);
    } else if (t > TRACE_END) {
      const { velocity: v, acceleration: a } = joinMotion(true);
      const duration = END - TRACE_END;
      flight = bezier(start, { x: start.x + v.x * duration / 3, y: start.y + v.y * duration / 3 },
        { x: start.x + 2 * v.x * duration / 3 + a.x * duration ** 2 / 6,
          y: start.y + 2 * v.y * duration / 3 + a.y * duration ** 2 / 6 },
        { x: width + size * 2, y: -size }, (t - TRACE_END) / duration);
    }
    rig.root.visible = t < END;
    rig.root.position.set(flight.x, height - flight.y, 55);
    rig.root.scale.setScalar(size);
    heading.setFromAxisAngle(zAxis, Math.atan2(-flight.dy, flight.dx) + Math.PI / 2);
    bank.setFromAxisAngle(zAxis, 0.11 * Math.sin(progress * Math.PI) ** 2);
    rig.root.quaternion.copy(heading).multiply(topView).multiply(bank);
    rig.setTime(t * 4);

    const fade = 1 - smooth(TRACE_END, TRACE_END + 0.55, t);
    trail.visible = t >= TRACE_START && fade > 0;
    const trailHead = sampleBubbleFlight(progress).revealProgress;
    for (let i = 0; i <= SEGMENTS; i++) {
      const along = i / SEGMENTS;
      const p = Math.max(0, trailHead - (1 - along) * 0.075);
      const point = screenPoint(p);
      const halfWidth = (0.5 + along * 3.5) * size / 70;
      color.setHSL(0.52 + 0.30 * p, 0.65, 0.73);
      for (let side = 0; side < 2; side++) {
        const offset = halfWidth * (side ? 1 : -1);
        const vertex = i * 2 + side;
        positions[vertex * 3] = point.x - point.dy * offset;
        positions[vertex * 3 + 1] = height - point.y - point.dx * offset;
        positions[vertex * 3 + 2] = 30;
        colors[vertex * 4] = color.r; colors[vertex * 4 + 1] = color.g; colors[vertex * 4 + 2] = color.b;
        colors[vertex * 4 + 3] = along ** 1.5 * 0.6 * fade;
      }
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.trailColor.needsUpdate = true;
    if (t >= END) finish();
    if (import.meta.env.DEV) {
      host.dataset.butterflyTime = String(t);
      host.dataset.bubbleProgress = String(paint);
      host.dataset.butterflyPoint = JSON.stringify({ x: flight.x, y: flight.y });
    }
    renderer.render(scene, camera);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width; height = rect.height; hostLeft = rect.left; hostTop = rect.top;
    camera.right = width; camera.top = height; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    renderPose(previewTime ?? elapsed);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || !onScreen || document.hidden) { lastTime = 0; return; }
    if (!paused && previewTime === null && lastTime) elapsed = Math.min(END, elapsed + Math.min((now - lastTime) / 1000, 0.06));
    lastTime = now;
    const time = previewTime ?? elapsed;
    renderPose(time);
    if (time < END) frame = requestAnimationFrame(tick);
  }
  function schedule() { lastTime = 0; if (!frame && !disposed) frame = requestAnimationFrame(tick); }
  function replayIntro() {
    elapsed = 0;
    begin();
    if (paused) hero.querySelector<HTMLButtonElement>('[data-minecraft-pause]')?.click();
    schedule();
  }
  function animationState(event: Event) { paused = (event as CustomEvent<{ paused: boolean }>).detail.paused; schedule(); }
  function visibility() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
    else schedule();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; schedule(); });
  intersection.observe(host);
  replay.addEventListener('click', replayIntro);
  document.addEventListener('xr:animation-state', animationState);
  document.addEventListener('visibilitychange', visibility);
  replay.hidden = false;
  begin();
  resize();
  host.dataset.butterflyReady = 'true';
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect(); intersection.disconnect();
    replay.removeEventListener('click', replayIntro);
    replay.hidden = true;
    document.removeEventListener('xr:animation-state', animationState);
    document.removeEventListener('visibilitychange', visibility);
    finish();
    disposeScene(scene);
    rig.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
