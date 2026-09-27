import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/oauthRedirect.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { localAuthReturn, googleCallbackError, prepareGoogleReturn, consumeGoogleReturn, finishGoogleReturn } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const origin = 'https://xr.umd.edu';
const fallback = '/suits/team/';
for (const bad of ['https://other.example/suits/team/', '//other.example/', 'javascript:alert(1)', 'data:text/html,test', 'https://xr.umd.edu@other.example/']) {
  assert.equal(localAuthReturn(bad, origin, fallback), origin + fallback, `Reject external callback: ${bad}`);
}
assert.equal(localAuthReturn('/suits/team/tasks/', origin, fallback), origin + '/suits/team/tasks/');
assert.equal(localAuthReturn('/suits/team/documents/', 'http://127.0.0.1:4342', fallback), 'http://127.0.0.1:4342/suits/team/documents/');
assert.equal(googleCallbackError('', '#access_token=sample&refresh_token=sample'), null);
assert.match(googleCallbackError('', '#error=access_denied'), /cancelled or access was denied/);
assert.match(googleCallbackError('?error=server_error&error_description=Try+again', ''), /Try again/);
assert.match(googleCallbackError('', '#error_code=unexpected_failure&error_description=Provider%20unavailable'), /Provider unavailable/);
assert.ok(googleCallbackError('', '#error=server_error&error_description=' + 'x'.repeat(2000)).length < 350);
console.log('PASS: sign-in stays on the current site, preserves deep links, and reports provider failures without displaying session tokens.');



const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const localOrigin = 'http://127.0.0.1:4342';
assert.equal(prepareGoogleReturn('/suits/team/documents/', localOrigin, '/', storage), localOrigin + '/auth/callback/');
assert.equal(consumeGoogleReturn(localOrigin, '/', storage), localOrigin + '/suits/team/documents/');
assert.equal(consumeGoogleReturn(localOrigin, '/', storage), localOrigin + fallback, 'Use a stored destination once');
prepareGoogleReturn('/login/?redirect=%2Fsuits%2Fteam%2Ftasks%2F', origin, '/', storage);
assert.equal(consumeGoogleReturn(origin, '/', storage), origin + '/login/?redirect=%2Fsuits%2Fteam%2Ftasks%2F', 'Preserve workspace and admin routing through login');
prepareGoogleReturn('https://other.example/', origin, '/', storage);
assert.equal(consumeGoogleReturn(origin, '/', storage), origin + fallback);
prepareGoogleReturn('/auth/callback/', origin, '/', storage);
assert.equal(consumeGoogleReturn(origin, '/', storage), origin + fallback, 'Do not loop back to callback');
prepareGoogleReturn('/suits/team/?access_token=sample&refresh_token=sample&view=tasks#provider_token=sample', origin, '/', storage);
assert.equal(consumeGoogleReturn(origin, '/', storage), origin + '/suits/team/?view=tasks', 'Never store callback credentials as the destination');
assert.equal(localAuthReturn('https://user:password@xr.umd.edu/', origin, fallback), origin + fallback);
const unavailableStorage = {getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); }, removeItem: () => { throw Error('blocked'); }};
assert.equal(prepareGoogleReturn('/suits/team/tasks/', origin, '/', unavailableStorage), origin + '/auth/callback/');
assert.equal(consumeGoogleReturn(origin, '/', unavailableStorage), origin + fallback);
assert.equal(consumeGoogleReturn(origin, '/', null), origin + fallback);
prepareGoogleReturn('/club/suits/team/tasks/', origin, '/club/', storage);
assert.equal(consumeGoogleReturn(origin, '/club/', storage), origin + '/club/suits/team/tasks/');

let resolveSession;
const steps = [];
const completion = finishGoogleReturn({
  providerError: null,
  restoreSession: () => new Promise(resolve => { resolveSession = resolve; steps.push('restoring'); }),
  clearAddress: () => steps.push('clear'),
  navigate: () => steps.push('navigate'),
});
assert.deepEqual(steps, ['restoring'], 'Do not clear credentials or leave before session initialization finishes');
resolveSession({hasSession: true, error: null});
assert.equal(await completion, null);
assert.deepEqual(steps, ['restoring', 'clear', 'navigate']);
for (const result of [{hasSession: false, error: null}, {hasSession: true, error: Error('Invalid new callback, previous session still exists')}]) {
  const effects = [];
  assert.ok(await finishGoogleReturn({providerError: null, restoreSession: async () => result, clearAddress: () => effects.push('clear'), navigate: () => effects.push('navigate')}));
  assert.deepEqual(effects, ['clear'], 'Invalid callbacks must not redirect, including with a previously saved session');
}
const cancelled = [];
assert.match(await finishGoogleReturn({
  providerError: googleCallbackError('', '#error=access_denied'),
  restoreSession: async () => { throw Error('Must not touch existing session on provider cancellation'); },
  clearAddress: () => cancelled.push('clear'),
  navigate: () => cancelled.push('navigate'),
}), /cancelled/);
assert.deepEqual(cancelled, ['clear']);
const offline = [];
assert.match(await finishGoogleReturn({providerError: null, restoreSession: async () => {throw Error('sample secret');}, clearAddress: () => offline.push('clear'), navigate: () => offline.push('navigate')}), /Check your connection/);
assert.deepEqual(offline, ['clear']);
console.log('PASS: OAuth completion waits for the session, clears the address, preserves destinations, and handles cancelled, failed, and offline callbacks.');
