import fs from 'node:fs';
// CMU subject 81, trial 07 (pull a heavy object), 120 fps.
// Derive only the normalized weight-loading envelope, not a humanoid skeleton.
const input = process.argv[2];
if (!input) throw new Error('Pass the path to CMU 81_07.amc');
const frames = [];
for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/)) {
  if (line.startsWith('root ')) frames.push(Number(line.trim().split(/\s+/)[2]));
}
const first = 90, last = 360;
if (frames.length <= last) throw new Error('Incomplete CMU capture');
const smooth = i => {
  let total = 0, weight = 0;
  for (let j = -12; j <= 12; j++) {
    const w = 13 - Math.abs(j);
    total += frames[Math.max(0, Math.min(frames.length - 1, i + j))] * w; weight += w;
  }
  return total / weight;
};
const start = smooth(first), end = smooth(last);
const raw = Array.from({length: 33}, (_, i) => {
  const t = i / 32;
  return Math.max(0, start + (end - start) * t - smooth(Math.round(first + (last - first) * t)));
});
const maximum = Math.max(...raw);
const samples = raw.map(n => Number((n / maximum).toFixed(5)));
fs.writeFileSync(new URL('../src/features/equipment/catPullReference.ts', import.meta.url),
  '// Weight-loading envelope adapted from CMU 81_07, frames 91–361.\n' +
  '// Smoothed root height, detrended and normalized; see CREDITS.md.\n' +
  '// Regenerate with scripts/prepare-cat-pull.mjs and the original AMC capture.\n' +
  'export const CAT_PULL_LOAD = [' + samples.join(', ') + '] as const;\n');
console.log('Prepared 33 weight-loading samples from CMU 81_07.');
