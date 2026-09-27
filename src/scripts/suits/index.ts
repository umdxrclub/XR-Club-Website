// Boot for /suits/team: sign in with Google, confirm a UMD account, join the
// roster, then hand off to the section views.
import type { User } from '@supabase/supabase-js';
import { googleCallbackError, prepareGoogleReturn } from '../../lib/oauthRedirect';
import { db, api, state, isManager, canReviewApplications } from './api';
import { toast } from './ui';
import { navigate } from 'astro:transitions/client';
import { setupWorkspace, enterWorkspace } from './workspace';
import { stopSky } from './sky';
import * as overview from './overview';
import * as reader from './reader';
import * as tasks from './tasks';
import * as meetings from './meetings';
import * as documents from './documents';
import * as team from './team';
import * as applications from './applications';

const TEAM_EMAIL = /@(terpmail\.)?umd\.edu$/i;
const THEME_KEY = 'xr-suits-theme';
let googleButtonReady = false;

interface View {
  render: (host: HTMLElement) => Promise<void> | void;
  leave?: () => void;
}

const VIEWS: Record<string, View> = {
  overview: { render: h => overview.render(h) },
  proposal: { render: h => reader.render(h), leave: () => reader.leave() },
  tasks: { render: h => tasks.render(h) },
  meetings: { render: h => meetings.render(h), leave: () => meetings.leave() },
  documents: { render: h => documents.render(h) },
  team: { render: h => team.render(h), leave: () => team.leave() },
  applications: { render: h => applications.render(h), leave: () => applications.leave() },
};

let current = '';
let authorizing = false;
let bootAbort: AbortController | null = null;
let authSubscription: { unsubscribe(): void } | null = null;
let pageVersion = 0;
document.addEventListener('astro:before-swap', () => {
  stopSky();
  pageVersion++; bootAbort?.abort(); authSubscription?.unsubscribe(); authSubscription=null;
  reader.leave(); meetings.leave(); team.leave(); applications.leave(); current=''; authorizing=false; state.me=null;
});

export async function boot() {
  const root = document.getElementById('st')!;
  if(root.dataset.booted)return;root.dataset.booted='true';
  bootAbort?.abort();bootAbort=new AbortController();
  const signal=bootAbort.signal;authorizing=false;current='';googleButtonReady=false;
  setupWorkspace();
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

  if (import.meta.env.DEV && root.dataset.preview === 'true') {
    const { bootPreview } = await import('./calendarPreview');
    await bootPreview();
    return;
  }
  // Keep the original branded Google popup on its registered UMD origin.
  // Unregistered local preview origins use the working Supabase redirect.
  if (root.dataset.mode !== 'workspace') void setupGoogleButton();
  document.getElementById('st-google')!.addEventListener('click', async () => {
    const btn = document.getElementById('st-google') as HTMLButtonElement;
    const label = btn.querySelector('span')!;
    btn.disabled = true;
    label.textContent = 'Opening Google…';
    document.getElementById('st-gate-error')!.hidden = true;
    try {
      let returnStorage: Storage | null = null;
      try { returnStorage = window.sessionStorage; } catch { /* Use the team overview if storage is disabled. */ }
      const { data, error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: prepareGoogleReturn(location.pathname + location.search, location.origin, state.base, returnStorage),
          queryParams: { prompt: 'select_account' },
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google did not return a sign-in address. Please try again.');
      location.assign(data.url);
    } catch (err) {
      showGateError(`Google sign-in did not start: ${err instanceof Error ? err.message : 'Please try again.'}`);
      btn.disabled = false;
      label.textContent = 'Continue with Google';
    }
  });
  document.getElementById('st-signout')!.addEventListener('click', async () => {
    authSubscription?.unsubscribe();authSubscription=null;
    applications.leave();
    await db.auth.signOut();
    await navigate(`${state.base}suits/team/`);
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
  window.addEventListener('popstate', () => {
    const v = viewFromLocation();
    if (v !== current) go(v, false);
  }, { signal });

  authSubscription = db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && !state.me) void authorize(session.user);
    if (event === 'SIGNED_OUT') { state.me = null; applications.leave(); meetings.leave(); showGate(); }
  }).data.subscription;

  try {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;
    if (session) void authorize(session.user);
    else showGate(googleCallbackError(location.search, location.hash) || undefined);
  } catch (err) {
    showGate(`Could not restore your sign-in: ${err instanceof Error ? err.message : 'Please try again.'}`);
  }
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
  if (!clientId || !host || location.hostname !== 'xr.umd.edu') return;
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
    setSignInVisible(!document.getElementById('st-gate')!.hidden && !authorizing);
  } catch {
    // Fallback button stays
  }
}


