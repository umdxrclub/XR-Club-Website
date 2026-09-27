import { state } from './api';
import { editAvatar, updateIdentity } from './avatar';
import { openModal } from './ui';
import { startSky } from './sky';

const layouts = [
 ['scenic','Sidebar','Navigation on the left.'],
 ['top','Top tabs','Navigation above your work.'],
 ['dock','Bottom dock','Navigation below your work.'],
 ['right','Right sidebar','Navigation on the right.'],
 ['rail','Icon rail','A narrow sidebar with icons.'],
 ['wide','Wide','More space across the screen.'],
] as const;

export function setupWorkspace(){
 const root=document.getElementById('st')!;
 let layout='scenic';try{layout=localStorage.getItem('xr-suits-layout')||layout;}catch{}
 root.dataset.layout=layouts.some(([key])=>key===layout)?layout:'scenic';
 document.getElementById('st-layout')?.addEventListener('click',()=>{
  void openModal({title:'Layout',className:'st-layout-modal',cancelLabel:'Done',body:`<div class="workspace-layouts">${layouts.map(([key,title,note])=>`<button type="button" data-layout-choice="${key}" aria-pressed="${root.dataset.layout===key}"><span class="workspace-layout-diagram" data-diagram="${key}" aria-hidden="true"><i></i><i></i></span><strong>${title}</strong><small>${note}</small></button>`).join('')}</div>`});
  document.querySelector('.workspace-layouts')?.addEventListener('click',e=>{
   const b=(e.target as HTMLElement).closest<HTMLElement>('[data-layout-choice]');if(!b)return;
   root.dataset.layout=b.dataset.layoutChoice;
   try{localStorage.setItem('xr-suits-layout',b.dataset.layoutChoice!);}catch{}
   document.querySelectorAll('[data-layout-choice]').forEach(x=>x.setAttribute('aria-pressed',String((x as HTMLElement).dataset.layoutChoice===b.dataset.layoutChoice)));
  });
 });
 document.getElementById('st-edit-avatar')?.addEventListener('click',()=>void editAvatar());
 document.getElementById('st-mobile-avatar')?.addEventListener('click',()=>void editAvatar());
}
export async function enterWorkspace(render:()=>Promise<void>){
 const root=document.getElementById('st')!;
 const image=document.querySelector<HTMLImageElement>('.st-bg__sky');
 if(image)await image.decode().catch(()=>{});
 if(!root.isConnected)return;
 const commit=async()=>{
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
 if(!state.me?.avatar_set_at)void editAvatar(true);
}
