import { phase } from '../projects/projectStoryMotion';

/** Scroll advances the birth of the blocks and then their smaller ripple echoes. */
export function equipmentRipplePose(offset: number, width: number, height: number, reduced = false) {
  const progress = phase(.36, 2.48, offset);
  const x = width * .5, y = height * .55;
  const reach = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return {
    progress, x, y, reach, reduced,
    // An un-eased clock preserves constant outward wave speed. Only scroll advances it.
    travel: Math.max(0, Math.min(1, offset / 4.2)),
  };
}
export type EquipmentRipplePose = ReturnType<typeof equipmentRipplePose>;

export function equipmentRippleCoverage(pose: EquipmentRipplePose, x: number, y: number) {
  if (pose.reduced) return pose.progress;
  if (pose.progress <= 0) return 0;
  if (pose.progress >= 1) return 1;
  // Match the average tile arrival beneath each navigation item. Local column
  // staggering varies within this band, so switch ink as the floor settles.
  const arrival = Math.min(.82, Math.hypot(x - pose.x, y - pose.y) / pose.reach * .72 + .04);
  const age = (pose.progress - arrival) / .18;
  return phase(.35, .80, age);
}

/** Neighboring impacts launch smaller rings behind the first expanding crest. */
export const equipmentRippleImpacts = [
  { x: 0, z: 0, at: .08, strength: 1 },
  { x: -11, z: -8, at: .29, strength: .55 },
  { x: 13, z: 4, at: .47, strength: .45 },
  { x: -9, z: 15, at: .65, strength: .38 },
] as const;
