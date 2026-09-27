// Keep every icon's lettering identical to the custom Labs Display monogram.
// Run from the repository root after editing public/brand/xr-labs-header.svg.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const header = await readFile('public/brand/xr-labs-header.svg', 'utf8');
const monogram = header.match(/<g id="xr-monogram"[^>]*>([\s\S]*?)<\/g>/)?.[1];
if (!monogram) throw new Error('The header logo must contain the XR monogram.');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>XR Labs</title>
  <circle cx="256" cy="256" r="256" fill="#111214"/>
  <g transform="translate(70 135) scale(1.06)" fill="none" stroke="#FFFFFF" stroke-width="32" stroke-linecap="butt" stroke-linejoin="round">${monogram}</g>
</svg>
`;
await writeFile('public/favicon.svg', icon);
await sharp(Buffer.from(icon)).resize(96, 96).png().toFile('public/favicon-96.png');
// Touch icons fill the square; the device supplies its own corner mask.
await sharp(Buffer.from(icon)).resize(180, 180).flatten({ background: '#111214' }).png().toFile('public/apple-touch-icon.png');
