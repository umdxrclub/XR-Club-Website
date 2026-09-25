import { phase } from '../projects/projectStoryMotion';
import type { CollageBox } from './cloudPhotoLayout';
// Give each collage enough scroll distance for a gradual entrance and reading pause.
export const CLOUD_PHOTO_HOLD = 2;

/** Choose an entrance from the photo's position in the responsive collage. */
export function collagePhotoOrigin(box: CollageBox, boxes: CollageBox[], width: number, height: number) {
  const top = Math.min(...boxes.map(item => item.y));
  const upper = box.y < top + box.height * .5;
  const center = (box.x + box.width / 2) / width;
  const horizontal = center < .3 ? -1 : center > .7 ? 1 : 0;
  const x = horizontal * (width + box.width);
  const y = upper ? -(height + box.height) : horizontal ? 0 : height + box.height;
  return { x, y };
}

/** Smooth, staggered travel with a quiet landing and no opacity or mask morph. */
export function collagePhotoPose(progress: number, order: number, reduced: boolean) {
  const starts = [0, .045, .025, .085, .065, .10];
  const start = starts[order % starts.length];
  const arrival = reduced ? 1 : phase(start, start + .82, progress);
  return { remaining: 1 - arrival, visible: reduced || progress > start };
}
