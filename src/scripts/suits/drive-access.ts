import { api, state } from './api';
import { toast } from './ui';

export interface DriveStatus {
  configured: boolean;
  serviceEmail: string | null;
  folder: { id: string; name: string; url: string } | null;
  access: 'already' | 'granted' | null;
  accessError?: string | null;
  folders?: Record<string, { id: string; url: string }>;
  canShare?: boolean | null;
  setupRequired?: boolean;
}

let generation = 0;
let pending: { account: string; request: Promise<DriveStatus> } | null = null;
let confirmed: { account: string; status: DriveStatus; until: number } | null = null;
const accountKey = () => state.me ? `${state.me.user_id}:${state.me.email.toLowerCase()}` : '';
const hasAccess = (status: DriveStatus) => status.configured && !!status.folder && !status.accessError && ['already', 'granted'].includes(status.access || '');

export function resetDriveAccess() { generation++; pending = null; confirmed = null; }

function readyStatus() {
  return confirmed?.account === accountKey() && confirmed.until > Date.now() ? confirmed.status : null;
}

/** Reuse only successful server confirmation for this account, never saved metadata. */
export function getDriveStatus(force = false): Promise<DriveStatus> {
  const account = accountKey(), version = generation;
  if (!account) return Promise.reject(new Error('Sign in to the SUITS dashboard first.'));
  const hit = !force && readyStatus();
  if (hit) return Promise.resolve(hit);
  if (force) confirmed = null;
  if (pending?.account === account) return pending.request;
  const request = api.drive<DriveStatus>('status').then(status => {
    if (version !== generation || accountKey() !== account) throw new Error('Your account changed. Open Drive again.');
    confirmed = hasAccess(status) ? { account, status, until: Date.now() + 5 * 60 * 1000 } : null;
    return status;
  }).finally(() => { if (pending?.request === request) pending = null; });
  pending = { account, request };
  return request;
}

export async function prepareDriveAccess() {
  const status = await getDriveStatus();
  if (!status.configured || !status.folder) throw new Error('The team Drive folder is not connected yet.');
  if (status.accessError || !['already', 'granted'].includes(status.access || '')) {
    throw new Error('Drive access could not be granted. ' + (status.accessError || 'Please try again.'));
  }
  return status;
}

export function isGoogleDriveUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname); }
  catch { return false; }
}

/** Keep the permanent resource link, using the same Google account as SUITS. */
export function driveAccountUrl(value: string) {
  if (!isGoogleDriveUrl(value) || !state.me?.email) return value;
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/u\/\d+(?=\/|$)/, '');
  url.searchParams.set('authuser', state.me.email.toLowerCase());
  return url.href;
}

export async function openTeamDrive(url: string) {
  if (!isGoogleDriveUrl(url)) return;
  // Reserve the tab during the click so the awaited sharing check is not
  // blocked as a popup. No Drive page opens until access is confirmed.
  const tab = window.open('', '_blank');
  if (!tab) { toast('Allow popups for this site, then open Drive again.', 'danger'); return; }
  tab.opener = null;
  if (readyStatus()) { tab.location.replace(driveAccountUrl(url)); return; }
  tab.document.title = 'Opening Drive';
  tab.document.body.textContent = 'Opening your team Drive…';
  try {
    await prepareDriveAccess();
    if (!tab.closed) tab.location.replace(driveAccountUrl(url));
  } catch (err) {
    tab.close();
    toast((err as Error).message, 'danger');
  }
}

const bound = new WeakSet<HTMLElement>();
export function bindDriveLinks(host: HTMLElement) {
  if (bound.has(host)) return;
  bound.add(host);
  host.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-team-drive]');
    if (!link || !host.contains(link)) return;
    event.preventDefault();
    void openTeamDrive(link.href);
  });
}
