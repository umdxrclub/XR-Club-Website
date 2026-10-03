import { workspaceDestination } from '../../lib/suitsNavigation';
import { homeSettled } from '../../features/home/homeReady';

declare global {
 interface Window {
  xrSuitsPrepare?: (to: URL, signal: AbortSignal) => Promise<{ to: URL; boot: () => Promise<void> } | null>;
 }
}

let client:Promise<typeof import('../../lib/supabase')>|undefined;
const loadSupabase=()=>client??=import('../../lib/supabase');
// Sign-in links may return to any page; the client finishes those sessions from the address.
if(/[?#&](?:access_token|refresh_token|error_description|code)=/.test(location.search+location.hash))void loadSupabase();
else {
 // Otherwise keep it off the opening frame, and ready well before a SUITS link is used.
 const warm=()=>typeof requestIdleCallback==='function'?requestIdleCallback(()=>void loadSupabase(),{timeout:5000}):setTimeout(()=>void loadSupabase(),200);
 if(document.readyState==='complete')warm();else addEventListener('load',warm,{once:true});
}

// An approval is reused for a minute, so opening the dashboard right after warming it makes no request.
let approval:{userId:string;at:number}|undefined;
async function approvedSession(){
 const {supabase}=await loadSupabase();
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)return null;
 if(approval?.userId===session.user.id&&Date.now()-approval.at<60000)return session;
 const {api}=await import('./api');
 const request=await api.membership();
 if(request?.status!=='approved')return null;
 approval={userId:session.user.id,at:Date.now()};
 return session;
}

window.xrSuitsPrepare=async(to,signal)=>{
 if(import.meta.env.DEV&&to.origin===location.origin&&/\/suits\/preview\/?$/.test(to.pathname)&&to.searchParams.has('returning')) {
  const {boot}=await import('./index');
  return signal.aborted?null:{to,boot};
 }
 const target=workspaceDestination(to);
 if(!target||to.origin!==location.origin)return null;
 try {
  const session=await approvedSession();
  if(!session||signal.aborted)return null;
  const {boot}=await import('./index');
  return signal.aborted?null:{to:target,boot};
 } catch {
  // Normal sign-in and approval checks handle expired sessions and offline requests.
  return null;
 }
};

// Signed-in, approved members get the dashboard ready in the background (data stays in memory), so opening it
// from another page needs no loading screen. Its two large backgrounds load only once a SUITS link is in reach.
let warming:Promise<void>|undefined,backgrounds=false;
async function warmWorkspace(intent:boolean){
 if(document.getElementById('st'))return;
 const session=await approvedSession().catch(()=>null);
 if(!session||document.getElementById('st'))return;
 if(intent&&!backgrounds){
  backgrounds=true;
  for(const name of ['astronaut-source.jpg','sky-source.png']){
   const image=new Image();image.src=`${import.meta.env.BASE_URL}scenes/suits-sky/${name}`;void image.decode().catch(()=>{});
  }
 }
 warming??=(async()=>{
  const target=workspaceDestination(new URL(`${import.meta.env.BASE_URL}suits/workspace/`,location.href));
  // The page is served with a ten-minute cache, so the router's own request is answered from it.
  if(target)void fetch(target.href,{credentials:'same-origin'}).catch(()=>{});
  const {warmWorkspace:warm}=await import('./index');
  await warm(session.user.id);
 })().catch(()=>{}).finally(()=>{warming=undefined;});
 await warming;
}
// Once each page has settled (after the homepage intro), and again when a SUITS link is pointed at, focused, or touched.
document.addEventListener('astro:page-load',()=>{
 void homeSettled().then(()=>typeof requestIdleCallback==='function'?new Promise(resolve=>requestIdleCallback(resolve,{timeout:4000})):undefined).then(()=>warmWorkspace(false));
});
for(const type of ['pointerover','focusin','touchstart'] as const) {
 document.addEventListener(type,event=>{
  if((event.target as Element|null)?.closest?.('a[href*="/suits/"]'))void warmWorkspace(true);
 },{passive:true});
}
