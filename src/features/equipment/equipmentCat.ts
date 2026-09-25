import source from '../../../public/scenes/cat/source.json';
import { catOutsidePath, catPaperLipPath, catRiftPath, type EquipmentCatPose } from './equipmentCatMotion';

const set = (element: Element, name: string, value: string | number) => {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
};
const unit = (value: number) => Math.max(-1, Math.min(1, value));

export function mountEquipmentCat(layer: HTMLElement) {
  const svg = layer.querySelector<SVGSVGElement>('[data-cat-scene]')!;
  const part = (name: string) => svg.querySelector<SVGElement>(`[data-cat-${name}]`)!;
  const head = part('head-pose'), body = part('body-pose'), aim = part('head-aim'), pupils = part('pupils');
  const headWindow = part('head-window'), bodyWindow = part('body-window');
  const firstPaw = svg.querySelector<SVGGElement>('[data-cat-paw="left"]')!;
  const secondPaw = svg.querySelector<SVGGElement>('[data-cat-paw="right"]')!;
  const tail = part('tail'), floor = part('floor'), rift = part('rift'), lip = part('rift-lip');
  const opening = part('rift-opening'), windows = [...svg.querySelectorAll('[data-cat-rift-window]')], shadow = part('rift-shadow');
  const crease = part('rift-crease');
  const actor = part('actor');
  const render = layer.querySelector<HTMLElement>('[data-cat-render]')!;
  const video = layer.querySelector<HTMLVideoElement>('[data-cat-video]')!;
  const paper = layer.querySelector<SVGSVGElement>('[data-cat-paper]')!;
  const sheet = layer.querySelector<SVGPathElement>('[data-cat-sheet]')!;
  const sheetEdge = layer.querySelector<SVGPathElement>('[data-cat-sheet-edge]')!;
  let videoStarted = false;
  function pauseVideo() { video.pause(); videoStarted = false; }
  const hands = part('hands');
  const grip = part('grip'), armLeft = part('arm-left'), armRight = part('arm-right');
  const handLeft = part('hand-left'), handRight = part('hand-right');
  let interacting = false;
  const listeners = new AbortController();
  // Original camera settings and relative layer depth; pupils travel farther than the head.
  const depth = (id: string) => Math.abs(Number(source.layers.find(layer => layer.id === id)!.parallaxDepth.split(' ')[0]));
  const influence = source.parallax.amount * source.parallax.mouseInfluence * .5;
  const headDepth = depth('head'), pupilDepth = depth('pupils') - headDepth;
  let active = false, reduced = false, frame = 0, previousTime = 0, warmed = false;
  let currentX = 0, currentY = 0, targetX = 0, targetY = 0;
  let width = 1, height = 1, pointerX = 0, pointerY = 0, view = '';
  let pointerBounds: DOMRect | undefined;
  const invalidatePointerBounds = () => { pointerBounds = undefined; };
  let cameraTop = 0, cameraPerchTop = 0;

  function drawPointer() {
    const x = currentX * source.projection.width * influence;
    const y = currentY * source.projection.height * influence;
    set(aim, 'transform', `translate(${x * headDepth} ${y * headDepth}) rotate(${currentX * 2.2} 490 730)`);
    set(pupils, 'transform', `translate(${x * pupilDepth} ${y * pupilDepth})`);
  }
  function animate(now: number) {
    frame = 0;
    if (!active || reduced || document.hidden) return;
    const dt = previousTime ? Math.min(64, now - previousTime) : 16;
    previousTime = now;
    const follow = 1 - Math.exp(-dt / (source.parallax.delay * 1000));
    currentX += (targetX - currentX) * follow;
    currentY += (targetY - currentY) * follow;
    drawPointer();
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .001) frame = requestAnimationFrame(animate);
    else previousTime = 0;
  }
  function wake() {
    if (active && !reduced && !document.hidden && !frame) frame = requestAnimationFrame(animate);
  }
  function resetPointer() { targetX = 0; targetY = 0; wake(); }
  document.addEventListener('pointermove', event => {
    if (!active || reduced || interacting || event.pointerType === 'touch') return;
    // Read the actual camera/ancestor transforms only when the pointer needs them.
    const rect = pointerBounds ??= svg.getBoundingClientRect();
    const centerX = rect.left + pointerX / 2200 * rect.width;
    const centerY = rect.top + pointerY / 2900 * rect.height;
    targetX = unit((event.clientX - centerX) / (width * .40));
    targetY = unit((event.clientY - centerY) / (height * .40));
    wake();
  }, { passive: true, signal: listeners.signal });
  document.documentElement.addEventListener('pointerleave', resetPointer, { signal: listeners.signal });
  window.addEventListener('scroll', invalidatePointerBounds, { capture: true, passive: true, signal: listeners.signal });
  window.addEventListener('resize', invalidatePointerBounds, { passive: true, signal: listeners.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; previousTime = 0; }
    else wake();
  }, { signal: listeners.signal });

  return {
    update(pose: EquipmentCatPose, w: number, h: number, equipmentActive: boolean) {
      invalidatePointerBounds();
      width = w; height = h; reduced = pose.reduced;
      active = equipmentActive && pose.visible;
      layer.hidden = !active;
      if (!active) {
        pauseVideo();
        cancelAnimationFrame(frame); frame = 0; previousTime = 0;
        currentX = currentY = targetX = targetY = 0; drawPointer(); return;
      }
      if (!warmed) {
        svg.querySelectorAll<SVGImageElement>('[data-cat-image]').forEach(image => {
          set(image, 'href', image.dataset.href!); delete image.dataset.href;
        });
        warmed = true;
      }
      const key = `${w}:${h}`;
      if (view !== key) {
        view = key;
        // Frame the cat closely; pan the shared stage only when it climbs the title.
        const sceneHeight = Math.min(h * 1.30, (w - 24) * (w <= 640 ? 1.55 : 1) * 2900 / 2200);
        layer.style.setProperty('--cat-height', sceneHeight + 'px');
        layer.style.setProperty('--cat-width', (sceneHeight * 2200 / 2900) + 'px');
        cameraTop = h * (w <= 640 ? .83 : .90) - 2520 * sceneHeight / 2900;
        cameraPerchTop = Math.max(cameraTop, h * .12 - 300 * sceneHeight / 2900);
      }
      layer.style.setProperty('--cat-top', (cameraTop + (cameraPerchTop - cameraTop) * pose.cameraLift) + 'px');
      layer.style.opacity = String(pose.opacity);
      layer.dataset.catState = pose.state;
      layer.dataset.catProgress = pose.progress.toFixed(4);
      const portalPath = catRiftPath(pose.opening, pose.pressure);
      for (const element of [opening, ...windows, shadow]) set(element, 'd', portalPath);
      set(lip, 'd', catPaperLipPath(pose.opening, pose.pressure));
      set(crease, 'd', 'M950 135V1370');
      set(crease, 'opacity', 1 - pose.opening);
      set(rift, 'opacity', pose.riftOpacity); set(lip, 'opacity', pose.riftOpacity * .35);
      interacting = pose.progress > .46;
      if (interacting) { currentX = currentY = targetX = targetY = 0; drawPointer(); }
      // Use original video bytes; load before the reveal and play only while visible.
      if (pose.progress > .10 && !video.getAttribute('src')) { video.preload = 'auto'; video.src = video.dataset.src!; video.load(); }
      render.hidden = pose.paperCatch <= 0;
      if (!render.hidden && !reduced && !document.hidden && !videoStarted) {
        videoStarted = true; video.play().catch(() => { videoStarted = false; });
      } else if (render.hidden || reduced || document.hidden) pauseVideo();
      const sceneScale = parseFloat(layer.style.getPropertyValue('--cat-height')) / 2900;
      const pullTravel = h / sceneScale + 900;
      const actorY = pose.actorY + pose.paperPull * pullTravel;
      set(actor, 'transform', 'translate(' + pose.actorX + ' ' + actorY + ')');
      set(actor, 'opacity', pose.actorOpacity);
      set(paper, 'viewBox', '0 0 ' + w + ' ' + h);
      const handLevel = cameraTop + (actorY + 120 + 1100) * sceneScale;
      const edgeY = Math.max(0, handLevel) * pose.paperCatch;
      const leftHand = w / 2 + (180 - 500) * sceneScale;
      const rightHand = w / 2 + (820 - 500) * sceneScale;
      const outerY = Math.max(0, edgeY - 90 * pose.paperCatch * (1-pose.paperPull));
      const edge = 'M0 ' + outerY + 'C' + leftHand*.55 + ' ' + outerY + ' ' + leftHand*.7 + ' ' + edgeY + ' ' + leftHand + ' ' + edgeY + 'L' + rightHand + ' ' + edgeY + 'C' + (rightHand+(w-rightHand)*.3) + ' ' + edgeY + ' ' + (rightHand+(w-rightHand)*.55) + ' ' + outerY + ' ' + w + ' ' + outerY;
      set(sheet, 'd', edge + 'V' + (h+1500) + 'H0Z');
      set(sheetEdge, 'd', edge);
      const reach = pose.grab;
      const handY = 1220 - 1100 * reach;
      const leftGrip = 320 - 140 * reach, rightGrip = 650 + 170 * reach;
      // Solid limbs, drawn once behind the head: no opacity crossfade or ghost poses.
      set(grip, 'visibility', reach > .001 ? 'visible' : 'hidden');
      set(hands, 'visibility', reach > .001 ? 'visible' : 'hidden');
      set(armLeft, 'd', 'M335 870Q' + (335-375*reach) + ' ' + (1000-650*reach) + ' ' + leftGrip + ' ' + handY);
      set(armRight, 'd', 'M605 870Q' + (605+415*reach) + ' ' + (1000-650*reach) + ' ' + rightGrip + ' ' + handY);
      set(handLeft, 'transform', 'translate(' + leftGrip + ' ' + handY + ') rotate(-8)');
      set(handRight, 'transform', 'translate(' + rightGrip + ' ' + handY + ') rotate(8)');
      set(body, 'transform', `translate(${pose.bodyX} ${pose.bodyY}) scale(${pose.scale}) rotate(${pose.bodyAngle} 480 1300) translate(0 ${1420 * pose.squash}) scale(${1 + pose.squash} ${1 - pose.squash})`);
      set(head, 'transform', `translate(${pose.headX} ${pose.headY + pose.squash * 600}) scale(${pose.scale}) rotate(${pose.headAngle} 490 760)`);
      set(part('head-front'), 'clip-path', pose.headWindow >= 1 || reduced ? 'none' : 'url(#cat-head-outside)');
      set(part('body-front'), 'clip-path', pose.bodyWindow >= 1 || reduced ? 'none' : 'url(#cat-body-outside)');
      set(headWindow, 'd', catOutsidePath(pose.opening, pose.headWindow, pose.pressure));
      set(bodyWindow, 'd', catOutsidePath(pose.opening, pose.bodyWindow, pose.pressure));
      set(firstPaw, 'transform', `translate(${-pose.firstStep * 38} ${-pose.firstStep * 95}) rotate(${-pose.firstStep * 9} 340 1120)`);
      set(secondPaw, 'transform', `translate(${pose.secondStep * 26} ${-pose.secondStep * 86}) rotate(${pose.secondStep * 7} 550 1120)`);
      set(tail, 'transform', `rotate(${pose.tailAngle} 300 1200)`);
      set(floor, 'opacity', pose.shadow); set(floor, 'cx', pose.bodyX + 480 * pose.scale); set(floor, 'rx', 330 * pose.scale);
      pointerX = pose.actorX + pose.headX + 490 * pose.scale + 600;
      pointerY = actorY + pose.headY + 540 * pose.scale + 1100;
      if (reduced) { cancelAnimationFrame(frame); frame = 0; currentX = currentY = targetX = targetY = 0; drawPointer(); }
    },
    dispose() { active = false; listeners.abort(); cancelAnimationFrame(frame); pauseVideo(); video.removeAttribute('src'); video.load(); layer.hidden = true; },
  };
}
