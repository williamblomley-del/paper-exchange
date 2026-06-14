-- ============================================================================
-- Milestone 5 — MULTI-GAME schema (FRESH START — wipes old app data).
--
-- One auth account can belong to MANY games. Cash, holdings, trades, username
-- and value-history all live PER MEMBERSHIP (one row per user per game), so the
-- same person can run several games with different friends, and usernames only
-- need to be unique WITHIN a game. Each game has its own starting cash and an
-- optional recurring deposit (amount + cadence).
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL of this → Run.
-- You'll see a "destructive operation" warning (it drops the old tables) — that's
-- expected; you chose a fresh start. Run it once.
-- ============================================================================

-- ── wipe old single-game tables ──────────────────────────────────────────────
drop table if exists portfolio_snapshots cascade;
drop table if exists trades cascade;
drop table if exists positions cascade;
drop table if exists value_history cascade;
drop table if exists memberships cascade;
drop table if exists games cascade;
drop table if exists profiles cascade;

-- ── games ────────────────────────────────────────────────────────────────────
create table games (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text,
  created_by     uuid references auth.users(id) on delete set null,
  start_cash     numeric not null default 10000,
  deposit_amount numeric not null default 0,            -- 0 = no recurring deposit
  deposit_cadence text,                                 -- daily | 2d | 2pw | weekly | monthly
  created_at     timestamptz default now()
);

-- ── memberships (one per user per game) ──────────────────────────────────────
create table memberships (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  username        text not null,
  cash            numeric not null,
  deposited       numeric not null,        -- net capital in (start_cash + deposits so far)
  next_deposit_at timestamptz,             -- null when the game has no recurring deposit
  created_at      timestamptz default now(),
  unique (game_id, user_id),               -- one membership per person per game
  unique (game_id, username)               -- username unique WITHIN a game (reusable across games)
);

-- ── holdings / trades / value history (all scoped to a membership) ───────────
create table positions (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  ticker        text not null,
  shares        numeric not null check (shares > 0),
  avg_cost      numeric not null,
  ticker_name   text,
  updated_at    timestamptz default now(),
  unique (membership_id, ticker)
);

create table trades (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  ticker        text not null,
  side          text not null check (side in ('buy','sell')),
  shares        numeric not null,
  price         numeric not null,
  value         numeric not null,
  created_at    timestamptz default now()
);

create table portfolio_snapshots (
  membership_id uuid not null references memberships(id) on delete cascade,
  day           date not null,
  value         numeric not null,
  created_at    timestamptz default now(),
  primary key (membership_id, day)
);

-- price_cache is unchanged / independent (created in the original schema). If it
-- doesn't exist yet, uncomment:
-- create table if not exists price_cache (ticker text primary key, price numeric not null, name text, logo text, fetched_at timestamptz default now());

-- ── helper functions (SECURITY DEFINER → avoid RLS self-recursion) ───────────
create or replace function my_game_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select game_id from memberships where user_id = auth.uid() $$;

create or replace function my_membership_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select id from memberships where user_id = auth.uid() $$;

-- membership ids of EVERYONE in the games I'm in (for the leaderboard)
create or replace function game_member_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select id from memberships where game_id in (select game_id from memberships where user_id = auth.uid()) $$;

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table games enable row level security;
alter table memberships enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table portfolio_snapshots enable row level security;

-- games: anyone signed in can read (to join by code / read config); create your own
create policy "games_read"   on games for select using (true);
create policy "games_insert" on games for insert with check (auth.uid() = created_by);

-- memberships: read everyone in your games (leaderboard); write only your own
create policy "mem_read"   on memberships for select using (game_id in (select my_game_ids()));
create policy "mem_insert" on memberships for insert with check (user_id = auth.uid());
create policy "mem_update" on memberships for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- positions: read all in your games (to value rivals); write only your own
create policy "pos_read"  on positions for select using (membership_id in (select game_member_ids()));
create policy "pos_write" on positions for all
  using (membership_id in (select my_membership_ids()))
  with check (membership_id in (select my_membership_ids()));

-- trades + snapshots: your own only
create policy "trd_read"  on trades for select using (membership_id in (select my_membership_ids()));
create policy "trd_write" on trades for all
  using (membership_id in (select my_membership_ids()))
  with check (membership_id in (select my_membership_ids()));

create policy "snap_read"  on portfolio_snapshots for select using (membership_id in (select my_membership_ids()));
create policy "snap_write" on portfolio_snapshots for all
  using (membership_id in (select my_membership_ids()))
  with check (membership_id in (select my_membership_ids()));
