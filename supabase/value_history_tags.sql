-- ============================================================================
-- Tag deposit/grant rows in value_history so the graph can place deposit steps at
-- their REAL recorded times (the moment money actually landed) — for every player,
-- since value_history is game-readable. Stops the "guess it was 9am" behaviour.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL → Run. (After
-- value_history.sql.) Safe to re-run.
-- ============================================================================

alter table value_history add column if not exists kind   text default 'point';  -- point | deposit | grant
alter table value_history add column if not exists amount numeric;                -- money added (for deposit/grant)

-- deposit cron: apply due deposits + notify + write a TAGGED value step at deposit time
create or replace function apply_due_deposits() returns void
language plpgsql security definer set search_path = public as $$
declare m record; iv interval; nx timestamptz; add numeric; lastv numeric;
begin
  for m in
    select mem.id, mem.next_deposit_at as nda, mem.deposited as dep,
           g.deposit_amount as amt, g.deposit_cadence as cad
    from memberships mem join games g on g.id = mem.game_id
    where mem.next_deposit_at is not null
      and coalesce(g.deposit_amount, 0) > 0
      and mem.next_deposit_at <= now()
  loop
    iv := case m.cad
      when 'daily'   then interval '1 day'
      when '2d'      then interval '2 days'
      when '2pw'     then interval '84 hours'
      when 'weekly'  then interval '7 days'
      when 'monthly' then interval '1 month'
      else interval '1 day' end;
    nx := m.nda; add := 0;
    while nx <= now() loop add := add + m.amt; nx := nx + iv; end loop;
    update memberships set cash = cash + add, deposited = deposited + add, next_deposit_at = nx where id = m.id;
    insert into notifications(membership_id, kind, message, amount)
      values (m.id, 'deposit', 'Deposit received: P£' || trim(to_char(add, 'FM999999990.00')) || '.', add);
    lastv := _last_value(m.id, m.dep);
    insert into value_history(membership_id, t, value, kind, amount) values (m.id, now(), lastv + add, 'deposit', add);
  end loop;
end $$;

-- creator grant: add money + notify + write a TAGGED value step at grant time
create or replace function grant_funds(p_membership_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare m memberships; amt numeric := round(coalesce(p_amount,0)::numeric, 2); lastv numeric;
begin
  if amt <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  select * into m from memberships where id = p_membership_id;
  if m.id is null then raise exception 'Player not found.'; end if;
  if not is_game_creator(m.game_id) then raise exception 'Only the game creator can give money.'; end if;
  update memberships set cash = cash + amt, deposited = deposited + amt where id = m.id;
  insert into notifications(membership_id, kind, message, amount)
    values (m.id, 'grant', 'The game creator gave you P£' || trim(to_char(amt, 'FM999999990.00')) || '.', amt);
  lastv := _last_value(m.id, m.deposited);
  insert into value_history(membership_id, t, value, kind, amount) values (m.id, now(), lastv + amt, 'grant', amt);
end $$;
