import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const code = ts.transpileModule(await fs.readFile('src/features/apply/morph.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Math });
const { morphEdges, edgeClip, BAND } = exports;

const height = 900, width = 1440;
// The sweep starts with the leaving step whole and ends with the arriving step whole, with a flat edge at both ends.
assert.ok(morphEdges(0, height).leave >= height, 'nothing of the leaving step is clipped before the sweep starts');
assert.ok(morphEdges(1, height).arrive <= 0, 'the arriving step is whole once the sweep ends');
assert.equal(morphEdges(0, height).amplitude, 0);
assert.ok(Math.abs(morphEdges(1, height).amplitude) < 1e-9);
// Between the two edges only a thin, even band of background shows, so the screen is never empty halfway (the old
// morph hid both steps for a quarter of every transition).
let previous = morphEdges(0, height);
for (let i = 1; i <= 100; i++) {
  const f = i / 100, now = morphEdges(f, height);
  assert.ok(Math.abs(now.arrive - now.leave - 2 * BAND * height) < 1e-9, `the band stays ${2 * BAND * height}px wide at f=${f}`);
  assert.ok(now.leave < previous.leave && now.arrive < previous.arrive, 'both edges rise steadily');
  previous = now;
}
// A clip is a closed polygon with a point per column that keeps the right side of the edge and stays within the wave.
const above = edgeClip(450, 30, 1, width, height, true), below = edgeClip(450, 30, 1, width, height, false);
assert.match(above, /^path\('M0 -40H1440V[-\d.]+(L[\d.]+ [-\d.]+){24}Z'\)$/);
assert.match(below, /^path\('M0 940H1440V[-\d.]+(L[\d.]+ [-\d.]+){24}Z'\)$/);
const ys = [...above.matchAll(/L[\d.]+ ([-\d.]+)/g)].map(m => Number(m[1]));
assert.ok(ys.every(y => Math.abs(y - 450) <= 30 * 1.55 + .05), 'the wave stays within its amplitude of the edge');
// With no amplitude the edge is flat, so the two clips meet exactly along one line.
assert.equal(edgeClip(450, 0, 1, width, height, true).match(/L0\.0 ([\d.]+)Z/)[1], '450.0');
assert.equal(edgeClip(450, 0, 1, width, height, false).match(/L0\.0 ([\d.]+)Z/)[1], '450.0');

console.log('PASS: the step morph keeps the screen covered: one wave, two edges a thin band apart, whole steps at either end.');
