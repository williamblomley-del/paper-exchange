-- ============================================================================
-- Deposit TIME OF DAY at game creation. New games now schedule recurring deposits
-- at a fixed time (Europe/London) for EVERYONE — both the creator and anyone who
-- joins later — instead of each member's individual creation time.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL → Run. (Run once,
-- AFTER game_economy.sql.) Safe to re-run.
-- ============================================================================

-- create_game gains a deposit_time param (drop the old 5-arg version first).
drop function if exists create_game(text, text, numeric, numeric, text);

create or replace function create_game(
  p_name text, p_username text, p_start_cash numeric,
  p_deposit_amount numeric, p_deposit_cadence text, p_deposit_time time default null
) returns memberships
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sc  numeric := case when coalesce(p_start_cash,0) > 0 then p_start_cash else 10000 end;
  amt numeric := case when coalesce(p_deposit_amount,0) > 0 then p_deposit_amount else 0 end;
  cad text := case when amt > 0 then p_deposit_cadence else null end;
  tod time := case when amt > 0 then p_deposit_time else null end;
  g games;
  m memberships;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if coalesce(trim(p_username),'') = '' then raise exception 'Pick a display name.'; end if;
  loop
    begin
      insert into games(code, name, created_by, start_cash, deposit_amount, deposit_cadence, deposit_time)
      values (upper(substr(md5(random()::text), 1, 6)), nullif(trim(p_name),''), uid, sc, amt, cad, tod)
      returning * into g;
      exit;
    exception when unique_violation then
      -- code collision → try another code
    end;
  end loop;
  insert into memberships(game_id, user_id, username, cash, deposited, next_deposit_at)
  values (g.id, uid, trim(p_username), sc, sc,
          case when amt > 0 then _next_deposit_at(cad, tod) else null end)
  returning * into m;
  return m;
end $$;

grant execute on function create_game(text, text, numeric, numeric, text, time) to authenticated;

-- join_game: seed the joiner's next deposit at the GAME's time of day too (was each
-- joiner's creation time), so all players in a game deposit together.
create or replace function join_game(p_code text, p_username text)
returns memberships
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games;
  m memberships;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if coalesce(trim(p_username),'') = '' then raise exception 'Pick a display name.'; end if;
  select * into g from games where code = upper(trim(p_code));
  if g.id is null then raise exception 'No game found with that code.'; end if;
  begin
    insert into memberships(game_id, user_id, username, cash, deposited, next_deposit_at)
    values (g.id, uid, trim(p_username), g.start_cash, g.start_cash,
            case when coalesce(g.deposit_amount,0) > 0 then _next_deposit_at(g.deposit_cadence, g.deposit_time) else null end)
    returning * into m;
  exception when unique_violation then
    raise exception 'You are already in this game, or that username is taken here.';
  end;
  return m;
end $$;
