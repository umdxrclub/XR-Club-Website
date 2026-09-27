const views = new Set(['meetings','overview','tasks','proposal','documents','team','applications','access']);

/** Preserve the requested section while bypassing the sign-in route for approved members. */
export function workspaceDestination(input: URL): URL | null {
 const match=input.pathname.match(/^(.*\/suits\/)(team|workspace|dashboard)(?:\/([^/]+))?\/?$/);
 if(!match)return null;
 const requested=match[2]==='dashboard'?'applications':match[3] || input.searchParams.get('view') || input.hash.slice(1);
 const view=views.has(requested)?requested:'meetings';
 const target=new URL(input.href);
 target.pathname=`${match[1]}workspace/${view==='meetings'?'':view+'/'}`;
 target.searchParams.delete('view');target.hash='';
 return target;
}
