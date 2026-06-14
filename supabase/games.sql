-- Games / lobby (Milestone 4).
-- A "game" is a shared competition: friends join via a 6-char code and compete
-- on a per-game leaderboard. Each profile belongs to at most one game (game_id).
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste this → Run.
-- (Safe to re-run: everything is "if not exists" / idempotent.)

create table if not exists games (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Link each player's profile to their game.
alter table profiles add column if not exists game_id uuid references games(id) on delete set null;

alter table games enable row level security;

-- Anyone signed in can look up a game (needed to JOIN by code) ...
drop policy if exists "games_read_all" on games;
create policy "games_read_all" on games for select using (true);

-- ... and create a game they own.
drop policy if exists "games_insert_auth" on games;
create policy "games_insert_auth" on games for insert with check (auth.uid() = created_by);
