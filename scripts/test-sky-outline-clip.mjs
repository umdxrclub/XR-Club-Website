import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const code = ts.transpileModule(await fs.readFile('src/lib/clipCurves.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Math, Infinity });
const { clipCubics, cubicsPath } = exports;

// The same closed spline skyJourney's contour() draws through projected points.
const spline = points => points.map((b, i) => {
  const a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length], d = points[(i + 2) % points.length];
  return [b, { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 }, { x: c.x - (d.x - b.x) / 6, y: c.y - (d.y - b.y) / 6 }, c];
});
const at = ([p0, p1, p2, p3], t) => { const u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }; };
const flatten = segments => segments.flatMap(s => Array.from({ length: 256 }, (_, i) => at(s, i / 256)));
// Nonzero winding, matching SVG clip-rule="nonzero".
const winding = (poly, x, y) => {
  let w = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a.y <= y) { if (b.y > y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) > 0) w++; }
    else if (b.y <= y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) < 0) w--;
  }
  return w;
};
const near = (poly, x, y, d) => poly.some(p => Math.abs(p.x - x) < d && Math.abs(p.y - y) < d);

const screen = { width: 1440, height: 900 }, margin = 96;
const bounds = { left: -margin, top: -margin, right: screen.width + margin, bottom: screen.height + margin };

// Small outline: untouched, so the path string is exactly what contour() produced before.
const small = spline(Array.from({ length: 40 }, (_, i) => ({ x: 700 + 200 * Math.cos(i / 40 * 2 * Math.PI), y: 450 + 150 * Math.sin(i / 40 * 2 * Math.PI) })));
assert.equal(clipCubics(small, bounds), small, 'An outline that fits is returned as is');
assert.equal(cubicsPath(clipCubics(small, bounds)), cubicsPath(small));

// Large outlines, as when the camera zooms through a window: convex, rotated folder-like, and wavy concave.
const shapes = {
  zoomedEllipse: Array.from({ length: 64 }, (_, i) => ({ x: 720 + 2600 * Math.cos(i / 64 * 2 * Math.PI), y: 450 + 1900 * Math.sin(i / 64 * 2 * Math.PI) })),
  offsetBlob: Array.from({ length: 80 }, (_, i) => { const a = i / 80 * 2 * Math.PI, r = 1200 + 300 * Math.sin(3 * a); return { x: 1500 + r * Math.cos(a), y: 200 + r * 1.3 * Math.sin(a) }; }),
  wavyConcave: Array.from({ length: 120 }, (_, i) => { const a = i / 120 * 2 * Math.PI, r = 900 + 420 * Math.sin(9 * a); return { x: 300 + r * Math.cos(a), y: 700 + r * Math.sin(a) }; }),
};
for (const [name, points] of Object.entries(shapes)) {
  const original = spline(points);
  const clipped = clipCubics(original, bounds);
  assert.ok(clipped.length > 0, `${name} still shows`);
  for (const p of clipped.flat()) assert.ok(p.x >= bounds.left - 1e-6 && p.x <= bounds.right + 1e-6 && p.y >= bounds.top - 1e-6 && p.y <= bounds.bottom + 1e-6, `${name} stays within the screen margin`);
  const before = flatten(original), after = flatten(clipped);
  let checked = 0;
  for (let y = 0.5; y < screen.height; y += 12) for (let x = 0.5; x < screen.width; x += 12) {
    if (near(before, x, y, 0.75)) continue; // the edge itself is drawn with the same curve either way
    assert.equal(winding(after, x, y) !== 0, winding(before, x, y) !== 0, `${name}: (${x}, ${y}) is clipped the same`);
    checked++;
  }
  assert.ok(checked > 5000, `${name} checked across the screen`);
}

// An outline entirely off screen clips to nothing.
const away = spline(Array.from({ length: 24 }, (_, i) => ({ x: 5000 + 100 * Math.cos(i / 24 * 2 * Math.PI), y: 5000 + 100 * Math.sin(i / 24 * 2 * Math.PI) })));
assert.equal(cubicsPath(clipCubics(away, bounds)), 'M0 0Z');

console.log('PASS: sky window and shadow outlines are trimmed to the screen margin exactly: every point on screen is clipped as before, and outlines that fit are unchanged.');
