// Prepare Earl's Dreamers logo for the workspace's dark top bar. Run from the repository root:
//   node scripts/prepare-dreamers-logo.mjs [path to the original PNG, default src/assets/suits/dreamers-logo-earl.png]
// Crops the transparent margins and turns the black "REAMERS" lettering white. The red D, rocket and texture are unchanged.
import sharp from 'sharp';

const source = process.argv[2] ?? 'src/assets/suits/dreamers-logo-earl.png';
const output = 'src/assets/suits/dreamers-logo-white.png';
const { data, info } = await sharp(source).trim({ threshold: 0 }).raw().toBuffer({ resolveWithObject: true });
// The lettering lies below the rocket and right of the D's bowl; only its dark, uncoloured pixels are inverted.
for (let y = 180; y < info.height; y++) {
  for (let x = 380; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!data[i + 3] || Math.max(r, g, b) - Math.min(r, g, b) >= 48 || Math.max(r, g, b) >= 170 || r - Math.max(g, b) >= 8) continue;
    data[i] = 255 - r; data[i + 1] = 255 - g; data[i + 2] = 255 - b;
  }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 9 }).toFile(output);
console.log(`${output}: ${info.width}x${info.height}`);
