// Export browser and touch icons from the favicon's original XR wordmark paths.
// Run from the repository root: node scripts/prepare-favicon.mjs
import sharp from 'sharp';

for (const size of [16, 32, 96]) {
  await sharp('public/favicon.svg', { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(`public/favicon-${size}.png`);
}
await sharp('public/favicon.svg', { density: 384 })
  .resize(180, 180)
  .flatten({ background: '#111214' })
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png');
