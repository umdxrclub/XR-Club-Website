type Permission = { id: string; type: string; role: string; emailAddress?: string; deleted?: boolean };
type GoogleRequest = (url: string, init?: RequestInit) => Promise<any>;

export function approvedDriveEmail(user: { email?: string; email_confirmed_at?: string } | null, status: string | undefined) {
  if (status !== 'approved' || !user?.email_confirmed_at || !/^[^\s@]+@(terpmail\.)?umd\.edu$/i.test(user.email || '')) return null;
  return user.email!.trim().toLowerCase();
}

/** Grant only this approved person's account, never a domain or public link. */
export async function ensureFolderAccess(request: GoogleRequest, folderId: string, email: string) {
  const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`;
  const permissions: Permission[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ supportsAllDrives: 'true', pageSize: '100', fields: 'nextPageToken,permissions(id,type,role,emailAddress,deleted)' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request(`${endpoint}?${params}`);
    permissions.push(...(page.permissions || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  const existing = permissions.find(p => !p.deleted && p.type === 'user' && p.emailAddress?.toLowerCase() === email.toLowerCase());
  if (existing && ['reader', 'commenter', 'writer', 'owner', 'organizer', 'fileOrganizer'].includes(existing.role)) return 'already';
  await request(`${endpoint}?sendNotificationEmail=false&supportsAllDrives=true`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }) });
  return 'granted';
}
