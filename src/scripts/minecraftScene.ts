import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSteveRig } from './minecraftRig';
import { createStarModel } from './starModel';
import { createStarCollisionSolver } from './starCollision';

const DURATION = 42;
const AVATAR_SCALE = 0.68;
// Native placement of the supplied PNG in the original 6912 × 3456 artwork.
const STAR_ART = { x: 2543.5, y: 2943.5, width: 351, height: 397, backgroundWidth: 6912, backgroundHeight: 3456 };
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const envelope = (t: number, a: number, b: number, c: number, d: number) => smooth(a, b, t) * (1 - smooth(c, d, t));
const track = (t: number, keys: number[][]) => {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], smooth(keys[i - 1][0], keys[i][0], t));
  }
  return keys[keys.length - 1][1];
};

function disposeObject(object: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
  });
  textures.forEach((texture) => texture.dispose());
}

export async function mountMinecraftScene(host: HTMLElement) {
  const viewport = host.querySelector<HTMLElement>('[data-minecraft-viewport]')!;
  const background = host.parentElement?.querySelector<HTMLImageElement>('[data-hero-background]');
  const controls = host.querySelector<HTMLElement>('[data-minecraft-controls]')!;
  const pauseButton = host.querySelector<HTMLButtonElement>('[data-minecraft-pause]')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  viewport.append(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-8, 8, 4, -4, 0.1, 80);
  camera.position.set(0, 3.8, 14);
  camera.lookAt(0, 0, 0);
  const stage = new THREE.Group();
  scene.add(stage);
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x403050, 2.4));
  const key = new THREE.DirectionalLight(0xfff0de, 3.1);
  key.position.set(-3, 7, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb280ff, 2.2);
  rim.position.set(3, 4, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x64e9e4, 0.65);
  fill.position.set(-5, 2, 1);
  scene.add(fill);

  const loader = new GLTFLoader();
  const base = host.dataset.base || '/';
  const results = await Promise.allSettled([
    loader.loadAsync(`${base}models/the_perfect_steve_rigged.glb`),
    new THREE.TextureLoader().loadAsync(`${base}models/homepage-star.png`),
  ]);
  if (results[0].status === 'rejected' || results[1].status === 'rejected') {
    if (results[0].status === 'fulfilled') disposeObject(results[0].value.scene);
    if (results[1].status === 'fulfilled') results[1].value.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    throw new AggregateError(results.filter((result) => result.status === 'rejected').map((result) => result.reason), 'Unable to load the homepage models.');
  }
  const steveAsset = results[0].value;
  for (const model of [steveAsset.scene]) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      // The source artwork is pixel art: preserve its deliberate sharp edges.
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.map) {
          material.map.magFilter = THREE.NearestFilter;
          material.map.needsUpdate = true;
          material.roughness = 0.9;
        }
      }
      child.frustumCulled = false;
    });
  }

  const rig = createSteveRig(steveAsset.scene, steveAsset.animations[0]);
  rig.root.scale.setScalar(AVATAR_SCALE);
  stage.add(rig.root);
  const starModel = createStarModel(results[1].value);
  const star = starModel.root;
  stage.add(star);
  const collision = createStarCollisionSolver(rig.root, star, new THREE.Vector3(starModel.halfWidth, starModel.halfHeight, starModel.halfDepth));

  // Soft contact shadows keep the visitors grounded in the homepage artwork.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.65)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const createShadow = () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.85 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.renderOrder = -1;
    stage.add(mesh);
    return mesh;
  };
  const steveShadow = createShadow();
  const starShadow = createShadow();

  let worldWidth = 14;
  let avatarScale = AVATAR_SCALE;
  let mobile = false;
  let disposed = false;
  let paused = reducedMotion.matches;
  let onScreen = true;
  let frame = 0;
  let elapsed = 0;
  let lastTime = 0;
  let auditing = false;
  // Development-only still frames make the contact poses reviewable.
  const requestedTime = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene-time') : null;
  const previewTime = requestedTime !== null && Number.isFinite(Number(requestedTime)) ? Number(requestedTime) : null;
  const carriedCenter = new THREE.Vector3();
  const restCenter = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  let starHeight = 1;
  const handTarget = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const carryQuaternion = new THREE.Quaternion();
  const restQuaternion = camera.quaternion.clone();
  const inverseStageQuaternion = new THREE.Quaternion();
  const inverseStarMatrix = new THREE.Matrix4();
  const armVertex = new THREE.Vector3();
  const gazeTarget = new THREE.Vector3();

  const renderPose = (time: number) => {
    const t = ((time % DURATION) + DURATION) % DURATION;
    const starX = anchor.x;
    const pauseX = starX - (mobile ? 0.9 : 1.25);
    const startX = Math.min(-worldWidth / 2 - 1.2, pauseX - 1.2);
    const exitX = worldWidth / 2 + 1.4;
    const entry = smooth(1.8, 7, t);
    const approach = smooth(17, 20, t);
    const exit = smooth(25.2, 34, t);
    const x = mix(startX, pauseX, entry) + (starX - pauseX) * approach + (exitX - starX) * exit;
    const gait = envelope(t, 1.8, 2.5, 6.3, 7) + envelope(t, 17, 17.4, 19.5, 20) + envelope(t, 25.2, 25.9, 33.4, 34);
    const distance = (pauseX - startX) * entry + (starX - pauseX) * approach + (exitX - starX) * exit;
    const scratch = envelope(t, 8.1, 8.9, 10.8, 11.6);
    const grip = smooth(20, 21, t);
    const lift = smooth(21.3, 23.7, t);
    const depth = smooth(21.3, 22.8, t);
    const carry = smooth(22, 24, t);
    const hop = (a: number, b: number, height: number) => {
      const phase = clamp((t - a) / (b - a), 0, 1);
      return height * Math.sin(Math.PI * phase);
    };
    const sceneScale = avatarScale / AVATAR_SCALE;
    const jump = (hop(13.35, 14.1, 0.24) + hop(14.7, 15.55, 0.34)) * sceneScale;
    const knees = envelope(t, 12.9, 13.2, 13.35, 13.55) * 0.55
      + envelope(t, 13.95, 14.2, 14.55, 14.75) * 0.5
      + envelope(t, 15.35, 15.65, 16, 16.4) * 0.6;
    const step = distance / (1.2 * avatarScale) * Math.PI * 2;
    const bob = (1 - Math.cos(step * 2)) * 0.014 * gait;
    const sway = Math.sin(step) * 0.022 * gait;
    rig.root.visible = !reducedMotion.matches && t < 35;
    const approachDepth = envelope(t, 17, 18, 19.3, 20.3) * 0.22;
    rig.root.position.set(x, jump + bob, (-0.42 - approachDepth) * sceneScale);
    rig.root.rotation.set(0, track(t, [[0, 1.12], [7, 0.28], [8.2, -0.16], [11.5, 0.45], [12.8, 1.03], [16.5, 1.03], [18.7, 1.03], [20, 0], [24, 0], [25.8, 1.18], [42, 1.18]]), sway);
    rig.updateWalk(distance / (1.2 * avatarScale) * (steveAsset.animations[0]?.duration || 1.667), clamp(gait * (1 - carry * 0.28), 0, 1));
    rig.setCrouch(knees);
    // The opening scan stays authored; the star gaze below follows its position.
    const headPitch = track(t, [[0, 0], [7, -0.16], [8, -0.3], [10.8, -0.12], [12.5, 0.08], [16, 0.08], [19, 0.08], [21, 0.08], [23.7, 0.1], [24.5, -0.09], [25.5, 0.03], [42, 0.03]]);
    const headYaw = track(t, [[0, 0], [7, 0.28], [8, -0.35], [9.5, 0.22], [10.5, -0.16], [12.5, 0.14], [16.5, 0.14], [20, 0], [24, 0], [24.7, -0.35], [25.8, 0], [42, 0]]);
    rig.setTorso(-carry * 0.025 + knees * 0.13, scratch * 0.065 + sway * 0.4);
    rig.setHead(headPitch, headYaw, scratch * -0.14 + Math.sin(t * 1.1) * 0.015);
    stage.updateMatrixWorld(true);

    if (scratch > 0) {
      rig.getHeadScratchTarget(t, handTarget);
      pole.set(-1.3, 1.85, 0.25);
      rig.root.localToWorld(pole);
      rig.reachHand('right', handTarget, scratch, pole);
    }
    if (jump > 0) {
      // Loose raised elbows accompany the little hops, then settle before reaching.
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? 1 : -1;
        handTarget.set(sign * 0.68, 1.42, 0.36);
        rig.root.localToWorld(handTarget);
        rig.reachHand(side, handTarget, clamp(jump * 3, 0, 0.75));
      }
    }

    restCenter.copy(anchor);
    carriedCenter.set(0, 1.36 + Math.sin(step * 2 + 0.4) * 0.012 * gait, 0.60);
    rig.root.localToWorld(carriedCenter);
    stage.worldToLocal(carriedCenter);
    star.position.copy(restCenter).lerp(carriedCenter, lift);
    stage.getWorldQuaternion(inverseStageQuaternion).invert();
    rig.root.getWorldQuaternion(carryQuaternion).premultiply(inverseStageQuaternion);
    // The same UV-mapped front starts facing the camera and slowly peels free.
    star.quaternion.copy(restQuaternion).slerp(carryQuaternion, lift);
    star.scale.setScalar(starHeight);
    starModel.setDepth(depth);
    const reset = t >= 35;
    const returnAmount = reset ? smooth(37, 39, t) : 1;
    star.visible = !reset || t >= 37 || reducedMotion.matches;
    if (reset || reducedMotion.matches) {
      star.position.copy(restCenter);
      star.quaternion.copy(restQuaternion);
      starModel.setDepth(0);
      // After Steve has left, the original flat artwork returns in place.
      for (const child of star.children[0].children) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = reducedMotion.matches ? 1 : returnAmount;
      }
    } else {
      for (const child of star.children[0].children) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = 1;
      }
    }
    const starAttention = envelope(t, 11.1, 12, 16.8, 19);
    if (starAttention > 0) {
      star.getWorldPosition(gazeTarget);
      rig.lookAtHead(gazeTarget, starAttention);
    }
    stage.updateMatrixWorld(true);
    let contactError = 0;
    let collisionPush = 0;
    const bodyColliders = rig.root.visible ? rig.getBodyColliders() : [];
    if (!reset && !reducedMotion.matches) {
      // Keep the page artwork pinned through contact, then gradually transfer
      // the clearance from Steve's retreat to the lifted prop. Both sides use
      // the same posed colliders before hand IK, avoiding a pickup jump or a
      // sideways retreat once he turns to carry the star away.
      const retreat = collision.avoidStatic(bodyColliders, depth);
      const transfer = smooth(22.8, 24, t);
      collisionPush = retreat;
      if (transfer > 0) {
        rig.root.position.z += retreat * transfer;
        collisionPush = collision.resolve(bodyColliders, depth);
      }
    }
    if (grip > 0 && t < 35) {
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? 1 : -1;
        // Palm contact stays just outside the opaque left/right star tips.
        handTarget.set(sign * 0.47, side === 'left' ? 0.022 : -0.023, -0.14);
        star.localToWorld(handTarget);
        pole.set(sign * 1.4, 1.35, 0.35);
        rig.root.localToWorld(pole);
        rig.reachHand(side, handTarget, grip, pole);
        if (import.meta.env.DEV) contactError = Math.max(contactError, rig.getHandPosition(side).distanceTo(handTarget));
      }
    }
    steveShadow.visible = rig.root.visible;
    steveShadow.position.set(x, 0.015, -0.35);
    steveShadow.scale.set(1.05 + jump * 0.4, 0.6 + jump * 0.25, 1);
    steveShadow.material.opacity = 0.8 - jump * 0.85;
    // The original image has its own glow. Ground shadow starts only on pickup.
    starShadow.visible = star.visible && lift > 0 && !reset && !reducedMotion.matches;
    starShadow.position.set(star.position.x, 0.017, star.position.z);
    starShadow.scale.set(starHeight * 1.1, starHeight * 0.65, 1);
    starShadow.material.opacity = 0.3 * lift;
    if (import.meta.env.DEV) {
      host.dataset.contactError = contactError.toFixed(4);
      host.dataset.collisionPush = collisionPush.toFixed(4);
      host.dataset.bodyIntersection = String(rig.root.visible && star.visible && collision.intersects(bodyColliders, reset ? 0 : depth));
      host.dataset.sceneTime = t.toFixed(3);
      host.dataset.starDepth = (reset ? 0 : depth).toFixed(3);
      if (auditing) {
        let penetrations = 0;
        star.updateWorldMatrix(true, false);
        inverseStarMatrix.copy(star.matrixWorld).invert();
        if (depth > 0 && !reset) for (const side of ['left', 'right'] as const) {
          for (const vertex of rig.getArmVertices(side)) {
            armVertex.copy(vertex).applyMatrix4(inverseStarMatrix);
            if (starModel.containsPoint(armVertex, depth)) penetrations++;
          }
        }
        host.dataset.armPenetrations = String(penetrations);
      }
    }
    host.dataset.scenePhase = reducedMotion.matches ? 'still' : t < 7 ? 'enter' : t < 11.6 ? 'confused' : t < 17 ? 'look-and-hop' : t < 20 ? 'approach' : t < 21.3 ? 'reach' : t < 24 ? 'peel' : t < 35 ? 'carry' : 'reset';
    if (!auditing) renderer.render(scene, camera);
  };
  const resize = () => {
    const hostRect = host.getBoundingClientRect();
    const { width, height } = hostRect;
    if (!width || !height) return;
    mobile = width < 640;
    // On narrow screens the miniature scene lives beneath the central wordmark.
    const viewHeight = mobile ? 10.8 : 8;
    avatarScale = AVATAR_SCALE * viewHeight / 8;
    rig.root.scale.setScalar(avatarScale);
    worldWidth = width / height * viewHeight;
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    const cameraCosine = Math.cos(Math.atan2(3.8, 14));
    stage.position.y = -viewHeight * 0.485 / cameraCosine;
    // Map the source artwork into the background image's actual cover crop.
    // Keeping this independent of breakpoints prevents the star drifting away
    // from its photo when a window, browser panel, or device changes size.
    const backgroundRect = background?.getBoundingClientRect() ?? hostRect;
    const imageWidth = background?.naturalWidth || STAR_ART.backgroundWidth;
    const imageHeight = background?.naturalHeight || STAR_ART.backgroundHeight;
    const artworkScale = Math.max(backgroundRect.width / imageWidth, backgroundRect.height / imageHeight);
    const renderedWidth = imageWidth * artworkScale;
    const renderedHeight = imageHeight * artworkScale;
    const pixelX = backgroundRect.left - hostRect.left + backgroundRect.width / 2 + (STAR_ART.x / STAR_ART.backgroundWidth - 0.5) * renderedWidth;
    const pixelY = backgroundRect.top - hostRect.top + backgroundRect.height / 2 + (STAR_ART.y / STAR_ART.backgroundHeight - 0.5) * renderedHeight;
    const pixelWidth = STAR_ART.width / STAR_ART.backgroundWidth * renderedWidth;
    const pixelHeight = STAR_ART.height / STAR_ART.backgroundHeight * renderedHeight;
    starHeight = pixelHeight / height * viewHeight;
    anchor.set((pixelX / width - 0.5) * worldWidth, (0.5 - pixelY / height) * viewHeight / cameraCosine - stage.position.y, 0);
    const flatImage = host.querySelector<HTMLElement>('[data-star-image]')!;
    Object.assign(flatImage.style, { left: `${pixelX}px`, top: `${pixelY}px`, width: `${pixelWidth}px`, height: `${pixelHeight}px` });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    renderPose(previewTime ?? elapsed);
  };
  const updateControl = () => {
    const stopped = paused || reducedMotion.matches;
    pauseButton.setAttribute('aria-label', stopped ? 'Play homepage animations' : 'Pause homepage animations');
    pauseButton.title = stopped ? 'Play animations' : 'Pause animations';
    host.dataset.animationPaused = String(stopped);
    document.dispatchEvent(new CustomEvent('xr:animation-state', { detail: { paused: stopped } }));
    host.querySelector('[data-pause-icon]')!.toggleAttribute('hidden', stopped);
    host.querySelector('[data-play-icon]')!.toggleAttribute('hidden', !stopped);
    pauseButton.hidden = reducedMotion.matches;
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || paused || reducedMotion.matches || !onScreen || document.hidden || previewTime !== null) return;
    if (lastTime) elapsed += Math.min((now - lastTime) / 1000, 0.06);
    lastTime = now;
    renderPose(elapsed);
    frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    lastTime = 0;
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  };
  const togglePause = () => { paused = !paused; updateControl(); schedule(); };
  const changeMotion = () => { paused = reducedMotion.matches; updateControl(); renderPose(elapsed); schedule(); };
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const intersection = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; schedule(); });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  if (background) observer.observe(background);
  background?.addEventListener('load', resize);
  intersection.observe(host);
  pauseButton.addEventListener('click', togglePause);
  reducedMotion.addEventListener('change', changeMotion);
  document.addEventListener('visibilitychange', visibility);
  resize();
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('scene-audit')) {
    auditing = true;
    let intersections = 0, maxContactError = 0, maxCollisionPush = 0, maxArmPenetrations = 0, armFailureTime = 0;
    const failures: number[] = [];
    for (let sample = 0; sample < DURATION * 30; sample++) {
      const time = sample / 30;
      renderPose(time);
      if (host.dataset.bodyIntersection === 'true') { intersections++; if (failures.length < 8) failures.push(time); }
      if (time >= 21 && time < 35) maxContactError = Math.max(maxContactError, Number(host.dataset.contactError));
      maxCollisionPush = Math.max(maxCollisionPush, Number(host.dataset.collisionPush));
      if (Number(host.dataset.armPenetrations) > maxArmPenetrations) { maxArmPenetrations = Number(host.dataset.armPenetrations); armFailureTime = time; }
    }
    renderPose(21.3);
    const seamPosition = star.position.clone();
    const seamQuaternion = star.quaternion.clone();
    renderPose(21.3001);
    host.dataset.sceneAudit = JSON.stringify({ samples: DURATION * 30, intersections, failures, maxContactError, maxCollisionPush, maxArmPenetrations, armFailureTime, pickupPositionDelta: seamPosition.distanceTo(star.position), pickupRotationDelta: seamQuaternion.angleTo(star.quaternion) });
    auditing = false;
    renderPose(previewTime ?? elapsed);
  }
  controls.hidden = false;
  host.classList.add('is-ready');
  updateControl();
  schedule();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    background?.removeEventListener('load', resize);
    intersection.disconnect();
    pauseButton.removeEventListener('click', togglePause);
    reducedMotion.removeEventListener('change', changeMotion);
    document.removeEventListener('visibilitychange', visibility);
    disposeObject(stage);
    rig.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
