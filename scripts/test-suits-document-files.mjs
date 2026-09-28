import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(await fs.readFile('src/scripts/suits/document-files.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let now=Date.now(),batchAnswer,singleAnswer,batches=0,singles=0;
class Clock extends Date { static now(){return now;} }
const state={me:{user_id:'member-a'}};
const api={
 createSignedUrls:async paths=>{batches++;return new Promise(resolve=>{batchAnswer=data=>resolve(data||{data:paths.map(path=>({path,signedUrl:`https://files.invalid/a/${path}`})),error:null});});},
 createSignedUrl:async path=>{singles++;return new Promise(resolve=>{singleAnswer=data=>resolve(data||{data:{signedUrl:`https://files.invalid/new/${path}`},error:null});});},
};
const exports={};
vm.runInNewContext(source,{exports,Date:Clock,require:()=>({state,db:{storage:{from:bucket=>{assert.equal(bucket,'suits-docs');return api;}}}})});
const preloading=exports.warmDocumentFiles(['one.pdf','one.pdf','two.pdf']);
const opening=exports.documentUrl('one.pdf');
assert.equal(batches,1);assert.equal(singles,0,'Opening during preload shares the batch request');
batchAnswer();await preloading;
assert.equal(await opening,'https://files.invalid/a/one.pdf');
assert.equal(await exports.documentUrl('two.pdf'),'https://files.invalid/a/two.pdf');
await exports.warmDocumentFiles(['one.pdf','two.pdf']);assert.equal(batches,1);
const concurrentA=exports.documentUrl('third.pdf'),concurrentB=exports.documentUrl('third.pdf');
assert.equal(singles,1);singleAnswer();assert.equal(await concurrentA,await concurrentB);
now+=50*60*1000+1;
const expired=exports.documentUrl('one.pdf');assert.equal(singles,2);singleAnswer();await expired;
state.me={user_id:'member-b'};
const other=exports.documentUrl('two.pdf');assert.equal(singles,3,'Another account cannot reuse the previous account’s signed links');singleAnswer();await other;
const stale=exports.documentUrl('stale.pdf');exports.resetDocumentFiles();singleAnswer();await assert.rejects(stale,/account changed/);
const fresh=exports.documentUrl('stale.pdf');singleAnswer();await fresh;
const partial=exports.warmDocumentFiles(['missing.pdf']);batchAnswer({data:[],error:null});await partial;
const retried=exports.documentUrl('missing.pdf');singleAnswer();assert.equal(await retried,'https://files.invalid/new/missing.pdf');
state.me=null;await assert.rejects(exports.documentUrl('one.pdf'),/Sign in/);
console.log('PASS: batched document URLs, shared thumbnail/viewer requests, immediate reuse, expiry, partial failures, retry and account isolation.');
