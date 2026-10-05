// Rebuilds public/scenes/apply/axolotl-*.webp from the supplied Axolotl Ride wallpaper (Workshop 3305478571).
//   1. ffmpeg -ss 10 -i Axolotl_ride_final.mp4 -t 2 -vf fps=24,crop=1090:778:1362:726 frames/f%02d.png   (the swimmer's 2 s loop)
//   2. node scripts/prepare-axolotl.mjs frames public/scenes/apply
// The water is keyed by how much greener and bluer than red each pixel is (the swimmer is pink, its riders
// yellow-green); edge pixels are un-mixed from the frame's water colour. Frames are cropped to the swimmer's
// extent across the whole loop and packed into 8-column sheets at two sizes. The sheet metadata lives in
// src/features/apply/axolotl.ts.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');

const [framesDir = 'frames', outDir = 'public/scenes/apply'] = process.argv.slice(2);
const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
const LOW = 30, HIGH = 72; // teal-ness band: min(g-r, b-r) below LOW is creature, above HIGH is water
const keyed = [];
const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
for (const f of files) {
  const { data, info } = await sharp(`${framesDir}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const out = Buffer.alloc(W * H * 4);
  // Water colour for un-mixing edge pixels: the mean of clearly keyed pixels in this frame.
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let p = 0; p < W * H; p += 7) { const r = data[p * C], g = data[p * C + 1], b = data[p * C + 2]; if (Math.min(g - r, b - r) > HIGH + 20) { br += r; bg += g; bb += b; bn++; } }
  br /= bn; bg /= bn; bb /= bn;
  for (let p = 0; p < W * H; p++) {
    const r = data[p * C], g = data[p * C + 1], b = data[p * C + 2];
    const t = Math.min(g - r, b - r);
    let a = t <= LOW ? 1 : t >= HIGH ? 0 : 1 - (t - LOW) / (HIGH - LOW);
    a = a * a * (3 - 2 * a);
    let fr = r, fg = g, fb = b;
    if (a > 0 && a < 1) {
      fr = Math.min(255, Math.max(0, (r - (1 - a) * br) / a)); fg = Math.min(255, Math.max(0, (g - (1 - a) * bg) / a)); fb = Math.min(255, Math.max(0, (b - (1 - a) * bb) / a));
    }
    out[p * 4] = fr; out[p * 4 + 1] = fg; out[p * 4 + 2] = fb; out[p * 4 + 3] = Math.round(a * 255);
    if (a > 0.02) { const x = p % W, y = (p / W) | 0; if (x < box.left) box.left = x; if (x > box.right) box.right = x; if (y < box.top) box.top = y; if (y > box.bottom) box.bottom = y; }
  }
  keyed.push({ out, W, H });
}
const m = 6, left = Math.max(0, box.left - m), top = Math.max(0, box.top - m);
const width = Math.min(keyed[0].W, box.right + m + 1) - left, height = Math.min(keyed[0].H, box.bottom + m + 1) - top;
console.log('frames', keyed.length, 'swimmer box', { left, top, width, height });
fs.mkdirSync(outDir, { recursive: true });
for (const [name, frameW, cols] of [['axolotl-480', 480, 8], ['axolotl-300', 300, 8]]) {
  const frameH = Math.round(height * frameW / width);
  const rows = Math.ceil(keyed.length / cols);
  const tiles = [];
  for (let i = 0; i < keyed.length; i++) {
    const tile = await sharp(keyed[i].out, { raw: { width: keyed[i].W, height: keyed[i].H, channels: 4 } }).extract({ left, top, width, height }).resize(frameW, frameH, { kernel: 'lanczos3' }).png().toBuffer();
    tiles.push({ input: tile, left: (i % cols) * frameW, top: Math.floor(i / cols) * frameH });
  }
  await sharp({ create: { width: cols * frameW, height: rows * frameH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).webp({ quality: 86, alphaQuality: 92, effort: 6 }).toFile(`${outDir}/${name}.webp`);
  console.log(name, { frameWidth: frameW, frameHeight: frameH, frames: keyed.length, columns: cols, fps: 24 }, Math.round(fs.statSync(`${outDir}/${name}.webp`).size / 1024) + ' KB');
}