/** Keep the sign-in control available until authentication actually starts. */
function setSignInVisible(visible: boolean) {
  const button = document.getElementById('st-google') as HTMLButtonElement;
  const host = document.getElementById('st-google-host');
  if (host) host.hidden = !(visible && googleButtonReady);
  button.hidden = !(visible && !googleButtonReady);
  button.disabled = false;
  button.querySelector('span')!.textContent = 'Continue with Google';
}
function showGate(message?: string) {
  if (document.getElementById('st')?.dataset.mode === 'workspace') {
    void navigate(`${state.base}suits/team/?view=${encodeURIComponent(viewFromLocation())}`, { history: 'replace' });
    return;
  }
  document.getElementById('st-app')!.hidden = true;
  document.getElementById('st-gate')!.hidden = false;
  setSignInVisible(true);
  if (message) showGateError(message);
}

function showGateError(message: string) {
  const el = document.getElementById('st-gate-error')!;
  el.textContent = message;
  el.hidden = false;
}

async function authorize(user: User) {
  if (authorizing) return;
  authorizing = true;
  const version=pageVersion;
  setSignInVisible(false);
  document.getElementById('st-gate-error')!.hidden = true;
  document.getElementById('st-gate-text')!.textContent = 'One moment.';

  try {
    const email = user.email || '';
    if (!TEAM_EMAIL.test(email)) {
      await db.auth.signOut();
      authorizing = false;
      showGate(`${email || 'That account'} is not a UMD account. Sign in with your umd.edu or terpmail.umd.edu Google account.`);
      document.getElementById('st-gate-text')!.textContent = 'Sign in with your UMD account.';
      return;
    }

    const joined=await api.join();
    if(version!==pageVersion)return;
    state.me = joined;
    if (document.getElementById('st')?.dataset.mode !== 'workspace') {
      const initial = viewFromLocation();
      await navigate(`${state.base}suits/workspace/${initial === 'meetings' ? '' : initial + '/'}`, { history: 'replace' });
      return;
    }
    state.members = await api.members();
    if(version!==pageVersion)return;
    await refreshBadges();
    if(version!==pageVersion)return;


    document.querySelectorAll<HTMLElement>('[data-managers]').forEach(el => { el.hidden = !isManager(); });
    document.querySelector<HTMLElement>('[data-nav="applications"]')!.hidden = !canReviewApplications();

    documents.warm();
    const initial = viewFromLocation();
    if (location.hash) history.replaceState(null, '', pathFor(initial));
    await enterWorkspace(() => go(initial, false));
  } catch (err) {
    if(version!==pageVersion)return;
    state.me = null;
    authorizing = false;
    showGate(`Could not open the dashboard: ${(err as Error).message}`);
  }
}

/** Each section has a plain address: /suits/team/ for the overview, /suits/team/documents/ and so on. */
function pathFor(view: string) {
  return `${state.base}suits/workspace/${view === 'meetings' ? '' : view + '/'}`;
}

function viewFromLocation() {
  if (location.pathname.replace(/\/$/, '') === `${state.base}suits/dashboard`) return 'applications';
  const prefix = `${state.base}suits/${location.pathname.includes('/suits/workspace') ? 'workspace' : 'team'}`;
  let rest = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
  rest = rest.replace(/^\/+|\/+$/g, '');
  if (!rest && location.hash && VIEWS[location.hash.slice(1)]) rest = location.hash.slice(1); // older links
  const requested = new URLSearchParams(location.search).get('view') || '';
  return VIEWS[rest] ? rest : VIEWS[requested] ? requested : 'meetings';
}

export async function go(view: string, push = true) {
  if (!VIEWS[view]) view = 'meetings';
  if (current && VIEWS[current].leave) VIEWS[current].leave!();
  current = view;
  document.querySelectorAll<HTMLElement>('.st-nav__btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === view));
  document.querySelectorAll<HTMLElement>('.st-view').forEach(v => { v.hidden = v.dataset.view !== view; });
  if (push && document.getElementById('st')?.dataset.preview !== 'true' && location.pathname !== pathFor(view)) history.replaceState({ ...(history.state || {}), view }, '', pathFor(view));
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
