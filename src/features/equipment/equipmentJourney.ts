import { createEquipmentCamera, equipmentCardMatrix, projectEquipmentPoint, EQUIPMENT_CARD_REST, type EquipmentCamera } from './equipmentCamera';
import { mountStoryChrome } from '../sky/skyStoryChrome';
import { mountPointerTilt } from '../../lib/pointerTilt';
import { equipment } from '../../data/equipment';
import { phase } from '../projects/projectStoryMotion';
import { mountEquipmentCat } from './equipmentCat';
import { equipmentCatPose } from './equipmentCatMotion';
import { EQUIPMENT_CAT_START, equipmentPose, equipmentCardPose, equipmentLayout, equipmentPlane, equipmentFrontPath, equipmentWindowPath, equipmentFolderPath, type EquipmentPose } from './equipmentMotion';

const style = (element: HTMLElement | SVGElement, key: string, value: string) => {
  if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
};
const attr = (element: Element, key: string, value: string) => {
  if (element.getAttribute(key) !== value) element.setAttribute(key, value);
};
const hide = (element: HTMLElement, hidden: boolean) => {
  if (element.hidden !== hidden) element.hidden = hidden;
};

export function mountEquipmentJourney(root: HTMLElement) {
  const layer = root.querySelector<HTMLElement>('[data-equipment-journey]');
  const front = root.querySelector<HTMLElement>('[data-sky-stage]');
  if (!layer || !front) return null;
  const skySurface = front.querySelector<HTMLElement>('[data-sky-surface]')!;
  const cat = mountEquipmentCat(layer.querySelector<HTMLElement>('[data-equipment-cat]')!);
  let catPose = equipmentCatPose(0);
  const face = layer.querySelector<HTMLElement>('[data-equipment-face]')!;
  const surface = layer.querySelector<HTMLElement>('[data-equipment-surface]')!;
  const faceImage = face.querySelector<HTMLImageElement>('img')!;
  const heading = layer.querySelector<HTMLElement>('[data-equipment-heading]')!;
  const rack = layer.querySelector<HTMLElement>('[data-equipment-cards]')!;
  const cards = [...rack.querySelectorAll<HTMLElement>('[data-equipment-card]')].map(element => ({
    element, fill: element.querySelector<HTMLElement>('[data-equipment-card-fill]')!,
    image: element.querySelector<HTMLImageElement>('img')!,
  }));
  const listeners = new AbortController();
  const chrome = mountStoryChrome(root);
  // Preserve global chrome exactly when the visitor reverses or navigates away.
  const chromeElements = [...document.querySelectorAll<HTMLElement>('[data-header], .site-footer')].map(element => ({
    element, transform: element.style.transform, origin: element.style.transformOrigin,
    clip: element.style.clipPath, opacity: element.style.opacity, inert: element.inert,
  }));
  function morphChrome(amount: number) {
    for (const item of chromeElements) {
      const { element } = item;
      if (amount <= 0) {
        element.style.transform = item.transform; element.style.transformOrigin = item.origin;
        element.style.clipPath = item.clip; element.style.opacity = item.opacity; element.inert = item.inert;
        continue;
      }
      const footer = element.classList.contains('site-footer');
      element.style.transformOrigin = footer ? '50% 100%' : '50% 0%';
      element.style.transform = reduced ? item.transform : 'translateY(' + (footer ? 24 : -24) * amount + 'px) scale(' + (1-amount*.07) + ',' + Math.max(.001,1-amount) + ')';
      element.style.clipPath = 'inset(' + (footer ? amount*50 : 0) + '% 0 ' + (footer ? 0 : amount*50) + '% 0 round ' + amount*28 + 'px)';
      element.style.opacity = reduced ? String(1-amount) : amount >= 1 ? '0' : item.opacity;
      element.inert = amount > .75 || item.inert;
    }
  }
  let cardDrawing: Array<{ element: HTMLElement; x: number; y: number; z: number; yaw: number; pitch: number; roll: number; scale: number; gain: number }> = [];
  const tilt = mountPointerTilt(drawCards);
  function updateChrome() {
    if (!current) { chrome.update(false, 0, 0, () => true, false); return; }
    chrome.update(current.pose.turn > .08, current.width, current.height,
      () => true, false);
  }
  function drawCards() {
    if (rack.hidden) return;
    const pointer = tilt.value;
    cardDrawing.forEach(card => {
      if (!current) return;
      style(card.element, 'transform', equipmentCardMatrix(current.camera, {
        x: card.x, y: card.y, z: card.z,
        yaw: card.yaw + pointer.x * 10 * card.gain,
        pitch: card.pitch - pointer.y * 7 * card.gain, roll: card.roll
      }, current.layout.cardWidth, current.layout.cardHeight));
    });
  }
  let height = 1, reduced = false, active = false, viewport = '', cursor = 0;
  let headerBottom = 110, footerHeight = 60, disposed = false;
  let current: { pose: EquipmentPose; width: number; height: number; layout: ReturnType<typeof equipmentLayout>; camera: EquipmentCamera } | null = null;
  let autoFrame = 0, autoTime = 0, cycle = 0, reveal = 0, paused = false, warmed = -1;
  let touchX = 0;
  const load = (image: HTMLImageElement) => {
    if (!image.dataset.src) return;
    image.src = image.dataset.src; delete image.dataset.src;
  };
  const warm = (position: number) => {
    load(faceImage); load(cards[0].image);
    cards.forEach((card, index) => {
      const distance = Math.abs(index - position);
      if (Math.min(distance, equipment.length - distance) <= 5) load(card.image);
    });
  };
  function canRotate() { return Boolean(current?.pose.browsing && catPose.progress === 0 && !paused && !reduced && !document.hidden && !disposed && !root.hasAttribute('data-navigating')); }
  function animate(now: number) {
    autoFrame = 0;
    if (!canRotate()) return;
    const delta = autoTime ? Math.min((now - autoTime) / 1000, .05) : 0;
    reveal = Math.min(1, reveal + delta / .85);
    cycle = (cycle + delta / 1.8 * phase(.8, 1, reveal)) % equipment.length;
    autoTime = now;
    cursor = (Math.floor(cycle) + phase(.08, .92, cycle % 1)) % equipment.length;
    renderCards();
    autoFrame = requestAnimationFrame(animate);
  }
  function syncRotation() {
    if (canRotate() && !autoFrame) { autoTime = 0; autoFrame = requestAnimationFrame(animate); }
    else if (!canRotate() && autoFrame) { cancelAnimationFrame(autoFrame); autoFrame = 0; }
  }
  function browse(direction: number) {
    if (!current || !current.pose.browsing) return;
    cursor = (Math.round(cursor) + direction + equipment.length) % equipment.length;
    cycle = cursor; renderCards();
  }
  rack.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); browse(event.key === 'ArrowLeft' ? -1 : 1); }
    if (event.key === ' ') { event.preventDefault(); paused = !paused; syncRotation(); }
  }, { signal: listeners.signal });
  rack.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') touchX = event.clientX; }, { signal: listeners.signal });
  rack.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch' && Math.abs(event.clientX - touchX) > 35) browse(event.clientX < touchX ? 1 : -1);
  }, { signal: listeners.signal });
  document.addEventListener('visibilitychange', syncRotation, { signal: listeners.signal });
  root.ownerDocument.fonts.ready.then(() => { if (!disposed) viewport = ''; });

  function update(offset: number, width: number, h: number, reduceMotion: boolean) {
    height = h; reduced = reduceMotion;
    const pose = equipmentPose(offset, equipment.length, reduced);
    catPose = equipmentCatPose(offset - EQUIPMENT_CAT_START, reduced);
    morphChrome(catPose.morph);

    cardDrawing = [];
    tilt.setEnabled(pose.turn >= 1 && !reduced && pose.active && catPose.progress === 0);
    if (offset > -1.2) warm(Math.round(cursor));
    hide(layer!, !pose.active);
    if (!pose.active) {
      current = null; cat.update(catPose, width, height, false); syncRotation();
      if (active) {
        hide(front!, false);
        style(front!, 'clip-path', '');
        for (const property of ['transform', 'will-change']) style(skySurface, property, '');
        delete root.dataset.equipment;
      }
      active = false; return pose;
    }
    active = true;
    const mode = catPose.progress > 0 ? 'cat' : pose.turn < 1 ? 'flip' : pose.spread < 1 ? 'spread' : 'carousel';
    if (root.dataset.equipment !== mode) root.dataset.equipment = mode;
    const key = `${width}:${height}`;
    if (viewport !== key) {
      viewport = key;
      const header = root.ownerDocument.querySelector<HTMLElement>('[data-header]');
      const bar = header?.querySelector<HTMLElement>('.site-header__bar');
      headerBottom = header ? header.offsetTop + header.offsetHeight : 110;
      footerHeight = root.ownerDocument.querySelector<HTMLElement>('.site-footer')?.offsetHeight ?? 60;
      style(layer!, '--equipment-top', `${headerBottom + 20}px`);
      style(layer!, '--equipment-gutter', `${Math.max(width * .055, (bar?.getBoundingClientRect().left ?? width * .07) + 16)}px`);
      const layout = equipmentLayout(width, height, headerBottom, footerHeight);
      const clip = "path('" + equipmentFolderPath(layout.cardWidth, layout.cardHeight) + "')";
      cards.forEach(card => {
        style(card.element, 'width', `${layout.cardWidth}px`); style(card.element, 'height', `${layout.cardHeight}px`);
        style(card.fill, 'clip-path', clip);
      });
    }
    const layout = equipmentLayout(width, height, headerBottom, footerHeight);
    if (pose.turn < 1) { cursor = 0; cycle = 0; reveal = 0; }
    current = { pose, width, height, layout, camera: createEquipmentCamera(width, height, layout) };
    const perspective = Math.max(width, height) * 1.8;
    const plane = equipmentPlane(pose, width, height, layout);
    const faceHeight = plane.height, centerY = plane.centerY;
    const scale = faceHeight / height;
    hide(front!, !pose.frontVisible);
    style(skySurface, 'will-change', pose.turn > 0 && pose.frontVisible ? 'transform' : 'auto');
    // Preserve the landscape's proportions. Both sides share the same physical
    // plane; the folder contracts only while its center-axis turn is underway.
    style(skySurface, 'transform', pose.turn === 0 || reduced ? 'none' : `translateY(${(centerY-height/2).toFixed(3)}px) perspective(${perspective}px) rotateY(${pose.angle.toFixed(4)}deg) scale(${scale.toFixed(6)})`);
    style(front!, 'clip-path', pose.turn > 0 ? "path('" + equipmentFrontPath(pose, width, height, layout, reduced) + "')" : 'none');
    hide(face, !pose.back || pose.turn >= 1);
    // The moving contour is a window over a fixed-size product and label.
    // Only the window turns; the content remains undistorted in screen space.
    style(face, 'width', `${width}px`); style(face, 'height', `${height}px`);
    style(face, 'clip-path', "path('" + equipmentWindowPath(pose, width, height, layout, reduced) + "')");
    style(surface, 'width', `${layout.cardWidth}px`); style(surface, 'height', `${layout.cardHeight}px`);
    style(surface, 'left', `${layout.centerX}px`); style(surface, 'top', `${centerY.toFixed(3)}px`);
    // The title types itself in: a quick fade, then its wipe and cursor follow the scroll.
    style(heading, 'opacity', Math.min(1, pose.heading * 4).toFixed(4));
    style(heading, '--equipment-heading', pose.heading.toFixed(4));
    const titleFold = phase(.115, .195, catPose.progress);
    style(heading, 'transform', reduced ? 'none' : 'translateY(' + (-36 * titleFold) + 'px) scaleY(' + Math.max(.001, 1-titleFold) + ')');
    style(heading, 'clip-path', 'inset(0 0 ' + titleFold*100 + '% 0)');
    hide(heading, pose.heading <= 0 || titleFold >= 1);
    style(rack, 'opacity', catPose.rackOpacity.toFixed(4));
    hide(rack, pose.turn < 1 || catPose.morph >= 1);
    rack.inert = pose.turn < 1 || catPose.morph > .75;
    cat.update(catPose, width, height, pose.active); renderCards(); syncRotation();
    return pose;
  }
  function renderCards() {
    cardDrawing = [];
    // update() unhides the rack before rebuilding its current pose on reverse entry.
    if (!current || rack.hidden) return;
    const { width, height, layout, camera } = current;
    const pose = { ...current.pose, cursor, spread: Math.max(current.pose.spread, phase(0, 1, reveal)) };
    if (Math.round(cursor) !== warmed) { warmed = Math.round(cursor); warm(warmed); }
    cards.forEach((card, index) => {
      const p = equipmentCardPose(index, pose, width, height, reduced, layout);
      const visible = pose.turn >= 1 && p.visible && (index === 0 || pose.spread > 0);
      hide(card.element, !visible);
      attr(card.element, 'aria-hidden', String(!visible));
      if (!visible) return;
      load(card.image);
      const fold = reduced ? 0 : catPose.morph;
      const x = p.x * (1-fold) + width * .12 * fold, y = layout.centerY - camera.screenY + p.y + fold * 24;
      cardDrawing.push({ element: card.element, x, y, z: p.z - fold * 250, yaw: p.yaw * (1-fold) + fold * 90 + (reduced ? 0 : EQUIPMENT_CARD_REST.yaw * pose.spread),
        pitch: reduced ? 0 : EQUIPMENT_CARD_REST.pitch * pose.spread,
        roll: p.roll + (reduced ? 0 : EQUIPMENT_CARD_REST.roll * pose.spread), scale: p.scale,
        gain: reduced ? 0 : (1 - phase(.15, 1.7, Math.abs(p.distance))) * phase(.45, 1, pose.spread) });
      style(card.element, 'opacity', (p.opacity * (1-phase(.94,1,catPose.morph))).toFixed(4));
      style(card.element, 'z-index', String(10000 - Math.round(projectEquipmentPoint([x,y,p.z], camera).depth)));
    });
    drawCards();
  }
  return { update, updateChrome, dispose() {
    disposed = true; current = null; morphChrome(0); cat.dispose(); chrome.dispose(); cancelAnimationFrame(autoFrame); cardDrawing = []; tilt.dispose(); listeners.abort();
    hide(layer, true); hide(front, false); delete root.dataset.equipment;
    front.style.removeProperty('clip-path');
    for (const property of ['transform', 'will-change']) skySurface.style.removeProperty(property);
  } };
}
