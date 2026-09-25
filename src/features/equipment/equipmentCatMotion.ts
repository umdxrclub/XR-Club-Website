import { clamp, mix, phase } from '../projects/projectStoryMotion';

// End when the white sheet has cleared the ocean render.
export const CAT_TIMELINE_DISTANCE = 10.4;
export const CAT_ENTRANCE_DISTANCE = CAT_TIMELINE_DISTANCE * .79;
const pulse = (a: number, b: number, p: number) => Math.sin(Math.PI * phase(a, b, p));

// Motion reference: animationmentor.com/blog/tutorial-animate-a-jump-and-land/
// Grip reference: animationmentor.com/blog/tutorial-animating-character-prop-interaction/
/** Every pose is a pure function of scroll: scrubbing backwards restores contact. */
export function equipmentCatPose(offset: number, reduced = false) {
  const progress = clamp(offset / CAT_TIMELINE_DISTANCE);
  const entrance = clamp(progress / .32);
  const exit = reduced ? 1 : phase(.50, .80, entrance);
  const lean = reduced ? 0 : pulse(.20, .54, entrance);
  const leapTime = reduced ? 1 : clamp((entrance - .50) / .30);
  const airborne = reduced ? 0 : 4 * leapTime * (1-leapTime);
  const windup = reduced ? 0 : pulse(.39, .50, entrance);
  const impact = reduced ? 0 : pulse(.80, .92, entrance);
  const firstStep = airborne;
  const secondStep = reduced ? 0 : pulse(.56, .83, entrance);
  const approach = mix(1400, 720, phase(.12, .27, entrance));
  // Peek and hold; compress; push off; arc; lead-paw contact; settle.
  const x = reduced ? 0 : approach * (1-leapTime) * (1-leapTime);
  const y = reduced ? 0 : -330 * airborne + windup * 70 + impact * 20;
  const morph = phase(.19, .37, progress);
  const paperCatch = phase(.54, .605, progress);
  const paperPull = phase(.605, .79, progress);
  const crouch = reduced ? 0 : pulse(.465, .535, progress);
  const catchProgress = phase(.52, .605, progress);
  const hanging = phase(.52, .605, progress);
  const grab = phase(.51, .59, progress);
  // Finish at hand contact and hold this airborne pose for the remaining scroll.

  const actorY = -275 * catchProgress + crouch * 100;
  return {
    progress, entrance, reduced, visible: progress > 0,
    opacity: phase(0, .012, progress), morph,
    rackOpacity: reduced ? 1 - morph : 1,
    opening: reduced ? 0 : phase(.025, .16, entrance) * (1 - phase(.80, .94, entrance)),
    pressure: reduced ? 0 : phase(.34, .495, entrance) * (1 - phase(.80, .94, entrance)),
    riftOpacity: reduced ? 0 : phase(.005, .05, entrance) * (1 - phase(.93, .98, entrance)),
    bodyX: x, bodyY: y, scale: mix(.78, 1, exit),
    bodyAngle: -airborne * 12 + impact * 3,
    squash: windup * .085 + impact * .10 - airborne * .035 + crouch * .085 - pulse(.53, .605, progress) * (reduced ? 0 : .035),
    headX: x - lean * 96, headY: y - lean * 26, headAngle: -lean * 7 - airborne * 9 + impact * 4 - crouch * 5 + catchProgress * 4,
    headWindow: reduced || entrance >= .83 ? 1 : entrance >= .50 ? .5 : 0,
    bodyWindow: reduced || entrance >= .83 ? 1 : entrance >= .50 ? .5 : 0,
    firstStep, secondStep,
    tailAngle: reduced ? 0 : -firstStep * 12 + secondStep * 9 + hanging * 22,
    shadow: .13 * phase(.08, .28, progress) * (1 - .78*airborne) * (1 - catchProgress),
    paperCatch, paperPull,
    actorX: 0, actorY,
    actorOpacity: 1,
    grab, fly: 0, hanging, cameraLift: 0,
    state: progress >= .79 ? 'ocean' : progress >= .605 ? 'pulling-page' : progress >= .52 ? 'jumping' : progress >= .465 ? 'crouching' : progress >= .35 ? 'reaching-page' : entrance >= .97 ? 'settled' : entrance >= .80 ? 'landing' : entrance >= .50 ? 'leaping-through' : entrance >= .39 ? 'anticipating' : entrance >= .16 ? 'peeking' : 'slit',
  };
}
export type EquipmentCatPose = ReturnType<typeof equipmentCatPose>;

// Original narrow incision with straight sides and tapered tips.
export function catRiftPath(opening: number, _pressure = 0) {
  const w = 55 * clamp(opening);
  return `M950 135C950 300 ${950-w} 340 ${950-w} 500V1020C${950-w} 1200 950 1240 950 1370C950 1240 ${950+w} 1200 ${950+w} 1020V500C${950+w} 340 950 300 950 135Z`;
}
export function catPaperLipPath(opening: number, _pressure = 0) {
  const x = 950 + 55 * clamp(opening);
  return `M950 135C950 300 ${x} 340 ${x} 500V1020C${x} 1200 950 1240 950 1370`;
}
export function catOutsidePath(opening: number, reveal: number, pressure = 0) {
  if (!reveal) return catRiftPath(opening, pressure);
  // Keep the foreground crossing; the slit itself no longer balloons around the cat.
  const edge = 950 + 55 * clamp(opening);
  return `M-4000 -4000H${edge}V5000H-4000Z`;
}
