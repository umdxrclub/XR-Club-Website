// Explicit local design fixtures. Production never imports or routes this module.
import { api, state, type Member, type Meeting, type Rsvp } from './api';
import { enterWorkspace } from './workspace';
import { TEAM_ZONE, weekDays, zoneParts, wallTimeToIso } from '../../lib/suitsCalendar';
export async function bootPreview() {
  if (!import.meta.env.DEV) return;
  const realApi={...api};
  document.addEventListener('astro:before-swap',()=>Object.assign(api,realApi),{once:true});
  const names = ['Alex Rivera', 'Sam Patel', 'Jordan Lee', 'Taylor Chen'];
  state.members = names.map((name, i) => ({ user_id: `preview-${i}`, email: `preview-${i}@example.invalid`, display_name: name, avatar_url: null, role: i === 0 ? 'lead' : 'member', discord_username: name.toLowerCase().replace(' ', ''), discord_id: `10000000000000000${i}`, discord_avatar: null, proposal_role: ['pm','technical','uiux','aiml'][i], created_at: new Date().toISOString(), last_seen: new Date().toISOString() })) as Member[];
  if(new URLSearchParams(location.search).get('roster')==='full') {
    const extraNames=['Morgan Brooks','Casey Nguyen','Riley Jordan','Jamie Park','Avery Clark','Cameron Reed','Quinn Morgan','Drew Ellis','Robin Davis','Emerson Bell','Skyler Thomas','Charlie Adams','Reese Wilson','Parker Moore'];
    const teams=['technical','technical','technical','technical','uiux','uiux','uiux','aiml','aiml','hitl','hitl','pm','engagement',null];
    state.members.push(...extraNames.map((display_name,i)=>({...state.members[1],user_id:'preview-'+(i+4),email:'teammate-'+(i+4)+'@example.invalid',display_name,proposal_role:teams[i]})));
  }
  state.members[0].email='kcyle@terpmail.umd.edu';
  state.members.forEach((m,i)=>{m.avatar_seed=`suits-${i}`;m.avatar_color=['blue','orange','violet','mint'][i];m.avatar_set_at=new Date().toISOString();});
  state.me = state.members[new URLSearchParams(location.search).has('member')?1:0];
  if(new URLSearchParams(location.search).has('first'))state.me.avatar_set_at=null;
  api.saveAvatar=async(seed,color)=>({...state.me!,avatar_seed:seed,avatar_color:color,avatar_set_at:new Date().toISOString()});
  const days = weekDays(zoneParts(new Date()).day);
  const sample = (id: string, title: string, day: number, time: string, minutes: number, audience: 'team' | 'subteam' | 'check_in', subteam: string | null = null): Meeting => {
    const start = wallTimeToIso(days[day], time);
    return { id, title, starts_at: start, ends_at: new Date(Date.parse(start) + minutes * 60000).toISOString(), audience, subteam, attendee_ids: audience === 'check_in' ? ['preview-1'] : [], timezone: TEAM_ZONE, location: 'SUITS voice room', agenda: 'Example event for the design preview.', ping: [], created_by: 'preview-0', created_at: new Date().toISOString(), reminder_minutes: [60,10], notify_discord: true, discord_channel_id: '123456789012345678', announcement_channel_id: null };
  };
  let rows = [sample('sample-1','Weekly team sync',1,'10:00',60,'team'),sample('sample-2','Systems working session',2,'13:00',90,'subteam','technical'),sample('sample-3','Design review',3,'11:00',60,'subteam','uiux'),sample('sample-4','Check-in with Sam',4,'14:00',30,'check_in'),sample('sample-5','Mission planning',5,'10:30',60,'team'),sample('sample-6','AI / ML standup',5,'14:00',45,'subteam','aiml'),sample('sample-7','Saturday check-in',6,'12:00',30,'check_in')];
  let rsvps: Rsvp[] = [];
  api.meetings = async () => rows;
  api.rsvps = async () => rsvps;
  api.members = async () => state.members;
  api.tasks = async () => [];
  api.scheduleMeetings = async events => { const next = events.map(e => ({ ...e, id: crypto.randomUUID(), ping: [], created_by: state.me!.user_id, created_at: new Date().toISOString() } as Meeting)); rows = [...rows, ...next]; return next; };
  api.updateMeeting = async (id, patch) => { rows = rows.map(m => m.id === id ? { ...m, ...patch } : m); };
  api.deleteMeeting = async id => { rows = rows.filter(m => m.id !== id); };
  api.setRsvp = async (id, response) => { rsvps = [...rsvps.filter(r => r.meeting_id !== id), { meeting_id: id, user_id: state.me!.user_id, response }]; };
  api.meetingDeliveries = async () => [];
  api.discord = async <T>() => ({ configured: true, guildId: '123456789012345679', meetingChannelId: '123456789012345678', channels: [{ id: '123456789012345678', name: 'SUITS voice room', type: 2 }, { id: '123456789012345677', name: 'suits-announcements', type: 0 }] } as T);
  // These fixtures exercise the real layouts without writing to the team backend.
  api.updateProfile = async () => {};
  api.manageMember = async (id,role,subteam) => {state.members=state.members.map(m=>m.user_id===id?{...m,role,proposal_role:subteam}:m);};
  api.setRole = async () => {};
  api.setProposalRole = async () => {};
  api.removeMember = async () => {};
  api.createTask = async () => { throw new Error('Tasks are read-only in this design preview.'); };
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b => { b.disabled = b.dataset.nav === 'documents'; });
  const { go } = await import('./index');
  document.getElementById('st-nav')!.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-nav]');
    if (button && !button.disabled) void go(button.dataset.nav!, false);
  });
  await enterWorkspace(() => go('meetings', false));
}
