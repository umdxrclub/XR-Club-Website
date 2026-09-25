import source from '../../../public/scenes/design-sky/source.json';

// The In The Sky painting (Workshop 2335369259) behind the Design title, in
// title units where the word is 100 units tall. scripts/prepare-design-sky.mjs
// mirrors the painting and crops it; source.json records that crop.
const PAINTING_HEIGHT = 480;
const scale = PAINTING_HEIGHT / source.height;
export const designSky = {
  width: source.crop.width * scale,
  height: source.crop.height * scale,
  // The sun inside the crop, as fractions of its size. The title script
  // slides the image so this point sits under the period.
  sun: { x: source.sun.x / source.crop.width, y: source.sun.y / source.crop.height },
} as const;
