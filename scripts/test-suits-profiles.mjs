import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
CREATE FUNCTION public.is_board_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;`);
await db.exec(await fs.readFile('supabase/migrations/20260918000000_suits_team.sql','utf8'));
await db.exec(await fs.readFile('supabase/migrations/20260918040000_suits_proposal_role.sql','utf8'));
await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role');
const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',lead='33333333-3333-4333-8333-333333333333',fresh='44444444-4444-4444-8444-444444444444';
const emails={[owner]:'kcyle@terpmail.umd.edu',[member]:'member@umd.edu',[lead]:'otherlead@umd.edu',[fresh]:'fresh@umd.edu'};
for(const id of [owner,member,lead,fresh])await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,emails[id]]);
for(const [id,role] of [[owner,'lead'],[member,'member'],[lead,'lead']])await db.query('INSERT INTO public.suits_team(user_id,email,display_name,role) VALUES($1,$2,$3,$4)',[id,emails[id],'Test member',role]);
await db.exec(await fs.readFile('supabase/migrations/20260927000000_suits_profiles.sql','utf8'));
async function as(id,fn){await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,emails[id]]);await db.exec('SET ROLE authenticated');try{return await fn()}finally{await db.exec('RESET ROLE');await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.email','',false)")}}
for(const id of [member,lead]){
 await as(id,async()=>{
  assert.equal((await db.query('SELECT public.suits_is_lead() AS yes')).rows[0].yes,false,'Existing lead or board status cannot edit roles');
  await assert.rejects(db.query('SELECT public.suits_set_role($1,$2)',[member,'lead']),/owner/);
  await assert.rejects(db.query('SELECT public.suits_manage_member($1,$2,$3)',[member,'lead','technical']),/owner/);
  await assert.rejects(db.query('UPDATE public.suits_team SET proposal_role=$1 WHERE user_id=$2',['technical',id]),/owner/);
  await assert.rejects(db.query('UPDATE public.suits_team SET role=$1 WHERE user_id=$2',['product_manager',id]),/owner/);
  await assert.rejects(db.query('UPDATE public.suits_team SET email=$1 WHERE user_id=$2',['KCYLE@terpmail.umd.edu',id]),/identity/);
  await assert.rejects(db.query('UPDATE public.suits_team SET user_id=$1 WHERE user_id=$2',[fresh,id]),/identity|policy/);
  assert.equal((await db.query('UPDATE public.suits_team SET display_name=$1 WHERE user_id=$2 RETURNING user_id',['Other person',owner])).rows.length,0);
 });
}
await as(owner,async()=>{
 assert.equal((await db.query('SELECT public.suits_is_lead() AS yes')).rows[0].yes,true);
 await db.query('SELECT public.suits_manage_member($1,$2,$3)',[member,'member','technical']);
 await assert.rejects(db.query('SELECT public.suits_manage_member($1,$2,$3)',[member,'lead','invalid']),/valid role/);
 assert.equal((await db.query('SELECT role FROM public.suits_team WHERE user_id=$1',[member])).rows[0].role,'member','Invalid role update rolls back atomically');
 await db.query('SELECT public.suits_set_role($1,$2)',[member,'product_manager']);
 await assert.rejects(db.query('SELECT public.suits_set_role($1,$2)',[owner,'member']),/retain lead/);
 await assert.rejects(db.query('DELETE FROM public.suits_team WHERE user_id=$1',[owner]),/cannot be removed/);
});
await as(member,async()=>{
 const saved=(await db.query("SELECT (public.suits_save_avatar('suits-sample-123','orange')).* ")).rows[0];
 assert.equal(saved.avatar_seed,'suits-sample-123');assert.equal(saved.avatar_color,'orange');assert.ok(saved.avatar_url.startsWith('https://api.dicebear.com/10.x/bottts-neutral/svg?seed='));
 assert.equal((await db.query('SELECT (public.suits_join()).*')).rows[0].avatar_seed,'suits-sample-123','Sign-in preserves custom avatars and existing roles');
 await assert.rejects(db.query("SELECT public.suits_save_avatar('../outside','blue')"),/valid avatar/);
 await assert.rejects(db.query("SELECT public.suits_save_avatar('safe','invalid')"),/valid avatar/);
});
await as(lead,async()=>assert.equal((await db.query('SELECT avatar_seed FROM public.suits_team WHERE user_id=$1',[member])).rows[0].avatar_seed,'suits-sample-123','Avatar is visible to teammates'));
await as(fresh,async()=>assert.equal((await db.query('SELECT (public.suits_join()).*')).rows[0].role,'member','Board status never auto-promotes a new joiner'));
await db.exec('SET ROLE anon');await assert.rejects(db.query("SELECT public.suits_save_avatar('seed','blue')"),/permission denied/);await db.exec('RESET ROLE');
await db.close();console.log('PASS: exclusive owner permissions, identity protection, self-service avatars, persistence, roster visibility, and safe joins.');
