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

// Arriving at the homepage keeps the previous page on screen until its opening frame is shown.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function arrival(reducedMotion=false,chromium=true){
 const events=new Map(),attrs=new Map(),animations=[];let skipped=0,finish;
 const html={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),animate:(keyframes,options)=>{const animation={keyframes,options,finished:Promise.resolve(),cancel(){}};animations.push(animation);return animation;}};
 const transition={ready:Promise.resolve(),finished:new Promise(resolve=>{finish=resolve;}),skipTransition(){skipped++;finish();}};
 const document={documentElement:html,querySelector:()=>null,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k),startViewTransition:fn=>{fn();return transition}};
 const window={addEventListener:(k,v)=>events.set(k,v)};
 vm.runInNewContext(source,{window,document,navigator:chromium?{userAgentData:{}}:{},location:{href:'http://local/login/'},matchMedia:q=>({matches:q.includes('reduced-motion')&&reducedMotion}),innerWidth:1440,innerHeight:900,URL,Math,Promise,setTimeout,clearTimeout});
 // end() stands in for the CSS cross-fade finishing, which ends the view transition.
 return{events,attrs,animations,transition,skips:()=>skipped,end:()=>finish()};
}
const homeDocument={documentElement:{setAttribute(){}},querySelector:selector=>selector==='[data-home-waves]'?{}:null};
const swapTo=(page,from,to)=>page.events.get('astro:before-swap')({from:new URL(from),to:new URL(to),newDocument:homeDocument,viewTransition:page.transition});
const arrivalCss=fs.readFileSync('src/components/PageTransitions.astro','utf8');
assert.ok(arrivalCss.includes('html[data-home-arrival]::view-transition-old(root) { animation:home-arrival-hold'),'CSS holds the outgoing snapshot');
assert.ok(arrivalCss.includes("html[data-home-arrival='ready']::view-transition-new(root) { animation:home-arrival-in"),'CSS cross-fades once ready');
{
 const page=arrival();swapTo(page,'http://local/login/','http://local/');
 assert.equal(page.attrs.get('data-home-arrival'),'','The outgoing page is held');await tick();
 page.events.get('astro:after-swap')();await tick();
 assert.equal(page.attrs.get('data-home-arrival'),'','Nothing is revealed while the homepage loads');
 page.events.get('xr:home-visible')();await tick();
 assert.equal(page.attrs.get('data-home-arrival'),'ready','Cross-fade only once the homepage is ready');
 assert.equal(page.animations.length,0,'The hold and cross-fade are CSS only');
 page.end();await tick();assert.ok(!page.attrs.has('data-home-arrival'));assert.equal(page.skips(),0);
}
{
 const page=arrival();swapTo(page,'http://local/suits/team/','http://local/about/');
 assert.ok(page.attrs.has('data-suits-navigation'));assert.equal(page.attrs.get('data-home-arrival'),'');
 await tick();page.events.get('astro:after-swap')();await tick();
 assert.equal(page.animations.length,0,'The liquid reveal waits for the homepage');
 page.events.get('xr:home-visible')();await tick();await tick();
 assert.equal(page.animations.length,1);assert.equal(page.animations[0].options.pseudoElement,'::view-transition-new(root)');
 assert.ok(!page.attrs.has('data-home-arrival'),'The hold ends as the reveal starts');
}
{
 const page=arrival();page.attrs.set('data-home-loading','');
 page.events.get('pagereveal')({viewTransition:page.transition});await tick();
 assert.equal(page.attrs.get('data-home-arrival'),'','A full-page arrival holds the previous page as well');
 page.events.get('xr:home-visible')();await tick();assert.equal(page.attrs.get('data-home-arrival'),'ready');
 page.end();await tick();assert.ok(!page.attrs.has('data-home-arrival'));
}
{
 const page=arrival(true);swapTo(page,'http://local/login/','http://local/');await tick();
 page.events.get('astro:after-swap')();page.events.get('xr:home-visible')();await tick();await tick();
 assert.equal(page.attrs.get('data-home-arrival'),'ready','Reduced motion keeps the hold; CSS then switches without a cross-fade');
 assert.equal(page.animations.length,0);page.end();await tick();assert.ok(!page.attrs.has('data-home-arrival'));
}
{
 const page=arrival();swapTo(page,'http://local/login/','http://local/');await tick();
 page.transition.skipTransition();await tick();await tick();
 assert.ok(!page.attrs.has('data-home-arrival'),'Another navigation releases the hold');
}
{
 const page=arrival();let skipped=false;const swap=url=>page.events.get('pageswap')({viewTransition:{skipTransition(){skipped=true;},finished:Promise.resolve()},activation:{entry:{url}}});
 swap('http://local/about/');assert.equal(skipped,false,'Leaving for the homepage keeps the snapshot');
 swap('http://local/signup/');assert.equal(skipped,true,'Other pages keep the existing instant switch');
 const other=arrival();other.events.get('astro:before-swap')({from:new URL('http://local/'),to:new URL('http://local/login/'),newDocument:{documentElement:{setAttribute(){}},querySelector:()=>null},viewTransition:other.transition});
 await tick();assert.equal(other.animations.length,0);assert.equal(other.attrs.size,0);
}
{
 // Outside Chromium, full-page arrivals keep the previous instant switch; in-page router arrivals still hold.
 const page=arrival(false,false);let skipped=false;
 page.events.get('pageswap')({viewTransition:{skipTransition(){skipped=true;},finished:Promise.resolve()},activation:{entry:{url:'http://local/'}}});
 assert.equal(skipped,true);
 page.attrs.set('data-home-loading','');page.events.get('pagereveal')({viewTransition:page.transition});await tick();
 assert.ok(!page.attrs.has('data-home-arrival'));assert.equal(page.skips(),1);
 const router=arrival(false,false);swapTo(router,'http://local/login/','http://local/');assert.equal(router.attrs.get('data-home-arrival'),'');
}
console.log('PASS: arriving at the homepage keeps the previous page on screen until the opening frame is shown, then cross-fades or reveals.');

