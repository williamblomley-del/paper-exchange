-- ============================================================================
-- Create / join a game as a single server-side call (fixes the membership RLS
-- issue where the two separate inserts didn't share the same auth context).
-- These run SECURITY DEFINER and set user_id/created_by from auth.uid() directly.
-- Supabase → SQL Editor → New query → paste ALL → Run.
-- ============================================================================

-- maps a cadence to the first deposit due-time (null = no recurring deposit)
create or replace function _next_deposit(amt numeric, cad text) returns timestamptz
language sql immutable as $$
  select case when coalesce(amt,0) > 0 and cad is not null then
    now() + case cad
      when 'daily'   then interval '1 day'
      when '2d'      then interval '2 days'
      when '2pw'     then interval '84 hours'
      when 'weekly'  then interval '7 days'
      when 'monthly' then interval '1 month'
      else interval '1 day' end
  else null end
$$;

create or replace function create_game(
  p_name text, p_username text, p_start_cash numeric,
  p_deposit_amount numeric, p_deposit_cadence text
) returns memberships
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sc  numeric := case when coalesce(p_start_cash,0) > 0 then p_start_cash else 10000 end;
  amt numeric := case when coalesce(p_deposit_amount,0) > 0 then p_deposit_amount else 0 end;
  cad text := case when amt > 0 then p_deposit_cadence else null end;
  g games;
  m memberships;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if coalesce(trim(p_username),'') = '' then raise exception 'Pick a display name.'; end if;
  loop
    begin
      insert into games(code, name, created_by, start_cash, deposit_amount, deposit_cadence)
      values (upper(substr(md5(random()::text), 1, 6)), nullif(trim(p_name),''), uid, sc, amt, cad)
      returning * into g;
      exit;
    exception when unique_violation then
      -- code collision → try another code
    end;
  end loop;
  insert into memberships(game_id, user_id, username, cash, deposited, next_deposit_at)
  values (g.id, uid, trim(p_username), sc, sc, _next_deposit(amt, cad))
  returning * into m;
  return m;
end $$;

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
    values (g.id, uid, trim(p_username), g.start_cash, g.start_cash, _next_deposit(g.deposit_amount, g.deposit_cadence))
    returning * into m;
  exception when unique_violation then
    raise exception 'You are already in this game, or that username is taken here.';
  end;
  return m;
end $$;

grant execute on function create_game(text, text, numeric, numeric, text) to authenticated;
grant execute on function join_game(text, text) to authenticated;
