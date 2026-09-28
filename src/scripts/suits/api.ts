// Data layer for the SUITS team dashboard. Every call goes through Supabase
// with the signed in member's session, so the database rules decide what is
// allowed; this file just shapes the requests.
import type { CalendarEvent } from '../../lib/suitsCalendar';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as client } from '../../lib/supabase';
import { workspaceData } from '../../lib/workspaceCache';

export const db = client as unknown as SupabaseClient;

export type Role = 'member' | 'product_manager' | 'lead';
export type WorkspaceLayout = 'scenic' | 'top' | 'dock' | 'right' | 'rail' | 'wide';

export interface Member {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  avatar_seed?: string | null;
  avatar_color?: string;
  avatar_set_at?: string | null;
  workspace_layout?: WorkspaceLayout | null;
  designation?: 'advisor' | null;
  role: Role;
  discord_username: string | null;
  discord_id: string | null;
  discord_avatar: string | null;
  proposal_role: string | null;
  created_at: string;
  last_seen: string;
}

export interface RoleChoice {
  user_id: string;
  first_choice: string;
  second_choice: string | null;
  third_choice: string | null;
  notes: string | null;
  updated_at: string;
}

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  days: string[];
  start_hour: number;
  end_hour: number;
  closed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Availability {
  poll_id: string;
  user_id: string;
  slots: string[];
  updated_at: string;
}

export interface AdvisorAvailability {
  id: string; advisor_id: string; starts_at: string; ends_at: string; created_at: string;
}

export interface Meeting extends CalendarEvent {
  announcement_channel_id?: string | null;
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  agenda: string | null;
  ping: string[] | null;
  created_by: string | null;
  created_at: string;
}

export interface CalendarOptions {
  configured: boolean; guildId: string | null; meetingChannelId: string | null;
  announcementChannelId?: string | null; remindersChannelId?: string | null;
  channels: { id: string; name: string; type: number }[];
}
export interface CalendarDelivery {
  recipient_id: string | null; kind: string; status: string; last_error: string | null;
}
export type MeetingInput = Pick<Meeting, 'title' | 'starts_at' | 'ends_at' | 'location' | 'agenda'> & Partial<Pick<Meeting, 'audience' | 'subteam' | 'attendee_ids' | 'timezone' | 'discord_channel_id' | 'announcement_channel_id' | 'reminder_minutes' | 'notify_discord'>>;

export interface Rsvp {
  meeting_id: string;
  user_id: string;
  response: 'yes' | 'no' | 'maybe';
}

export interface Task {
  responsibility_id?: string | null;
  id: string;
  title: string;
  details: string | null;
  section: string;
  assignee_id: string | null;
  due_date: string | null;
  status: 'todo' | 'doing' | 'done';
  link: string | null;
  ping: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  posted_to_discord: boolean;
}

export interface Link {
  id: string;
  title: string;
  url: string;
  note: string | null;
  position: number;
}

export interface TeamDocument {
  id: string;
  title: string;
  kind: 'file' | 'link';
  url: string | null;
  storage_path: string | null;
  mime: string | null;
  size: number | null;
  role: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  drive_file_id: string | null;
  drive_url: string | null;
  drive_status: 'pending' | 'synced' | 'skipped' | 'not_connected' | 'error';
  drive_error: string | null;
}

export interface ChecklistRow {
  item_key: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
}

export interface RoleDef {
  key: string;
  name: string;
  count: number;
}

export const state = {
  me: null as Member | null,
  members: [] as Member[],
  roles: [] as RoleDef[],
  base: '/',
};

export interface MembershipRequest {
  user_id: string; email: string; display_name: string;
  status: 'pending' | 'approved' | 'rejected'; requested_at: string; reviewed_at: string | null;
}
export interface WorkingRole {
  id: string; subteam: string; name: string; description: string; created_by: string | null;
}
export interface WorkingRoleAssignment { role_id: string; user_id: string; }
export function canManageSubteam(subteam: string) {
  return !!state.me && (isManager() || subteam === 'team' || subteam === state.me.proposal_role);
}

export function canManageMeeting(meeting: Pick<Meeting, 'created_by'>) {
  return !!state.me && (isManager() || meeting.created_by === state.me.user_id);
}

export function isManager() {
  return state.me?.role === 'product_manager' || state.me?.role === 'lead';
}

export function isAdvisor(member: Member | null = state.me) {
  return member?.designation === 'advisor';
}

export function isLead() {
  return state.me?.role === 'lead' && (state.me.email.toLowerCase() === 'kcyle@terpmail.umd.edu' || isAdvisor());
}

// Navigation only; the review service and database independently verify Auth identity.
export function canReviewApplications() {
  return state.me?.email.toLowerCase() === 'kcyle@terpmail.umd.edu' || isAdvisor();
}

