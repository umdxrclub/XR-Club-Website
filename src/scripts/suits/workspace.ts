import { state } from './api';
import { editAvatar, updateIdentity } from './avatar';
import { applyMemberLayout, editLayout } from './layout';
import { startSky } from './sky';

export function setupWorkspace(){
 const root=document.getElementById('st')!;
 root.dataset.layout='scenic';
 document.getElementById('st-layout')?.addEventListener('click',()=>void editLayout());
 document.getElementById('st-edit-avatar')?.addEventListener('click',()=>void editAvatar());
 document.getElementById('st-mobile-avatar')?.addEventListener('click',()=>void editAvatar());
}
export async function enterWorkspace(render:()=>Promise<void>){
 const root=document.getElementById('st')!;
 const image=document.querySelector<HTMLImageElement>('.st-bg__sky');
 if(image)await image.decode().catch(()=>{});
 if(!root.isConnected)return;
 const commit=async()=>{
  applyMemberLayout(root);
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
 if(root.isConnected&&state.me?.user_id===me.user_id)await editLayout(true);
}
