import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
