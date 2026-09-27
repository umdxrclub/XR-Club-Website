import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async path => ts.transpileModule(await fs.readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = async (path, context) => {
  const exports = {};
  vm.runInNewContext(await compile(path), { exports, URL, URLSearchParams, Request, Response, TextEncoder, Uint8Array, console, ...context }, { filename: path });
  return exports;
};
const helpers = await load('supabase/functions/_shared/drive-access.ts', {});
const identity = { id: 'approved-user', email: 'member@terpmail.umd.edu', email_confirmed_at: '2026-09-01' };
assert.equal(helpers.approvedDriveEmail(identity, 'approved'), identity.email);
for (const status of ['pending', 'rejected', undefined]) assert.equal(helpers.approvedDriveEmail(identity, status), null);
assert.equal(helpers.approvedDriveEmail({ ...identity, email_confirmed_at: undefined }, 'approved'), null);
assert.equal(helpers.approvedDriveEmail({ ...identity, email: 'outsider@example.com' }, 'approved'), null);
assert.equal(helpers.approvedDriveEmail({ ...identity, email: 'member@umd.edu.evil.test' }, 'approved'), null);

for (const role of ['reader', 'commenter', 'writer', 'owner', 'organizer', 'fileOrganizer']) {
  const calls = [];
  const result = await helpers.ensureFolderAccess(async (url, init) => {
    calls.push({ url, init });
    if (!new URL(url).searchParams.has('pageToken')) return { permissions: [], nextPageToken: 'next' };
    return { permissions: [{ id: 'permission', type: 'user', role, emailAddress: identity.email.toUpperCase() }] };
  }, 'team-folder', identity.email);
  assert.equal(result, 'already');
  assert.equal(calls.length, 2, 'Permissions on later pages must be honored');
  assert.ok(calls.every(c => !c.init), 'Existing access must never be downgraded or upgraded');
}
const creates = [];
assert.equal(await helpers.ensureFolderAccess(async (url, init) => {
  if (!init) return { permissions: [] };
  creates.push({ url, body: JSON.parse(init.body) });
  return { id: 'new-permission' };
}, 'team-folder', identity.email), 'granted');
assert.equal(creates.length, 1);
assert.deepEqual(creates[0].body, { role: 'reader', type: 'user', emailAddress: identity.email });
assert.equal(new URL(creates[0].url).searchParams.get('sendNotificationEmail'), 'false');
await assert.rejects(helpers.ensureFolderAccess(async (_url, init) => {
  if (init) throw new Error('Folder sharing is restricted');
  return { permissions: [] };
}, 'team-folder', identity.email), /restricted/);

// Exercise the real Edge request handler with fake Google and Supabase services.
let handler, authUser = identity, approval = 'approved';
const googleCalls = [];
const admin = {
  from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: { status: approval }, error: null }; },
      async single() { return { data: { display_name: 'Member', role: 'member' }, error: null }; },
      async in() { assert.equal(table, 'suits_settings'); return { data: [{ key: 'drive_folder', value: { id: 'team-folder', url: 'https://drive.google.com/drive/folders/team-folder' } }] }; },
    };
    return query;
  },
};
const env = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', SUPABASE_ANON_KEY: 'test-anon-key',
  SUITS_GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'service@example.invalid', private_key: '-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----' }),
};
await load('supabase/functions/suits-drive/index.ts', {
  require: name => name.includes('supabase-js') ? { createClient: (_url, _key, opts) => opts ? { auth: { getUser: async () => ({ data: { user: authUser }, error: null }) } } : admin } : helpers,
  Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } },
  btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
  crypto: { subtle: { importKey: async () => ({}), sign: async () => new Uint8Array([1]).buffer } },
  fetch: async (url, init) => {
    googleCalls.push({ url, init });
    return new Response(JSON.stringify(url.includes('oauth2.googleapis.com') ? { access_token: 'fake-google-token', expires_in: 3600 } : init?.method === 'POST' ? { id: 'permission' } : { permissions: [] }), { status: 200 });
  },
});
const request = () => new Request('https://example.supabase.co/functions/v1/suits-drive', { method: 'POST', headers: { Authorization: 'Bearer fake-member-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', email: 'attacker@example.com', folderId: 'unrelated-folder' }) });
for (const status of ['pending', 'rejected']) {
  approval = status;
  assert.equal((await handler(request())).status, 403);
  assert.equal(googleCalls.length, 0, 'Unapproved accounts must never call Google');
}
approval = 'approved'; authUser = { ...identity, email_confirmed_at: undefined };
assert.equal((await handler(request())).status, 403);
assert.equal(googleCalls.length, 0);
authUser = identity;
const result = await (await handler(request())).json();
assert.equal(result.access, 'granted');
const permissionCall = googleCalls.find(c => c.url.includes('/permissions') && c.init?.method === 'POST');
assert.deepEqual(JSON.parse(permissionCall.init.body), { role: 'reader', type: 'user', emailAddress: identity.email });
assert.ok(permissionCall.url.includes('/files/team-folder/'), 'Only the configured folder can be shared');

// Exercise real browser-side sequencing without opening a browser or sending messages.
const state = { me: { user_id: 'approved-user' } };
let answer, requests = 0;
const tabs = [], notices = [];
const access = await load('src/scripts/suits/drive-access.ts', {
  require: name => name === './api' ? { state, api: { drive: async () => { requests++; return new Promise(resolve => { answer = resolve; }); } } } : { toast: text => notices.push(text) },
  window: { open: () => { const tab = { closed: false, document: { body: {} }, location: { replace: url => { tab.target = url; } }, close: () => { tab.closed = true; } }; tabs.push(tab); return tab; } },
});
const good = { configured: true, folder: { id: 'team-folder' }, access: 'granted' };
const url = 'https://drive.google.com/drive/folders/team-folder';
const opening = access.openTeamDrive(url);
assert.equal(tabs[0].target, undefined, 'Drive must not open before Google grants access');
const simultaneous = access.getDriveStatus();
assert.equal(requests, 1, 'Concurrent checks for one member should share a request');
answer(good);
await Promise.all([opening, simultaneous]);
assert.equal(tabs[0].target, url);
const denied = access.openTeamDrive(url);
answer({ ...good, access: null, accessError: 'Sharing is restricted' });
await denied;
assert.equal(tabs[1].closed, true);
assert.equal(tabs[1].target, undefined);
assert.match(notices.at(-1), /Sharing is restricted/);
const switching = access.openTeamDrive(url);
state.me = { user_id: 'another-user' };
answer(good); await switching;
assert.equal(tabs[2].closed, true, 'Changing account must invalidate an in-flight access check');
assert.equal(tabs[2].target, undefined);
await access.openTeamDrive('https://drive.google.com.evil.test/folder');
assert.equal(tabs.length, 3);
console.log('Drive access passed: approved verified accounts only, configured folder only, individual viewing access, existing roles preserved, pagination, sharing errors, opening order, request coalescing, and account changes. No real permissions changed.');
