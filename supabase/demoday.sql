-- Demo Day scavenger hunt schema.
-- Run this in the Supabase SQL editor on your project.

-- =============================================================
-- Stations table (the canonical order is stored here so the
-- server validates the next-scan instead of trusting the client).
-- =============================================================
create table if not exists public.demoday_stations (
  slug text primary key,
  step_index int not null unique,
  name text not null
);

-- =============================================================
-- Players
-- =============================================================
create table if not exists public.demoday_players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  current_step int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- For existing installs that had unique-email-not-null
alter table public.demoday_players alter column email drop not null;
alter table public.demoday_players drop constraint if exists demoday_players_email_key;

create index if not exists demoday_players_completed_idx
  on public.demoday_players (completed_at)
  where completed_at is not null;

-- =============================================================
-- Scans (one row per successful scan)
-- =============================================================
create table if not exists public.demoday_scans (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.demoday_players(id) on delete cascade,
  station_slug text not null references public.demoday_stations(slug),
  scanned_at timestamptz not null default now(),
  unique (player_id, station_slug)
);

-- =============================================================
-- Seed station order. Update this list to match src/lib/demoday.ts.
-- =============================================================
-- Reset step_index for any existing rows so we can re-seed cleanly
-- (step_index has a UNIQUE constraint and the order is shifting).
update public.demoday_stations set step_index = -step_index - 1 where step_index >= 0;

insert into public.demoday_stations (slug, step_index, name) values
  ('info-booth',              0,  'XR Club Info Booth'),
  ('imdm',                    1,  'IMDM'),
  ('app-dev',                 2,  'App Dev'),
  ('drone-club',              3,  'Drone Club'),
  ('athletics',               4,  'UMD Athletics'),
  ('great-teachers',          5,  'Great Teachers'),
  ('testugo',                 6,  'TestuGo'),
  ('augmented-worlds',        7,  'Augmented Worlds'),
  ('tron',                    8,  'Tron'),
  ('double-point',            9,  'Double Point'),
  ('sisu-vr',                10,  'Sisu VR'),
  ('tanit-xr',               11,  'Tanit XR'),
  ('paraverse',              12,  'Paraverse'),
  ('vusexr',                 13,  'vuseXR'),
  ('virnect',                14,  'Virnect'),
  ('niantic',                15,  'Niantic'),
  ('immersive-installation', 16,  'Immersive Installation'),
  ('rosetta-engine',         17,  'Rosetta Engine')
on conflict (slug) do update set
  step_index = excluded.step_index,
  name = excluded.name;

-- =============================================================
-- RLS
-- =============================================================
alter table public.demoday_players enable row level security;
alter table public.demoday_scans   enable row level security;
alter table public.demoday_stations enable row level security;

-- Stations are public read.
drop policy if exists demoday_stations_read on public.demoday_stations;
create policy demoday_stations_read on public.demoday_stations
  for select to anon, authenticated using (true);

-- Players: anyone can register; anyone can read minimal fields for the leaderboard.
-- We rely on the RPC for safe writes; direct UPDATEs from the client are blocked.
drop policy if exists demoday_players_select on public.demoday_players;
create policy demoday_players_select on public.demoday_players
  for select to anon, authenticated using (true);

drop policy if exists demoday_players_insert on public.demoday_players;
create policy demoday_players_insert on public.demoday_players
  for insert to anon, authenticated with check (
    char_length(name) between 1 and 80
  );

-- Scans: read open (so the leaderboard / counts work). Writes go through the RPC.
drop policy if exists demoday_scans_select on public.demoday_scans;
create policy demoday_scans_select on public.demoday_scans
  for select to anon, authenticated using (true);

-- =============================================================
-- RPC: record a scan atomically. Order does not matter.
-- Returns: { ok, reason, new_step, finished }
-- reason in: 'ok', 'no_player', 'unknown_station', 'already', 'finished_already'
-- =============================================================
create or replace function public.demoday_record_scan(
  p_player_id uuid,
  p_station_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player    public.demoday_players%rowtype;
  v_station   public.demoday_stations%rowtype;
  v_count     int;
  v_total     int;
  v_finished  boolean := false;
begin
  select * into v_player from public.demoday_players where id = p_player_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_player', 'new_step', 0, 'finished', false);
  end if;

  if v_player.completed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'finished_already', 'new_step', v_player.current_step, 'finished', true);
  end if;

  select * into v_station from public.demoday_stations where slug = p_station_slug;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_station', 'new_step', v_player.current_step, 'finished', false);
  end if;

  if exists (select 1 from public.demoday_scans where player_id = v_player.id and station_slug = v_station.slug) then
    return jsonb_build_object('ok', false, 'reason', 'already', 'new_step', v_player.current_step, 'finished', false);
  end if;

  insert into public.demoday_scans (player_id, station_slug)
    values (v_player.id, v_station.slug);

  select count(*) into v_count from public.demoday_scans where player_id = v_player.id;
  select count(*) into v_total from public.demoday_stations;

  update public.demoday_players
    set current_step = v_count,
        completed_at = case when v_count >= v_total then now() else completed_at end
    where id = v_player.id
    returning current_step, completed_at is not null
    into v_player.current_step, v_finished;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'new_step', v_player.current_step,
    'finished', v_finished
  );
end;
$$;

revoke all on function public.demoday_record_scan(uuid, text) from public;
grant execute on function public.demoday_record_scan(uuid, text) to anon, authenticated;

-- =============================================================
-- Voting: each player picks a top 3 (rank 1, 2, 3).
-- =============================================================
create table if not exists public.demoday_votes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.demoday_players(id) on delete cascade,
  station_slug text not null references public.demoday_stations(slug),
  rank int not null check (rank between 1 and 3),
  created_at timestamptz not null default now(),
  unique (player_id, rank),
  unique (player_id, station_slug)
);

alter table public.demoday_votes enable row level security;

drop policy if exists demoday_votes_select on public.demoday_votes;
create policy demoday_votes_select on public.demoday_votes
  for select to anon, authenticated using (true);

create or replace function public.demoday_save_vote(
  p_player_id uuid,
  p_first    text,
  p_second   text,
  p_third    text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_first = p_second or p_first = p_third or p_second = p_third then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  if not exists (select 1 from public.demoday_players where id = p_player_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_player');
  end if;

  if not exists (select 1 from public.demoday_stations where slug = p_first)
     or not exists (select 1 from public.demoday_stations where slug = p_second)
     or not exists (select 1 from public.demoday_stations where slug = p_third) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_station');
  end if;

  delete from public.demoday_votes where player_id = p_player_id;
  insert into public.demoday_votes (player_id, station_slug, rank) values
    (p_player_id, p_first,  1),
    (p_player_id, p_second, 2),
    (p_player_id, p_third,  3);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.demoday_save_vote(uuid, text, text, text) from public;
grant execute on function public.demoday_save_vote(uuid, text, text, text) to anon, authenticated;
