-- ============================================================================
-- ROBUST RLS RESET for the multi-game tables.
-- Wipes EVERY existing policy on each table (clears leftovers from earlier schema
-- runs) and rebuilds the correct ones. Guarded per-table so it never rolls back
-- if a table is missing. Safe to run repeatedly.
-- Supabase → SQL Editor → New query → paste ALL → Run.
-- ============================================================================

create or replace function my_game_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select game_id from memberships where user_id = auth.uid() $$;

create or replace function my_membership_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select id from memberships where user_id = auth.uid() $$;

create or replace function game_member_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select id from memberships where game_id in (select game_id from memberships where user_id = auth.uid()) $$;

grant execute on function my_game_ids(), my_membership_ids(), game_member_ids() to authenticated, anon;

do $$
declare p record;
begin
  -- memberships
  if to_regclass('public.memberships') is not null then
    execute 'alter table memberships enable row level security';
    for p in select polname from pg_policy where polrelid = 'public.memberships'::regclass loop
      execute format('drop policy %I on memberships', p.polname);
    end loop;
    execute 'create policy "mem_read"   on memberships for select using (game_id in (select my_game_ids()))';
    execute 'create policy "mem_insert" on memberships for insert with check (user_id = auth.uid())';
    execute 'create policy "mem_update" on memberships for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  -- positions
  if to_regclass('public.positions') is not null then
    execute 'alter table positions enable row level security';
    for p in select polname from pg_policy where polrelid = 'public.positions'::regclass loop
      execute format('drop policy %I on positions', p.polname);
    end loop;
    execute 'create policy "pos_read"  on positions for select using (membership_id in (select game_member_ids()))';
    execute 'create policy "pos_write" on positions for all using (membership_id in (select my_membership_ids())) with check (membership_id in (select my_membership_ids()))';
  end if;

  -- trades
  if to_regclass('public.trades') is not null then
    execute 'alter table trades enable row level security';
    for p in select polname from pg_policy where polrelid = 'public.trades'::regclass loop
      execute format('drop policy %I on trades', p.polname);
    end loop;
    execute 'create policy "trd_read"  on trades for select using (membership_id in (select my_membership_ids()))';
    execute 'create policy "trd_write" on trades for all using (membership_id in (select my_membership_ids())) with check (membership_id in (select my_membership_ids()))';
  end if;

  -- snapshots
  if to_regclass('public.portfolio_snapshots') is not null then
    execute 'alter table portfolio_snapshots enable row level security';
    for p in select polname from pg_policy where polrelid = 'public.portfolio_snapshots'::regclass loop
      execute format('drop policy %I on portfolio_snapshots', p.polname);
    end loop;
    execute 'create policy "snap_read"  on portfolio_snapshots for select using (membership_id in (select my_membership_ids()))';
    execute 'create policy "snap_write" on portfolio_snapshots for all using (membership_id in (select my_membership_ids())) with check (membership_id in (select my_membership_ids()))';
  end if;

  -- games
  if to_regclass('public.games') is not null then
    execute 'alter table games enable row level security';
    for p in select polname from pg_policy where polrelid = 'public.games'::regclass loop
      execute format('drop policy %I on games', p.polname);
    end loop;
    execute 'create policy "games_read"   on games for select using (true)';
    execute 'create policy "games_insert" on games for insert with check (auth.uid() = created_by)';
  end if;
end $$;
