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
 return{events,attrs,animations,transition,window,document,skips:()=>skipped,end:()=>finish()};
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
// Entering the dashboard from another page holds that page while the dashboard is built beneath it, then reveals it once.
const workspaceDocument={documentElement:{setAttribute(){}},querySelector:selector=>selector.includes('workspace')?{}:null};
for(const reducedMotion of [false,true]){
 const page=arrival(reducedMotion);let rendered=false;
 page.events.get('astro:before-swap')({from:new URL('http://local/'),to:new URL('http://local/suits/workspace/'),newDocument:workspaceDocument,viewTransition:page.transition});
 await tick();
 assert.equal(page.skips(),0,'The previous page is held, not skipped');
 assert.equal(page.attrs.get('data-home-arrival'),'','The hold keeps the previous page on screen');
 assert.equal(page.attrs.has('data-suits-navigation'),!reducedMotion,'The liquid reveal is prepared unless motion is reduced');
 const revealed=page.window.xrSuitsReveal(async()=>{rendered=true;assert.equal(page.animations.length,0,'The dashboard is drawn before anything is revealed');});
 await tick();await tick();
 assert.equal(rendered,true);
 if(reducedMotion){assert.equal(page.attrs.get('data-home-arrival'),'ready','Reduced motion switches straight to the dashboard');page.end();}
 else{assert.equal(page.animations.length,1,'The finished dashboard gets one liquid reveal');assert.equal(page.animations[0].options.pseudoElement,'::view-transition-new(root)');}
 await revealed;await tick();
 assert.ok(!page.attrs.has('data-home-arrival')&&!page.attrs.has('data-suits-navigation'));
}
{
 // A sign-in or approval gate ends the hold, and the next reveal is an ordinary one.
 const page=arrival();
 page.events.get('astro:before-swap')({from:new URL('http://local/'),to:new URL('http://local/suits/workspace/'),newDocument:workspaceDocument,viewTransition:page.transition});
 await tick();page.window.xrSuitsRelease();await tick();await tick();
 assert.equal(page.animations.length,1,'Releasing reveals the page as it is');
 assert.ok(!page.attrs.has('data-home-arrival'));
}
{
 // Moving within the dashboard, or without view transitions, keeps the instant switch.
 const page=arrival();page.document.querySelector=selector=>selector.includes('workspace')?{}:null;
 page.events.get('astro:before-swap')({from:new URL('http://local/suits/workspace/'),to:new URL('http://local/suits/workspace/tasks/'),newDocument:workspaceDocument,viewTransition:page.transition});
 assert.equal(page.skips(),1);assert.equal(page.attrs.size,0);
}
{
 // The funding page arrives the same way: held while its background starts, then one liquid reveal; it reports whether it is held.
 const page=arrival();
 const fundingDocument={documentElement:{setAttribute(){}},querySelector:selector=>selector.includes('data-arrival-hold')?{}:null};
 page.events.get('astro:before-swap')({from:new URL('http://local/'),to:new URL('http://local/apply/'),newDocument:fundingDocument,viewTransition:page.transition});
 await tick();
 assert.equal(page.window.xrSuitsHeld(),true,'The funding page can tell it is held');
 assert.equal(page.attrs.has('data-suits-navigation'),true,'The liquid reveal is prepared');
 await page.window.xrSuitsReveal(async()=>{});await tick();await tick();
 assert.equal(page.animations.length,1,'One liquid reveal onto the finished page');
 assert.equal(page.window.xrSuitsHeld(),false);
 // Leaving it for the homepage is a connected navigation with the homepage hold.
 const leaving=arrival();
 leaving.events.get('astro:before-swap')({from:new URL('http://local/apply/'),to:new URL('http://local/'),newDocument:homeDocument,viewTransition:leaving.transition});
 await tick();
 assert.equal(leaving.attrs.has('data-suits-navigation'),true);assert.equal(leaving.attrs.get('data-home-arrival'),'');
}
console.log('PASS: entering the dashboard or the funding page holds the previous page, draws the dashboard beneath it, then gives one liquid reveal (or a plain switch with reduced motion); gates release the hold.');

const routing={};vm.runInNewContext(routeCode,{exports:routing,URL,Set});
for(const [path,expected] of [['/suits/team/','/suits/workspace/'],['/suits/team/?view=tasks','/suits/workspace/tasks/'],['/suits/team/#documents','/suits/workspace/documents/'],['/suits/dashboard/','/suits/workspace/applications/'],['/suits/workspace/team/','/suits/workspace/team/'],['/club/suits/team/?view=bad','/club/suits/workspace/']])assert.equal(routing.workspaceDestination(new URL('http://local'+path)).pathname,expected);
assert.equal(routing.workspaceDestination(new URL('http://local/about')),null);

// Session and approval checks gate the shortcut; navigation never treats a cache flag as access.
const navCode=ts.transpileModule(fs.readFileSync('src/scripts/suits/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.env.DEV','false').replaceAll('import.meta.env.BASE_URL',"'/'");
for(const [signedIn,status] of [[false,null],[true,'pending'],[true,'rejected'],[true,'approved']]){
 const window={},boot=async()=>{};let checks=0;
 const supabase={auth:{getSession:async()=>({data:{session:signedIn?{user:{id:'member'}}:null}})}};
 vm.runInNewContext(navCode,{exports:{},window,location:{origin:'http://local',search:'',hash:''},document:{readyState:'loading',addEventListener(){},getElementById:()=>null},addEventListener(){},URL,require:name=>{
  if(name.includes('supabase'))return{supabase};if(name.includes('suitsNavigation'))return routing;
  if(name.includes('homeReady'))return{homeSettled:async()=>{}};
  if(name==='./api')return{api:{membership:async()=>{checks++;return{status};}}};if(name==='./index')return{boot};throw new Error(name);
 }});
 const prepared=await window.xrSuitsPrepare(new URL('http://local/suits/team/?view=tasks'),new AbortController().signal);
 assert.equal(!!prepared,signedIn&&status==='approved');
 const cancelled=new AbortController();cancelled.abort();
 assert.equal(await window.xrSuitsPrepare(new URL('http://local/suits/team/'),cancelled.signal),null);
 // An approval is reused for a minute, so opening the dashboard after warming it makes no second request.
 if(status==='approved')assert.equal(checks,1,'The approval check runs once');
}
console.log('PASS: approved return preserves the requested section and reuses a fresh approval; approval checks remain enforced.');

// The auth client stays off a page's opening load, except when a sign-in link returns with tokens.
for(const [search,hash,expected] of [['','',0],['','#access_token=a&refresh_token=b',1],['?code=abc','',1],['?view=tasks','#documents',0]]){
 let loads=0,onLoad;
 vm.runInNewContext(navCode,{exports:{},window:{},location:{origin:'http://local',search,hash},document:{readyState:'loading',addEventListener(){}},
  addEventListener:(type,listener)=>{if(type==='load')onLoad=listener;},URL,require:name=>{if(name.includes('supabase')){loads++;return{supabase:{}};}return routing;}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loads,expected,`${search}${hash} loads the auth client ${expected?'immediately':'later'}`);
 assert.equal(typeof onLoad,expected?'undefined':'function','Other pages warm the auth client after loading');
}
console.log('PASS: the auth client loads after the page, or immediately to finish a returning sign-in.');
