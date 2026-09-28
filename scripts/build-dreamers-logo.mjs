// Build the Dreamers (NASA SUITS team) wordmark from code. Run from anywhere:
//   node scripts/build-dreamers-logo.mjs [output directory, default public/brand]
//
// The wordmark uses the Labs lettering: the header's own a and s, the typeface's d, r, e
// and m centerlines, and the header's stroke weight. It writes an ink version for light
// backgrounds and a white one for dark backgrounds and the workspace sky.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const INK = '#111214', PAPER = '#FFFFFF', STROKE = 27;
const OUT = process.argv[2] ?? fileURLToPath(new URL('../public/brand', import.meta.url));

const header = await readFile(new URL('../public/brand/xr-labs-header.svg', import.meta.url), 'utf8');
const strokes = header.slice(header.indexOf('stroke="#FFFFFF"'));
const headerPaths = [...strokes.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
const shift = (d, dx) => d.replace(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g, (_, cmd, args) => {
  const v = args.trim() ? args.trim().split(/[\s,]+|(?=-)/).map(Number) : [];
  if (cmd === 'V' || cmd === 'Z') return cmd + args;
  if (cmd === 'H') return cmd + v.map(x => x + dx).join(' ');
  return cmd + v.map((x, i) => i % 2 ? x : x + dx).join(' ');
});
// Centerline glyphs: [path, left extent, right extent], on the header's baseline.
const GLYPHS = {
  d: ['M119 23V201M119 142C119 107 98 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C98 202 119 177 119 142Z', 16, 119],
  r: ['M16 81V215M16 140C16 105 36 81 65 81C77 81 86 84 94 89', 16, 94],
  e: ['M18 140H119C119 103 98 81 69 81C38 81 16 106 16 142C16 177 38 202 71 202C91 202 106 195 119 184', 16, 119],
  a: [shift(headerPaths[1], -539), 16, 119],
  m: ['M16 81V215M16 135C16 101 33 81 58 81C82 81 98 100 98 130V215M98 133C98 101 116 81 141 81C166 81 181 100 181 130V215', 16, 181],
  s: [shift(headerPaths[3], -839), 16, 120],
};
// Space between centerline extents, by the shape each side presents (the header's rhythm).
const SPACE = { dr: 48, re: 25, ea: 38, am: 48, me: 43, er: 43, rs: 27 };
let x = 0; const paths = [];
[...'dreamers'].forEach((ch, i, word) => {
  const [d, left, right] = GLYPHS[ch];
  paths.push(`<path d="${shift(d, x - left)}"/>`);
  x += right - left + (i < word.length - 1 ? SPACE[ch + word[i + 1]] : 0);
});
// Lettering spans y 23..215 at the centerline; the ink adds half a stroke above.
const top = 23 - STROKE / 2, w = x + STROKE, h = 215 - top;
const wordmark = color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" role="img" aria-labelledby="title">\n`
  + `  <title id="title">Dreamers</title>\n`
  + `  <g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="round" transform="translate(${STROKE / 2} ${-top})">${paths.join('')}</g>\n</svg>\n`;

const files = { 'dreamers-wordmark.svg': wordmark(INK), 'dreamers-wordmark-white.svg': wordmark(PAPER) };
await mkdir(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) await writeFile(`${OUT}/${name}`, content);
console.log(Object.keys(files).map(f => `${OUT}/${f}`).join('\n'));
