import { mix, phase } from '../projects/projectStoryMotion';
import { CAT_ENTRANCE_DISTANCE } from './equipmentCatMotion';

export const EQUIPMENT_CAROUSEL_START = 2.6;
export const EQUIPMENT_CAROUSEL_DISTANCE = 1.6;
// Let visitors reach and browse the equipment before the next scene opens.
export const EQUIPMENT_CAT_START = EQUIPMENT_CAROUSEL_START + EQUIPMENT_CAROUSEL_DISTANCE;
export const EQUIPMENT_DISTANCE = EQUIPMENT_CAT_START + CAT_ENTRANCE_DISTANCE;

export function equipmentPose(offset: number, count: number, reduced = false) {
  const turn = phase(.08, 1.85, offset);
  return {
    count, active: offset > 0,
    fold: phase(0, .30, turn),
    shrink: phase(.24, 1, turn),
    angle: reduced ? 0 : turn * 180,
    back: turn >= .5,
    frontVisible: turn < .5,
    turn,
    spread: phase(1.92, 2.5, offset),
    heading: phase(1.36, 1.92, offset),
    cursor: 0,
    browsing: turn >= 1,
  };
}
export type EquipmentPose = ReturnType<typeof equipmentPose>;

export function equipmentLayout(width: number, height: number, headerBottom = 110, footerHeight = 60) {
  const narrow = width <= 640;
  const titleHeight = narrow ? Math.max(42, Math.min(width * .11, 70)) : Math.max(50, Math.min(width * .072, height * .11, 112));
  const top = headerBottom + 20 + titleHeight + 24;
  const bottom = height - footerHeight - 90;
  const maximum = Math.max(130, bottom - top) / 1.19;
  const cardWidth = Math.min(width * (narrow ? .67 : .30), maximum, 440);
  const cardHeight = cardWidth * 1.19;
  const heroWidth = cardWidth;
  return { cardWidth, cardHeight, heroWidth, heroHeight: heroWidth * 1.19,
    centerX: width / 2, centerY: (top + bottom) / 2, safeTop: headerBottom + 12, safeBottom: height - footerHeight - 16, narrow };
}

/** Finish the outline morph at the edge-on turn; the reverse face stays rigid. */
export function equipmentPlane(pose: EquipmentPose, width: number, height: number, layout = equipmentLayout(width, height)) {
  const faceHeight = mix(height, layout.heroHeight, pose.shrink);
  const aspect = mix(width / height, layout.heroWidth / layout.heroHeight, phase(.08, .5, pose.turn));
  return {
    width: faceHeight * aspect,
    height: faceHeight,
    centerY: mix(height / 2, layout.centerY, pose.shrink),
    scale: faceHeight / layout.heroHeight,
  };
}

/** One continuous ring: each item passes through the center before moving left. */
export function equipmentCardPose(index: number, pose: EquipmentPose, width: number, height: number, reduced = false, layout = equipmentLayout(width, height)) {
  const raw = index - pose.cursor;
  const wrap = (value: number) => value > pose.count / 2 ? value - pose.count : value < -pose.count / 2 ? value + pose.count : value;
  const distance = wrap(raw);
  const magnitude = Math.abs(distance);
  const angle = Math.min(magnitude, 4) * .42;
  const arc = Math.sin(angle) * Math.sign(distance);
  const spread = pose.spread;
  const opacity = 1 - phase(2.05, 2.85, magnitude);
  return {
    ...layout, distance, opacity, featured: magnitude < .5,
    x: arc * layout.cardWidth * (layout.narrow ? 2.6 : 3.05) * spread,
    y: (1 - Math.cos(angle)) * layout.cardHeight * .08 * spread,
    z: -(1 - Math.cos(angle)) * layout.cardWidth * .95 * spread,
    yaw: reduced ? 0 : -Math.sign(distance) * Math.min(magnitude * 23, 68) * spread,
    roll: reduced ? 0 : Math.sign(distance) * Math.min(magnitude, 3) * 1.4 * spread,
    scale: 1,
    visible: magnitude < 2.85 && opacity > .0005,
  };
}

