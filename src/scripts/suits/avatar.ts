import { api, state, isAdvisor, type Member } from './api';
import { esc, onboardingProgress, openModal, toast } from './ui';

const colors = ['blue','orange','violet','mint'] as const;
export function avatarUrl(seed:string) { return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`; }
let helmetId = 0;
/**
 * Front view of an EMU style helmet as flat vector shapes: the white shell, the
 * visor frame, the face behind blue glass with hard edged reflections, and the
 * metal neck ring over the suit, all clipped to the helmet outline.
 */
export function crewAvatar(m:Pick<Member,'avatar_seed'|'avatar_color'|'display_name'>, size='') {
 const seed=m.avatar_seed || 'suits-explorer';
 const id=`helmet-${++helmetId}`;
 const color=colors.includes(m.avatar_color as typeof colors[number])?m.avatar_color:'blue';
 const outline='M50 2C77 2 97 21 97 48C97 76 78 98 50 98C22 98 3 76 3 48C3 21 23 2 50 2Z';
 const visor='M50 16C71 16 84 28 84 47C84 64 71 74 50 74C29 74 16 64 16 47C16 28 29 16 50 16Z';
 return `<span class="crew-avatar ${size}" data-color="${color}"><svg class="crew-avatar__svg" viewBox="0 0 100 100" role="img" aria-label="${esc(m.display_name)} avatar">
 <defs><clipPath id="${id}-o"><path d="${outline}"/></clipPath><clipPath id="${id}-v"><path d="${visor}"/></clipPath></defs>
 <g clip-path="url(#${id}-o)">
  <rect width="100" height="100" fill="#d6dde5"/>
  <circle cx="45" cy="42" r="54" fill="#f7f8fa"/>
  <rect y="86" width="100" height="14" style="fill:var(--suit)"/>
  <ellipse cx="50" cy="86.5" rx="44" ry="5.5" fill="#8995a3"/>
  <ellipse cx="50" cy="84.2" rx="44" ry="4.6" fill="#d2d9e1"/>
  <path d="M6 84.2C14 87.4 31 89.2 50 89.2C69 89.2 86 87.4 94 84.2" fill="none" stroke="#6f7b88" stroke-width=".8"/>
 </g>
 <path d="M50 12C74 12 88 26 88 47C88 67 73 78 50 78C27 78 12 67 12 47C12 26 26 12 50 12Z" fill="#2a3139"/>
 <g clip-path="url(#${id}-v)">
  <rect x="16" y="16" width="68" height="58" fill="#1a2630"/>
  <image href="${esc(avatarUrl(seed))}" x="16" y="13" width="68" height="64" preserveAspectRatio="xMidYMid slice"/>
  <rect x="16" y="16" width="68" height="58" fill="#3d86ff" opacity=".28"/>
  <path d="M19 44C19 29 30 19 47 18C33 22 25 32 24 45Z" fill="#fff" opacity=".85"/>
  <path d="M72 62C76 58 79 53 80 48C81 55 78 62 74 66Z" fill="#fff" opacity=".6"/>
  <rect x="59" y="22" width="11" height="4" rx="2" transform="rotate(18 64.5 24)" fill="#fff" opacity=".7"/>
 </g>
 <path d="${visor}" fill="none" stroke="#b9dcff" stroke-width="1.2" opacity=".75"/>
</svg></span>`;
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
 body:`${first?onboardingProgress(1,isAdvisor()?3:2):''}<div class="avatar-picker"><div class="avatar-picker__hero" data-avatar-hero></div><div class="avatar-picker__choices" data-avatar-choices></div><button type="button" class="avatar-picker__shuffle" data-shuffle>Shuffle <span aria-hidden="true">↻</span></button><div class="avatar-picker__colors" role="group" aria-label="Suit color">${colors.map(c=>`<button type="button" data-suit-color="${c}" aria-label="${c[0].toUpperCase()+c.slice(1)} suit" aria-pressed="${c===color}"><span></span></button>`).join('')}</div></div>`,
 onSubmit:async(_form,close)=>{
  const member=await api.saveAvatar(selected,color);
  if(state.me?.user_id!==me.user_id){close();return;}
  state.me=member;state.members=state.members.map(m=>m.user_id===member.user_id?member:m);updateIdentity();saved=true;close();if(!first)toast('Avatar saved');
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