export function memberName(id: string | null | undefined) {
  if (!id) return 'Unassigned';
  return state.members.find(m => m.user_id === id)?.display_name ?? 'Former member';
}

export function member(id: string | null | undefined) {
  return state.members.find(m => m.user_id === id) ?? null;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const api = {
  async review<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    return callFunction<T>('suits-review', action, params);
  },
  // Roster
  async join(): Promise<Member | null> {
    return unwrap(await db.rpc('suits_join'));
  },
  async membership(): Promise<MembershipRequest | null> {
    const { data: { user }, error } = await db.auth.getUser();
    if (error) throw new Error(error.message);
    if (!user) return null;
    return unwrap(await db.from('suits_membership_requests').select('*').eq('user_id', user.id).maybeSingle());
  },
  async membershipRequests(): Promise<MembershipRequest[]> {
    return unwrap(await db.from('suits_membership_requests').select('*').order('requested_at', { ascending: false }));
  },
  async reviewMembership(userId: string, decision: 'approved' | 'rejected', subteam: string | null = null) {
    unwrap(await db.rpc('suits_review_membership', { target: userId, decision, subteam }));
  },
  async workingRoles(): Promise<WorkingRole[]> {
    return unwrap(await db.from('suits_subteam_roles').select('*').order('name'));
  },
  async workingRoleAssignments(): Promise<WorkingRoleAssignment[]> {
    return unwrap(await db.from('suits_subteam_role_members').select('role_id,user_id'));
  },
  async saveWorkingRole(id: string | null, role: Pick<WorkingRole, 'name' | 'subteam' | 'description'>) {
    if (id) unwrap(await db.from('suits_subteam_roles').update(role).eq('id', id).select('id').single());
    else unwrap(await db.from('suits_subteam_roles').insert({ ...role, created_by: state.me!.user_id }).select('id').single());
  },
  async assignWorkingRole(roleId: string, people: string[]) {
    unwrap(await db.rpc('suits_assign_working_role', { target_role: roleId, people }));
  },
  async deleteWorkingRole(id: string) {
    unwrap(await db.from('suits_subteam_roles').delete().eq('id', id).select('id').single());
  },
  async members(): Promise<Member[]> {
    return unwrap(await db.from('suits_team').select('*').order('created_at'));
  },
  async manageMember(userId: string, role: Role, subteam: string | null) {
    unwrap(await db.rpc('suits_manage_member', { target:userId,new_role:role,new_subteam:subteam }));
  },
  async setRole(userId: string, role: Role) {
    unwrap(await db.rpc('suits_set_role', { target: userId, new_role: role }));
  },
  async saveAvatar(seed: string, color: string): Promise<Member> {
    return unwrap(await db.rpc('suits_save_avatar', { seed, color }));
  },
  async saveLayout(layout: WorkspaceLayout): Promise<Member> {
    return unwrap(await db.rpc('suits_save_layout', { layout }));
  },
  async updateProfile(patch: Partial<Pick<Member, 'display_name' | 'discord_username'>>) {
    unwrap(await db.from('suits_team').update(patch).eq('user_id', state.me!.user_id));
  },
  /** Only the verified team owner can change subteam assignments. */
  async setProposalRole(userId: string, proposalRole: string | null) {
    unwrap(await db.from('suits_team').update({ proposal_role: proposalRole }).eq('user_id', userId));
  },
  async removeMember(userId: string) {
    await api.reviewMembership(userId, 'rejected');
  },

  // Roles
  async roleChoices(): Promise<RoleChoice[]> {
    return unwrap(await db.from('suits_role_choices').select('*'));
  },
  async saveRoleChoice(choice: Omit<RoleChoice, 'user_id' | 'updated_at'>) {
    unwrap(await db.from('suits_role_choices').upsert({ ...choice, user_id: state.me!.user_id, updated_at: new Date().toISOString() }));
  },

  // Availability
  async advisorAvailability(): Promise<AdvisorAvailability[]> {
    return unwrap(await db.from('suits_advisor_availability').select('*').gte('ends_at', new Date().toISOString()).order('starts_at'));
  },
  async saveAdvisorAvailability(id: string | null, starts: string, ends: string): Promise<AdvisorAvailability> {
    return unwrap(await db.rpc('suits_save_advisor_availability', { target: id, starts, ends }));
  },
  async deleteAdvisorAvailability(id: string) {
    unwrap(await db.from('suits_advisor_availability').delete().eq('id', id).select('id').single());
  },
  async polls(): Promise<Poll[]> {
    return unwrap(await db.from('suits_polls').select('*').order('created_at', { ascending: false }));
  },
  async createPoll(poll: Pick<Poll, 'title' | 'description' | 'days' | 'start_hour' | 'end_hour'>): Promise<Poll> {
    return unwrap(await db.from('suits_polls').insert({ ...poll, created_by: state.me!.user_id }).select().single());
  },
  async setPollClosed(id: string, closed: boolean) {
    unwrap(await db.from('suits_polls').update({ closed }).eq('id', id));
  },
  async deletePoll(id: string) {
    unwrap(await db.from('suits_polls').delete().eq('id', id));
  },
  async availability(pollId: string): Promise<Availability[]> {
    return unwrap(await db.from('suits_poll_availability').select('*').eq('poll_id', pollId));
  },
  async saveAvailability(pollId: string, slots: string[]) {
    unwrap(await db.from('suits_poll_availability').upsert({ poll_id: pollId, user_id: state.me!.user_id, slots, updated_at: new Date().toISOString() }));
  },

  // Meetings
  async meetings(): Promise<Meeting[]> {
    return unwrap(await db.from('suits_meetings').select('*').order('starts_at'));
  },
  async scheduleMeetings(events: MeetingInput[]): Promise<Meeting[]> {
    const rows = unwrap<Meeting[]>(await db.rpc('suits_schedule_meetings', { events }));
    if (isManager()) void callFunction('suits-discord', 'calendar-dispatch', {}).catch(() => {});
    return rows;
  },
  async createMeeting(m: MeetingInput): Promise<Meeting> {
    return (await api.scheduleMeetings([m]))[0];
  },
  async updateMeeting(id: string, m: Partial<Meeting>) {
    unwrap(await db.from('suits_meetings').update(m).eq('id', id).select('id').single());
    if (isManager()) void callFunction('suits-discord', 'calendar-dispatch', {}).catch(() => {});
  },
  async deleteMeeting(id: string, _snapshot?: Meeting) {
    unwrap(await db.from('suits_meetings').delete().eq('id', id).select('id').single());
    if (isManager()) void callFunction('suits-discord', 'calendar-dispatch', {}).catch(() => {});
  },
  async meetingDeliveries(id: string): Promise<CalendarDelivery[]> {
    return unwrap(await db.from('suits_calendar_notifications').select('recipient_id, kind, status, last_error').eq('meeting_id', id).neq('status', 'cancelled').order('due_at'));
  },
  async rsvps(): Promise<Rsvp[]> {
    return unwrap(await db.from('suits_meeting_rsvps').select('meeting_id, user_id, response'));
  },
  async setRsvp(meetingId: string, response: Rsvp['response']) {
    unwrap(await db.from('suits_meeting_rsvps').upsert({ meeting_id: meetingId, user_id: state.me!.user_id, response, updated_at: new Date().toISOString() }));
    // The calendar and Discord worker read the persisted reply directly.
  },

  // Tasks
  async tasks(): Promise<Task[]> {
    return unwrap(await db.from('suits_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('created_at'));
  },
  async createTask(t: Pick<Task, 'title' | 'details' | 'section' | 'assignee_id' | 'due_date' | 'link'> & Pick<Partial<Task>, 'responsibility_id'>): Promise<Task> {
    const row = unwrap<Task>(await db.from('suits_tasks').insert({ ...t, created_by: state.me!.user_id }).select().single());
    notify('task', row.id, 'created');
    return row;
  },
  async updateTask(id: string, t: Partial<Task>, before?: Task) {
    unwrap(await db.from('suits_tasks').update({ ...t, updated_at: new Date().toISOString() }).eq('id', id));
    const event = t.status === 'done' && before?.status !== 'done' ? 'completed'
      : t.status === 'doing' && before?.status !== 'doing' ? 'started'
      : 'assignee_id' in t && t.assignee_id && t.assignee_id !== before?.assignee_id ? 'assigned'
      : 'updated';
    notify('task', id, event);
  },
  async deleteTask(id: string, snapshot?: Task) {
    unwrap(await db.from('suits_tasks').delete().eq('id', id));
    notify('task', id, 'deleted', snapshot);
  },

  // Announcements
  async announcements(): Promise<Announcement[]> {
    return unwrap(await db.from('suits_announcements').select('*').order('created_at', { ascending: false }));
  },
  async createAnnouncement(body: string, postedToDiscord: boolean): Promise<Announcement> {
    return unwrap(await db.from('suits_announcements').insert({ body, created_by: state.me!.user_id, posted_to_discord: postedToDiscord }).select().single());
  },
  async deleteAnnouncement(id: string) {
    unwrap(await db.from('suits_announcements').delete().eq('id', id));
  },

  // Links
  async links(): Promise<Link[]> {
    return unwrap(await db.from('suits_links').select('*').order('position').order('created_at'));
  },
  async createLink(l: Pick<Link, 'title' | 'url' | 'note'>) {
    unwrap(await db.from('suits_links').insert({ ...l, created_by: state.me!.user_id }));
  },
  async deleteLink(id: string) {
    unwrap(await db.from('suits_links').delete().eq('id', id));
  },

  // Team documents
  async documents(): Promise<TeamDocument[]> {
    return unwrap(await db.from('suits_documents').select('*').order('created_at', { ascending: false }));
  },
  async createDocument(d: Pick<TeamDocument, 'title' | 'kind' | 'url' | 'storage_path' | 'mime' | 'size' | 'role' | 'notes'>): Promise<TeamDocument> {
    return unwrap(await db.from('suits_documents').insert({ ...d, created_by: state.me!.user_id }).select().single());
  },
  async updateDocument(id: string, patch: Partial<Pick<TeamDocument, 'title' | 'role' | 'notes'>>) {
    unwrap(await db.from('suits_documents').update(patch).eq('id', id));
  },
  async deleteDocument(id: string, snapshot?: TeamDocument) {
    notify('document', id, 'deleted', snapshot);
    unwrap(await db.from('suits_documents').delete().eq('id', id));
  },

  // Checklist
  async checklist(): Promise<ChecklistRow[]> {
    return unwrap(await db.from('suits_checklist').select('*'));
  },
  async setChecklist(itemKey: string, done: boolean) {
    unwrap(await db.from('suits_checklist').upsert({ item_key: itemKey, done, done_by: done ? state.me!.user_id : null, done_at: done ? new Date().toISOString() : null }));
  },

  // Edge Function bridges. Errors come back as thrown Errors with the server's message.
  async discord<T = Record<string, unknown>>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    return callFunction<T>('suits-discord', action, params);
  },
  async drive<T = Record<string, unknown>>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const result=await callFunction<T>('suits-drive', action, params);
    if(['pull','sync','update','remove'].includes(action))workspaceData.invalidate('documents');
    return result;
  },
};