const routeCode=ts.transpileModule(fs.readFileSync('src/lib/suitsNavigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const routing={};vm.runInNewContext(routeCode,{exports:routing,URL,Set});
for(const [path,expected] of [['/suits/team/','/suits/workspace/'],['/suits/team/?view=tasks','/suits/workspace/tasks/'],['/suits/team/#documents','/suits/workspace/documents/'],['/suits/dashboard/','/suits/workspace/applications/'],['/suits/workspace/team/','/suits/workspace/team/'],['/club/suits/team/?view=bad','/club/suits/workspace/']])assert.equal(routing.workspaceDestination(new URL('http://local'+path)).pathname,expected);
assert.equal(routing.workspaceDestination(new URL('http://local/about')),null);

// Session and approval checks gate the shortcut; navigation never treats a cache flag as access.
const navCode=ts.transpileModule(fs.readFileSync('src/scripts/suits/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.env.DEV','false');
for(const [signedIn,status] of [[false,null],[true,'pending'],[true,'rejected'],[true,'approved']]){
 const window={},boot=async()=>{};
 const supabase={auth:{getSession:async()=>({data:{session:signedIn?{}:null}})}};
 vm.runInNewContext(navCode,{exports:{},window,location:{origin:'http://local',search:'',hash:''},document:{readyState:'loading'},addEventListener(){},URL,require:name=>{
  if(name.includes('supabase'))return{supabase};if(name.includes('suitsNavigation'))return routing;
  if(name==='./api')return{api:{membership:async()=>({status})}};if(name==='./index')return{boot};throw new Error(name);
 }});
 const prepared=await window.xrSuitsPrepare(new URL('http://local/suits/team/?view=tasks'),new AbortController().signal);
 assert.equal(!!prepared,signedIn&&status==='approved');
 const cancelled=new AbortController();cancelled.abort();
 assert.equal(await window.xrSuitsPrepare(new URL('http://local/suits/team/'),cancelled.signal),null);
}
console.log('PASS: approved return preserves the requested section, shows a plain loading screen, then reveals the dashboard once; approval checks and reduced motion remain enforced.');

// The auth client stays off a page's opening load, except when a sign-in link returns with tokens.
for(const [search,hash,expected] of [['','',0],['','#access_token=a&refresh_token=b',1],['?code=abc','',1],['?view=tasks','#documents',0]]){
 let loads=0,onLoad;
 vm.runInNewContext(navCode,{exports:{},window:{},location:{origin:'http://local',search,hash},document:{readyState:'loading'},
  addEventListener:(type,listener)=>{if(type==='load')onLoad=listener;},URL,require:name=>{if(name.includes('supabase')){loads++;return{supabase:{}};}return routing;}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loads,expected,`${search}${hash} loads the auth client ${expected?'immediately':'later'}`);
 assert.equal(typeof onLoad,expected?'undefined':'function','Other pages warm the auth client after loading');
}
console.log('PASS: the auth client loads after the page, or immediately to finish a returning sign-in.');
