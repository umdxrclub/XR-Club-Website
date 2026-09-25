import { clamp, mix, phase, type StoryBox } from '../projects/projectStoryMotion';
import { mountSkyWorld } from './skyWorld';
import { mountOrangeWaves } from './orangeWaves';
import { mountSkyStory } from './skyStory';
import { mountEquipmentJourney } from '../equipment/equipmentJourney';
import { SKY_STORY_DISTANCE, storyCloudProgress } from './skyStoryMotion';
import { SKY_PROJECT_HOLD, SKY_TRANSITION_DISTANCE, skyTransitionPose } from './skyTimeline';
import { mountPointerTilt } from '../../lib/pointerTilt';

type Point = { x: number; y: number };
const samples = 160;
const attr = (element: Element, key: string, value: string) => {
  if (element.getAttribute(key) !== value) element.setAttribute(key, value);
};
const style = (element: HTMLElement | SVGElement, key: string, value: string) => {
  if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
};
const data = (element: HTMLElement, key: string, value: string) => {
  if (element.dataset[key] !== value) element.dataset[key] = value;
};

// Attached rivulets stretch ahead of the sheet and merge back into its surface.
export function orangeLiquidPath(progress: number, width: number, height: number) {
  if (progress <= 0) return 'M0 0H0V0Z';
  if (progress >= 1) return `M0 0H${width}V${height}H0Z`;
  const sweep = phase(.035, 1, progress), swell = Math.sin(Math.PI * sweep);
  const edge = (x: number) => {
    const wave = .065 * Math.sin(x * Math.PI * 2.4 + progress * 2.3) + .035 * Math.sin(x * Math.PI * 5.1 - progress * 1.8);
    const slope = .065 * Math.PI * 2.4 * Math.cos(x * Math.PI * 2.4 + progress * 2.3) + .035 * Math.PI * 5.1 * Math.cos(x * Math.PI * 5.1 - progress * 1.8);
    return { y: height * (mix(-.19, 1.2, sweep) + swell * (wave + .07 * (x - .5))), slope: height * swell * (slope + .07) };
  };
  let path = `M0 -1H${width}V${edge(1).y.toFixed(2)}`;
  const surface = (from: number, to: number) => {
    const count = Math.max(1, Math.ceil((from - to) * 80)), step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const x = from + step * i, next = x + step, a = edge(x), b = edge(next);
      path += `C${((x + step / 3) * width).toFixed(2)} ${(a.y + a.slope * step / 3).toFixed(2)} ${((next - step / 3) * width).toFixed(2)} ${(b.y - b.slope * step / 3).toFixed(2)} ${(next * width).toFixed(2)} ${b.y.toFixed(2)}`;
    }
  };
  const streams = [
    { x: .065, width: .023, depth: .28, start: .015, end: .76, bend: -.45 },
    { x: .29, width: .015, depth: .19, start: .10, end: .84, bend: .65 },
    { x: .57, width: .037, depth: .33, start: 0, end: .86, bend: -.3 },
    { x: .785, width: .012, depth: .20, start: .18, end: .92, bend: .55 },
    { x: .94, width: .027, depth: .26, start: .065, end: .81, bend: -.5 },
  ];
  let cursor = 1;
  for (const stream of streams.reverse()) {
    const age = phase(stream.start, stream.end, progress), reach = Math.sin(Math.PI * age);
    if (reach < .0001) continue;
    const cx = stream.x * width, base = edge(stream.x).y, length = height * stream.depth * reach;
    const radius = Math.min(width, height * 1.4) * stream.width * reach;
    const shoulder = Math.min(radius * 2.3, cx * .99, (width - cx) * .99), neck = radius * (.22 + .13 * (1 - reach));
    const tipRadius = radius * .8, tip = base + length, drift = radius * stream.bend * reach;
    const right = stream.x + shoulder / width, left = stream.x - shoulder / width, rightEdge = edge(right), leftEdge = edge(left);
    surface(cursor, right);
    // Match the sheet's tangent at both roots, so the rivulet is part of one
    // smooth outline, with neither overlapping seams nor detached shapes.
    path += `C${cx + shoulder * .52} ${rightEdge.y - shoulder * .48 * rightEdge.slope / width} ${cx + neck + drift * .18} ${base + length * .13} ${cx + neck + drift * .3} ${base + length * .4}`;
    path += `C${cx + neck + drift * .5} ${base + length * .65} ${cx + tipRadius + drift} ${tip - tipRadius * 1.8} ${cx + tipRadius + drift} ${tip - tipRadius}`;
    path += `C${cx + tipRadius + drift} ${tip - tipRadius * .38} ${cx + tipRadius * .55 + drift} ${tip} ${cx + drift} ${tip}`;
    path += `C${cx - tipRadius * .55 + drift} ${tip} ${cx - tipRadius + drift} ${tip - tipRadius * .38} ${cx - tipRadius + drift} ${tip - tipRadius}`;
    path += `C${cx - tipRadius + drift} ${tip - tipRadius * 1.8} ${cx - neck + drift * .5} ${base + length * .65} ${cx - neck + drift * .3} ${base + length * .4}`;
    path += `C${cx - neck + drift * .18} ${base + length * .13} ${cx - shoulder * .52} ${leftEdge.y + shoulder * .48 * leftEdge.slope / width} ${cx - shoulder} ${leftEdge.y}`;
    cursor = left;
  }
  surface(cursor, 0);
  return `${path}Z`;
}

