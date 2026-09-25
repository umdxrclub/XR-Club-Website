// Export only the original cat layers, preserving source resolution and parallax.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Pass the Minimal Noir source scene.pkg (Workshop 3736099508).');
const archive = await fs.readFile(source);
let offset = 0;
const uint = () => { const value = archive.readUInt32LE(offset); offset += 4; return value; };
const string = () => { const length = uint(); const value = archive.subarray(offset, offset + length).toString(); offset += length; return value; };
if (!/^PKGV\d+$/.test(string())) throw new Error('Unsupported scene archive.');
const count = uint(), entries = [];
for (let i = 0; i < count; i++) entries.push({ name: string(), start: uint(), length: uint() });
const files = new Map(entries.map(entry => [entry.name, archive.subarray(offset + entry.start, offset + entry.start + entry.length)]));

function lz4(input, size) {
  const output = Buffer.alloc(size); let i = 0, o = 0;
  while (i < input.length) {
    const token = input[i++]; let literal = token >> 4;
    if (literal === 15) { let n; do { n = input[i++]; literal += n; } while (n === 255); }
    if (i + literal > input.length || o + literal > size) throw new Error('Invalid literal block.');
    input.copy(output, o, i, i + literal); i += literal; o += literal;
    if (i >= input.length) break;
    const back = input.readUInt16LE(i); i += 2;
    let length = (token & 15) + 4;
    if ((token & 15) === 15) { let n; do { n = input[i++]; length += n; } while (n === 255); }
    if (!back || back > o || o + length > size) throw new Error('Invalid LZ4 block.');
    for (let n = 0; n < length; n++, o++) output[o] = output[o - back];
  }
  if (o !== size) throw new Error('Incomplete LZ4 block.');
  return output;
}

function texture(name) {
  const b = files.get(`materials/${name}.tex`);
  if (!b || b.toString('ascii', 0, 8) !== 'TEXV0005' || !['TEXB0003', 'TEXB0004'].includes(b.toString('ascii', 46, 54))) throw new Error(`Unsupported texture: ${name}`);
  const shift = b.toString('ascii', 46, 54) === 'TEXB0004' ? 4 : 0;
  const size = b.readUInt32LE(83 + shift);
  let bytes = b.subarray(87 + shift, 87 + shift + size);
  if (b.readUInt32LE(75 + shift)) bytes = lz4(bytes, b.readUInt32LE(79 + shift));
  if (b.readInt32LE(59) < 0) throw new Error(`Expected an embedded lossless cat image: ${name}`);
  return sharp(bytes);
}

const output = 'public/scenes/cat';
await fs.mkdir(output, { recursive: true });
const scene = JSON.parse(files.get('scene.json'));
const layers = [];
for (const [name, id] of [['Cat 9', 'body'], ['Cat 8', 'head'], ['Cat 5', 'eyes'], ['Cat 6', 'pupils'], ['Cat 3', 'whiskers']]) {
  const object = scene.objects.find(object => object.name === name);
  if (!object) throw new Error(`Missing cat layer: ${name}`);
  const art = texture(name), { width, height } = await art.metadata();
  await art.webp({ lossless: true, effort: 6 }).toFile(path.join(output, `${id}.webp`));
  layers.push({ id, source: name, width, height, origin: object.origin, parallaxDepth: object.parallaxDepth });
}
await fs.writeFile(path.join(output, 'source.json'), JSON.stringify({
  title: 'Minimal Noir 4k', workshop: '3736099508', uploader: 'Drioyard',
  projection: scene.general.orthogonalprojection,
  parallax: { amount: scene.general.cameraparallaxamount, delay: scene.general.cameraparallaxdelay, mouseInfluence: scene.general.cameraparallaxmouseinfluence },
  layers,
}, null, 2) + '\n');
console.log(`Exported ${layers.length} lossless cat layers to ${output}.`);