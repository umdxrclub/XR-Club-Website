import { state, isAdvisor } from './api';
import { editAvatar, updateIdentity } from './avatar';
import { applyMemberLayout, editLayout } from './layout';
import { startSky } from './sky';
import { openAdvisorAvailability } from './advisorAvailability';

export function setupWorkspace(){
 const root=document.getElementById('st')!;
 root.dataset.layout='scenic';
 document.getElementById('st-layout')?.addEventListener('click',()=>void editLayout());
 document.getElementById('st-edit-avatar')?.addEventListener('click',()=>void editAvatar());
 document.getElementById('st-availability')?.addEventListener('click',()=>void openAdvisorAvailability());
 document.getElementById('st-mobile-avatar')?.addEventListener('click',()=>void editAvatar());
}
export async function enterWorkspace(render:()=>Promise<void>){
 const root=document.getElementById('st')!;
 const image=document.querySelector<HTMLImageElement>('.st-bg__sky');
 if(image)await image.decode().catch(()=>{});
 if(!root.isConnected)return;
 const commit=async()=>{
  applyMemberLayout(root);
  const advisor=isAdvisor();
  document.getElementById('st-availability')!.hidden=!advisor;
  const order=['meetings','overview','tasks','proposal','documents','team','applications','access'];
  const nav=document.getElementById('st-nav')!;
  for(const view of order){const button=nav.querySelector(`[data-nav="${view}"]`);if(button)nav.appendChild(button);}
  const brand=document.querySelector<HTMLAnchorElement>('.st-workspace-brand')!;
  brand.href=`${state.base}suits/workspace/`;
  brand.setAttribute('aria-label','Dreamers calendar');
  document.getElementById('st-gate')!.hidden=true;
  document.getElementById('st-app')!.hidden=false;
  root.dataset.ready='true';
  document.documentElement.dataset.suitsWorkspace='true';
  updateIdentity();await render();
 };
 const reveal=(window as unknown as {xrSuitsReveal?:(fn:()=>Promise<void>)=>Promise<void>}).xrSuitsReveal;
 if(reveal)await reveal(commit);else await commit();
 if(!root.isConnected)return;
 startSky();
 void onboardWorkspace(root);
}

async function onboardWorkspace(root: HTMLElement) {
 const me=state.me;if(!me)return;
 if(!me.avatar_set_at) {
  if(!await editAvatar(true))return;
 } else if(me.workspace_layout)return;
 if(!root.isConnected||state.me?.user_id!==me.user_id)return;
 const laidOut=await editLayout(true);
 // Advisors finish setup by adding when they are free to meet.
 if(laidOut&&isAdvisor()&&root.isConnected&&state.me?.user_id===me.user_id)await openAdvisorAvailability(state.me,undefined,{first:true});
}
