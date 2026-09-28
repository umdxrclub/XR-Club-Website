import { api, state, isAdvisor, type WorkspaceLayout } from './api';
import { onboardingProgress, openModal, toast } from './ui';

const layouts = [
 ['scenic','Sidebar','Navigation on the left'],
 ['top','Top tabs','Navigation above your work'],
 ['dock','Bottom dock','Navigation below your work'],
 ['right','Right sidebar','Navigation on the right'],
 ['rail','Icon rail','A narrow sidebar with icons'],
 ['wide','Wide','More space across the screen'],
] as const;

function validLayout(value: unknown): value is WorkspaceLayout {
 return layouts.some(([key])=>key===value);
}

export function applyMemberLayout(root: HTMLElement) {
 let layout: unknown=state.me?.workspace_layout;
 // Keep a previous device choice as the starting point until it is saved to the account.
 if(!validLayout(layout))try{layout=localStorage.getItem('xr-suits-layout');}catch{}
 root.dataset.layout=validLayout(layout)?layout:'scenic';
}

export async function editLayout(first=false) {
 const more=first&&isAdvisor();
 const me=state.me, root=document.getElementById('st');
 if(!me||!root||document.querySelector('.st-layout-modal'))return false;
 const previous=root.dataset.layout || 'scenic';
 let selected: WorkspaceLayout=validLayout(previous)?previous:'scenic', saved=false, saving=false;
 const closed=openModal({
  title:first?'Choose your layout':'Layout',className:'st-layout-modal',
  submitLabel:more?'Continue':first?'Finish setup':'Save layout',cancelLabel:first?'Later':'Cancel',
  body:`${first?onboardingProgress(2,more?3:2):''}<div class="workspace-layouts" role="group" aria-label="Workspace layout">${layouts.map(([key,title,note])=>`<button type="button" data-layout-choice="${key}" aria-pressed="${selected===key}"><span class="workspace-layout-diagram" data-diagram="${key}" aria-hidden="true"><i></i><i></i></span><strong>${title}</strong><small>${note}</small></button>`).join('')}</div>`,
  onSubmit:async(form,close)=>{
   saving=true;
   const choices=form.querySelectorAll<HTMLButtonElement>('[data-layout-choice]');
   choices.forEach(button=>button.disabled=true);
   try {
    const member=await api.saveLayout(selected);
    if(state.me?.user_id!==me.user_id||!root.isConnected){close();return;}
    state.me=member;
    state.members=state.members.map(m=>m.user_id===member.user_id?member:m);
    root.dataset.layout=member.workspace_layout || selected;
    try{localStorage.removeItem('xr-suits-layout');}catch{}
    saved=true;close();if(!more)toast(first?'Your workspace is ready':'Layout saved');
   } finally {
    saving=false;choices.forEach(button=>button.disabled=false);
   }
  },
 });
 const picker=document.querySelector('.st-layout-modal .workspace-layouts');
 picker?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll:true});
 picker?.addEventListener('click',e=>{
  if(saving)return;
  const button=(e.target as HTMLElement).closest<HTMLElement>('[data-layout-choice]');
  if(!button||!validLayout(button.dataset.layoutChoice))return;
  selected=button.dataset.layoutChoice;
  root.dataset.layout=selected;
  picker.querySelectorAll<HTMLElement>('[data-layout-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice.dataset.layoutChoice===selected)));
 });
 await closed;
 if(!saved&&root.isConnected&&state.me?.user_id===me.user_id)root.dataset.layout=previous;
 return saved;
}
