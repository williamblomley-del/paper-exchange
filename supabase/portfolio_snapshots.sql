-- Portfolio value history (Milestone 4 — real performance graph).
-- One row per user per day, holding that day's total account value.
-- The app upserts today's value on load + after each trade; the performance
-- graph (Day / Week / Month / Year / All-time) reads it back. History starts
-- empty for a new account and fills in over time.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this → Run.

create table if not exists portfolio_snapshots (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  value      numeric not null,
  created_at timestamptz default now(),
  primary key (user_id, day)
);

alter table portfolio_snapshots enable row level security;

-- Each user can only read/write their OWN snapshots.
create policy "snapshots_select_own" on portfolio_snapshots
  for select using (auth.uid() = user_id);

create policy "snapshots_insert_own" on portfolio_snapshots
  for insert with check (auth.uid() = user_id);

create policy "snapshots_update_own" on portfolio_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
