import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Real endpoint, with fake identity, database and Discord. No messages are sent.
let handler, approved = true, signedIn = true, channelReads = 0, dispatches = 0;
const member = { user_id: 'member', email: 'member@umd.edu', role: 'member', proposal_role: 'technical' };
const settings = { guild_id: 'guild', channel_id: 'announcements', reminders_channel_id: 'reminders', meeting_channel_id: 'voice' };
const channels = [{ id: 'voice', name: 'Team room', type: 2 }, { id: 'technical', name: 'technical', type: 0 }, { id: 'category', name: 'SUITS', type: 4 }];
let savedChannels = [];
const admin = { from(table) {
  const q = {
    select() { return q; }, eq() { return q; },
    async maybeSingle() { assert.equal(table, 'suits_settings'); return { data: { value: settings } }; },
    async in(_key, ids) { assert.equal(table, 'suits_team'); return { data: ids.includes(member.user_id) ? [member] : [] }; },
    async upsert(rows) { assert.equal(table, 'suits_discord_channels'); savedChannels = rows; return { error: null }; },
    then(resolve, reject) { assert.equal(table, 'suits_membership_requests'); return Promise.resolve({ data: approved ? [{ user_id: member.user_id }] : [], error: null }).then(resolve, reject); },
  }; return q;
} };
const source = ts.transpileModule(await fs.readFile('supabase/functions/suits-discord/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(source, {
  exports: {}, Request, Response, URL, console,
  Deno: { serve: fn => { handler = fn; }, env: { get: key => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-server', SUPABASE_ANON_KEY: 'fake-anon', DISCORD_BOT_TOKEN: 'fake-bot' })[key] } },
  require: name => name.includes('supabase-js') ? { createClient: (_url, _key, options) => options ? { auth: { getUser: async () => ({ data: { user: signedIn ? { id: member.user_id, email: member.email } : null } }) } } : admin } : {
    calendarDiscord: async () => { channelReads++; return channels; },
    processCalendarQueue: async () => { dispatches++; return {}; },
  },
});
const request = action => new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer fake-member', 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
for (const approval of [false, true]) {
  approved = approval;
  const response = await handler(request('calendar-options'));
  assert.equal(response.status, approval ? 200 : 403);
  if (approval) {
    const result = await response.json();
    assert.equal(result.meetingChannelId, 'voice');
    assert.equal(result.announcementChannelId, 'announcements');
    assert.equal(result.remindersChannelId, 'reminders');
    assert.deepEqual(result.channels.map(c => c.id), ['voice', 'technical']);
  } else assert.equal(channelReads, 0, 'Unapproved members cannot read Discord channels');
}
assert.equal(channelReads, 1);assert.equal(savedChannels.length, 2);
assert.ok(savedChannels.every(c => c.guild_id === 'guild'));
assert.equal((await handler(request('calendar-dispatch'))).status, 403);
assert.equal(dispatches, 0, 'Global notification controls stay restricted');
signedIn = false;
assert.equal((await handler(request('calendar-options'))).status, 401);
assert.equal(channelReads, 1);
console.log('PASS: approved members receive calendar channels and routing, rejected and signed-out users cannot, and global notification dispatch remains restricted.');
