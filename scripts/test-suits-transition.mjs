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

// The loading screen swaps in immediately; only the ready dashboard gets a liquid reveal.
for(const reducedMotion of [false,true]){
 const loading=setup(reducedMotion);let skipped=0,rendered=false;
 loading.window.xrSuitsPrepare=async()=>({to:new URL('http://local/suits/workspace/tasks/')});
 const preparation={from:new URL('http://local/'),to:new URL('http://local/suits/team/?view=tasks'),signal:new AbortController().signal,newDocument:{querySelector:()=>null,documentElement:loading.html},loader:async()=>{}};
 loading.events.get('astro:before-preparation')(preparation);await preparation.loader();
 assert.equal(preparation.to.pathname,'/suits/workspace/tasks/');
 loading.events.get('astro:before-swap')({...preparation,newDocument:{querySelector:()=>({}),documentElement:loading.html},viewTransition:{...loading.transition,skipTransition(){skipped++;}}});
 assert.equal(skipped,1);assert.equal(loading.frames.length,0,'Opening workspace is shown without an animation');
 await loading.window.xrSuitsReveal(async()=>{rendered=true;});
 assert.equal(rendered,true);assert.equal(loading.frames.length,reducedMotion?0:1,'The completed dashboard gets one liquid reveal');
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
console.log('PASS: approved return preserves the requested section, shows a plain loading screen, then reveals the dashboard once; approval checks and reduced motion remain enforced.');
