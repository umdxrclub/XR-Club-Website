// Generate raster icons from the favicon, independently of the website logo.
// Run from the repository root after editing public/favicon.svg.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const icon = await readFile('public/favicon.svg', 'utf8');
await sharp(Buffer.from(icon)).resize(96, 96).png().toFile('public/favicon-96.png');
// Touch icons fill the square; the device supplies its own corner mask.
await sharp(Buffer.from(icon)).resize(180, 180).flatten({ background: '#111214' }).png().toFile('public/apple-touch-icon.png');
