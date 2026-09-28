// Build the Dreamers (NASA SUITS team) logo from code. Run from the repository root.
// The wordmark uses the Labs lettering: the header's own a and s, and the matching
// centerline paths from scripts/build-typeface.py for d, r, e and m, stroked like
// the header. The mark is Testudo, drawn like the site's cat: a flat silhouette
// with big white eyes, looking up.
import { readFile, writeFile } from 'node:fs/promises';

const INK = '#111214', PAPER = '#FFFFFF', STROKE = 27;

const header = await readFile('public/brand/xr-labs-header.svg', 'utf8');
const strokes = header.slice(header.indexOf('stroke="#FFFFFF"'));
const headerPaths = [...strokes.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
const shift = (d, dx) => d.replace(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g, (_, cmd, args) => {
  const n = args.trim() ? args.trim().split(/[\s,]+|(?=-)/).map(Number) : [];
  if (cmd === 'V' || cmd === 'Z') return cmd + args;
  if (cmd === 'H') return cmd + n.map(v => v + dx).join(' ');
  return cmd + n.map((v, i) => i % 2 ? v : v + dx).join(' ');
});

// Centerline glyphs: [path, left extent, right extent], all on the header's baseline.
const GLYPHS = {
  d: ['M119 23V201M119 142C119 107 98 81 68 81C37 81 16 107 16 142C16 177 37 202 68 202C98 202 119 177 119 142Z', 16, 119],
  r: ['M16 81V215M16 140C16 105 36 81 65 81C77 81 86 84 94 89', 16, 94],
  e: ['M18 140H119C119 103 98 81 69 81C38 81 16 106 16 142C16 177 38 202 71 202C91 202 106 195 119 184', 16, 119],
  a: [shift(headerPaths[1], -539), 16, 119],
  m: ['M16 81V215M16 135C16 101 33 81 58 81C82 81 98 100 98 130V215M98 133C98 101 116 81 141 81C166 81 181 100 181 130V215', 16, 181],
  s: [shift(headerPaths[3], -839), 16, 120],
};
// Space between centerline extents, by the shape each side presents.
const SPACE = { dr: 50, re: 26, ea: 40, am: 50, me: 45, er: 45, rs: 28 };

function wordmark(word = 'dreamers') {
  let x = 0, paths = [];
  [...word].forEach((ch, i) => {
    const [d, left, right] = GLYPHS[ch];
    paths.push(`<path d="${shift(d, x - left)}"/>`);
    x += right - left + (i < word.length - 1 ? SPACE[ch + word[i + 1]] : 0);
  });
  return { width: x, body: paths.join('') };
}

function testudo(ink = INK, paper = PAPER) {
  return `<g fill="${ink}"><path d="M36 156C26 158 18 162 14 168C22 172 30 172 36 172Z"/>`
    + `<path d="M58 166H86V188C86 194 82 198 76 198H68C62 198 58 194 58 188ZM150 166H178V188C178 194 174 198 168 198H160C154 198 150 194 150 188Z"/>`
    + `<path d="M30 170C30 104 72 64 124 64C176 64 208 104 208 164C208 170 204 174 198 174H36C32 174 30 172 30 170Z"/>`
    + `<path d="M184 152C192 130 202 120 214 120L226 168H192Z"/>`
    + `<path d="M212 96C236 96 252 112 252 136C252 160 236 172 214 172C190 172 176 160 176 136C176 112 190 96 212 96Z"/></g>`
    + `<path d="M44 152C84 160 140 160 176 153" fill="none" stroke="${paper}" stroke-width="5" stroke-linecap="round"/>`
    + `<g fill="${paper}"><path d="M196 116C205 116 210 123 210 133C210 143 205 149 197 149C189 149 184 143 184 133C184 123 188 116 196 116Z"/>`
    + `<path d="M229 116C238 116 243 123 243 133C243 143 238 149 230 149C222 149 217 143 217 133C217 123 221 116 229 116Z"/></g>`
    + `<g fill="${ink}"><ellipse cx="202" cy="125" rx="4.6" ry="7.2"/><ellipse cx="235" cy="125" rx="4.6" ry="7.2"/></g>`;
}
// Testudo centered in a 256 circle, for the badge and favicon.
const badgeBody = (fill = PAPER) => `<circle cx="128" cy="128" r="128" fill="${fill}"/><g transform="translate(128 134) scale(.9) translate(-133 -131)">${testudo()}</g>`;
const strokeGroup = (color, body) => `<g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="round">${body}</g>`;
const svg = (viewBox, title, body, size = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size} role="img" aria-labelledby="title">\n  <title id="title">${title}</title>\n  ${body}\n</svg>\n`;

const word = wordmark();
// Lettering spans y 23..215 before stroke; pad by half the stroke.
const top = 23 - STROKE / 2, bottom = 215 + STROKE / 2, textHeight = bottom - top;
// The badge matches the full letter height, like the XR badge beside labs.
const badgeSize = textHeight + 12, badgeY = top - 6, gap = 44;
const lockup = (textColor) => {
  const tx = badgeSize + gap + STROKE / 2;
  const w = tx + word.width + STROKE / 2;
  return svg(`0 ${badgeY} ${Math.ceil(w)} ${badgeSize}`, 'Dreamers',
    `<g transform="translate(0 ${badgeY}) scale(${badgeSize / 256})">${badgeBody()}</g>\n  ${strokeGroup(textColor, `<g transform="translate(${tx} 0)">${word.body}</g>`)}`,
    ` width="${Math.ceil(w)}" height="${badgeSize}"`);
};
// Light backgrounds: the silhouette itself, no badge.
const lockupLight = () => {
  const markH = textHeight * 0.98, scale = markH / 134, markW = 238 * scale;
  const tx = markW + gap + STROKE / 2, w = tx + word.width + STROKE / 2;
  return svg(`0 ${top} ${Math.ceil(w)} ${textHeight}`, 'Dreamers',
    `<g transform="translate(${-14 * scale} ${top + textHeight - markH - 64 * scale}) scale(${scale})">${testudo()}</g>\n  ${strokeGroup(INK, `<g transform="translate(${tx} 0)">${word.body}</g>`)}`,
    ` width="${Math.ceil(w)}" height="${Math.ceil(textHeight)}"`);
};

const files = {
  'public/brand/dreamers-lockup.svg': lockup(PAPER),
  'public/brand/dreamers-lockup-light.svg': lockupLight(),
  'public/brand/dreamers-mark.svg': svg('14 64 238 134', 'Dreamers', testudo()),
  'public/brand/dreamers-badge.svg': svg('0 0 256 256', 'Dreamers', badgeBody()),
  'public/brand/dreamers-wordmark.svg': svg(`${-STROKE / 2} ${top} ${Math.ceil(word.width + STROKE)} ${textHeight}`, 'Dreamers', strokeGroup(INK, word.body)),
};
for (const [path, content] of Object.entries(files)) await writeFile(path, content);
console.log(Object.keys(files).join('\n'));
