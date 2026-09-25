import { clamp, mix, phase } from '../projects/projectStoryMotion';
import { CLOUD_PHOTO_HOLD } from './cloudPhotoMotion';

export const SKY_INTRO_DISTANCE = 4.6;
export const SKY_STORY_DISTANCE = SKY_INTRO_DISTANCE + 3.2 + CLOUD_PHOTO_HOLD * 4;
const INTRO_END = SKY_INTRO_DISTANCE / SKY_STORY_DISTANCE;
export const storyChapters = [
  { id: 'about', at: .23 },
  { id: 'community', at: 1.12 },
  { id: 'history', at: 2.08 },
  { id: 'sponsors', at: 3.03 },
] as const;
export type BirdFocus = { x: number; y: number; radius: number };

export function storyCloudProgress(progress: number) {
  return clamp((progress - INTRO_END) / (1 - INTRO_END));
}

export function skyStoryPose(progress: number, width: number, height: number, bird: BirdFocus, reduced = false) {
  const t = clamp(progress), intro = clamp(t / INTRO_END);
  const push = phase(.70, 1, intro);
  const cloudProgress = storyCloudProgress(t);
  const cx = mix(bird.x, width / 2, push), cy = mix(bird.y, height / 2, push);
  const coverRadius = Math.hypot(Math.max(bird.x, width - bird.x), Math.max(bird.y, height - bird.y)) + 4;
  const radius = mix(bird.radius, coverRadius, push);
  const diagonal = Math.hypot(width, height);
  const angle = reduced ? -Math.PI : (-115 - 130 * phase(.24, .54, intro)) * Math.PI / 180;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const offset = (reduced ? 0 : diagonal * 1.2 * (1 - phase(0, .22, intro))) - diagonal * 1.2 * phase(.52, .70, intro);
  const px = bird.x + nx * offset, py = bird.y + ny * offset;
  const tx = -ny, ty = nx, extent = diagonal * 4;
  const points = [
    [px + tx * extent, py + ty * extent],
    [px - tx * extent, py - ty * extent],
    [px - tx * extent + nx * extent, py - ty * extent + ny * extent],
    [px + tx * extent + nx * extent, py + ty * extent + ny * extent],
  ];
  const sheetPath = 'M' + points.map(point => point.map(n => n.toFixed(2)).join(' ')).join('L') + 'Z';
  const veilOpacity = reduced ? phase(0, .2, intro) * (1 - phase(.70, 1, intro)) : intro >= 1 ? 0 : 1;
  const paperAt = (x: number, y: number) => intro < 1 && veilOpacity >= .5
    && nx * (x - bird.x) + ny * (y - bird.y) >= offset
    && Math.hypot(x - cx, y - cy) > radius;
  return {
    progress: t, intro, push, cloudProgress, cx, cy, radius,
    sheetPath, veilOpacity, paperAt,
    introOpacity: phase(.16, .40, intro) * (1 - phase(.64, .78, intro)),
    letterEntrance: phase(.16, .40, intro),
    letterExit: phase(.64, .78, intro),
    introCopyTop: bird.y + bird.radius + 28,
  };
}
export type SkyStoryPose = ReturnType<typeof skyStoryPose>;
