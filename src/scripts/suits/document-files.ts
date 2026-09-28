import { db, state } from './api';

const urls = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string>>();
let account: string | null = null;
let generation = 0;

export function resetDocumentFiles() { generation++; account = null; urls.clear(); pending.clear(); }
function scope() {
  const userId = state.me?.user_id;
  if (!userId) throw new Error('Sign in to open this file.');
  if (account !== userId) { resetDocumentFiles(); account = userId; }
  return { userId, version: generation };
}
function current(userId: string, version: number) {
  if (state.me?.user_id !== userId || generation !== version) throw new Error('Your account changed. Open the file again.');
}
function cached(path: string) {
  const hit = urls.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
}
/** When a handed out link stops being reused, so previews that keep reading from it can sign again. */
export function documentUrlUntil(path: string) { return urls.get(path)?.until ?? 0; }

/** Shared by the document cards and viewer, so opening does not sign a file twice. */
export async function documentUrl(path: string): Promise<string> {
  const { userId, version } = scope();
  const hit = cached(path);
  if (hit) return hit;
  const existing = pending.get(path);
  if (existing) return existing;
  const request = (async () => {
    const { data, error } = await db.storage.from('suits-docs').createSignedUrl(path, 3600);
    current(userId, version);
    if (error || !data) throw error || new Error('Couldn’t open the file. Try again.');
    urls.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  })().finally(() => { if (pending.get(path) === request) pending.delete(path); });
  pending.set(path, request);
  return request;
}

/** Prepare the document links together while the dashboard is loading. */
export async function warmDocumentFiles(paths: string[]) {
  const { userId, version } = scope();
  const missing = [...new Set(paths)].filter(path => !cached(path) && !pending.has(path));
  if (!missing.length) return;
  const batch = db.storage.from('suits-docs').createSignedUrls(missing, 3600).then(({ data, error }) => {
    current(userId, version);
    if (error) throw error;
    for (const row of data || []) if (row.path && row.signedUrl) urls.set(row.path, { url: row.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  });
  const jobs = missing.map(path => {
    const job = batch.then(() => {
      const url = cached(path);
      if (!url) throw new Error('Couldn’t open the file. Try again.');
      return url;
    }).finally(() => { if (pending.get(path) === job) pending.delete(path); });
    pending.set(path, job);
    return job;
  });
  await Promise.allSettled(jobs);
}