function sample(path: SVGPathElement, flip = false, count = samples) {
  const length = path.getTotalLength();
  return Array.from({ length: count }, (_, i) => {
    const point = path.getPointAtLength(length * (flip ? (count - i) % count : i) / count);
    return { x: point.x, y: flip ? 1 - point.y : point.y };
  });
}

function align(source: Point[], target: Point[]) {
  let best = 0, score = Infinity;
  for (let offset = 0; offset < samples; offset++) {
    let total = 0;
    for (let i = 0; i < samples; i++) {
      const a = source[i], b = target[(i + offset) % samples];
      total += (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    }
    if (total < score) { score = total; best = offset; }
  }
  return target.map((_, i) => target[(i + best) % samples]);
}

function contour(points: Point[], box: StoryBox, pitch: number, yaw: number, roll: number, perspective: number) {
  // Rotate an undistorted plane in 3D, then project it through the camera.
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const projected = points.map(point => {
    const x = (point.x - .5) * box.width, y = (point.y - .5) * box.height;
    const py = y * cp, pz = y * sp;
    const px = x * cy + pz * sy, z = -x * sy + pz * cy;
    const scale = perspective / Math.max(perspective * .15, perspective - z);
    return { x: box.x + box.width / 2 + (px * cr - py * sr) * scale,
      y: box.y + box.height / 2 + (px * sr + py * cr) * scale };
  });
  // A closed cubic spline removes the tiny facets of a polygon clip, including
  // while the outline is morphing and when the camera is close to its corners.
  let path = `M${projected[0].x.toFixed(3)} ${projected[0].y.toFixed(3)}`;
  for (let i = 0; i < projected.length; i++) {
    const a = projected[(i + projected.length - 1) % projected.length], b = projected[i];
    const c = projected[(i + 1) % projected.length], d = projected[(i + 2) % projected.length];
    path += `C${(b.x + (c.x - a.x) / 6).toFixed(3)} ${(b.y + (c.y - a.y) / 6).toFixed(3)} ${(c.x - (d.x - b.x) / 6).toFixed(3)} ${(c.y - (d.y - b.y) / 6).toFixed(3)} ${c.x.toFixed(3)} ${c.y.toFixed(3)}`;
  }
  return `${path}Z`;
}

export function mountSkyJourney(root: HTMLElement) {
  const candidate = root.querySelector<HTMLElement>('[data-sky-journey]');
  if (!candidate) return null;
  const journey = candidate;
  const orange = journey.querySelector<HTMLElement>('[data-orange-reveal]')!;
  const orangeWaves = mountOrangeWaves(orange);
  const orangeCoverage = journey.querySelector<SVGPathElement>('[data-sky-orange-coverage]')!;
  const view = journey.querySelector<HTMLElement>('[data-sky-view]')!;
  const front = journey.querySelector<HTMLElement>('[data-sky-front]')!;
  const paths = [...journey.querySelectorAll<SVGPathElement>('[data-sky-window]')];
  const shadow = journey.querySelector<SVGSVGElement>('[data-sky-shadows]')!;
  const shadowPaths = [...journey.querySelectorAll<SVGPathElement>('[data-sky-shadow-window]')];
  const shadowFilter = journey.querySelector<SVGFilterElement>('#sky-folder-shadow')!;
  const shadowBlur = journey.querySelector<SVGFEGaussianBlurElement>('[data-sky-shadow-blur]')!;
  const shadowOffset = journey.querySelector<SVGFEOffsetElement>('[data-sky-shadow-offset]')!;
  const setWindow = (index: number, outline: string) => {
    attr(paths[index], 'd', outline);
    attr(shadowPaths[index], 'd', outline);
  };
  const source = sample(journey.querySelector<SVGPathElement>('#sky-folder-source')!, true);
  const frontSource = sample(journey.querySelector<SVGPathElement>('#sky-folder-source')!);
  const target = align(source, sample(journey.querySelector<SVGPathElement>('#sky-folder-target')!));
  const world = mountSkyWorld(journey.querySelector<HTMLElement>('[data-sky-world]')!);
  const story = mountSkyStory(root);
  const equipment = mountEquipmentJourney(root);
  const scene = root.querySelector<HTMLElement>('[data-project-scene]')!;
  const landing = root.querySelector<HTMLElement>('[data-project-landing]')!;
  const details = root.querySelector<HTMLElement>('[data-project-details]')!;
  const listeners = new AbortController();
  root.addEventListener('xr:prepare-section', event => {
    const detail = (event as CustomEvent<{ section: string; waitUntil: (ready: Promise<void>) => void }>).detail;
    if (detail.section === 'about') detail.waitUntil(world.warm());
  }, { signal: listeners.signal });
  root.addEventListener('xr:project-progress', event => {
    if ((event as CustomEvent<{ background: number }>).detail.background > 0) world.warm();
  }, { signal: listeners.signal });
  let shown = false;
  let flightSettled = false, flightWidth = 0, flightHeight = 0, flightReduced = false;
  let folderPose = '';
  let shadowScale = 0;
  let shadowWidth = 0, shadowHeight = 0;
  let lastOpaque = false;
  let lastState: { offset: number; width: number; height: number; landing: StoryBox; reduced: boolean } | undefined;
  type Projection = { box: StoryBox; pitch: number; yaw: number; roll: number; perspective: number };
  let folderProjection: { shape: Point[]; box: StoryBox; frontBox: StoryBox; theta: number; yaw: number; roll: number; perspective: number; gain: number; response: number } | undefined;
  let sideProjections: Projection[] = [];
  // Track the pointer before entry too, so the project folder keeps its pose
  // when its orange-scene replacement takes over.
  const windowTilt = mountPointerTilt(drawWindows, true);
  function drawWindows() {
    if (!folderProjection) return;
    const { shape, box, frontBox, theta, yaw, roll, perspective, gain, response } = folderProjection;
    const x = windowTilt.value.x * gain, y = windowTilt.value.y * gain;
    const dx = x * Math.min(frontBox.width * .075, 32) * response;
    const dy = y * Math.min(frontBox.height * .055, 24) * response;
    const cursorPitch = -y * mix(3.5 * Math.PI / 180, .28, response);
    const cursorYaw = x * mix(4.5 * Math.PI / 180, .36, response);
    const pitch = theta + cursorPitch, facingFront = Math.cos(pitch) >= 0;
    const move = (base: StoryBox) => ({ ...base, x: base.x + dx, y: base.y + dy });
    // Project the windows and their shadows from the same cursor + scroll pose.
    // All three folders look into the same continuous sky.
    style(front, 'visibility', facingFront ? 'visible' : 'hidden');
    style(front, 'transform', `translate3d(${frontBox.x + dx}px, ${frontBox.y + dy}px, 0) perspective(${perspective}px) rotateZ(${roll}rad) rotateY(${yaw + cursorYaw}rad) rotateX(${pitch}rad)`);
    setWindow(0, facingFront ? '' : contour(shape, move(box), pitch - Math.PI, yaw + cursorYaw, roll, perspective));
    if (facingFront) attr(shadowPaths[0], 'd', contour(frontSource, move(frontBox), pitch, yaw + cursorYaw, roll, perspective));
    sideProjections.forEach((folder, i) => {
      const sideBox = { ...folder.box, x: folder.box.x + x * 36, y: folder.box.y + y * 28 };
      setWindow(i + 1, contour(target, sideBox, folder.pitch - y * .25, folder.yaw + x * .34, folder.roll, folder.perspective));
    });
  }
  root.classList.add('has-sky-journey');

  function update(state: NonNullable<typeof lastState>) {
    lastState = state;
    const { offset, width, height, landing: box, reduced } = state;
    if (shadowWidth !== width || shadowHeight !== height) {
      shadowWidth = width; shadowHeight = height;
      // The camera can enlarge paths far beyond the viewport. Keep the blur's
      // render target bounded instead of allocating a giant offscreen surface.
      shadowFilter.setAttribute('width', String(width + 120));
      shadowFilter.setAttribute('height', String(height + 160));
    }
    const nextShadowScale = width < 640 ? .55 : 1;
    if (shadowScale !== nextShadowScale) {
      shadowScale = nextShadowScale;
      shadowBlur.setAttribute('stdDeviation', String(10 * shadowScale));
      shadowOffset.setAttribute('dy', String(26 * shadowScale));
    }
    // The offset begins after the initial photo-to-project-folder story.
    const hold = reduced ? .2 : SKY_PROJECT_HOLD;
    const duration = reduced ? .7 : SKY_TRANSITION_DISTANCE;
    const p = clamp((offset - hold) / duration);
    const descent = clamp((offset - hold - duration) / SKY_STORY_DISTANCE);
    const active = offset > hold;
    if (active) world.warm();
    const settled = p >= 1;
    orangeWaves.update(width, height, active && !settled && !document.hidden, reduced);
    const cloudProgress = storyCloudProgress(descent);
    const equipmentState = equipment?.update(offset - hold - duration - SKY_STORY_DISTANCE, width, height, reduced);
    const skyVisible = !equipmentState?.active || equipmentState.frontVisible;
    const bird = world.focus(width, height, cloudProgress, reduced);
    const storyPose = story?.update(descent, width, height, settled && skyVisible && !document.hidden, reduced, bird);
    const transition = skyTransitionPose(p);
    const liquid = reduced ? p : transition.liquid;
    if (!active || reduced || settled) { folderProjection = undefined; sideProjections = []; }
    windowTilt.setEnabled(!reduced && !settled);
    // Descendants can override inherited visibility; display suppression is
    // what guarantees no reverse face survives the return to the home scene.
    if (journey.hidden === active) journey.hidden = !active;
    style(journey, 'visibility', active ? 'visible' : 'hidden');
    style(shadow, 'visibility', active && !reduced && !settled ? 'visible' : 'hidden');
    style(shadow, 'opacity', String(1 - phase(.82, .98, p)));

    if (!active) {
      if (shown) {
        style(scene, 'visibility', ''); style(landing, 'visibility', ''); style(details, 'visibility', '');
      }
      shown = false;
      flightSettled = false;
      folderPose = '';
      style(front, 'visibility', 'hidden');
      world.update(0, false, reduced, { width, height });
    } else {
      shown = true;
      // Once the aperture fills the viewport, its hidden contours and cast
      // shadows no longer need to be regenerated during the reading sequence.
      if (!settled || !flightSettled || flightWidth !== width || flightHeight !== height || flightReduced !== reduced) {
        // Remove the original only while its exact replacement is in flight.
        if (!scene.inert) scene.inert = true; style(scene, 'pointer-events', 'none');
        style(landing, 'visibility', reduced && p < .45 ? '' : 'hidden');
        if (reduced) style(landing, 'opacity', String(1 - phase(0, .45, p)));
        style(details, 'opacity', '1');
        style(details, 'visibility', liquid >= 1 ? 'hidden' : '');
        style(scene, 'visibility', liquid >= 1 ? 'hidden' : '');
        const orangeOutline = orangeLiquidPath(liquid, width, height);
        style(orange, 'clip-path', reduced ? 'none' : "path('" + orangeOutline + "')");
        attr(orangeCoverage, 'd', orangeOutline);
        style(orange, 'opacity', reduced ? String(phase(0, .3, p) * (1 - phase(.55, 1, p))) : '1');
        if (reduced) {
          style(front, 'visibility', 'hidden');
          style(view, 'clip-path', 'none');
          style(view, 'opacity', String(phase(.45, 1, p)));
        } else {
          style(view, 'opacity', '1');
          const { turn, morph, shift, zoom, entrance } = transition;
          const nextFolderPose = `${turn}:${morph}:${shift}:${zoom}:${entrance}:${transition.tilt}:${width}:${height}:${box.x}:${box.y}:${box.width}:${box.height}`;
          if (folderPose !== nextFolderPose) {
            folderPose = nextFolderPose;
            const size = Math.min(width * (width < 640 ? .50 : .32), height * .54);
            const baseW = mix(box.width, size, morph);
            const baseH = mix(box.height, size * 1.07, morph);
            const centerX = mix(box.x + box.width / 2, width * .5, shift);
            const centerY = mix(box.y + box.height / 2, height * .53, shift) - height * .07 * zoom;
            const theta = turn * Math.PI;
            const zoomScale = mix(1, Math.max(width, height) / size * 1.8, zoom ** 1.65);
            const roll = (-.025 * Math.sin(Math.PI * shift) - .045 * Math.sin(Math.PI * zoom)) * (1 - phase(.91, 1, p));
            const yaw = .85 * Math.sin(Math.PI * turn) + .28 * turn * (1 - zoom) + .34 * Math.sin(Math.PI * zoom);
            const pitch = .12 * Math.sin(Math.PI * zoom);
            const centerYaw = .85 * Math.sin(Math.PI * turn);
            const centerRoll = -.025 * Math.sin(Math.PI * shift);
            const perspective = Math.max(width, height) * 1.65;
            style(front, 'width', `${baseW}px`); style(front, 'height', `${baseH}px`);
            const frontBox = { x: centerX - baseW / 2, y: centerY - baseH / 2, width: baseW, height: baseH };
            const backHeight = baseH * zoomScale;
            const mainBox = { x: centerX - baseW * zoomScale / 2, y: centerY - backHeight / 2, width: baseW * zoomScale, height: backHeight };
            const shape = source.map((point, i) => ({ x: mix(point.x, target[i].x, morph), y: mix(point.y, target[i].y, morph) }));
            folderProjection = { shape, box: mainBox, frontBox, theta, yaw: centerYaw, roll: centerRoll, perspective, gain: transition.tilt, response: phase(0, .255, p) };
            sideProjections = [];
            const spread = 1 + zoom * 2.8;
            const narrow = width < 640;
            const companions = [
              { x: narrow ? -.385 : -.25, w: narrow ? .34 : .42, h: .76, yaw: -.34, pitch: .07, roll: 0 },
              { x: narrow ? .385 : .30, w: narrow ? .42 : .59, h: .60, yaw: .38, pitch: -.09, roll: 0 },
            ];
            companions.forEach((item, i) => {
              // Full-size planes turn into view with the main flip. The orange
              // coverage clips their reveal, so none can appear on the project art.
              const sw = size * item.w * (1 + zoom * 2);
              const sh = size * item.h * (1 + zoom * 2);
              const sx = width * (.5 + item.x * spread), sy = height * .53 - height * .07 * zoom;
              const sideBox = { x: sx - sw / 2, y: sy - sh / 2, width: sw, height: sh };
              const direction = i === 0 ? -1 : 1;
              const entryYaw = direction * .38 * (1 - entrance);
              const entryRoll = direction * .065 * (1 - entrance);
              sideProjections.push({ box: sideBox, pitch: item.pitch + pitch + direction * .10 * (1 - entrance), yaw: item.yaw + yaw * .35 + entryYaw, roll: item.roll + roll * .35 + entryRoll, perspective });
            });
            drawWindows();
          }
          style(view, 'clip-path', settled ? 'none' : 'url(#sky-windows)');
        }
      }
      flightSettled = settled; flightWidth = width; flightHeight = height; flightReduced = reduced;
      world.update(cloudProgress, skyVisible && !document.hidden, reduced, { width, height }, !settled, storyPose?.intro ?? 0, p);
    }
    const opaque = active && (liquid >= 1 || settled);
    data(root, 'skyCovered', String(opaque));
    if (opaque !== lastOpaque) {
      lastOpaque = opaque;
      root.dispatchEvent(new CustomEvent('xr:sky-coverage', { detail: { opaque } }));
    }
    data(root, 'skyPhase', !active ? 'projects' : settled ? 'descent' : p < .255 ? 'flip' : p < .70 ? 'liquid' : 'zoom');
    data(root, 'skyProgress', p.toFixed(4));
    data(root, 'skyDescent', descent.toFixed(4));
    // Ink follows the actual background at the top and bottom of the viewport.
    const liquidEase = phase(.05, 1, liquid);
    const coveredDepth = mix(-.19, 1.2, liquidEase) - Math.sin(Math.PI * liquidEase) * .09;
    const headerTone = settled && storyPose
      ? storyPose.paperAt(width * .15, 48) ? 'ink' : 'light'
      : active && (reduced ? p > .15 && p < .7 : coveredDepth > .05 && p < .84) ? 'ink' : 'light';
    const footerTone = settled && storyPose
      ? storyPose.paperAt(width * .75, height - 34) ? 'ink' : cloudProgress > .9 ? 'sky-ink' : 'light'
      : active && (reduced ? p > .15 && p < .7 : coveredDepth > .98 && p < .84) ? 'ink' : 'light';
    const equipmentBackdrop = equipmentState?.active && equipmentState.turn > .08;
    data(root, 'skyHeaderTone', equipmentBackdrop ? 'ink' : headerTone);
    data(root, 'skyFooterTone', equipmentBackdrop ? 'ink' : footerTone);
    // Keep the controls readable on the equipment section’s white background.
    equipment?.updateChrome();
  }
  document.addEventListener('visibilitychange', () => { if (lastState) update(lastState); }, { signal: listeners.signal });
  return { update, dispose() {
    folderProjection = undefined; sideProjections = []; windowTilt.dispose();
    listeners.abort(); orangeWaves.dispose(); equipment?.dispose(); story?.dispose(); world.dispose(); root.classList.remove('has-sky-journey');
    root.dispatchEvent(new CustomEvent('xr:sky-coverage', { detail: { opaque: false } }));
    for (const key of ['skyPhase', 'skyProgress', 'skyDescent', 'skyHeaderTone', 'skyFooterTone', 'skyCovered']) delete root.dataset[key];
    style(journey, 'visibility', 'hidden');
    journey.hidden = true;
    style(landing, 'visibility', ''); style(details, 'visibility', '');
  } };
}