/** Clip in screen space so the animated edge is not rasterized inside a 3D layer. */
export function equipmentFrontPath(pose: EquipmentPose, width: number, height: number, layout = equipmentLayout(width, height), reduced = false) {
  const plane = equipmentPlane(pose, width, height, layout);
  if (reduced) {
    const clipWidth = plane.width / (plane.height / height);
    return equipmentFolderPath(clipWidth, height, pose.fold, 0, (width - clipWidth) / 2);
  }
  const angle = pose.angle * Math.PI / 180;
  const perspective = Math.max(width, height) * 1.8;
  return equipmentFolderPath(plane.width, plane.height, pose.fold, 0, 0, 0, (x, y) => {
    const localX = x - plane.width / 2, localY = y - plane.height / 2;
    const projection = perspective / (perspective + Math.sin(angle) * localX);
    return [width / 2 + Math.cos(angle) * localX * projection, plane.centerY + localY * projection];
  });
}

/** A screen-space window reveals the product without rotating or resizing it. */
export function equipmentWindowPath(pose: EquipmentPose, width: number, height: number, layout = equipmentLayout(width, height), reduced = false) {
  const plane = equipmentPlane(pose, width, height, layout);
  const angle = reduced ? 0 : (pose.angle - 180) * Math.PI / 180;
  const scale = reduced ? 1 : plane.scale;
  const perspective = Math.max(width, height) * 1.8;
  return equipmentFolderPath(layout.cardWidth, layout.cardHeight, 1, 0, 0, 0, (x, y) => {
    const localX = (x - layout.cardWidth / 2) * scale;
    const localY = (y - layout.cardHeight / 2) * scale;
    const depth = -Math.sin(angle) * localX;
    const project = perspective / (perspective - depth);
    return [layout.centerX + Math.cos(angle) * localX * project, plane.centerY + localY * project];
  });
}

/** Rounded tabs and a chamfered lower corner, shared by both faces and every card. */
export function equipmentFolderPath(width: number, height: number, amount = 1, inset = 0, originX = 0, originY = 0, project?: (x: number, y: number) => [number, number]) {
  const x = originX + inset, y = originY + inset, w = width - inset * 2, h = height - inset * 2;
  const r = Math.min(w, h) * .032 * amount;
  const tab = w * .064 * amount, step = h * .055 * amount, cut = w * .09 * amount;
  const point = (px: number, py: number) => (project ? project(px, py) : [px, py]).map(n => Number(n.toFixed(3))).join(' ');
  const line = (px: number, py: number) => 'L' + point(px, py);
  const curve = (cx: number, cy: number, px: number, py: number) => 'Q' + point(cx, cy) + ' ' + point(px, py);
  return [
    'M' + point(x+r, y),
    line(x+w*.60, y), curve(x+w*.62, y, x+w*.635, y+step*.45),
    line(x+w*.65, y+step*.82), curve(x+w*.66, y+step, x+w*.68, y+step),
    line(x+w-tab-r, y+step), curve(x+w-tab, y+step, x+w-tab, y+step+r),
    line(x+w-tab, y+h*.29), curve(x+w-tab, y+h*.31, x+w-tab*.55, y+h*.325),
    line(x+w-tab*.2, y+h*.34), curve(x+w, y+h*.35, x+w, y+h*.37),
    line(x+w, y+h-r), curve(x+w, y+h, x+w-r, y+h),
    line(x+cut+r, y+h), curve(x+cut, y+h, x+cut-r*.6, y+h-r*.6),
    line(x+r*.6, y+h-cut+r*.6), curve(x, y+h-cut, x, y+h-cut-r),
    line(x, y+r), curve(x, y, x+r, y), 'Z',
  ].join('');
}
