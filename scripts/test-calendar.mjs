import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const load = async path => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
const cal = await load('src/lib/suitsCalendar.ts');
const delivery = await load('supabase/functions/_shared/calendar-delivery.ts');

assert.equal(cal.wallTimeToIso('2026-07-10','14:30'), '2026-07-10T18:30:00.000Z');
assert.equal(cal.wallTimeToIso('2026-12-10','14:30'), '2026-12-10T19:30:00.000Z');
assert.throws(() => cal.wallTimeToIso('2026-03-08','02:30'), /does not exist/);
assert.throws(() => cal.wallTimeToIso('2026-11-01','01:30'), /occurs twice/);
assert.throws(() => cal.wallTimeToIso('2026-02-30','14:30'), /valid/);
assert.deepEqual(cal.recurringStarts('2026-10-25','10:00',3), ['2026-10-25T14:00:00.000Z','2026-11-01T15:00:00.000Z','2026-11-08T15:00:00.000Z']);
assert.equal(cal.monthDays('2026-12-31').length,42);
const overlap = [
  {id:'a',title:'A',starts_at:'2026-09-28T13:00:00Z',ends_at:'2026-09-28T14:00:00Z'},
  {id:'b',title:'B',starts_at:'2026-09-28T13:30:00Z',ends_at:'2026-09-28T14:30:00Z'},
  {id:'c',title:'C',starts_at:'2026-09-28T14:00:00Z',ends_at:'2026-09-28T15:00:00Z'},
];
assert.deepEqual(cal.layoutDay(overlap,'2026-09-28').map(e=>[e.column,e.columns]),[[0,2],[1,2],[0,2]]);
assert.equal(cal.eventsOnDay([{...overlap[0],starts_at:'2026-09-28T03:30:00Z',ends_at:'2026-09-28T04:00:00Z'}],'2026-09-28').length,0,'Midnight ending does not spill into next day');
const windowEvents=[
 {...overlap[0],id:'early',starts_at:'2026-09-28T11:00:00Z',ends_at:'2026-09-28T12:00:00Z'},
 {...overlap[0],id:'crossing',starts_at:'2026-09-28T12:30:00Z',ends_at:'2026-09-28T13:30:00Z'},
 {...overlap[0],id:'late',starts_at:'2026-09-29T03:30:00Z',ends_at:'2026-09-29T04:00:00Z'},
];
assert.deepEqual(cal.calendarDayWindow(windowEvents,'2026-09-28').map(e=>[e.event.id,e.start,e.end]),[['crossing',0,30],['late',870,900]],'9 AM clipping retains crossing meetings and the end of the day');
assert.equal(cal.eventsOnDay(windowEvents,'2026-09-28').length,3,'Earlier meetings remain available in the schedule');
assert.equal(cal.discordChannelUrl('123456789012345678','https://evil.test'),null);
const privateJob={id:'abc12345-0000-4000-8000-123456789012',kind:'created',snapshot:{...overlap[0],audience:'check_in',title:'Private review',agenda:'Private notes @everyone',location:'Room 2',attendee_ids:['bob'],created_by:'alice'}};
const serverPayload=delivery.deliveryPayload(privateJob,{});
assert.ok(!JSON.stringify(serverPayload).includes('Private review'));
assert.ok(!JSON.stringify(serverPayload).includes('Private notes'));
assert.ok(JSON.stringify(delivery.deliveryPayload(privateJob,{}, {user_id:'bob'})).includes('Private notes'));
assert.deepEqual(serverPayload.allowed_mentions,{parse:[],users:[],roles:[]});
assert.equal(serverPayload.enforce_nonce,true);
assert.equal(delivery.isInvited(privateJob.snapshot,{user_id:'carol',proposal_role:'technical'}),false);

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
CREATE FUNCTION public.is_board_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;
`);
await db.exec(await fs.readFile('supabase/migrations/20260918000000_suits_team.sql','utf8'));
await db.exec(`ALTER TABLE public.suits_team ADD COLUMN proposal_role text; CREATE TABLE public.suits_settings(key text PRIMARY KEY,value jsonb,updated_at timestamptz DEFAULT now()); GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;`);
await db.exec(await fs.readFile('supabase/migrations/20260926000000_suits_calendar.sql','utf8'));
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',carol='33333333-3333-4333-8333-333333333333',outsider='44444444-4444-4444-8444-444444444444';
for (const [id,name,role,group] of [[alice,'Alice','lead','pm'],[bob,'Bob','member','technical'],[carol,'Carol','member','uiux']]) {
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)",[id,`${name}@umd.edu`]);
  await db.query('INSERT INTO public.suits_team(user_id,email,display_name,role,proposal_role) VALUES($1,$2,$3,$4,$5)',[id,`${name}@umd.edu`,name,role,group]);
}
async function as(id,fn) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[id,`${id===outsider?'outside':'member'}@${id===outsider?'example.com':'umd.edu'}`]);
  await db.exec('SET ROLE authenticated');
  try { return await fn(); } finally { await db.exec('RESET ROLE'); await db.exec("SELECT set_config('request.jwt.claim.sub','',false)"); }
}
const row = {title:'Check-in',starts_at:'2030-10-05T18:00:00Z',ends_at:'2030-10-05T18:30:00Z',audience:'check_in',attendee_ids:[bob],reminder_minutes:[60,10],notify_discord:true};
const create = async events => (await db.query('SELECT * FROM public.suits_schedule_meetings($1::jsonb)',[JSON.stringify(events)])).rows;
const [checkin] = await as(alice,()=>create([row]));
assert.equal(checkin.created_by,alice);
assert.equal((await db.query('SELECT * FROM public.suits_calendar_notifications WHERE meeting_id=$1',[checkin.id])).rows.length,7,'Server + two initial DMs + four reminders');
await db.exec(await fs.readFile('supabase/migrations/20260927010000_suits_calendar_channels.sql','utf8'));
assert.equal((await db.query('SELECT * FROM public.suits_calendar_notifications WHERE meeting_id=$1',[checkin.id])).rows.length,9,'Migration adds only two future channel reminders to the existing meeting');
assert.equal((await db.query("SELECT count(*)::int n FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND kind='created'",[checkin.id])).rows[0].n,3,'Migration never re-announces existing meetings');
assert.equal((await as(bob,()=>db.query('SELECT id FROM public.suits_meetings'))).rows.length,1);
assert.equal((await as(carol,()=>db.query('SELECT id FROM public.suits_meetings'))).rows.length,0,'Other members cannot see a check-in');
assert.equal((await as(outsider,()=>db.query('SELECT id FROM public.suits_meetings'))).rows.length,0);
await assert.rejects(()=>as(bob,()=>create([{...row,audience:'team',attendee_ids:[]}])));
await assert.rejects(()=>as(bob,()=>db.query('SELECT * FROM public.suits_claim_calendar_notifications(20)')));
await assert.rejects(()=>as(bob,()=>db.query("INSERT INTO public.suits_calendar_notifications(meeting_id,revision,kind,snapshot,due_at,expires_at) VALUES($1,1,'created','{}',now(),now()+interval '1 day')",[checkin.id])));
assert.equal((await as(bob,()=>db.query('SELECT * FROM public.suits_calendar_notifications'))).rows.length,0);
await assert.rejects(()=>as(carol,()=>db.query("INSERT INTO public.suits_meeting_rsvps(meeting_id,user_id,response) VALUES($1,$2,'yes')",[checkin.id,carol])));
await as(bob,()=>db.query("INSERT INTO public.suits_meeting_rsvps(meeting_id,user_id,response) VALUES($1,$2,'yes')",[checkin.id,bob]));
await assert.rejects(()=>as(alice,()=>create([{...row,discord_channel_id:'123456789012345678'}])),'Unverified server channel rejected');
const before=(await db.query('SELECT count(*)::int n FROM public.suits_meetings')).rows[0].n;
await assert.rejects(()=>as(alice,()=>create([row,{...row,ends_at:row.starts_at}])));
assert.equal((await db.query('SELECT count(*)::int n FROM public.suits_meetings')).rows[0].n,before,'A bad recurring occurrence rolls back the whole batch');
const weekly=await as(alice,()=>create([{...row,title:'Weekly 1',audience:'team',attendee_ids:[]},{...row,title:'Weekly 2',audience:'team',attendee_ids:[],starts_at:'2030-10-12T18:00:00Z',ends_at:'2030-10-12T18:30:00Z'}]));
assert.ok(weekly[0].series_id); assert.equal(weekly[0].series_id,weekly[1].series_id);
const firstClaim=(await db.query('SELECT * FROM public.suits_claim_calendar_notifications(20)')).rows;
const secondClaim=(await db.query('SELECT * FROM public.suits_claim_calendar_notifications(20)')).rows;
assert.ok(firstClaim.length); assert.equal(secondClaim.length,0,'Concurrent worker cannot claim a leased job again');
await as(alice,()=>db.query('UPDATE public.suits_meetings SET title=$2,created_by=$3,revision=900,attendee_ids=$4 WHERE id=$1',[checkin.id,'Rescheduled',bob,[carol]]));
const updated=(await db.query('SELECT * FROM public.suits_meetings WHERE id=$1',[checkin.id])).rows[0];
assert.equal(updated.created_by,alice); assert.equal(updated.revision,2);
assert.equal((await db.query("SELECT count(*)::int n FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND revision=1 AND status IN ('pending','processing')",[checkin.id])).rows[0].n,0,'Reschedule invalidates previous deliveries');
assert.equal((await db.query("SELECT count(*)::int n FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND recipient_id=$2 AND kind='cancelled'",[checkin.id,bob])).rows[0].n,1,'Removed guest gets cancellation');
await as(alice,()=>db.query('DELETE FROM public.suits_meetings WHERE id=$1',[checkin.id]));
assert.equal((await db.query("SELECT count(*)::int n FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND revision=3 AND kind='cancelled'",[checkin.id])).rows[0].n,3,'Cancellation survives deletion, for server and both invitees');
const [subteam]=await as(alice,()=>create([{...row,audience:'subteam',subteam:'technical',attendee_ids:[]}])) ;
const recipients=(await db.query("SELECT DISTINCT recipient_id FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND recipient_id IS NOT NULL",[subteam.id])).rows.map(r=>r.recipient_id);
assert.deepEqual(recipients.sort(),[alice,bob].sort(),'Only the subteam and organizer receive DMs');
await assert.rejects(()=>as(carol,()=>db.query("INSERT INTO public.suits_meeting_rsvps(meeting_id,user_id,response) VALUES($1,$2,'yes')",[subteam.id,carol])));

// Exercise the worker against the real outbox, replacing only Discord's network.
await db.exec("UPDATE public.suits_calendar_notifications SET status='cancelled'; UPDATE public.suits_team SET discord_id=CASE display_name WHEN 'Alice' THEN '123456789012345671' WHEN 'Bob' THEN '123456789012345672' ELSE NULL END;");
class Query {
  constructor(table) { this.table=table; this.filters=[]; this.columns='*'; }
  select(columns='*') { this.columns=columns; return this; }
  eq(key,value) { this.filters.push([key,value]); return this; }
  update(patch) { this.patch=patch; return this; }
  async execute(single=false) {
    const values=[];
    const identifier=s=>{assert.match(s,/^[a-z_]+$/);return `"${s}"`;};
    const param=v=>{values.push(v);return `$${values.length}`;};
    const set=this.patch?Object.entries(this.patch).map(([k,v])=>`${identifier(k)}=${param(v)}`).join(','):'';
    const where=this.filters.map(([k,v])=>`${identifier(k)}=${param(v)}`).join(' AND ')||'true';
    const sql=this.patch?`UPDATE public.${identifier(this.table)} SET ${set} WHERE ${where} RETURNING *`:`SELECT ${this.columns==='*'?'*':this.columns.split(',').map(identifier).join(',')} FROM public.${identifier(this.table)} WHERE ${where}`;
    const result=await db.query(sql,values); return {data:single?result.rows[0]||null:result.rows,error:null};
  }
  single() {return this.execute(true);} maybeSingle(){return this.execute(true);}
  then(resolve,reject){return this.execute().then(resolve,reject);}
}
const admin={from:table=>new Query(table),rpc:async(name,args)=>({data:(await db.query(`SELECT * FROM public.${name}($1)`,[args.batch_size])).rows,error:null})};
const members=(await db.query('SELECT * FROM public.suits_team')).rows;
const settings={guild_id:'123456789012345679',channel_id:'123456789012345677',reminders_channel_id:'123456789012345676'};
const subteamChannel='123456789012345675',voiceChannel='123456789012345678';
await db.query("INSERT INTO public.suits_settings(key,value) VALUES('discord',$1)",[JSON.stringify(settings)]);
for(const [id,type] of [[settings.channel_id,0],[settings.reminders_channel_id,0],[subteamChannel,0],[voiceChannel,2]]) await db.query('INSERT INTO public.suits_discord_channels(id,guild_id,name,type) VALUES($1,$2,$3,$4)',[id,settings.guild_id,id,type]);
assert.equal(delivery.notificationChannel({...privateJob.snapshot,announcement_channel_id:settings.channel_id},settings),settings.reminders_channel_id);
assert.equal(delivery.notificationChannel({...privateJob.snapshot,audience:'team',announcement_channel_id:subteamChannel},settings),settings.channel_id);
assert.equal(delivery.notificationChannel({...privateJob.snapshot,audience:'subteam',discord_channel_id:subteamChannel,announcement_channel_id:settings.channel_id},settings),subteamChannel,'Old announcements overrides cannot send subteam updates to announcements');
assert.throws(()=>delivery.notificationChannel(privateJob.snapshot,{...settings,reminders_channel_id:undefined}),/reminders channel/);
assert.throws(()=>delivery.notificationChannel(privateJob.snapshot,{...settings,reminders_channel_id:settings.channel_id}),/separate/);
assert.throws(()=>delivery.notificationChannel({...privateJob.snapshot,audience:'subteam',discord_channel_id:settings.channel_id},settings),/subteam/);
assert.throws(()=>delivery.notificationChannel({...privateJob.snapshot,audience:'subteam'},settings),/subteam/);
assert.deepEqual(delivery.checkInMentions({...row,created_by:alice},[...members,{user_id:carol,discord_id:'123456789012345674'},{user_id:bob,email:'e2e.test@umd.edu',discord_id:'123456789012345673'}]),['123456789012345671','123456789012345672'],'Only the organizer and invited real teammate can be tagged');
const realFetch=globalThis.fetch; let sent=[],rateLimit=false,blockBob=false;
let foreignChannel=false;
globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/users/@me/channels')) {const body=JSON.parse(options.body);return Response.json({id:`dm-${body.recipient_id}`});}
  if(options.method==='POST'&&path.endsWith('/messages')) {
    if(rateLimit){rateLimit=false;return Response.json({retry_after:60},{status:429});}
    if(blockBob&&path.includes('dm-123456789012345672'))return Response.json({},{status:403});
    sent.push({path,body:JSON.parse(options.body)});return Response.json({id:`message-${sent.length}`});
  }
  return Response.json({guild_id:foreignChannel?'123456789012345670':settings.guild_id,type:path.endsWith(voiceChannel)?2:0});
};
try {
  const [jobMeeting]=await as(alice,()=>create([row]));
  let result=await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(result.sent,3,'Initial server announcement and two DMs are delivered');
  assert.equal(sent.length,3); assert.equal(sent.filter(s=>s.path.includes('/dm-')).length,2);
  const checkinPost=sent.find(s=>!s.path.includes('/dm-'));
  assert.ok(checkinPost.path.includes(settings.reminders_channel_id),'1:1 creation goes only to reminders');
  assert.deepEqual(checkinPost.body.allowed_mentions,{parse:[],roles:[],users:['123456789012345671','123456789012345672']});
  assert.ok(checkinPost.body.content.includes('<@123456789012345672>'));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(sent.length,3,'A second run does not duplicate sent announcements');
  await as(bob,()=>db.query("INSERT INTO public.suits_meeting_rsvps(meeting_id,user_id,response) VALUES($1,$2,'no')",[jobMeeting.id,bob]));
  await db.query("UPDATE public.suits_calendar_notifications SET due_at=now() WHERE meeting_id=$1 AND kind='reminder'",[jobMeeting.id]);
  result=await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(result.skipped,2,'Declined attendees do not get reminder DMs');
  assert.equal(result.sent,4,'Two channel reminders and two organizer DMs');
  const reminders=sent.filter(s=>s.body.content.includes('Meeting reminder')&&!s.path.includes('/dm-'));
  assert.equal(reminders.length,2);
  assert.ok(reminders.every(s=>s.path.includes(settings.reminders_channel_id)));
  assert.ok(reminders.every(s=>!s.body.content.includes('123456789012345672')),'Declined participants are not tagged in channel reminders');
  sent=[]; rateLimit=true;
  const [retryMeeting]=await as(alice,()=>create([row]));
  result=await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(result.retried,3,'Rate limit defers the remaining batch');
  assert.equal(sent.length,0);
  await db.query("UPDATE public.suits_calendar_notifications SET due_at=now() WHERE meeting_id=$1 AND kind='created'",[retryMeeting.id]);
  blockBob=true;
  result=await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(result.failed,1,'Blocked DMs are recorded separately');
  assert.equal(result.sent,2,'One failed DM does not prevent other recipients');
  const failures=(await db.query("SELECT last_error FROM public.suits_calendar_notifications WHERE meeting_id=$1 AND status='failed'",[retryMeeting.id])).rows;
  assert.match(failures[0].last_error,/privacy|permissions/);
  blockBob=false; sent=[];
  const [aiMeeting]=await as(alice,()=>create([{...row,audience:'subteam',subteam:'technical',attendee_ids:[],discord_channel_id:subteamChannel,announcement_channel_id:settings.channel_id}]));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  let channelPosts=sent.filter(s=>!s.path.includes('/dm-'));
  assert.equal(channelPosts.length,1); assert.ok(channelPosts[0].path.includes(subteamChannel));
  assert.deepEqual(channelPosts[0].body.allowed_mentions,{parse:[],users:[],roles:[]});
  await as(alice,()=>db.query('UPDATE public.suits_meetings SET title=$2 WHERE id=$1',[aiMeeting.id,'Changed @everyone <@123456789012345672>']));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  await db.query("UPDATE public.suits_calendar_notifications SET due_at=now() WHERE meeting_id=$1 AND kind='reminder' AND status='pending'",[aiMeeting.id]);
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  await as(alice,()=>db.query('DELETE FROM public.suits_meetings WHERE id=$1',[aiMeeting.id]));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  channelPosts=sent.filter(s=>!s.path.includes('/dm-'));
  assert.equal(channelPosts.length,5,'Create, update, two reminders and cancellation each produce one subteam post');
  assert.ok(channelPosts.every(s=>s.path.includes(subteamChannel)),'Every subteam event stays in the subteam channel');
  assert.ok(channelPosts.every(s=>s.body.allowed_mentions.parse.length===0&&s.body.allowed_mentions.users.length===0),'Titles and notes cannot enable incidental mentions');
  sent=[];
  await as(alice,()=>create([{...row,audience:'subteam',subteam:'technical',attendee_ids:[],discord_channel_id:voiceChannel}]));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.ok(sent.find(s=>!s.path.includes('/dm-')).path.includes(voiceChannel),'Voice meeting updates stay in that voice channel’s text chat');
  sent=[];
  await as(alice,()=>create([{...row,audience:'team',attendee_ids:[],announcement_channel_id:subteamChannel}]));
  await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.ok(sent.find(s=>!s.path.includes('/dm-')).path.includes(settings.channel_id),'All-team posts use announcements, ignoring a legacy override');
  sent=[];
  await as(alice,()=>create([{...row,title:'Private review',agenda:'Private notes @everyone',announcement_channel_id:settings.channel_id}]));
  result=await delivery.processCalendarQueue(admin,{...settings,reminders_channel_id:undefined},members,'fake-test-token');
  assert.equal(result.failed,1); assert.equal(sent.filter(s=>!s.path.includes('/dm-')).length,0,'No configured reminders channel means no public fallback');
  sent=[]; foreignChannel=true;
  await as(alice,()=>create([row]));
  result=await delivery.processCalendarQueue(admin,settings,members,'fake-test-token');
  assert.equal(result.failed,1); assert.ok(sent.every(s=>s.path.includes('/dm-')),'A channel outside the configured server cannot receive meeting posts');
} finally { globalThis.fetch=realFetch; }
await db.close();
console.log('Calendar passed: DST, layout, RLS, recurrence, audience channel routing, participant-only mentions, reminder migration, leases, rescheduling, cancellations, Discord DMs, duplicate prevention, declined invites, rate limits and blocked DMs. No external messages sent.');
