import { AnimationMixer, Box3, DirectionalLight, Group, HemisphereLight, Mesh, Object3D, OrthographicCamera, Quaternion, VSMShadowMap, PlaneGeometry, Scene, ShadowMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { dragSurface } from './dragSurface';
import { assistantDocks } from './assistantDocks';
import { liquidPath, type LiquidOrigin } from '../projects/projectStoryMotion';

export async function mountHomeAssistant(root: HTMLElement, isCurrent: () => boolean) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-assistant-canvas]')!;
  const button = root.querySelector<HTMLButtonElement>('button')!;
  const home = document.querySelector<HTMLElement>('[data-home-waves]')!;
  const stage = home.querySelector<HTMLElement>('[data-home-waves-stage]')!;
  const create = home.querySelector<HTMLElement>('.home-statement__create');
  const textContext = document.createElement('canvas').getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = VSMShadowMap;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1.55, 1.55, 1.55, -1.55, .1, 30);
  camera.position.set(.9, 2.1, 7); camera.lookAt(0, 1.15, 0);
  scene.add(new HemisphereLight(0xf6f5f2, 0x585858, 1.65));
  const key = new DirectionalLight(0xffffff, 1.8); key.position.set(-2, 9, 4); key.castShadow = true;
  key.shadow.mapSize.set(256, 256); key.shadow.radius = 4; key.shadow.blurSamples = 4;
  key.shadow.camera.left = -2; key.shadow.camera.right = 2;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -2; key.shadow.normalBias = .025; key.shadow.bias = -.0001;
  scene.add(key);
  const fill = new DirectionalLight(0xe3e5e7, .5); fill.position.set(4, 2, -2); scene.add(fill);
  const shadowViewport = { value: new Vector2(1, 1) };
  const shadowMaterial = new ShadowMaterial({ color: 0x000000, opacity: .22 });
  shadowMaterial.onBeforeCompile = shader => {
    shader.uniforms.uShadowViewport = shadowViewport;
    shader.fragmentShader = 'uniform vec2 uShadowViewport;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>', `
      vec2 edge = min(gl_FragCoord.xy, uShadowViewport - gl_FragCoord.xy) / uShadowViewport;
      gl_FragColor.a *= smoothstep(0., .15, min(edge.x, edge.y));
      #include <premultiplied_alpha_fragment>`);
  };
  const shadow = new Mesh(new PlaneGeometry(12, 12), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.receiveShadow = true; scene.add(shadow);
  const pivot = new Group(); scene.add(pivot);
  const listeners = new AbortController();
  dragSurface(root, button, listeners.signal, box => assistantDocks(box, true));
  let placed = root.hasAttribute('data-assistant-placed') || root.hasAttribute('data-docked') || Boolean(root.style.translate);
  button.addEventListener('pointermove', () => {
    if (root.hasAttribute('data-dragging')) {
      placed = true; root.setAttribute('data-assistant-placed', '');
      measureRevealGeometry(); maskReveal();
    }
  }, { signal: listeners.signal });
  let disposed = false, ready = false, active = true, revealed = false, hover = false, focused = false, frame = 0, last = 0, time = 0;
  let greeting = 0, headAdjusted = false;
  let createInkBottom = 0, canvasHeight = 1, canvasInset = 0, alignedTop = NaN;
  let stageWidth = 1, stageHeight = 1, geometryFrame = 0;
  let revealBox = { x: 0, y: 0, width: 1, height: 1 };
  let previousMask = '';
  let revealBackground = 0;
  let revealOrigin: LiquidOrigin = { x: .72, y: .54, radius: 4 };
  let chatOpen = Boolean(document.querySelector('.chat__panel--open'));
  const model = await new GLTFLoader().loadAsync(canvas.dataset.modelUrl!).catch(error => {
    listeners.abort(); shadow.geometry.dispose(); (shadow.material as ShadowMaterial).dispose(); renderer.dispose(); throw error;
  });
  const loadedTextures = new Set<Texture>(), skeletons = new Set<Skeleton>();
  let head: Object3D | undefined, waveArm: Object3D | undefined, waveForearm: Object3D | undefined, waveHand: Object3D | undefined;
  model.scene.traverse(object => {
    if (/Head_06$/.test(object.name)) head = object;
    if (/LeftArm_09$/.test(object.name)) waveArm = object;
    if (/LeftForeArm_010$/.test(object.name)) waveForearm = object;
    if (/LeftHand_011$/.test(object.name)) waveHand = object;
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(material => {
      Object.values(material).forEach(value => { if (value instanceof Texture) loadedTextures.add(value); });
    });
    if ((mesh as SkinnedMesh).isSkinnedMesh) { skeletons.add((mesh as SkinnedMesh).skeleton); mesh.frustumCulled = false; }
  });
  const mixer = new AnimationMixer(model.scene);
  const idle = model.animations.find(clip => clip.name === 'Idle') || model.animations[0];
  const action = idle ? mixer.clipAction(idle) : undefined;
  action?.setEffectiveTimeScale(.7).play(); mixer.update(0);
  const bounds = new Box3().setFromObject(model.scene, true), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  const scale = 2.12 / Math.max(size.y, size.x * .9, size.z * .9);
  const normalized = new Group(), centered = new Group(); centered.add(model.scene); normalized.add(centered); normalized.scale.setScalar(scale);
  centered.position.set(-center.x, -bounds.min.y, -center.z);
  pivot.add(normalized); pivot.position.y = .025; pivot.rotation.y = -.16;
  pivot.updateWorldMatrix(true, true);
  // Keep only the vertices around the feet. Their skinned positions give the
  // visible silhouette, rather than the transparent canvas or ground shadow.
  const feet: { mesh: Mesh; index: number }[] = [];
  const footPoint = new Vector3();
  const standing = new Box3().setFromObject(pivot, true);
  const footLimit = standing.min.y + (standing.max.y - standing.min.y) * .18;
  model.scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      mesh.getVertexPosition(index, footPoint).applyMatrix4(mesh.matrixWorld);
      if (footPoint.y <= footLimit) feet.push({ mesh, index });
    }
  });
  const restHead = new Quaternion(), nod = new Quaternion();
  const nodAxis = new Vector3(0, 0, 1), liftAxis = new Vector3(1, 0, 0);
  const waveRotation = new Quaternion();
  const waveBones = [waveArm, waveForearm, waveHand].map(bone => ({ bone, rest: new Quaternion() }));
  let waveApplied = false;
  const ease = (value: number) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };
  function restoreWave() {
    if (!waveApplied) return;
    for (const { bone, rest } of waveBones) bone?.quaternion.copy(rest);
    waveApplied = false;
  }
  function wave() {
    if (!waveArm || !waveForearm || !waveHand) return;
    const cycle = time % 8.8;
    const strength = ease((cycle - .8) / .65) * (1 - ease((cycle - 3.05) / .65));
    if (strength <= 0) return;
    const flutter = Math.sin((cycle - 1.45) * Math.PI * 4.2) * ease((cycle - 1.45) / .25) * (1 - ease((cycle - 2.8) / .25));
    // In this GLB, each arm follows local +Y. Negative local-X flexion lifts
    // the elbow toward the face; a small wrist arc supplies the greeting.
    const angles = [-1.05, -1.6 + flutter * .065, flutter * .20];
    waveBones.forEach(({ bone, rest }, index) => {
      if (!bone) return;
      rest.copy(bone.quaternion);
      waveRotation.setFromAxisAngle(liftAxis, angles[index] * strength);
      bone.quaternion.multiply(waveRotation);
    });
    waveApplied = true;
  }
  function cleanup() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(geometryFrame); listeners.abort(); resize.disconnect(); visibility.disconnect();
    scene.traverse(object => { const mesh = object as Mesh; if (!mesh.isMesh) return; mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose()); });
    mixer.stopAllAction(); mixer.uncacheRoot(model.scene); skeletons.forEach(skeleton => skeleton.dispose());
    loadedTextures.forEach(texture => texture.dispose()); key.shadow.map?.dispose(); key.shadow.mapPass?.dispose(); renderer.dispose();
    root.removeAttribute('data-ready'); root.inert = false;
    for (const property of ['opacity', 'visibility', 'clip-path']) root.style.removeProperty(property);
  }
  function measureAlignment() {
    if (!create || !textContext || placed) return;
    const style = getComputedStyle(create);
    textContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = textContext.measureText(create.textContent?.trim() || 'Create.');
    const fontSize = parseFloat(style.fontSize);
    const ascent = metrics.fontBoundingBoxAscent || fontSize * .8;
    const descent = metrics.fontBoundingBoxDescent || fontSize * .2;
    const lineHeight = parseFloat(style.lineHeight) || ascent + descent;
    const lineTop = create.getBoundingClientRect().top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
    const baseline = lineTop + (lineHeight - ascent - descent) / 2 + ascent;
    createInkBottom = baseline + metrics.actualBoundingBoxDescent - stage.getBoundingClientRect().top;
    const canvasBox = canvas.getBoundingClientRect();
    canvasHeight = canvasBox.height;
    canvasInset = canvasBox.top - root.getBoundingClientRect().top;
  }
  function measureRevealGeometry() {
    if (disposed) return;
    const box = root.getBoundingClientRect(), stageBox = stage.getBoundingClientRect();
    stageWidth = stage.clientWidth; stageHeight = stage.clientHeight;
    revealBox = { x: box.left - stageBox.left, y: box.top - stageBox.top, width: box.width, height: box.height };
  }
  function refreshGeometry() {
    if (disposed || geometryFrame) return;
    geometryFrame = requestAnimationFrame(() => {
      geometryFrame = 0;
      measureRevealGeometry(); maskReveal();
    });
  }
  function alignFeet() {
    if (!create || !feet.length || !createInkBottom || placed || root.hasAttribute('data-dragging') || root.hasAttribute('data-docked')) return;
    let lowest = Infinity;
    for (const { mesh, index } of feet) {
      mesh.getVertexPosition(index, footPoint).applyMatrix4(mesh.matrixWorld).project(camera);
      lowest = Math.min(lowest, footPoint.y);
    }
    const top = createInkBottom - canvasInset - (1 - lowest) * .5 * canvasHeight;
    if (Math.abs(top - alignedTop) < .025) return;
    alignedTop = top;
    root.style.setProperty('--assistant-top', `${top.toFixed(3)}px`);
    root.setAttribute('data-feet-aligned', '');
    // Unplaced models have no drag translation, so their new stage-relative
    // top is known without forcing layout after this style write.
    revealBox.y = top;
  }
  function maskReveal() {
    if (revealBackground <= 0 || revealBackground >= 1) {
      if (previousMask) root.style.removeProperty('clip-path');
      previousMask = ''; return;
    }
    const hole = liquidPath(revealBackground, stageWidth, stageHeight, revealOrigin, revealBox.x, revealBox.y);
    const mask = `path(evenodd, 'M-100 -100H${revealBox.width + 100}V${revealBox.height + 100}H-100Z${hole}')`;
    if (mask !== previousMask) { root.style.clipPath = mask; previousMask = mask; }
  }
  function draw() {
    renderer.render(scene, camera);
    alignFeet();
    if (revealBackground > 0 && revealBackground < 1) maskReveal();
  }
  function resizeCanvas() {
    if (disposed) return;
    const size = Math.max(1, canvas.clientWidth);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25)); renderer.setSize(size, size, false);
    renderer.getDrawingBufferSize(shadowViewport.value);
    measureAlignment();
    measureRevealGeometry();
    if (ready) draw();
  }
  function wake() {
    if (!ready || disposed || document.hidden || !active || revealed || chatOpen || frame) return;
    last = 0; frame = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || document.hidden || !active || revealed || chatOpen) return;
    if (!last || now - last >= 1000 / 30 - .5) {
      const delta = last ? Math.min((now - last) / 1000, .1) : 0;
      time += delta; last = now;
      restoreWave();
      if (headAdjusted && head) { head.quaternion.copy(restHead); headAdjusted = false; }
      if (!reduced.matches) {
        const attentive = hover || focused;
        greeting += ((attentive ? 1 : 0) - greeting) * (1 - Math.exp(-7 * delta));
        mixer.update(delta * (1 - greeting * .7));
        pivot.rotation.y = -.16 * (1 - greeting) + Math.sin(time * .4) * .025 * (1 - greeting);
        if (head) {
          restHead.copy(head.quaternion);
          nod.setFromAxisAngle(nodAxis, greeting * .10);
          head.quaternion.multiply(nod);
          headAdjusted = true;
        }
        wave();
      }
      draw();
    }
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  const resize = new ResizeObserver(resizeCanvas);
  const visibility = new IntersectionObserver(entries => { active = entries[0].isIntersecting; wake(); });
  if (!isCurrent()) { cleanup(); return cleanup; }
  resizeCanvas(); await renderer.compileAsync(scene, camera);
  if (!isCurrent()) { cleanup(); return cleanup; }
  ready = true; draw(); root.setAttribute('data-ready', '');
  resize.observe(canvas); resize.observe(stage); if (create) resize.observe(create); visibility.observe(root);
  const options = { signal: listeners.signal };
  button.addEventListener('pointerenter', () => { hover = true; wake(); }, options);
  button.addEventListener('pointerleave', () => { hover = false; }, options);
  button.addEventListener('focus', () => { focused = true; wake(); }, options);
  button.addEventListener('blur', () => { focused = false; }, options);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => {
    refreshGeometry();
    // Dock snapping animates only after a drag. Refresh once more at its end;
    // ordinary scroll frames never read a bounding box.
    void Promise.allSettled(root.getAnimations().map(animation => animation.finished)).then(refreshGeometry);
  }, options);
  window.addEventListener('resize', refreshGeometry, { ...options, passive: true });
  document.addEventListener('visibilitychange', wake, options);
  window.addEventListener('xr:chat-state', event => { chatOpen = Boolean((event as CustomEvent).detail); wake(); }, options);
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      restoreWave();
      if (headAdjusted && head) { head.quaternion.copy(restHead); headAdjusted = false; }
      if (ready) draw();
    }
    wake();
  }, options);
  const updateReveal = (background: number, origin?: LiquidOrigin) => {
    revealBackground = background;
    if (origin) revealOrigin = origin;
    revealed = background >= 1; root.inert = revealed;
    root.style.removeProperty('opacity'); root.style.visibility = revealed ? 'hidden' : '';
    maskReveal();
    wake();
  };
  home.addEventListener('xr:project-progress', event => {
    const { background, origin } = (event as CustomEvent<{ background: number; origin: LiquidOrigin }>).detail;
    updateReveal(background, origin);
  }, options);
  updateReveal(Number(home.style.getPropertyValue('--project-background')) || 0, {
    x: Number(home.style.getPropertyValue('--project-origin-x')) || .72,
    y: Number(home.style.getPropertyValue('--project-origin-y')) || .54,
    radius: Number(home.style.getPropertyValue('--project-origin-radius')) || 4,
  });
  document.fonts.ready.then(() => { if (!disposed) resizeCanvas(); });
  wake(); return cleanup;
}
