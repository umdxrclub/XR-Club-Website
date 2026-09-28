type Permission = { id: string; type: string; role: string; emailAddress?: string; deleted?: boolean };
type GoogleRequest = (url: string, init?: RequestInit) => Promise<any>;

const TEAM_EMAIL = /^[^\s@]+@(terpmail\.)?umd\.edu$/i;
const HAS_ACCESS = ['reader', 'commenter', 'writer', 'owner', 'organizer', 'fileOrganizer'];

export function approvedDriveEmail(user: { email?: string; email_confirmed_at?: string } | null, status: string | undefined) {
  if (status !== 'approved' || !user?.email_confirmed_at || !TEAM_EMAIL.test(user.email || '')) return null;
  return user.email!.trim().toLowerCase();
}

const permissionsUrl = (folderId: string) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`;

/** Lowercased emails that can already open the folder. */
async function sharedEmails(request: GoogleRequest, folderId: string) {
  const permissions: Permission[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ supportsAllDrives: 'true', pageSize: '100', fields: 'nextPageToken,permissions(id,type,role,emailAddress,deleted)' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request(`${permissionsUrl(folderId)}?${params}`);
    permissions.push(...(page.permissions || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return new Set(permissions
    .filter(p => !p.deleted && p.type === 'user' && p.emailAddress && HAS_ACCESS.includes(p.role))
    .map(p => p.emailAddress!.toLowerCase()));
}

async function grantReader(request: GoogleRequest, folderId: string, email: string) {
  await request(`${permissionsUrl(folderId)}?sendNotificationEmail=false&supportsAllDrives=true`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }) });
}

/** Grant only this approved person's account, never a domain or public link. */
export async function ensureFolderAccess(request: GoogleRequest, folderId: string, email: string) {
  if ((await sharedEmails(request, folderId)).has(email.toLowerCase())) return 'already';
  await grantReader(request, folderId, email);
  return 'granted';
}

/** Share the folder ahead of time with every approved member who lacks access. */
export async function ensureTeamFolderAccess(request: GoogleRequest, folderId: string, emails: string[]) {
  const shared = await sharedEmails(request, folderId);
  const granted: string[] = [], failed: Record<string, string> = {};
  for (const raw of new Set(emails.map(e => e.trim().toLowerCase()))) {
    if (!TEAM_EMAIL.test(raw) || shared.has(raw)) continue;
    try { await grantReader(request, folderId, raw); granted.push(raw); }
    catch (err) { failed[raw] = (err as Error).message; }
  }
  return { granted, failed };
}
