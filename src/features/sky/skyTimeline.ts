import { clamp, phase } from '../projects/projectStoryMotion';

export const SKY_PROJECT_HOLD = 1.65;
export const SKY_TRANSITION_DISTANCE = 3.35;

export function skyTransitionPose(progress: number) {
  const p = clamp(progress);
  return {
    turn: phase(.015, .245, p),
    morph: phase(.04, .255, p),
    shift: phase(.025, .255, p),
    liquid: clamp((p - .255) / .425),
    entrance: phase(.255, .66, p),
    zoom: phase(.70, 1, p),
    // Keep cursor motion through the flip, reveal, and zoom; release only as
    // the aperture fills the screen and becomes the sky scene.
    tilt: 1 - phase(.94, 1, p),
  };
}
