import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const load=async(path,context={})=>{
 const exports={};const code=ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,structuredClone,...context});return exports;
};
const {WorkspaceCache}=await load('src/lib/workspaceCache.ts');
let now=1000,calls=0,resolve;
const cache=new WorkspaceCache(()=>now);
const first=cache.read('owner','applications',()=>{calls++;return new Promise(r=>{resolve=r;});});
const second=cache.read('owner','applications',()=>{calls++;throw new Error('Duplicate');});
resolve([{id:'application'}]);const results=await Promise.all([first,second]);assert.equal(calls,1,'Preload and tab opening share one request');
results[0][0].id='edited';assert.equal((await cache.read('owner','applications',async()=>[]))[0].id,'application','Views cannot mutate the saved snapshot');
now+=61000;assert.equal((await cache.read('owner','applications',async()=>[{id:'fresh'}]))[0].id,'application','Reopening a warm tab paints immediately while refreshing');
await new Promise(r=>setImmediate(r));assert.equal((await cache.read('owner','applications',async()=>[]))[0].id,'fresh');
cache.invalidate('applications');assert.deepEqual(await cache.read('owner','applications',async()=>[]),[],'Mutations invalidate the affected tab');
const old=cache.read('owner','tasks',()=>new Promise(r=>{resolve=r;}));cache.clear();resolve(['private']);await assert.rejects(old,/workspace changed/);
assert.deepEqual(await cache.read('advisor','applications',async()=>['different']),['different'],'Another account cannot receive the prior account’s snapshot');
cache.clear();await assert.rejects(()=>cache.read(null,'applications',async()=>[]),/Sign in/);
let failed=true;await assert.rejects(()=>cache.read('owner','tasks',async()=>{if(failed)throw new Error('Offline');return[];}),/Offline/);failed=false;
assert.deepEqual(await cache.read('owner','tasks',async()=>[]),[],'Failed preloads can retry');

for(const role of ['owner','advisor','member']){
 const requests=[],state={me:{user_id:role},members:[]};let release,finished=false;
 const api=Object.fromEntries(['members','tasks','workingRoles','workingRoleAssignments','meetings','rsvps','membershipRequests','advisorAvailability'].map(name=>[name,async()=>{requests.push(name);return[];}]));
 api.review=async()=>{requests.push('applications');return{};};
 const {preloadWorkspace}=await load('src/scripts/suits/preload.ts',{require:()=>({api,state,isAdvisor:()=>role==='advisor',isLead:()=>role!=='member',canReviewApplications:()=>role!=='member'})});
 const ready=preloadWorkspace([new Promise(r=>{release=r;})]).then(()=>{finished=true;});
 await new Promise(r=>setImmediate(r));assert.equal(finished,false,'The loading screen waits for the accessible tab data');
 release();await ready;
 for(const name of ['members','tasks','workingRoles','workingRoleAssignments','advisorAvailability'])assert.ok(requests.includes(name));
 assert.equal(requests.includes('applications'),role!=='member');assert.equal(requests.includes('membershipRequests'),role!=='member');
 assert.ok(requests.includes('meetings'));assert.ok(requests.includes('rsvps'));
}
console.log('PASS: preloaded tabs, request coalescing, immediate cached paint, background refresh, edit invalidation, session isolation, retry, owner and advisor application preload, and calendar for everyone.');
