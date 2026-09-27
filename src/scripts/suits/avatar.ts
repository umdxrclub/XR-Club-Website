import { api, state, type Member } from './api';
import { esc, onboardingProgress, openModal, toast } from './ui';

const colors = ['blue','orange','violet','mint'] as const;
export function avatarUrl(seed:string) { return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`; }
export function crewAvatar(m:Pick<Member,'avatar_seed'|'avatar_color'|'display_name'>, size='') {
 const seed=m.avatar_seed || 'suits-explorer';
 return `<span class="crew-avatar ${size}" data-color="${colors.includes(m.avatar_color as typeof colors[number])?m.avatar_color:'blue'}"><span class="crew-avatar__visor"><img src="${esc(avatarUrl(seed))}" alt="${esc(m.display_name)} avatar" referrerpolicy="no-referrer" loading="lazy" /></span><span class="crew-avatar__collar" aria-hidden="true"></span></span>`;
}
export function updateIdentity() {
 if(!state.me) return;
 const avatar=document.getElementById('st-avatar'); if(avatar) avatar.innerHTML=crewAvatar(state.me);
 const mobile=document.getElementById('st-mobile-avatar');if(mobile)mobile.innerHTML=crewAvatar(state.me);
 const name=document.getElementById('st-whoami'); if(name) name.textContent=state.me.display_name;
 document.dispatchEvent(new Event('suits:profile-updated'));
}
export async function editAvatar(first=false) {
 const me=state.me; if(!me) return false;
 let saved=false;
 let selected=me.avatar_seed || crypto.randomUUID(), color=me.avatar_color || 'blue';
 let choices=[selected,...Array.from({length:5},()=>crypto.randomUUID())];
 const closed = openModal({ title:'Choose your avatar', className:'st-avatar-modal', submitLabel:first?'Continue':'Save avatar', cancelLabel:first?'Later':'Cancel',
 body:`${first?onboardingProgress(1):''}<div class="avatar-picker"><div class="avatar-picker__hero" data-avatar-hero></div><div class="avatar-picker__choices" data-avatar-choices></div><button type="button" class="avatar-picker__shuffle" data-shuffle>Shuffle <span aria-hidden="true">↻</span></button><div class="avatar-picker__colors" role="group" aria-label="Suit color">${colors.map(c=>`<button type="button" data-suit-color="${c}" aria-label="${c[0].toUpperCase()+c.slice(1)} suit" aria-pressed="${c===color}"><span></span></button>`).join('')}</div></div>`,
 onSubmit:async(_form,close)=>{
  const member=await api.saveAvatar(selected,color);
  if(state.me?.user_id!==me.user_id){close();return;}
  state.me=member;state.members=state.members.map(m=>m.user_id===member.user_id?member:m);updateIdentity();saved=true;close();if(!first)toast('Avatar saved.');
 }
 });
 function draw() {
  const modal=document.querySelector('.avatar-picker');if(!modal)return;
  modal.querySelector('[data-avatar-hero]')!.innerHTML=crewAvatar({display_name:me!.display_name,avatar_seed:selected,avatar_color:color},'crew-avatar--hero');
  modal.querySelector('[data-avatar-choices]')!.innerHTML=choices.map((seed,i)=>`<button type="button" data-avatar-seed="${seed}" aria-label="Face ${i+1}" aria-pressed="${seed===selected}">${crewAvatar({display_name:`Face ${i+1}`,avatar_seed:seed,avatar_color:color})}</button>`).join('');
  modal.querySelectorAll('[data-suit-color]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.suitColor===color)));
 }
 draw();
 document.querySelector<HTMLButtonElement>('.avatar-picker [data-avatar-seed][aria-pressed="true"]')?.focus({preventScroll:true});
 document.querySelector('.avatar-picker')?.addEventListener('click', e=>{
  const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
  if(b.dataset.avatarSeed)selected=b.dataset.avatarSeed;
  if(b.dataset.suitColor)color=b.dataset.suitColor;
  if(b.hasAttribute('data-shuffle')){choices=Array.from({length:6},()=>crypto.randomUUID());selected=choices[0];}
  draw();
 });
 await closed;
 return saved;
}
