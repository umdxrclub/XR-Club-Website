// Data layer for the SUITS team dashboard. Every call goes through Supabase
// with the signed in member's session, so the database rules decide what is
// allowed; this file just shapes the requests.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as client } from '../../lib/supabase';

export const db = client as unknown as SupabaseClient;

export type Role = 'member' | 'product_manager' | 'lead';

export interface Member {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
  discord_username: string | null;
  discord_id: string | null;
  discord_avatar: string | null;
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

export interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  agenda: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Rsvp {
  meeting_id: string;
  user_id: string;
  response: 'yes' | 'no' | 'maybe';
}

export interface Task {
  id: string;
  title: string;
  details: string | null;
  section: string;
  assignee_id: string | null;
  due_date: string | null;
  status: 'todo' | 'doing' | 'done';
  link: string | null;
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

export function isManager() {
  return state.me?.role === 'product_manager' || state.me?.role === 'lead';
}

export function isLead() {
  return state.me?.role === 'lead';
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
  // Roster
  async join(): Promise<Member> {
    return unwrap(await db.rpc('suits_join'));
  },
  async members(): Promise<Member[]> {
    return unwrap(await db.from('suits_team').select('*').order('created_at'));
  },
  async setRole(userId: string, role: Role) {
    unwrap(await db.rpc('suits_set_role', { target: userId, new_role: role }));
  },
  async updateProfile(patch: Partial<Pick<Member, 'display_name' | 'discord_username' | 'discord_id' | 'discord_avatar'>>) {
    unwrap(await db.from('suits_team').update(patch).eq('user_id', state.me!.user_id));
  },
  async removeMember(userId: string) {
    unwrap(await db.from('suits_team').delete().eq('user_id', userId));
  },

  // Roles
  async roleChoices(): Promise<RoleChoice[]> {
    return unwrap(await db.from('suits_role_choices').select('*'));
  },
  async saveRoleChoice(choice: Omit<RoleChoice, 'user_id' | 'updated_at'>) {
    unwrap(await db.from('suits_role_choices').upsert({ ...choice, user_id: state.me!.user_id, updated_at: new Date().toISOString() }));
  },

  // Availability
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
  async createMeeting(m: Pick<Meeting, 'title' | 'starts_at' | 'ends_at' | 'location' | 'agenda'>): Promise<Meeting> {
    return unwrap(await db.from('suits_meetings').insert({ ...m, created_by: state.me!.user_id }).select().single());
  },
  async updateMeeting(id: string, m: Partial<Meeting>) {
    unwrap(await db.from('suits_meetings').update(m).eq('id', id));
  },
  async deleteMeeting(id: string) {
    unwrap(await db.from('suits_meetings').delete().eq('id', id));
  },
  async rsvps(): Promise<Rsvp[]> {
    return unwrap(await db.from('suits_meeting_rsvps').select('meeting_id, user_id, response'));
  },
  async setRsvp(meetingId: string, response: Rsvp['response']) {
    unwrap(await db.from('suits_meeting_rsvps').upsert({ meeting_id: meetingId, user_id: state.me!.user_id, response, updated_at: new Date().toISOString() }));
  },

  // Tasks
  async tasks(): Promise<Task[]> {
    return unwrap(await db.from('suits_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('created_at'));
  },
  async createTask(t: Pick<Task, 'title' | 'details' | 'section' | 'assignee_id' | 'due_date' | 'link'>): Promise<Task> {
    return unwrap(await db.from('suits_tasks').insert({ ...t, created_by: state.me!.user_id }).select().single());
  },
  async updateTask(id: string, t: Partial<Task>) {
    unwrap(await db.from('suits_tasks').update({ ...t, updated_at: new Date().toISOString() }).eq('id', id));
  },
  async deleteTask(id: string) {
    unwrap(await db.from('suits_tasks').delete().eq('id', id));
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
    return callFunction<T>('suits-drive', action, params);
  },
};

async function callFunction<T>(name: string, action: string, params: Record<string, unknown>): Promise<T> {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Not signed in');
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
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
}
