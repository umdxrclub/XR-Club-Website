import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await fs.readFile('src/features/apply/axolotl.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function mount(viewWidth, viewHeight, width, reduced = false, failImage = false) {
  let now = 0, nextId = 1;
  const frames = new Map(), events = new Map(), documentEvents = new Map(), draws = [];
  const math = Object.create(Math); math.random = () => .5;
  const document = { hidden: false, addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: name => documentEvents.delete(name) };
  const context = { exports: {}, Math: math, innerWidth: viewWidth, innerHeight: viewHeight, document,
    performance: { now: () => now },
    Image: class { decode() { return failImage ? Promise.reject(new Error('Image unavailable')) : Promise.resolve(); } },
    requestAnimationFrame: fn => { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
  };
  vm.runInNewContext(code, context);
  const canvas = { style: {}, getContext: () => ({ clearRect() {}, drawImage: (...args) => draws.push(args) }) };
  const sheet = width === 150 ? context.exports.axolotlSheets.small : context.exports.axolotlSheets.large;
  const actor = context.exports.mountAxolotl(canvas, { sheet, width, reduced });
  actor.setInsets(120, 54);
  await Promise.resolve(); await Promise.resolve();
  const tick = () => {
    now += 1000 / 60;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(fn => fn(now));
  };
  const pose = () => {
    const match = canvas.style.transform.match(/^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)$/);
    assert.ok(match, 'The sprite is translated without any scale, mirror or rotation');
    assert.equal(canvas.style.opacity, '1', 'Opacity remains constant');
    return { x: Number(match[1]), y: Number(match[2]) };
  };
  return { actor, canvas, tick, pose, draws, frames, events, documentEvents, document, width,
    resize(w, h) { context.innerWidth = w; context.innerHeight = h; events.get('resize')(); },
    hide(value) { document.hidden = value; documentEvents.get('visibilitychange')(); },
  };
}

for (const [w, h, width] of [[1280, 800, 154], [390, 844, 150], [844, 390, 150]]) {
  const scene = await mount(w, h, width);
  scene.tick();
  let previous = scene.pose(), wraps = 0, minY = previous.y, maxY = previous.y;
  for (let i = 0; i < 7200; i++) {
    scene.tick(); const current = scene.pose();
    if (current.x < previous.x) {
      assert.ok(previous.x >= w + 64, 'The sprite and its shadow fully leave the right edge before wrapping');
      assert.ok(current.x + width <= -64, 'The next pass starts fully offscreen on the left');
      wraps++;
    } else assert.ok(current.x > previous.x, 'The swimmer only moves right during a pass');
    minY = Math.min(minY, current.y); maxY = Math.max(maxY, current.y);
    previous = current;
  }
  assert.ok(wraps >= 2, `Repeated complete crossings at ${w}x${h}`);
  assert.ok(maxY > minY + 3, 'Swimming has a gentle vertical drift');
  assert.equal(scene.canvas.style.visibility, 'visible');
  scene.hide(true); const held = scene.pose();
  for (let i = 0; i < 120; i++) scene.tick();
  assert.deepEqual(scene.pose(), held, 'Hidden tabs do not advance the swimmer');
  scene.hide(false); scene.tick();
  assert.ok(scene.pose().x > held.x, 'Swimming resumes when the tab becomes visible');
  scene.resize(1024, 768); scene.tick(); scene.pose();
  scene.actor.dispose();
  assert.equal(scene.frames.size, 0); assert.equal(scene.events.size, 0); assert.equal(scene.documentEvents.size, 0);
}

const calm = await mount(1280, 800, 154), startled = await mount(1280, 800, 154);
calm.tick(); startled.tick();
const position = startled.pose();
startled.actor.startle(position.x + 154 / 2, position.y + Number.parseFloat(startled.canvas.style.height) / 2 + 10);
for (let i = 0; i < 60; i++) { calm.tick(); startled.tick(); startled.pose(); }
assert.ok(startled.pose().x > calm.pose().x + 20, 'Cursor proximity speeds up forward motion');
assert.ok(startled.pose().y < calm.pose().y, 'A cursor below gives a gentle upward nudge');
calm.actor.dispose(); startled.actor.dispose();

for (const [w, h, width] of [[1280, 800, 154], [390, 844, 150]]) {
  const scene = await mount(w, h, width, true);
  scene.tick(); const still = scene.pose();
  scene.actor.startle(still.x + width / 2, still.y + 50);
  for (let i = 0; i < 300; i++) { scene.tick(); assert.deepEqual(scene.pose(), still, 'Reduced motion is stationary'); }
  assert.ok(scene.draws.every(args => args[1] === 0 && args[2] === 0), 'Reduced motion uses the still first frame');
  scene.actor.dispose();
}

const failed = await mount(390, 844, 150, false, true);
failed.tick();
assert.equal(failed.canvas.style.visibility, 'hidden'); assert.equal(failed.frames.size, 0);
failed.actor.dispose();
console.log('PASS: fixed orientation and opacity, full offscreen wrap at desktop/mobile sizes, cursor response, reduced motion and lifecycle cleanup.');
