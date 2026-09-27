import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

// Exercise the actual review handler without a network or access to real applications.
const source = await fs.readFile('supabase/functions/_shared/suits-review.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createReviewHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let identity = null, operations = 0;
const result = { data: { id: 'sample', resume_path: null }, error: null };
const chain = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => resolve(result) : () => chain });
const handler = createReviewHandler(() => ({
  auth: { getUser: async () => ({ data: { user: identity }, error: null }) },
  from: () => { operations++; return chain; },
  storage: { from: () => ({ createSignedUrl: async () => { operations++; return { data: { signedUrl: 'https://example.invalid/resume' }, error: null }; } }) },
}));
const request = (action, authorization = 'Bearer test-session') => new Request('https://example.invalid/review', {
  method: 'POST', headers: authorization ? { Authorization: authorization } : {},
  body: JSON.stringify({ action, id: 'sample', resume_path: 'sample/resume.pdf', status: 'interview', password: 'legacy-password', email: 'kcyle@terpmail.umd.edu' }),
});
assert.equal((await handler(request('list', ''))).status, 401);
assert.equal((await handler(request('list'))).status, 401, 'An unverified token cannot open the old password endpoint');
for (const user of [
  { email: 'board@umd.edu', email_confirmed_at: '2026-01-01', user_metadata: { email: 'kcyle@terpmail.umd.edu', role: 'admin' } },
  { email: 'kcyle@terpmail.umd.edu', email_confirmed_at: null },
  { email: 'kcyle@terpmail.umd.edu.evil.test', email_confirmed_at: '2026-01-01' },
]) {
  identity = user;
  for (const action of ['list', 'update', 'delete', 'resume']) assert.equal((await handler(request(action))).status, 403);
}
assert.equal(operations, 0, 'Blocked requests never touch applications or storage');
identity = { email: 'KCYLE@terpmail.umd.edu', email_confirmed_at: '2026-01-01' };
for (const action of ['list', 'update', 'delete', 'resume']) assert.equal((await handler(request(action))).status, 200);
assert.ok(operations > 0);

// Exercise real RLS against the schema, including older broad board/storage grants.
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.is_board_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;`);
await db.exec(await fs.readFile('supabase/migrations/20260914000000_nasa_suits.sql', 'utf8'));
await db.exec(`CREATE POLICY "Existing broad board policy" ON public.suits_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Existing broad storage policy" ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.suits_applications,storage.objects TO anon,authenticated;`);
await db.exec(await fs.readFile('supabase/migrations/20260927020000_suits_application_owner.sql', 'utf8'));
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
await db.query('INSERT INTO auth.users VALUES ($1,$2,now()),($3,$4,now())', [owner,'KCYLE@terpmail.umd.edu',other,'board@umd.edu']);
const application = { full_name: 'Sample applicant', email: 'sample@example.invalid', discord_username: 'sample', year: 'Sophomore', majors: 'CS', organizations: 'Sample', bring_to_table: 'Sample', why_join: 'Sample', teamwork_story: 'Sample', team_environment: 'Sample', hours_per_week: '5 to 7 hours', availability_changes: 'None', required_dates: 'Yes', us_citizen_or_pr: 'Yes', resume_path: 'sample/resume.pdf' };
await db.query(`INSERT INTO public.suits_applications (${Object.keys(application).join(',')}) VALUES (${Object.keys(application).map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(application));
await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES ('suits-resumes','sample/resume.pdf'),('other-bucket','visible.txt')");
async function as(id, fn, role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email','kcyle@terpmail.umd.edu',false)", [id]);
  await db.exec(`SET ROLE ${role}`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
async function blocked() {
  assert.equal((await db.query('SELECT * FROM public.suits_applications')).rows.length, 0);
  assert.equal((await db.query("UPDATE public.suits_applications SET status='accepted' RETURNING id")).rows.length, 0);
  assert.equal((await db.query('DELETE FROM public.suits_applications RETURNING id')).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='suits-resumes'")).rows.length, 0);
  assert.equal((await db.query("UPDATE storage.objects SET name='changed' WHERE bucket_id='suits-resumes' RETURNING id")).rows.length, 0);
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='suits-resumes' RETURNING id")).rows.length, 0);
}
await as(other, blocked);
await as('', blocked, 'anon');
await as(other, async () => assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='other-bucket'")).rows.length, 1, 'Other buckets retain their policies'));
await as(owner, async () => {
  assert.equal((await db.query('SELECT * FROM public.suits_applications')).rows.length, 1);
  assert.equal((await db.query("UPDATE public.suits_applications SET status='interview',reviewer_notes='Reviewed' RETURNING id")).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='suits-resumes'")).rows.length, 1);
});
await db.query('UPDATE auth.users SET email_confirmed_at=null WHERE id=$1', [owner]);
await as(owner, blocked);
await db.query('UPDATE auth.users SET email_confirmed_at=now(),email=$2 WHERE id=$1', [owner,'changed@umd.edu']);
await as(owner, blocked); // A stale JWT email cannot preserve access after Auth identity changes.
await db.query('UPDATE auth.users SET email=$2 WHERE id=$1', [owner,'kcyle@terpmail.umd.edu']);
await as(owner, async () => {
  assert.equal((await db.query('DELETE FROM public.suits_applications RETURNING id')).rows.length, 1);
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='suits-resumes' RETURNING id")).rows.length, 1);
});
await db.close();
console.log('PASS: verified owner-only application review and resume access; legacy password, board roles, forged metadata, unconfirmed and stale emails denied.');
