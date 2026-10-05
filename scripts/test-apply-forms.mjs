import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// The funding page's tables: anyone can submit a pitch or a team application; only the board reads or reviews them.
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
CREATE FUNCTION public.is_board_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.sub',true) = '11111111-1111-4111-8111-111111111111'$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;`);
await db.exec(await fs.readFile('supabase/migrations/20261005000000_apply_forms.sql', 'utf8'));
await db.exec(await fs.readFile('supabase/migrations/20261005010000_apply_forms_hardening.sql', 'utf8'));
await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role');

const board = '11111111-1111-4111-8111-111111111111', member = '21111111-1111-4111-8111-111111111111';
async function as(user, sql, args = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [user || '', user ? 'authenticated' : 'anon']);
  await db.exec(user ? 'SET ROLE authenticated' : 'SET ROLE anon');
  try { return await db.query(sql, args); } finally { await db.exec('RESET ROLE'); }
}
const pitch = ['Terrapin Terrarium', 'A hologram tank.', 'Kyle', 'kyle@terpmail.umd.edu', 'kyle', JSON.stringify([{ name: 'A', detail: 'Unity' }, { name: 'B', detail: '' }, { name: 'C', detail: '' }]), 'Outline', 'Lab only', 'Weekly', 'A demo', JSON.stringify([{ name: 'Webcam', cost: 80, priority: 'must', link: '' }]), 80, true];
const insertPitch = `INSERT INTO public.funding_pitches(project_title, idea, lead_name, lead_email, lead_discord, members, outline, zero_dollar_plan, timeline, deliverable, budget_items, requested_total, agreed_to_rules) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12,$13)`;
// Submissions never ask for the row back (RETURNING would need a SELECT policy), like the site's Supabase client.
await as(null, insertPitch, pitch);
await as(member, insertPitch, pitch);
// The hardening keeps the review columns, the JSON shapes, and the rules box out of a submitter's hands.
const withColumn = (column, literal) => insertPitch.replace('agreed_to_rules)', `agreed_to_rules, ${column})`).replace('$13)', `$13, ${literal})`);
await assert.rejects(as(null, withColumn('status', "'chosen'"), pitch), 'Submitters cannot pre-set a status');
await assert.rejects(as(null, withColumn('reviewer_notes', "'Approved'"), pitch), 'Submitters cannot write reviewer notes');
await assert.rejects(as(null, withColumn('created_at', "'2999-01-01'"), pitch), 'Submitters cannot date their own row');
await assert.rejects(as(null, insertPitch, pitch.with(5, '{}')), 'The team must be a list');
await assert.rejects(as(null, insertPitch, pitch.with(5, '[null]')), 'The team must be a list of people');
await assert.rejects(as(null, insertPitch, pitch.with(10, '"a webcam"')), 'Budget items must be a list');
await assert.rejects(as(null, insertPitch, pitch.with(12, false)), 'The funding rules must be agreed to');
await assert.rejects(as(null, insertPitch, pitch.with(0, 'x'.repeat(201))), 'Text columns are bounded');
const anonPitch = await db.query("SELECT id, status FROM public.funding_pitches ORDER BY created_at LIMIT 1");
assert.equal(anonPitch.rows[0].status, 'new', 'A signed-out visitor can submit a pitch');
assert.equal((await as(null, 'SELECT * FROM public.funding_pitches')).rows.length, 0, 'Visitors cannot read pitches');
assert.equal((await as(member, 'SELECT * FROM public.funding_pitches')).rows.length, 0, 'Signed-in members cannot read pitches');
assert.equal((await as(board, 'SELECT * FROM public.funding_pitches')).rows.length, 2, 'The board reads every pitch');
await as(member, "UPDATE public.funding_pitches SET status='chosen'");
assert.equal((await db.query("SELECT count(*)::int n FROM public.funding_pitches WHERE status='chosen'")).rows[0].n, 0, 'Only the board changes a status');
await as(board, "UPDATE public.funding_pitches SET status='chosen', reviewer_notes='Strong' WHERE id=$1", [anonPitch.rows[0].id]);
assert.equal((await db.query("SELECT count(*)::int n FROM public.funding_pitches WHERE status='chosen'")).rows[0].n, 1);
await assert.rejects(as(board, "UPDATE public.funding_pitches SET status='funded'"), 'Statuses are a fixed set');
await as(member, 'DELETE FROM public.funding_pitches');
assert.equal((await db.query('SELECT count(*)::int n FROM public.funding_pitches')).rows[0].n, 2, 'Only the board deletes');

const application = ['immersive-installations', 'Sam', 'sam@umd.edu', 'sam', 'Sophomore', 'Computer Science', 'A projection piece', '{TouchDesigner,Blender}', null, 'yes', null];
const insertApplication = 'INSERT INTO public.team_applications(team, full_name, email, discord_username, year, major, pitch, tools, link, availability, anything_else) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
await as(null, insertApplication, application);
await assert.rejects(as(null, insertApplication, application.with(0, '')), 'An application names a team');
await assert.rejects(as(null, insertApplication, application.with(0, 'robotics')), 'An application names a known team');
await assert.rejects(as(null, insertApplication.replace('anything_else)', 'anything_else, status)').replace('$11)', "$11, 'joined')"), application), 'Applicants cannot pre-set a status');
const app = await db.query('SELECT status, tools FROM public.team_applications');
assert.equal(app.rows[0].status, 'new');
assert.deepEqual(app.rows[0].tools, ['TouchDesigner', 'Blender']);
assert.equal((await as(null, 'SELECT * FROM public.team_applications')).rows.length, 0, 'Visitors cannot read applications');
assert.equal((await as(board, 'SELECT * FROM public.team_applications')).rows.length, 1);
await assert.rejects(as(board, "UPDATE public.team_applications SET status='maybe'"), 'Application statuses are a fixed set');

console.log('PASS: funding pitches and team applications: anyone can submit a new, well-formed row for a known team, nobody can pre-set review fields, only the board can read, review, or remove them, and statuses are a fixed set.');
