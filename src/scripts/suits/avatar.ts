import { api, state, isAdvisor, type Member } from './api';
import { esc, onboardingProgress, openModal, toast } from './ui';

const colors = ['blue','orange','violet','mint'] as const;
export function avatarUrl(seed:string) { return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`; }
let helmetId = 0;
/**
 * The crew helmet as one vector drawing: the rounded white shell with soft
 * shading, a thin gold ring around the visor, the face behind blue glass with
 * hard edged reflections, and the suit collar cut off by the helmet outline.
 */
export function crewAvatar(m:Pick<Member,'avatar_seed'|'avatar_color'|'display_name'>, size='') {
 const seed=m.avatar_seed || 'suits-explorer';
 const id=`helmet-${++helmetId}`;
 const color=colors.includes(m.avatar_color as typeof colors[number])?m.avatar_color:'blue';
 // Rounded square with a slightly flatter base.
 const outline='M49 .5H51A48.5 48.5 0 0 1 99.5 49V57A42.5 42.5 0 0 1 57 99.5H43A42.5 42.5 0 0 1 .5 57V49A48.5 48.5 0 0 1 49 .5Z';
 const visor='M50 16C71 16 84 28 84 47C84 64 71 74 50 74C29 74 16 64 16 47C16 28 29 16 50 16Z';
 // Collar rings, outermost first, as flat concentric ellipses below the helmet.
 const rings:Array<[string,number]>=[['#8b98a6',1],['#eff3f7',.955],['var(--suit-dark)',.86],['var(--suit)',.75]];
 return `<span class="crew-avatar ${size}" data-color="${color}"><svg class="crew-avatar__svg" viewBox="0 0 100 100" role="img" aria-label="${esc(m.display_name)} avatar">
 <defs>
  <clipPath id="${id}-o"><path d="${outline}"/></clipPath><clipPath id="${id}-v"><path d="${visor}"/></clipPath>
  <radialGradient id="${id}-s" cx=".35" cy=".16" r=".95"><stop offset=".15" stop-color="#fff"/><stop offset=".49" stop-color="#f4f5f4"/><stop offset=".88" stop-color="#d5dce3"/></radialGradient>
 </defs>
 <g clip-path="url(#${id}-o)">
  <rect width="100" height="100" fill="url(#${id}-s)"/>
  ${rings.map(([fill,k])=>`<ellipse cx="50" cy="102" rx="${64*k}" ry="${17*k}" style="fill:${fill}"/>`).join('')}
 </g>
 <path d="${outline}" fill="none" stroke="#d8dfe6" stroke-width="1"/>
 <path d="M50 11C75 11 89 25.5 89 47C89 68 73.5 79 50 79C26.5 79 11 68 11 47C11 25.5 25 11 50 11Z" fill="#9a8b6f"/>
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
