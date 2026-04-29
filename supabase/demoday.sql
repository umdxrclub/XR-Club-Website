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
  email text not null unique,
  current_step int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

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
insert into public.demoday_stations (slug, step_index, name) values
  ('app-dev',                 0,  'App Dev'),
  ('drone-club',              1,  'Drone Club'),
  ('athletics',               2,  'UMD Athletics'),
  ('great-teachers',          3,  'Great Teachers'),
  ('testugo',                 4,  'TestuGo'),
  ('augmented-worlds',        5,  'Augmented Worlds'),
  ('tron',                    6,  'Tron'),
  ('double-point',            7,  'Double Point'),
  ('sisu-vr',                 8,  'Sisu VR'),
  ('tanit-xr',                9,  'Tanit XR'),
  ('paraverse',              10,  'Paraverse'),
  ('vusexr',                 11,  'vuseXR'),
  ('virnect',                12,  'Virnect'),
  ('niantic',                13,  'Niantic'),
  ('immersive-installation', 14,  'Immersive Installation'),
  ('rosetta-engine',         15,  'Rosetta Engine')
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
    char_length(name) between 1 and 80 and
    char_length(email) between 3 and 200 and
    email like '%@%'
  );

-- Scans: read open (so the leaderboard / counts work). Writes go through the RPC.
drop policy if exists demoday_scans_select on public.demoday_scans;
create policy demoday_scans_select on public.demoday_scans
  for select to anon, authenticated using (true);

-- =============================================================
-- RPC: validate and record a scan atomically.
-- Returns: { ok, reason, new_step, finished }
-- reason in: 'ok', 'no_player', 'unknown_station', 'wrong_order', 'already', 'finished_already'
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

  if v_station.step_index <> v_player.current_step then
    return jsonb_build_object('ok', false, 'reason', 'wrong_order', 'new_step', v_player.current_step, 'finished', false);
  end if;

  insert into public.demoday_scans (player_id, station_slug)
    values (v_player.id, v_station.slug);

  select count(*) into v_total from public.demoday_stations;

  update public.demoday_players
    set current_step = current_step + 1,
        completed_at = case when current_step + 1 >= v_total then now() else null end
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
