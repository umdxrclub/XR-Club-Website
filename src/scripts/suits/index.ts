// Boot for /suits/team: sign in with Google, confirm a UMD account, join the
// roster, then hand off to the section views.
import type { User } from '@supabase/supabase-js';
import { db, api, state, isManager } from './api';
import { esc, toast, roleLabel } from './ui';
import * as overview from './overview';
import * as proposal from './checklist';
import * as roles from './roles';
import * as availability from './availability';
import * as meetings from './meetings';
import * as tasks from './tasks';
import * as announcements from './announcements';
import * as chat from './chat';
import * as documents from './documents';
import * as drive from './drive';
import * as team from './team';

const TEAM_EMAIL = /@(terpmail\.)?umd\.edu$/i;
const THEME_KEY = 'xr-suits-theme';

interface View {
  render: (host: HTMLElement) => Promise<void> | void;
  leave?: () => void;
}

const VIEWS: Record<string, View> = {
  overview: { render: h => overview.render(h) },
  mission: { render: () => {} },
  proposal: { render: () => proposal.render() },
  roles: { render: h => roles.render(h) },
  availability: { render: h => availability.render(h) },
  meetings: { render: h => meetings.render(h) },
  tasks: { render: h => tasks.render(h) },
  announcements: { render: h => announcements.render(h) },
  chat: { render: h => chat.render(h), leave: () => chat.stop() },
  drive: { render: h => drive.render(h) },
  documents: { render: h => documents.render(h) },
  team: { render: h => team.render(h) },
  guide: { render: () => {} },
};

let current = '';
let authorizing = false;

