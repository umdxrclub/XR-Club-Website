import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, module,
    require: id => load(path.resolve(path.dirname(file), id + '.ts')), Math });
  cache.set(file, module.exports);
  return module.exports;
}
const sky = load('src/features/sky/skyStoryMotion.ts');
const transition = load('src/features/sky/skyTimeline.ts');
const { collagePhotoPose, CLOUD_PHOTO_HOLD } = load('src/features/sky/cloudPhotoMotion.ts');
const { collageLayout, collageBounds } = load('src/features/sky/cloudPhotoLayout.ts');
const { homeSectionStops, sectionAtTravel } = load('src/lib/homeSections.ts');
assert.equal(transition.SKY_PROJECT_HOLD, 1.65, 'Preserve the Projects reading beat');
assert.equal(transition.SKY_TRANSITION_DISTANCE, 3.35, 'Preserve the original folder/sky transition');
assert.equal(sky.SKY_INTRO_DISTANCE, 4.6, 'Preserve the cloud aperture introduction');
assert(CLOUD_PHOTO_HOLD >= 1.8 && CLOUD_PHOTO_HOLD <= 2.2, 'Cloud photos should have time to settle without a long scroll stall');
for (const reduced of [false, true]) {
  const stops = homeSectionStops(reduced);
  assert(stops.home < stops.projects && stops.projects < stops.about && stops.about < stops.equipment);
  assert.equal(sectionAtTravel(stops.projects, reduced), 'projects');
  assert.equal(sectionAtTravel(stops.equipment, reduced), 'equipment');
  for (const [width, height] of [[390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
    const bird = { x: width * .64, y: height * .5, radius: height * .2 };
    for (let step = 0; step <= 100; step++) {
      const distance = step / 100 * sky.SKY_INTRO_DISTANCE;
      const pose = sky.skyStoryPose(distance / sky.SKY_STORY_DISTANCE, width, height, bird, reduced);
      assert(Math.abs(pose.intro - step / 100) < 1e-12, 'Intro keeps its physical scroll timing');
      assert(!pose.sheetPath.includes('NaN'));
      assert.equal(pose.cloudProgress, 0);
    }
  }
}
for (let photo = 0; photo < 6; photo++) {
  let last = 1;
  for (let step = 0; step <= 1000; step++) {
    const pose = collagePhotoPose(step / 1000, photo, false);
    assert(pose.remaining <= last && pose.remaining >= 0, 'Each image travels smoothly toward its destination');
    last = pose.remaining;
  }
  assert.equal(last, 0);
  assert.equal(collagePhotoPose(0, photo, true).remaining, 0);
  assert.equal(collagePhotoPose(0, photo, false).visible, false, 'Reverse scroll restores the initial state');
}
const ratios = [1.5, 1.333333, .75, 1.777778, 1.5, 1.333333];
for (const width of [700, 1100, 1500]) {
  const copy = { x: width * .53, y: 44, width: width * .46, height: 260 };
  const result = collageLayout(ratios, width, false, 'community', 500, copy);
  const bounds = result.boxes.map(collageBounds);
  result.boxes.forEach((box, index) => {
    assert(Math.abs(box.width / box.height - ratios[index]) < 1e-10, 'Preserve photo proportions');
    assert(bounds[index].x >= 0 && bounds[index].x + bounds[index].width <= width + .01,
      'Tilted corners remain inside the section');
    assert(bounds[index].y + bounds[index].height <= result.height, 'Content height encloses every image');
    if (index < 2) assert(bounds[index].x + bounds[index].width < copy.x, 'Upper photos remain beside the copy');
    else assert(bounds[index].y >= copy.y + copy.height, 'Lower photos clear the copy');
    for (let other = 0; other < index; other++) {
      const a = bounds[index], b = bounds[other];
      assert(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height,
        'Photo envelopes do not overlap');
    }
  });
}
console.log('PASS: preserved opening timing; responsive cloud poses; staggered/reversible arrivals; community alignment and original proportions.');
