import { api, state, isLead, type Member, type Role } from './api';
import { esc, toast, confirmModal, roleLabel, openModal, select, field, input, formValue, enhanceSelects } from './ui';
import { crewAvatar, editAvatar, updateIdentity } from './avatar';
import { READER_ROLES } from './reader-content';

export async function render(host:HTMLElement) {
 host.innerHTML='<p class="st-muted">Loading team…</p>';
 state.members=await api.members();
 const groups=[...READER_ROLES.map(r=>({key:r.key,name:r.name})),{key:'unassigned',name:'No subteam yet'}];
 const groupFor=(m:Member)=>groups.find(g=>g.key===m.proposal_role)||groups[groups.length-1];
 const countLabel=(n:number)=>`${n} member${n===1?'':'s'}`;
 let query='',subteam='all';
 const availableGroups=groups.filter(g=>state.members.some(m=>groupFor(m).key===g.key));
 host.innerHTML=`<div class="crew-directory">
  <div class="crew-head"><div><h1 class="st-h1">Meet your team.</h1><p>${state.members.length} team member${state.members.length===1?'':'s'}</p></div><button type="button" class="st-btn" data-profile>Your profile</button></div>
  <div class="crew-toolbar">
   <label class="crew-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" placeholder="Find a teammate" aria-label="Find a teammate" /></label>
   <div class="crew-filter">${select('crew_subteam',[{value:'all',label:'All subteams',selected:true},...availableGroups.map(g=>({value:g.key,label:g.name}))],'aria-label="Filter by subteam"')}</div>
  </div>
  <p class="crew-results" data-crew-results role="status" hidden></p>
  <div class="crew-groups" data-crew-groups></div>
 </div>`;
 enhanceSelects(host);
 function draw() {
  const matches=state.members.filter(m=>(subteam==='all'||groupFor(m).key===subteam)&&`${m.display_name} ${m.email} ${groupFor(m).name}`.toLowerCase().includes(query));
  const status=host.querySelector<HTMLElement>('[data-crew-results]')!;
  status.hidden=!query;
  status.textContent=query?`${matches.length} match${matches.length===1?'':'es'}`:'';
  host.querySelector('[data-crew-groups]')!.innerHTML=groups.map(g=>{
   const people=matches.filter(m=>groupFor(m).key===g.key).sort((a,b)=>a.display_name.localeCompare(b.display_name));
   if(!people.length)return '';
   const isMine=state.me?.proposal_role===g.key;
   return `<section class="crew-group" aria-labelledby="crew-subteam-${g.key}">
    <header><div class="crew-group__title"><h2 id="crew-subteam-${g.key}">${esc(g.name)}</h2>${isMine?'<span class="crew-group__mine">Your subteam</span>':''}</div><span class="crew-group__count">${countLabel(people.length)}</span></header>
    <ul class="crew-cards">${people.map(m=>`<li class="crew-card">
     ${crewAvatar(m)}<div class="crew-card__person"><h3>${esc(m.display_name)}${m.user_id===state.me?.user_id?' <small>You</small>':''}</h3><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>
     <div class="crew-card__footer"><span class="crew-card__role">${esc(roleLabel(m.role))}</span>${isLead()?`<button type="button" class="crew-manage" data-manage="${m.user_id}" aria-label="Manage ${esc(m.display_name)}">Manage</button>`:''}</div>
    </li>`).join('')}</ul>
   </section>`;
  }).join('') || '<p class="crew-empty">No teammates found. Try another name or subteam.</p>';
 }
 draw();
 host.querySelector('input[type="search"]')!.addEventListener('input',e=>{query=(e.target as HTMLInputElement).value.trim().toLowerCase();draw();});
 host.querySelector('select[name="crew_subteam"]')!.addEventListener('change',e=>{subteam=(e.target as HTMLSelectElement).value;draw();});
 host.querySelector('[data-profile]')!.addEventListener('click',()=>void editProfile(host));
 host.querySelector('[data-crew-groups]')!.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-manage]');const m=state.members.find(m=>m.user_id===b?.dataset.manage);if(m&&isLead())void manage(m,host);});
 const refresh=()=>{if(host.isConnected&&!host.closest('[hidden]'))draw();};
 document.addEventListener('suits:profile-updated',refresh,{signal:profileListener(host)});
}

let profileAbort:AbortController|null=null;
function profileListener(_host:HTMLElement){profileAbort?.abort();profileAbort=new AbortController();return profileAbort.signal;}
export function leave(){profileAbort?.abort();}

async function manage(m:Member,host:HTMLElement){
 const owner=m.email.toLowerCase()==='kcyle@terpmail.umd.edu';
 const done=openModal({title:m.display_name,submitLabel:'Save changes',body:`<div class="crew-manage-avatar">${crewAvatar(m)}</div>${field('subteam','Subteam',select('subteam',[{value:'',label:'Not assigned',selected:!m.proposal_role},...READER_ROLES.map(r=>({value:r.key,label:r.name,selected:r.key===m.proposal_role}))]))}${owner?'<p class="st-muted">Team owner · lead access</p>':field('access','Access',select('access',(['member','product_manager','lead'] as Role[]).map(r=>({value:r,label:roleLabel(r),selected:r===m.role}))))}${!owner?'<button type="button" class="crew-remove" data-remove-member>Remove from team</button>':''}`,onSubmit:async(form,close)=>{
  if(!isLead())throw new Error('Only the team owner can manage roles.');
  const subteam=formValue(form,'subteam')||null;
  const access=owner?'lead':formValue(form,'access') as Role;
  await api.manageMember(m.user_id,access,subteam);
  close();toast('Team member updated.');await render(host);
 }});
 document.querySelector('[data-remove-member]')?.addEventListener('click',async()=>{
  if(!await confirmModal('Revoke team access?',`${m.display_name} will lose dashboard access until you approve them again in Team access. Their past work will be kept.`,'Revoke access'))return;
  try{await api.removeMember(m.user_id);document.querySelector<HTMLButtonElement>('.st-modal [data-modal-cancel]')?.click();await render(host);toast('Member removed.');}catch(e){toast((e as Error).message,'danger');}
 });
 await done;
}
async function editProfile(host:HTMLElement){
 const me=state.me!;
 const closed=openModal({title:'Your profile',submitLabel:'Save profile',body:`<button type="button" class="crew-profile-avatar" data-edit-profile-avatar>${crewAvatar(me,'crew-avatar--large')}<span>Edit avatar</span></button>${field('name','Your name',input('name',`value="${esc(me.display_name)}" required maxlength="100"`))}${field('discord','Discord username',input('discord',`value="${esc(me.discord_username||'')}"`))}<p class="st-help">To receive meeting reminders, use /link with your UMD email in the Discord server.</p>`,onSubmit:async(form,close)=>{
  const name=formValue(form,'name');if(!name)throw new Error('Enter your name.');
  const patch={display_name:name,discord_username:formValue(form,'discord')||null};
  await api.updateProfile(patch);state.me={...state.me!,...patch};updateIdentity();close();await render(host);toast('Profile saved.');
 }});
 document.querySelector('[data-edit-profile-avatar]')?.addEventListener('click',()=>{document.querySelector<HTMLButtonElement>('.st-modal [data-modal-cancel]')?.click();void editAvatar().then(()=>render(host));});
 await closed;
}
