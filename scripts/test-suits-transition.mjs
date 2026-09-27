import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/scripts/suitsPageTransition.js','utf8');
function setup(reduced=false){
 const events=new Map(),attrs=new Map(),frames=[];
 const html={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),animate:f=>{frames.push(f);return{finished:Promise.resolve(),cancel(){}}}};
 const transition={ready:Promise.resolve(),finished:Promise.resolve(),skipTransition(){}};
 const document={documentElement:html,addEventListener:(k,v)=>events.set(k,v),startViewTransition:fn=>{fn();return transition}};
 const window={addEventListener:(k,v)=>events.set(k,v)};
 vm.runInNewContext(source,{window,document,location:{href:'http://local/suits/team/'},matchMedia:q=>({matches:q.includes('reduced-motion')&&reduced}),innerWidth:1440,innerHeight:900,URL,Math,Promise});
 return{window,document,events,attrs,frames,html,transition};
}
const local=setup();let updated=0;await local.window.xrSuitsReveal(async()=>{updated++});assert.equal(updated,1);assert.equal(local.frames.length,1);assert.equal(local.attrs.size,0);
assert.ok(!JSON.stringify(local.frames).includes('NaN'));
const reduced=setup(true);await reduced.window.xrSuitsReveal(async()=>{updated++});assert.equal(reduced.frames.length,0);assert.equal(updated,2);
const nav=setup();nav.events.get('astro:before-swap')({from:new URL('http://local/'),to:new URL('http://local/suits/team/'),newDocument:{documentElement:nav.html},viewTransition:nav.transition});await nav.window.xrSuitsReveal(async()=>{});assert.equal(nav.frames.length,2);
assert.ok(!source.includes('data-suits-arrival'),'No blank arrival layer');
const css=fs.readFileSync('src/components/PageTransitions.astro','utf8');assert.ok(!css.includes('visibility: hidden'));assert.ok(css.includes('opacity:1'),'Outgoing page stays visible throughout reveal');
console.log('PASS: liquid transitions retain the outgoing page, cover Astro navigation and workspace entry, and respect reduced motion.');

// Approved returns must capture the completed dashboard in the original transition.
for(const reducedMotion of [false,true]){
 const events=new Map(),frames=[],captures=[];
 let rendered=false,nativeCalls=0;
 const html={setAttribute(){},removeAttribute(){},animate:f=>{frames.push(f);return{finished:Promise.resolve(),cancel(){}}}};
 const document={documentElement:html,addEventListener:(name,fn)=>events.set(name,fn),startViewTransition:update=>{
  nativeCalls++;
  const ready=Promise.resolve().then(update).then(()=>captures.push(rendered));
  return{ready,finished:ready,skipTransition(){}};
 }};
 const window={addEventListener(){}};
 vm.runInNewContext(source,{window,document,location:{href:'http://local/'},matchMedia:q=>({matches:q.includes('reduced-motion')&&reducedMotion}),innerWidth:1440,innerHeight:900,URL,Math,Promise});
 window.xrSuitsPrepare=async()=>({to:new URL('http://local/suits/workspace/tasks/'),boot:()=>window.xrSuitsReveal(async()=>{rendered=true;})});
 const preparation={from:new URL('http://local/'),to:new URL('http://local/suits/team/?view=tasks'),signal:new AbortController().signal,newDocument:{querySelector:()=>null,documentElement:html},loader:async()=>{}};
 events.get('astro:before-preparation')(preparation);await preparation.loader();
 assert.equal(preparation.to.pathname,'/suits/workspace/tasks/');
 const transition=document.startViewTransition(async()=>{
  events.get('astro:before-swap')({...preparation,viewTransition:transition});
  events.get('astro:after-swap')();
 });
 await transition.ready;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nativeCalls,1,'Returning members get one native transition');
 assert.deepEqual(captures,[true],'Snapshot contains the dashboard, never a loading gate');
 assert.equal(frames.length,reducedMotion?0:1,'One liquid animation, or none for reduced motion');
}

const routeCode=ts.transpileModule(fs.readFileSync('src/lib/suitsNavigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const routing={};vm.runInNewContext(routeCode,{exports:routing,URL,Set});
for(const [path,expected] of [['/suits/team/','/suits/workspace/'],['/suits/team/?view=tasks','/suits/workspace/tasks/'],['/suits/team/#documents','/suits/workspace/documents/'],['/suits/dashboard/','/suits/workspace/applications/'],['/suits/workspace/team/','/suits/workspace/team/'],['/club/suits/team/?view=bad','/club/suits/workspace/']])assert.equal(routing.workspaceDestination(new URL('http://local'+path)).pathname,expected);
assert.equal(routing.workspaceDestination(new URL('http://local/about')),null);

// Session and approval checks gate the shortcut; navigation never treats a cache flag as access.
const navCode=ts.transpileModule(fs.readFileSync('src/scripts/suits/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.env.DEV','false');
for(const [signedIn,status] of [[false,null],[true,'pending'],[true,'rejected'],[true,'approved']]){
 const window={},boot=async()=>{};
 const supabase={auth:{getSession:async()=>({data:{session:signedIn?{}:null}})}};
 vm.runInNewContext(navCode,{exports:{},window,location:{origin:'http://local'},URL,require:name=>{
  if(name.includes('supabase'))return{supabase};if(name.includes('suitsNavigation'))return routing;
  if(name==='./api')return{api:{membership:async()=>({status})}};if(name==='./index')return{boot};throw new Error(name);
 }});
 const prepared=await window.xrSuitsPrepare(new URL('http://local/suits/team/?view=tasks'),new AbortController().signal);
 assert.equal(!!prepared,signedIn&&status==='approved');
 const cancelled=new AbortController();cancelled.abort();
 assert.equal(await window.xrSuitsPrepare(new URL('http://local/suits/team/'),cancelled.signal),null);
}
console.log('PASS: approved return goes directly to the requested dashboard section in one completed liquid snapshot; pending, rejected, signed-out and cancelled requests keep normal authorization.');
