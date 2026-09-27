import { supabase } from '../../lib/supabase';
import { workspaceDestination } from '../../lib/suitsNavigation';

declare global {
 interface Window {
  xrSuitsPrepare?: (to: URL, signal: AbortSignal) => Promise<{ to: URL; boot: () => Promise<void> } | null>;
 }
}

window.xrSuitsPrepare=async(to,signal)=>{
 if(import.meta.env.DEV&&to.origin===location.origin&&/\/suits\/preview\/?$/.test(to.pathname)&&to.searchParams.has('returning')) {
  const {boot}=await import('./index');
  return signal.aborted?null:{to,boot};
 }
 const target=workspaceDestination(to);
 if(!target||to.origin!==location.origin)return null;
 try {
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
