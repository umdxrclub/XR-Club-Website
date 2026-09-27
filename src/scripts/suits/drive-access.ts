import { api, state } from './api';
import { toast } from './ui';

export interface DriveStatus {
  configured: boolean;
  serviceEmail: string | null;
  folder: { id: string; name: string; url: string } | null;
  access: 'already' | 'granted' | null;
  accessError?: string | null;
}

let pending: { userId: string; request: Promise<DriveStatus> } | null = null;

/** Recheck with the server each time; saved folder metadata is not permission. */
export function getDriveStatus(): Promise<DriveStatus> {
  const userId = state.me?.user_id;
  if (!userId) return Promise.reject(new Error('Sign in to the SUITS dashboard first.'));
  if (pending?.userId === userId) return pending.request;
  const request = api.drive<DriveStatus>('status').then(status => {
    if (state.me?.user_id !== userId) throw new Error('Your account changed. Open Drive again.');
    return status;
  }).finally(() => { if (pending?.request === request) pending = null; });
  pending = { userId, request };
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

export async function openTeamDrive(url: string) {
  if (!isGoogleDriveUrl(url)) return;
  // Reserve the tab during the click so the awaited sharing check is not
  // blocked as a popup. No Drive page opens until access is confirmed.
  const tab = window.open('', '_blank');
  if (!tab) { toast('Allow popups for this site, then open Drive again.', 'danger'); return; }
  tab.opener = null;
  tab.document.title = 'Opening Drive';
  tab.document.body.textContent = 'Opening your team Drive…';
  try {
    await prepareDriveAccess();
    if (!tab.closed) tab.location.replace(url);
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
