/** Original, unmodified public/Images/bubble.png dimensions. */
export const BUBBLE_IMAGE_WIDTH = 2130;
export const BUBBLE_IMAGE_HEIGHT = 1539;
export const BUBBLE_IMAGE_ASPECT = BUBBLE_IMAGE_WIDTH / BUBBLE_IMAGE_HEIGHT;

/**
 * 225° clockwise from screen +X: enter the ring on its upper-left arc.
 * A CSS conic-gradient uses +Y-up as its zero, so its matching `from` angle is
 * 315deg, i.e. BUBBLE_TRACE_START_ANGLE * 180 / Math.PI + 90.
 */
export const BUBBLE_TRACE_START_ANGLE = 5 * Math.PI / 4;

const TAU = Math.PI * 2;

// Low-pass Fourier fit to the original 256 alpha-centroid radii, in source
// pixels. Retain only three harmonics, with gains .8/.4/.1: the tiny folds in
// the artwork must not make a flying butterfly zigzag. This rounded profile
// has strictly positive curvature, so its heading advances around the loop
// without reversing direction. Its radius and all derivatives are periodic.
const MEAN_RADIUS = 679.30340234375;
const HARMONICS = [
  { cosine: 62.277123178738606 * 0.8, sine: -73.78725466833176 * 0.8 },
  { cosine: 178.2455842305312 * 0.4, sine: 110.3287985125519 * 0.4 },
  { cosine: -51.52879350669971 * 0.1, sine: 7.06150670140379 * 0.1 },
] as const;

const clampProgress = (progress: number) => Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

export interface BubblePathSample {
  /** Position normalized independently by the PNG width and height. */
  x: number;
  y: number;
  /**
   * Unit tangent in source-pixel axes, where +X is right and +Y is down.
   * atan2(tangentY, tangentX) is the heading when the image keeps its aspect.
   * For a stretched image, multiply these by renderedWidth/2130 and
   * renderedHeight/1539 respectively before calculating the heading.
   */
  tangentX: number;
  tangentY: number;
}

/**
 * One rounded clockwise circuit, with a constant angular sweep.
 * p=0 and p=1 have identical position AND tangent. Angular progress is measured
 * in pixel space, matching a conic CSS mask centered at 50% 50% even though the
 * source is rectangular. No images, DOM access, or animation state are needed.
 */
export function sampleBubblePath(progress: number): BubblePathSample {
  const clamped = clampProgress(progress);
  const phase = clamped === 1 ? 0 : clamped;
  const angle = BUBBLE_TRACE_START_ANGLE + phase * TAU;
  let radius = MEAN_RADIUS;
  let radialDerivative = 0;
  for (let index = 0; index < HARMONICS.length; index++) {
    const frequency = index + 1;
    const harmonicAngle = frequency * angle;
    const { cosine, sine } = HARMONICS[index];
    radius += cosine * Math.cos(harmonicAngle) + sine * Math.sin(harmonicAngle);
    radialDerivative += frequency * (-cosine * Math.sin(harmonicAngle) + sine * Math.cos(harmonicAngle));
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = radialDerivative * cos - radius * sin;
  const dy = radialDerivative * sin + radius * cos;
  const speed = Math.hypot(dx, dy);

  return {
    x: 0.5 + radius * cos / BUBBLE_IMAGE_WIDTH,
    y: 0.5 + radius * sin / BUBBLE_IMAGE_HEIGHT,
    tangentX: dx / speed,
    tangentY: dy / speed,
  };
}

export interface BubbleFlightSample extends BubblePathSample {
  /** Actual angular sweep for the PNG mask; use this instead of flight time. */
  revealProgress: number;
}

// Cache the distance integral once. The table is small (32 KB), and each
// sample uses a binary search; the frame loop does not rebuild a spline.
const ARC_STEPS = 4096;
const ARC_LENGTHS = (() => {
  const lengths = new Float64Array(ARC_STEPS + 1);
  let previous = sampleBubblePath(0);
  for (let index = 1; index <= ARC_STEPS; index++) {
    const point = sampleBubblePath(index / ARC_STEPS);
    lengths[index] = lengths[index - 1] + Math.hypot(
      (point.x - previous.x) * BUBBLE_IMAGE_WIDTH,
      (point.y - previous.y) * BUBBLE_IMAGE_HEIGHT,
    );
    previous = point;
  }
  return lengths;
})();

/**
 * Smooth flight around the same orbit, parameterized by distance. Equal
 * progress steps travel nearly equal pixel distances, avoiding acceleration
 * spikes around the short-radius sections. Pass revealProgress to the mask;
 * sample a delayed flight progress and use its revealProgress for the trail.
 */
export function sampleBubbleFlight(progress: number): BubbleFlightSample {
  const distanceProgress = clampProgress(progress);
  if (distanceProgress === 0 || distanceProgress === 1) {
    return { ...sampleBubblePath(distanceProgress), revealProgress: distanceProgress };
  }
  const distance = distanceProgress * ARC_LENGTHS[ARC_STEPS];
  let lower = 0;
  let upper = ARC_STEPS;
  while (upper - lower > 1) {
    const middle = (lower + upper) >>> 1;
    if (ARC_LENGTHS[middle] < distance) lower = middle;
    else upper = middle;
  }
  const fraction = (distance - ARC_LENGTHS[lower]) / (ARC_LENGTHS[upper] - ARC_LENGTHS[lower]);
  const revealProgress = (lower + fraction) / ARC_STEPS;
  return { ...sampleBubblePath(revealProgress), revealProgress };
}
