import { mix, phase } from '../projects/projectStoryMotion';
import type { EquipmentCatPose } from './equipmentCatMotion';
export type CatPoint = { x: number; y: number };
const point = (a: CatPoint, b: CatPoint, t: number): CatPoint => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** Two fixed bone lengths; the wrist is the constraint, rather than a free curve. */
export function catArmJoint(shoulder: CatPoint, wrist: CatPoint, side: -1 | 1) {
  const upper = 445, lower = 425;
  const dx = wrist.x - shoulder.x, dy = wrist.y - shoulder.y;
  const distance = Math.hypot(dx, dy);
  const reach = Math.max(Math.abs(upper - lower) + .01, Math.min(upper + lower - .01, distance));
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / Math.max(distance, .001), uy = dy / Math.max(distance, .001);
  return { x: shoulder.x + ux * along - uy * height * side, y: shoulder.y + uy * along + ux * height * side };
}

/** Match the SVG torso transform so both shoulders remain attached during effort. */
export function catBodyPoint(pose: EquipmentCatPose, x: number, y: number): CatPoint {
  x *= 1 + pose.squash;
  y = y * (1 - pose.squash) + 1420 * pose.squash;
  const angle = pose.bodyAngle * Math.PI / 180;
  const dx = x - 480, dy = y - 1300;
  return {
    x: pose.bodyX + pose.scale * (480 + dx * Math.cos(angle) - dy * Math.sin(angle)),
    y: pose.bodyY + pose.scale * (1300 + dx * Math.sin(angle) + dy * Math.cos(angle)),
  };
}

export function catPullRig(pose: EquipmentCatPose) {
  const reach = pose.grab;
  const y = 1220 - 1100 * reach;
  const left = { x: 320 - 140 * reach, y };
  const rightReach = phase(.505, .54, pose.progress);
  const right = { x: 650 + 170 * rightReach, y: 1220 - 1100 * rightReach };
  const shoulderLeft = catBodyPoint(pose, 335, 870);
  const shoulderRight = catBodyPoint(pose, 605, 870);
  const elbowLeft = catArmJoint(shoulderLeft, left, -1);
  const elbowRight = catArmJoint(shoulderRight, right, 1);
  const arm = (a: CatPoint, b: CatPoint, c: CatPoint) => {
    const before = point(b, a, .13), after = point(b, c, .13);
    return 'M' + a.x + ' ' + a.y + 'L' + before.x + ' ' + before.y + 'Q' + b.x + ' ' + b.y + ' ' + after.x + ' ' + after.y + 'L' + c.x + ' ' + c.y;
  };
  const closed = phase(.52, .54, pose.progress);
  return {
    left, right, shoulderLeft, shoulderRight, elbowLeft, elbowRight,
    leftPath: arm(shoulderLeft, elbowLeft, left), rightPath: arm(shoulderRight, elbowRight, right),
    // Curl around the edge, then keep a flat contact patch while the torso moves.
    handAngle: mix(24, 0, closed), handScale: mix(1.14, .94, closed),
  };
}

/** Keep the existing sheet trajectory; align the jumping cat to that exact edge. */
export function catPageContact(pose: EquipmentCatPose, height: number, scale: number, cameraTop: number) {
  const sheetActorY = pose.actorY + pose.paperPull * (height / scale + 900);
  const handLevel = cameraTop + (sheetActorY + 1220) * scale;
  const edgeY = Math.max(0, handLevel) * pose.paperCatch;
  // Before contact this is a smooth upward leap. Once caught, wrist and edge coincide.
  const actorY = sheetActorY + (edgeY - handLevel) / scale * pose.hook;
  return { actorY, edgeY };
}
