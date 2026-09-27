import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const load=async(path,context)=>{
 const exports={};
 const code=ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,...context});return exports;
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const [avatar,layout,saveAvatar,expected] of [[null,null,true,['avatar','layout']], [null,null,false,['avatar']], ['saved',null,true,['layout']], ['saved','top',true,[]]]){
 const state={me:{user_id:'member',avatar_set_at:avatar,workspace_layout:layout}};
 const root={dataset:{},isConnected:true},nodes={'st':root,'st-gate':{},'st-app':{}};
 const steps=[];
 const workspace=await load('src/scripts/suits/workspace.ts',{
  document:{getElementById:id=>nodes[id],querySelector:()=>null,documentElement:{dataset:{}}},window:{},
  require:name=>name==='./api'?{state}:name==='./avatar'?{updateIdentity(){},editAvatar:async()=>{steps.push('avatar');return saveAvatar;}}:name==='./layout'?{applyMemberLayout(){},editLayout:async()=>{steps.push('layout');}}:{startSky(){}},
 });
 await workspace.enterWorkspace(async()=>{});await tick();assert.deepEqual(steps,expected);
}

let state={me:{user_id:'member',workspace_layout:'top'},members:[{user_id:'member',workspace_layout:'top'}]};
const root={dataset:{layout:'top'},isConnected:true};
const buttons=['scenic','top','dock','right','rail','wide'].map(key=>({dataset:{layoutChoice:key},setAttribute(){},focus(){}}));
let options,close,click,legacy='rail',failure=false;
const picker={querySelector:()=>buttons[1],querySelectorAll:()=>buttons,addEventListener:(_name,handler)=>{click=handler;}};
const layouts=await load('src/scripts/suits/layout.ts',{
 document:{getElementById:()=>root,querySelector:selector=>selector==='.st-layout-modal'?null:picker},
 localStorage:{getItem:()=>legacy,removeItem:()=>{legacy=null;}},
 require:name=>name==='./api'?{state,api:{saveLayout:async layout=>{if(failure)throw new Error('Offline');return{...state.me,workspace_layout:layout};}}}:{onboardingProgress:()=>'',toast(){},openModal:opts=>{options=opts;return new Promise(resolve=>{close=resolve;});}},
});
layouts.applyMemberLayout(root);assert.equal(root.dataset.layout,'top','Account preference wins over an old browser preference');
state.me.workspace_layout=null;layouts.applyMemberLayout(root);assert.equal(root.dataset.layout,'rail','The previous browser layout seeds unfinished setup');
state.me.workspace_layout='top';layouts.applyMemberLayout(root);
const cancelled=layouts.editLayout();click({target:{closest:()=>buttons[2]}});assert.equal(root.dataset.layout,'dock');close();assert.equal(await cancelled,false);assert.equal(root.dataset.layout,'top','Cancel restores the saved layout');
const saving=layouts.editLayout(true);click({target:{closest:()=>buttons[4]}});
failure=true;await assert.rejects(()=>options.onSubmit(picker,close),/Offline/);assert.equal(state.me.workspace_layout,'top','Failed save cannot complete setup');assert.ok(buttons.every(b=>!b.disabled),'Choices can be retried after a failed save');
failure=false;await options.onSubmit(picker,close);assert.equal(await saving,true);assert.equal(state.me.workspace_layout,'rail');assert.equal(state.members[0].workspace_layout,'rail');assert.equal(legacy,null);

console.log('PASS: avatar then layout, deferred setup, returning members, account preference, live preview, cancellation, save failure and retry.');
