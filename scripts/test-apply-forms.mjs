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

// Upgrade with existing submissions in place. New forms have two steps and no MVP fields.
await db.exec(await fs.readFile('supabase/migrations/20261006000000_apply_two_steps.sql', 'utf8'));
const insertShort = `INSERT INTO public.funding_pitches(project_title, idea, lead_name, lead_email, lead_discord, lead_major, lead_year, funding_mode, members, budget_items, requested_total, agreed_to_rules, motivation)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`;
const budgetItem = (overrides = {}) => ({ name: 'Sensor', cost: 400, priority: 'must', link: 'https://example.com/products/sensor?color=blue&size=small', ...overrides });
const teamMember = (overrides = {}) => ({ name: 'Another applicant', detail: 'another@umd.edu', ...overrides });
const short = ['Interactive light', 'A light that responds to movement.', 'Test applicant', 'test@umd.edu', 'test', 'Art', 'Junior', 'solo', '[]', JSON.stringify([budgetItem()]), 400, true, 'I want to make gallery lighting something visitors can control together.'];
await as(null, insertShort, short);
const newTeamMembers = [teamMember(), teamMember({ name: 'Third applicant', detail: 'third@terpmail.umd.edu' })];
const teamPitch = short.with(7, 'team').with(8, JSON.stringify(newTeamMembers)).with(9, JSON.stringify([budgetItem({ name: 'Projector', cost: 1000, link: 'http://shop.example.com/products/projector' })])).with(10, 1000);
await as(member, insertShort, teamPitch);
await assert.rejects(as(null, insertShort, short.with(9, JSON.stringify([budgetItem({ cost: 401 })])).with(10, 401)), 'Solo funding is capped at $400');
await assert.rejects(as(null, insertShort, teamPitch.with(9, JSON.stringify([budgetItem({ name: 'Projector', cost: 1001 })])).with(10, 1001)), 'Team funding is capped at $1,000');
await assert.rejects(as(null, insertShort, short.with(10, 1)), 'The requested amount must match the item costs');
await assert.rejects(as(null, insertShort, short.with(9, JSON.stringify([budgetItem({ cost: -1 })])).with(10, -1)), 'Negative costs are refused');
await assert.rejects(as(null, insertShort, short.with(9, JSON.stringify([budgetItem({ cost: '400' })]))), 'Costs must be numeric');
await assert.rejects(as(null, insertShort, short.with(9, JSON.stringify([budgetItem({ cost: 1.005 })])).with(10, 1.01)), 'Costs use whole cents');
await assert.rejects(as(null, insertShort, short.with(9, '[{}]')), 'Incomplete budget items are refused');
await assert.rejects(as(null, insertShort, short.with(9, '[]').with(10, 0)), 'A funding request includes a budget');
for (const link of [undefined, null, 123, '', '  ', 'javascript:alert(1)', 'data:text/plain,product', 'ftp://example.com/item', '/products/sensor', 'https://', 'https://bad host.example/item', `https://example.com/${'x'.repeat(1000)}`]) {
  await assert.rejects(as(null, insertShort, short.with(9, JSON.stringify([budgetItem({ link })]))), `Product links must be complete HTTP or HTTPS URLs: ${String(link).slice(0, 70)}`);
}
await assert.rejects(as(null, insertShort, short.with(7, null)), 'New submissions cannot skip the funding cap');
await assert.rejects(as(null, insertShort, short.with(7, 'other')), 'Only solo and team modes are valid');
await assert.rejects(as(null, insertShort, short.with(8, '[{"name":"Someone"}]')), 'Solo projects have no other members');
await assert.rejects(as(null, insertShort, teamPitch.with(8, '[]')), 'Team projects name another member');
await assert.rejects(as(null, insertShort, teamPitch.with(8, '[{}]')), 'Team members must have names');
for (const name of [undefined, null, 123, '', ' \t\n ', 'x'.repeat(201)]) {
  await assert.rejects(as(null, insertShort, teamPitch.with(8, JSON.stringify([teamMember({ name })]))), 'Each team member needs a name of at most 200 characters');
}
for (const detail of [undefined, null, 123, '', ' ', 'person@example.com', 'person@umd.edu.example.com', 'person @umd.edu', 'person@@umd.edu', `${'x'.repeat(313)}@umd.edu`]) {
  await assert.rejects(as(null, insertShort, teamPitch.with(8, JSON.stringify([teamMember({ detail })]))), 'Each team member needs a UMD email of at most 320 characters');
}
await assert.rejects(as(null, insertShort, teamPitch.with(8, JSON.stringify(Array.from({ length: 21 }, (_, index) => teamMember({ detail: `member${index}@umd.edu` }))))), 'At most 20 additional members can be added');
await as(null, insertShort, teamPitch.with(8, JSON.stringify(Array.from({ length: 20 }, (_, index) => teamMember({ name: index === 0 ? 'x'.repeat(200) : `Member ${index}`, detail: `member${index}@umd.edu` })))));
await assert.rejects(as(null, insertShort, short.with(3, 'test@example.com')), 'New funding applications use UMD email');
await assert.rejects(as(null, insertShort, short.with(5, null)), 'Major is saved for funding applicants');
await assert.rejects(as(null, insertShort, short.with(6, '')), 'Year is required');
await assert.rejects(as(null, insertShort, short.with(11, false)), 'Funding rules still require agreement');
await assert.rejects(as(null, insertShort, short.with(12, null)), 'Funding applicants explain why they want to make the project');
await assert.rejects(as(null, insertShort, short.with(12, '')), 'Motivation cannot be empty');
await assert.rejects(as(null, insertShort, short.with(12, ' \t\n ')), 'Motivation cannot be only whitespace');
await assert.rejects(as(null, insertShort, short.with(12, 'x'.repeat(1201))), 'Motivation is limited to 1,200 characters');
const cents = short.with(9, JSON.stringify([budgetItem({ name: 'Part A', cost: 0.1 }), budgetItem({ name: 'Part B', cost: 0.2 })])).with(10, 0.3);
await as(null, insertShort, cents);
const saved = (await as(board, "SELECT * FROM public.funding_pitches WHERE funding_mode = 'solo' AND requested_total=400")).rows[0];
assert.equal(saved.lead_major, 'Art'); assert.equal(saved.lead_year, 'Junior'); assert.equal(saved.outline, null);
assert.equal(saved.motivation, short[12], 'The board can read the applicant\'s motivation');
assert.equal(saved.budget_items[0].link, budgetItem().link, 'Product links remain available to the board');
const savedTeam = (await as(board, "SELECT members FROM public.funding_pitches WHERE funding_mode = 'team' AND jsonb_array_length(members) = 2")).rows[0];
assert.deepEqual(savedTeam.members, newTeamMembers, 'Individual names and UMD emails remain available to the board');
assert.equal((await as(null, 'SELECT * FROM public.funding_pitches')).rows.length, 0, 'New submissions remain private');
assert.equal((await as(member, 'SELECT * FROM public.funding_pitches')).rows.length, 0, 'Members cannot read applicants');
await as(board, "UPDATE public.funding_pitches SET status='reviewing' WHERE id=$1", [anonPitch.rows[0].id]);
const legacy = (await db.query('SELECT outline, motivation, budget_items, members FROM public.funding_pitches WHERE id=$1', [anonPitch.rows[0].id])).rows[0];
assert.equal(legacy.outline, 'Outline', 'Legacy applications remain reviewable');
assert.equal(legacy.motivation, null, 'Legacy applications do not need a new answer');
assert.equal(legacy.budget_items[0].link, '', 'Legacy applications without product links remain reviewable');
assert.deepEqual(legacy.members, JSON.parse(pitch[5]), 'Legacy member details remain unchanged without new email requirements');
await as(board, "UPDATE public.funding_pitches SET status='reviewing' WHERE id=$1", [saved.id]);
console.log('PASS: applications, private board review, legacy migration, solo/team funding caps, budget totals, product links and required details.');
await db.close();
