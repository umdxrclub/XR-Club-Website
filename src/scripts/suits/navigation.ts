import { workspaceDestination } from '../../lib/suitsNavigation';

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

window.xrSuitsPrepare=async(to,signal)=>{
 if(import.meta.env.DEV&&to.origin===location.origin&&/\/suits\/preview\/?$/.test(to.pathname)&&to.searchParams.has('returning')) {
  const {boot}=await import('./index');
  return signal.aborted?null:{to,boot};
 }
 const target=workspaceDestination(to);
 if(!target||to.origin!==location.origin)return null;
 try {
  const {supabase}=await loadSupabase();
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session||signal.aborted)return null;
  const {api}=await import('./api');
  const request=await api.membership();
  if(request?.status!=='approved'||signal.aborted)return null;
  const {boot}=await import('./index');
  return signal.aborted?null:{to:target,boot};
 } catch {
  // Normal sign-in and approval checks handle expired sessions and offline requests.
  return null;
 }
};
