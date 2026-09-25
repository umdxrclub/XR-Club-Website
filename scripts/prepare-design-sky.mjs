// Extract the In The Sky painting for the Design title; flares, particles and
// post effects are not exported.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Pass the In The Sky scene.pkg file (Workshop 2335369259).');
const archive = await fs.readFile(source);
let offset = 0;
const uint = () => { const value = archive.readUInt32LE(offset); offset += 4; return value; };
const string = () => { const length = uint(); const value = archive.subarray(offset, offset + length).toString(); offset += length; return value; };
if (!/^PKGV\d+$/.test(string())) throw new Error('Unsupported scene archive.');
const count = uint(), entries = [];
for (let i = 0; i < count; i++) entries.push({ name: string(), start: uint(), length: uint() });
const files = new Map(entries.map(entry => [entry.name, archive.subarray(offset + entry.start, offset + entry.start + entry.length)]));

// The painting is stored as a plain PNG inside the texture container.
function texture(name) {
  const b = files.get(`materials/${name}.tex`);
  if (!b || b.toString('ascii', 0, 8) !== 'TEXV0005' || b.toString('ascii', 46, 54) !== 'TEXB0003') throw new Error(`Unsupported texture: ${name}`);
  if (b.readUInt32LE(75) || b.readInt32LE(59) < 0) throw new Error(`Expected an uncompressed image file in ${name}.`);
  const size = b.readUInt32LE(83);
  return sharp(b.subarray(87, 87 + size));
}

const output = 'public/scenes/design-sky';
await fs.mkdir(output, { recursive: true });
const painting = texture('cloudytakeoff');
const { width, height } = await painting.metadata();
// The title reads right to left from the sun: mirror the painting so the
// large cloud bank sits in the letters and the sun ends the word.
const sun = { x: width - 1271, y: 755 };
const crop = { left: Math.round(width * .05), top: Math.round(height * .3), width: Math.round(width * .51), height: Math.round(height * .32) };
// sharp crops before it mirrors, so take the crop from the unmirrored side.
const cut = await painting.extract({ ...crop, left: width - crop.left - crop.width }).toBuffer();
await sharp(cut).flop().webp({ quality: 88, effort: 6 }).toFile(path.join(output, 'sky.webp'));
const metadata = { source: 'Wallpaper Engine 2335369259', width, height, mirrored: true, crop, sun: { x: sun.x - crop.left, y: sun.y - crop.top } };
await fs.writeFile(path.join(output, 'source.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));