const cachedMethods=new WeakSet<Function>();
/** Also wraps the explicitly local fixtures so previews use the same loading behavior. */
export function cacheWorkspaceApi(){
 const reads=['members','tasks','workingRoles','workingRoleAssignments','meetings','rsvps','documents','membershipRequests','advisorAvailability'] as const;
 for(const name of reads){
  const original=api[name];if(cachedMethods.has(original))continue;
  const cached=()=>workspaceData.read<unknown>(state.me?.user_id||null,name,original);
  cachedMethods.add(cached);Object.assign(api,{[name]:cached});
 }
 if(!cachedMethods.has(api.review)){
  const original=api.review;
  const cached:typeof api.review=async<T>(action:string,params:Record<string,unknown>={})=>{
   if(action==='list'){
    if(!canReviewApplications())throw new Error('Only the team owner can review applications.');
    return workspaceData.read(state.me?.user_id||null,'applications',()=>original<T>(action,params));
   }
   const result=await original<T>(action,params);
   if(action==='update'||action==='delete')workspaceData.invalidate('applications');
   return result;
  };
  cachedMethods.add(cached);api.review=cached;
 }
 const changes={
  saveAdvisorAvailability:['advisorAvailability'],deleteAdvisorAvailability:['advisorAvailability'],
  reviewMembership:['membershipRequests','members','tasks','workingRoles','workingRoleAssignments'],
  manageMember:['members','tasks','workingRoleAssignments'],setRole:['members'],setProposalRole:['members','workingRoleAssignments'],
  saveAvatar:['members'],saveLayout:['members'],updateProfile:['members'],removeMember:['members','membershipRequests'],
  createTask:['tasks'],updateTask:['tasks'],deleteTask:['tasks'],
  saveWorkingRole:['workingRoles'],assignWorkingRole:['workingRoleAssignments'],deleteWorkingRole:['workingRoles','workingRoleAssignments','tasks'],
  scheduleMeetings:['meetings','rsvps'],updateMeeting:['meetings'],deleteMeeting:['meetings','rsvps'],setRsvp:['rsvps'],
  createDocument:['documents'],updateDocument:['documents'],deleteDocument:['documents'],
 } as const;
 for(const name of Object.keys(changes) as Array<keyof typeof changes>){
  const original=api[name] as (...args:never[])=>Promise<unknown>;if(cachedMethods.has(original))continue;
  const wrapped=async(...args:never[])=>{const result=await original(...args);workspaceData.invalidate(...changes[name]);return result;};
  cachedMethods.add(wrapped);Object.assign(api,{[name]:wrapped});
 }
}
cacheWorkspaceApi();

/** Tell the Discord bot. Never blocks the dashboard and never surfaces an error. */
function notify(kind: 'task' | 'meeting' | 'document', id: string, event: string, snapshot?: unknown) {
  void callFunction('suits-discord', 'announce', { kind, id, event, snapshot }).catch(() => { /* the bot may not be set up */ });
}

async function callFunction<T>(name: string, action: string, params: Record<string, unknown>): Promise<T> {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('You are signed out. Sign in again.');
    const res = await fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}). Try again.`);
    return data as T;
}