export async function boot() {
  const root = document.getElementById('st')!;
  state.base = root.dataset.base || '/';
  state.roles = JSON.parse(root.dataset.roles || '[]');

  // Night mode, shared with the application page
  const themeBtn = document.getElementById('st-theme')!;
  const applyTheme = (dark: boolean) => {
    root.classList.toggle('is-dark', dark);
    document.querySelector('.st-bg')?.classList.toggle('is-dark', dark);
    themeBtn.textContent = dark ? 'Day mode' : 'Night mode';
  };
  let dark = false;
  try { dark = localStorage.getItem(THEME_KEY) === 'dark'; } catch { /* ignore */ }
  applyTheme(dark);
  themeBtn.addEventListener('click', () => {
    dark = !dark;
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
    applyTheme(dark);
  });

  // Sign in. With a Google client id the page uses Google's own button and hands
  // the id token to Supabase, so Google's screen names xr.umd.edu. Without one it
  // falls back to the Supabase redirect flow.
  void setupGoogleButton();
  document.getElementById('st-google')!.addEventListener('click', async () => {
    const btn = document.getElementById('st-google') as HTMLButtonElement;
    btn.disabled = true;
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}${state.base}suits/team`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) { showGateError(`Google sign in did not start: ${error.message}`); btn.disabled = false; }
  });

  document.getElementById('st-signout')!.addEventListener('click', async () => {
    await db.auth.signOut();
    location.href = `${state.base}suits/team`;
  });

  // Navigation
  document.getElementById('st-nav')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (btn) go(btn.dataset.nav!);
  });
  root.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
    if (btn) { e.preventDefault(); go(btn.dataset.go!); }
  });
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (v && VIEWS[v] && v !== current) go(v, false);
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && !state.me) void authorize(session.user);
    if (event === 'SIGNED_OUT') { state.me = null; showGate(); }
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) void authorize(session.user);
  else showGate();
}

interface GoogleId {
  accounts: {
    id: {
      initialize(config: Record<string, unknown>): void;
      renderButton(el: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

async function setupGoogleButton() {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID as string | undefined;
  const host = document.getElementById('st-google-host');
  if (!clientId || !host) return;
  try {
    await new Promise<void>((resolve, reject) => {
      if ((window as unknown as { google?: GoogleId }).google?.accounts) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google sign in did not load'));
      document.head.appendChild(s);
    });
    const google = (window as unknown as { google: GoogleId }).google;

    // Supabase checks the token's nonce against the raw value; Google wants the hash.
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

    google.accounts.id.initialize({
      client_id: clientId,
      nonce: hashed,
      ux_mode: 'popup',
      itp_support: true,
      use_fedcm_for_prompt: true,
      callback: async (resp: { credential: string }) => {
        document.getElementById('st-gate-error')!.hidden = true;
        const { error } = await db.auth.signInWithIdToken({ provider: 'google', token: resp.credential, nonce: raw });
        if (error) showGateError(`Google sign in failed: ${error.message}`);
      },
    });
    google.accounts.id.renderButton(host, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.min(360, host.parentElement!.clientWidth - 8) });
    googleButtonReady = true;
    setSignInVisible(!document.getElementById('st-gate')!.hidden && document.getElementById('st-gate-steps')!.hidden);
  } catch {
    // Fallback button stays
  }
}

let googleButtonReady = false;

/** Show whichever sign in control is in use, or hide both while authorizing. */
function setSignInVisible(visible: boolean) {
  const host = document.getElementById('st-google-host');
  const fallback = document.getElementById('st-google') as HTMLButtonElement;
  if (host) host.hidden = !(visible && googleButtonReady);
  fallback.hidden = !(visible && !googleButtonReady);
  fallback.disabled = false;
}

function showGate(message?: string) {
  document.getElementById('st-app')!.hidden = true;
  document.getElementById('st-gate')!.hidden = false;
  document.getElementById('st-gate-steps')!.hidden = true;
  setSignInVisible(true);
  if (message) showGateError(message);
}

function showGateError(message: string) {
  const el = document.getElementById('st-gate-error')!;
  el.textContent = message;
  el.hidden = false;
}

function step(name: string, status: 'active' | 'done') {
  const li = document.querySelector<HTMLElement>(`.st-gate__step[data-step="${name}"]`)!;
  li.classList.remove('is-active', 'is-done');
  li.classList.add(status === 'active' ? 'is-active' : 'is-done');
}

async function authorize(user: User) {
  if (authorizing) return;
  authorizing = true;
  const steps = document.getElementById('st-gate-steps')!;
  steps.hidden = false;
  setSignInVisible(false);
  document.getElementById('st-gate-error')!.hidden = true;
  document.getElementById('st-gate-text')!.textContent = 'One moment.';
  steps.querySelectorAll('.st-gate__step').forEach(s => s.classList.remove('is-active', 'is-done'));

  try {
    step('account', 'active');
    await pause(250);
    step('account', 'done');

    step('domain', 'active');
    const email = user.email || '';
    if (!TEAM_EMAIL.test(email)) {
      await db.auth.signOut();
      authorizing = false;
      showGate(`${email || 'That account'} is not a UMD account. Sign in with your umd.edu or terpmail.umd.edu Google account.`);
      document.getElementById('st-gate-text')!.textContent = 'Sign in with your UMD account.';
      return;
    }
    await pause(250);
    step('domain', 'done');

    step('roster', 'active');
    state.me = await api.join();
    state.members = await api.members();
    await syncDiscordIdentity(user);
    step('roster', 'done');

    step('data', 'active');
    await refreshBadges();
    step('data', 'done');
    await pause(300);

    document.getElementById('st-gate')!.hidden = true;
    document.getElementById('st-app')!.hidden = false;
    document.getElementById('st-whoami')!.innerHTML = `${esc(state.me.display_name)} · ${esc(roleLabel(state.me.role))}`;
    document.querySelectorAll<HTMLElement>('[data-managers]').forEach(el => { el.hidden = !isManager(); });

    const initial = location.hash.slice(1);
    go(initial && VIEWS[initial] ? initial : 'overview', false);
  } catch (err) {
    authorizing = false;
    showGate(`Could not open the dashboard: ${(err as Error).message}`);
  }
}

/** If the member connected Discord, keep their Discord name and avatar on the roster. */
async function syncDiscordIdentity(user: User) {
  const identity = user.identities?.find(i => i.provider === 'discord');
  if (!identity || !state.me) return;
  const data = (identity.identity_data || {}) as Record<string, string | undefined>;
  const id = identity.identity_id || data.provider_id || data.sub;
  const username = data.custom_claims && (data.custom_claims as unknown as Record<string, string>).global_name || data.full_name || data.name || data.user_name;
  const avatar = data.avatar_url || data.picture;
  if (id && (state.me.discord_id !== id || state.me.discord_username !== username || state.me.discord_avatar !== avatar)) {
    await api.updateProfile({ discord_id: id, discord_username: username || null, discord_avatar: avatar || null });
    state.me = { ...state.me, discord_id: id, discord_username: username || null, discord_avatar: avatar || null };
    state.members = await api.members();
  }
}

export async function go(view: string, pushHash = true) {
  if (!VIEWS[view]) view = 'overview';
  if (view === 'guide' && !isManager()) view = 'overview';
  if (current && VIEWS[current].leave) VIEWS[current].leave!();
  current = view;
  document.querySelectorAll<HTMLElement>('.st-nav__btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === view));
  document.querySelectorAll<HTMLElement>('.st-view').forEach(v => { v.hidden = v.dataset.view !== view; });
  if (pushHash && location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  const host = document.querySelector<HTMLElement>(`.st-view[data-view="${view}"] > div`) || document.querySelector<HTMLElement>(`.st-view[data-view="${view}"]`)!;
  window.scrollTo({ top: 0 });
  try {
    await VIEWS[view].render(host);
  } catch (err) {
    toast((err as Error).message, 'danger');
  }
}

/** Counts on the nav: your open tasks, upcoming meetings. */
export async function refreshBadges() {
  try {
    const [allTasks, allMeetings] = await Promise.all([api.tasks(), api.meetings()]);
    const mine = allTasks.filter(t => t.assignee_id === state.me?.user_id && t.status !== 'done').length;
    const upcoming = allMeetings.filter(m => new Date(m.ends_at).getTime() > Date.now()).length;
    setBadge('tasks', mine);
    setBadge('meetings', upcoming);
  } catch { /* badges are decoration */ }
}

function setBadge(view: string, n: number) {
  const btn = document.querySelector<HTMLElement>(`.st-nav__btn[data-nav="${view}"]`);
  if (!btn) return;
  btn.querySelector('.st-nav__count')?.remove();
  if (n > 0) btn.insertAdjacentHTML('beforeend', `<span class="st-nav__count">${n}</span>`);
}

function pause(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
