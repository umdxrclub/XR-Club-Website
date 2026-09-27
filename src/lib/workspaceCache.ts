/** Session-only data. Never persists application records or shares data between accounts. */
export class WorkspaceCache {
 private scope: string | null = null;
 private entries=new Map<string,{value?:unknown;ready:boolean;updated:number;pending?:Promise<unknown>}>();
 constructor(private now=()=>Date.now()){}
 clear(){this.entries.clear();this.scope=null;}
 invalidate(...keys:string[]){for(const key of keys)this.entries.delete(key);}
 async read<T>(scope:string|null,key:string,load:()=>Promise<T>):Promise<T>{
  if(!scope)throw new Error('Sign in to open the workspace.');
  if(this.scope!==scope){this.entries.clear();this.scope=scope;}
  let entry=this.entries.get(key);
  if(!entry){entry={ready:false,updated:0};this.entries.set(key,entry);}
  const current=entry;
  const refresh=()=>{
   if(!current.pending)current.pending=load().then(value=>{
    if(this.scope!==scope||this.entries.get(key)!==current)throw new Error('The workspace changed. Open this section again.');
    current.value=structuredClone(value);current.ready=true;current.updated=this.now();return value;
   }).finally(()=>{current.pending=undefined;});
   return current.pending as Promise<T>;
  };
  if(current.ready){if(this.now()-current.updated>60000)void refresh().catch(()=>{});return structuredClone(current.value) as T;}
  return structuredClone(await refresh());
 }
}
export const workspaceData=new WorkspaceCache();
