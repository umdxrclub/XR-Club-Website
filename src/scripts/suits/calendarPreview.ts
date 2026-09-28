// Explicit local design fixtures. Production never imports or routes this module.
import { api, state, canReviewApplications, isLead, isAdvisor, cacheWorkspaceApi, type Member, type Meeting, type Rsvp, type Task, type WorkingRole, type WorkingRoleAssignment, type MembershipRequest, type TeamDocument, type AdvisorAvailability } from './api';
import { preloadWorkspace } from './preload';
import type { SuitsApplication } from '../../lib/types';
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
  state.members.forEach((m,i)=>{m.avatar_seed=`suits-${i}`;m.avatar_color=['blue','orange','violet','mint'][i];m.avatar_set_at=new Date().toISOString();m.workspace_layout='scenic';});
  state.me = state.members[new URLSearchParams(location.search).has('member')?1:0];
  const advisorFixture:Member={...state.members[0],user_id:'preview-advisor',email:'zwicker@umd.edu',display_name:'Zwicker',designation:'advisor',proposal_role:null,avatar_seed:'suits-advisor'};
  state.members.push(advisorFixture);
  if(new URLSearchParams(location.search).has('advisor')) state.me=advisorFixture;
  if(new URLSearchParams(location.search).has('first')){state.me.avatar_set_at=null;state.me.workspace_layout=null;}
  if(new URLSearchParams(location.search).has('layout-first'))state.me.workspace_layout=null;
  api.saveAvatar=async(seed,color)=>({...state.me!,avatar_seed:seed,avatar_color:color,avatar_set_at:new Date().toISOString()});
  api.saveLayout=async(layout)=>({...state.me!,workspace_layout:layout});
  const days = weekDays(zoneParts(new Date()).day);
  const sample = (id: string, title: string, day: number, time: string, minutes: number, audience: 'team' | 'subteam' | 'check_in', subteam: string | null = null): Meeting => {
    const start = wallTimeToIso(days[day], time);
    return { id, title, starts_at: start, ends_at: new Date(Date.parse(start) + minutes * 60000).toISOString(), audience, subteam, attendee_ids: audience === 'check_in' ? ['preview-1'] : [], timezone: TEAM_ZONE, location: 'SUITS voice room', agenda: 'Example event for the design preview.', ping: [], created_by: 'preview-0', created_at: new Date().toISOString(), reminder_minutes: [60,10], notify_discord: true, discord_channel_id: '123456789012345678', announcement_channel_id: null };
  };
  let rows = [sample('sample-1','Weekly team sync',1,'10:00',60,'team'),sample('sample-2','Systems working session',2,'13:00',90,'subteam','technical'),sample('sample-3','Design review',3,'11:00',60,'subteam','uiux'),sample('sample-4','1:1 with Sam',4,'14:00',30,'check_in'),sample('sample-5','Mission planning',5,'10:30',60,'team'),sample('sample-6','AI/ML standup',5,'14:00',45,'subteam','aiml'),sample('sample-7','Saturday 1:1',6,'12:00',30,'check_in')];
  let rsvps: Rsvp[] = [];
  let advisorSlots:AdvisorAvailability[]=[{id:'sample-availability',advisor_id:advisorFixture.user_id,starts_at:wallTimeToIso(days[2],'14:00'),ends_at:wallTimeToIso(days[2],'16:00'),created_at:new Date().toISOString()}];
  api.advisorAvailability=async()=>structuredClone(advisorSlots);
  api.saveAdvisorAvailability=async(id,starts_at,ends_at)=>{
    if(!isAdvisor())throw new Error('Only an advisor can set availability.');
    if(advisorSlots.some(s=>s.id!==id&&s.advisor_id===state.me!.user_id&&s.starts_at<ends_at&&s.ends_at>starts_at))throw new Error('That time overlaps your saved availability.');
    const slot={id:id||crypto.randomUUID(),advisor_id:state.me!.user_id,starts_at,ends_at,created_at:new Date().toISOString()};
    advisorSlots=[...advisorSlots.filter(s=>s.id!==id),slot].sort((a,b)=>a.starts_at.localeCompare(b.starts_at));return slot;
  };
  api.deleteAdvisorAvailability=async id=>{advisorSlots=advisorSlots.filter(s=>s.id!==id);};
  api.meetings = async () => rows;
  api.rsvps = async () => rsvps;
  api.members = async () => state.members;
  const stamp = new Date().toISOString();
  let tasks: Task[] = [
    { id:'work-1', title:'Draft the abstract', section:'team', assignee_id:'preview-0', status:'todo', due_date:days[5] },
    { id:'work-2', title:'Connect the telemetry feed', section:'technical', assignee_id:'preview-1', status:'doing', due_date:days[4], responsibility_id:'role-1' },
    { id:'work-3', title:'Validate the alert priority rules', section:'technical', assignee_id:'preview-4', status:'todo', due_date:days[2], responsibility_id:'role-2' },
    { id:'work-4', title:'Document the integration checklist', section:'technical', assignee_id:'preview-5', status:'done', due_date:days[1], responsibility_id:'role-1' },
    { id:'work-5', title:'Prototype the mission timeline', section:'uiux', assignee_id:'preview-2', status:'doing', due_date:days[6], responsibility_id:'role-3' },
    { id:'work-6', title:'Compare intent model accuracy', section:'aiml', assignee_id:'preview-3', status:'todo', due_date:days[5] },
  ].map(t => ({ details:'Define the acceptance criteria, share a first pass with the subteam, and incorporate feedback.',link:null,ping:[],created_by:'preview-0',created_at:stamp,updated_at:stamp,...t })) as Task[];
  let workingRoles: WorkingRole[] = [
    { id:'role-1',subteam:'technical',name:'Systems integration',description:'Connect telemetry, services, and the astronaut interface into a dependable workflow.',created_by:'preview-1' },
    { id:'role-2',subteam:'technical',name:'Testing & reliability',description:'Own integration checks, investigate failures, and keep the demo ready to run.',created_by:'preview-1' },
    { id:'role-3',subteam:'uiux',name:'Interface design',description:'Turn astronaut needs into clear, usable interactions.',created_by:'preview-2' },
  ];
  let assignments: WorkingRoleAssignment[] = [{role_id:'role-1',user_id:'preview-1'},{role_id:'role-1',user_id:'preview-5'},{role_id:'role-2',user_id:'preview-4'},{role_id:'role-3',user_id:'preview-2'}];
  api.tasks = async () => structuredClone(tasks);
  api.createTask = async payload => { const task={...payload,id:crypto.randomUUID(),status:'todo',ping:[],created_by:state.me!.user_id,created_at:stamp,updated_at:stamp} as Task; tasks.push(task); return task; };
  api.updateTask = async (id,patch) => { tasks=tasks.map(t=>t.id===id?{...t,...patch}:t); };
  api.deleteTask = async id => { tasks=tasks.filter(t=>t.id!==id); };
  api.workingRoles = async () => structuredClone(workingRoles);
  api.workingRoleAssignments = async () => structuredClone(assignments);
  api.saveWorkingRole = async (id,role) => { const saved={...role,id:id || crypto.randomUUID(),created_by:state.me!.user_id}; workingRoles=[...workingRoles.filter(r=>r.id!==id),saved]; };
  api.assignWorkingRole = async (roleId,people) => { assignments=[...assignments.filter(a=>a.role_id!==roleId),...people.map(user_id=>({role_id:roleId,user_id}))]; };
  api.deleteWorkingRole = async id => { workingRoles=workingRoles.filter(r=>r.id!==id); assignments=assignments.filter(a=>a.role_id!==id); tasks=tasks.map(t=>t.responsibility_id===id?{...t,responsibility_id:null}:t); };
  let requests: MembershipRequest[] = [...state.members.map(m=>({user_id:m.user_id,email:m.email,display_name:m.display_name,status:'approved' as const,requested_at:stamp,reviewed_at:stamp})),{user_id:'request-1',email:'new.member@example.invalid',display_name:'Morgan Ellis',status:'pending',requested_at:stamp,reviewed_at:null},{user_id:'request-2',email:'casey@example.invalid',display_name:'Casey Moore',status:'rejected',requested_at:stamp,reviewed_at:stamp}];
  api.membershipRequests = async () => structuredClone(requests);
  api.reviewMembership = async (id,status) => { requests=requests.map(r=>r.user_id===id?{...r,status,reviewed_at:new Date().toISOString()}:r); };
  api.scheduleMeetings = async events => { const next = events.map(e => ({ ...e, id: crypto.randomUUID(), ping: [], created_by: state.me!.user_id, created_at: new Date().toISOString() } as Meeting)); rows = [...rows, ...next]; return next; };
  api.updateMeeting = async (id, patch) => { rows = rows.map(m => m.id === id ? { ...m, ...patch } : m); };
  api.deleteMeeting = async id => { rows = rows.filter(m => m.id !== id); };
  api.setRsvp = async (id, response) => { rsvps = [...rsvps.filter(r => r.meeting_id !== id), { meeting_id: id, user_id: state.me!.user_id, response }]; };
  api.meetingDeliveries = async () => new URLSearchParams(location.search).has('deliveries') ? [
    {recipient_id:null,kind:'update',status:'sent',last_error:null},
    {recipient_id:'preview-1',kind:'reminder',status:'pending',last_error:null},
    {recipient_id:'preview-2',kind:'reminder',status:'failed',last_error:'This participant has direct messages turned off.'},
  ] : [];
  api.discord = async <T>() => ({ configured: true, guildId: '123456789012345679', meetingChannelId: '123456789012345678', announcementChannelId: '123456789012345677', remindersChannelId: '123456789012345676', channels: [{ id: '123456789012345678', name: 'SUITS voice room', type: 2 }, { id: '123456789012345677', name: 'announcements', type: 0 }, { id: '123456789012345676', name: 'reminders', type: 0 }, { id: '123456789012345675', name: 'ai-ml', type: 0 }] } as T);
  // These fixtures exercise the real layouts without writing to the team backend.
  api.updateProfile = async () => {};
  api.manageMember = async (id,role,subteam) => {state.members=state.members.map(m=>m.user_id===id?{...m,role,proposal_role:subteam}:m);};
  api.setRole = async () => {};
  api.setProposalRole = async () => {};
  api.removeMember = async () => {};
  let documents:TeamDocument[]=[{id:'sample-document',title:'Proposal guidelines',kind:'link',url:new URL(`${state.base}fy27-suits-proposal-guidelines%20(1).pdf`,location.origin).href,storage_path:null,mime:'application/pdf',size:null,role:'team',notes:'NASA proposal requirements',created_by:'preview-0',created_at:stamp,drive_file_id:null,drive_url:null,drive_status:'not_connected',drive_error:null}];
  api.documents=async()=>structuredClone(documents);
  api.updateDocument=async(id,patch)=>{documents=documents.map(d=>d.id===id?{...d,...patch}:d);};
  api.deleteDocument=async id=>{documents=documents.filter(d=>d.id!==id);};
  api.drive=async<T>(action:string)=>({configured:false,folder:null,serviceEmail:null,access:null,folders:{},imported:0,ok:action!=='setFolder'} as T);
  let applications: SuitsApplication[] = ['Morgan Brooks', 'Casey Nguyen'].map((full_name, i) => ({
    id: `sample-application-${i}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    full_name, email: `applicant-${i}@example.invalid`, discord_username: `sample_applicant_${i}`, status: i ? 'interview' : 'new',
    year: i ? 'Junior' : 'Sophomore', majors: 'Computer Science', minors: null, organizations: 'Example student project team',
    resume_path: null, portfolio_url: null, bring_to_table: 'I enjoy building accessible interfaces and testing them with a team.',
    why_join: 'I would like to contribute to astronaut tools and learn from the SUITS team.',
    teamwork_story: 'We divided the work, reviewed prototypes together, and improved the design after feedback.',
    team_environment: 'I share progress and ask for feedback early.', interest_areas: ['AI and Machine Learning', 'XR and Unity Development'],
    interest_other: null, hours_per_week: '5 to 7 hours', availability_changes: 'No expected changes.', required_dates: 'Yes',
    us_citizen_or_pr: 'Yes', interview_slots: ['2026-09-25 14:00'], anything_else: null, reviewer_notes: null,
  }));
  api.review = async <T>(action: string, params: Record<string, unknown> = {}): Promise<T> => {
    if (!canReviewApplications()) throw new Error('Only the team owner and advisor can review applications.');
    if (action === 'list') return { applications: structuredClone(applications) } as T;
    if (action === 'update') applications = applications.map(a => a.id === params.id ? { ...a, ...params } as SuitsApplication : a);
    else if (action === 'delete') applications = applications.filter(a => a.id !== params.id);
    else throw new Error('No real resumes are available in this design preview.');
    return { ok: true } as T;
  };
  document.querySelector<HTMLElement>('[data-nav="applications"]')!.hidden = !canReviewApplications();
  document.querySelector<HTMLElement>('[data-nav="access"]')!.hidden = !isLead();
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b => { b.disabled = false; });
  const { go, showMembershipGate } = await import('./index');
  const accessStatus = new URLSearchParams(location.search).get('access');
  if (accessStatus === 'pending' || accessStatus === 'rejected') {
    showMembershipGate({user_id:'preview-new',display_name:'Sample member',email:'sample@umd.edu',status:accessStatus,requested_at:stamp,reviewed_at:null},async()=>{},async()=>{location.assign('/suits/team/');});
    return;
  }
  document.getElementById('st-nav')!.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-nav]');
    if (button && !button.disabled) void go(button.dataset.nav!, false);
  });
  document.getElementById('st')!.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-go]');if(button){e.preventDefault();void go(button.dataset.go!,false);}});
  const returning=document.querySelector<HTMLAnchorElement>('.st-preview-note a');
  if(returning&&isAdvisor())returning.href=`${state.base}suits/preview/?returning=1&advisor=1&roster=full&loading=1`;
  cacheWorkspaceApi();
  const [documentView,reader]=await Promise.all([import('./documents'),import('./reader')]);
  await preloadWorkspace([documentView.warm(),reader.warm(),...(new URLSearchParams(location.search).has('loading')?[new Promise(resolve=>setTimeout(resolve,1800))]:[])]);
  await enterWorkspace(() => go(new URLSearchParams(location.search).get('view') || (isAdvisor()?'documents':'meetings'), false));
}
