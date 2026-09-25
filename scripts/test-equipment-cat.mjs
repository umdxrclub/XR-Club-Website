import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(file){
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(source,{exports:module.exports,module,require:id=>load(path.resolve(path.dirname(file),id+'.ts')),Math});
 return module.exports;
}
const {equipmentCatPose:pose,CAT_TIMELINE_DISTANCE:D,CAT_ENTRANCE_DISTANCE,catRiftPath}=load(fileURLToPath(new URL('../src/features/equipment/equipmentCatMotion.ts', import.meta.url)));
for(let i=0;i<=1000;i++)for(const reduce of [false,true]){
 const p=pose(D*i/1000,reduce);
 for(const [key,value] of Object.entries(p)) if(typeof value==='number') assert(Number.isFinite(value),key);
 assert(p.morph>=0 && p.morph<=1);
 assert(!catRiftPath(p.opening).includes('NaN'));
}
const end=pose(CAT_ENTRANCE_DISTANCE);
assert.equal(end.state,'ocean'); assert.equal(end.paperPull,1); assert.equal(end.morph,1);
assert.equal(pose(.605*D).paperPull,0);
for(const reduced of [false,true]) {
 let previous=0;
 for(let i=605;i<=790;i++) {
  const p=pose(i/1000*D,reduced);
  assert(p.paperPull>=previous); previous=p.paperPull;
  assert.equal(p.grab,1,'Hands stay attached through the pull');
  assert.equal(p.actorY,-275);
 }
}
assert.equal(pose(0).morph,0); assert.equal(pose(0).visible,false);
console.log('PASS: finite poses; complete ocean reveal; monotonic pull; maintained grip; reverse reset.');

const peekA=pose(D*.32*.29), peekB=pose(D*.32*.38);
assert.equal(peekA.bodyX,peekB.bodyX,'Hold the eye peek before takeoff');
const apex=pose(D*.32*.65), landed=pose(D*.32*.95);
assert(apex.bodyY < -300 && apex.bodyX>0,'Entrance follows a visible airborne arc');
assert.equal(landed.bodyX,0); assert(Math.abs(landed.bodyY)<1e-9);
const art=fs.readFileSync(fileURLToPath(new URL('../src/features/equipment/EquipmentCat.astro',import.meta.url)),'utf8');
assert.equal((art.match(/data-cat-head-pose/g)||[]).length,1);
assert.equal((art.match(/data-cat-body-pose/g)||[]).length,1);
assert(!art.includes('<use'),'No duplicated SVG character instances');
console.log('PASS: eye-peek hold; leap apex; settled landing; one solid character instance.');
