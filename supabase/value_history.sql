-- ============================================================================
-- value_history — an ACCURATE, recorded performance timeline.
--
-- Instead of RECONSTRUCTING the past (estimating from today's holdings), the app
-- records each account's real value every ~15 minutes while it's open, and the
-- deposit cron / "give money" write a value STEP at the exact moment money lands
-- (so deposits show as a clean jump even when nobody's online). The graph plots
-- these real points; it falls back to the estimate until enough points accrue.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL → Run. (Run once,
-- AFTER game_economy.sql.) Safe to re-run. Replaces apply_due_deposits + grant_funds.
-- ============================================================================

create table if not exists value_history (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  t             timestamptz not null default now(),
  value         numeric not null
);
create index if not exists value_history_mem_t on value_history(membership_id, t);

alter table value_history enable row level security;
-- read your own + everyone in your games (for rivals' real timelines); write your own
drop policy if exists "vh_read"  on value_history;
drop policy if exists "vh_write" on value_history;
create policy "vh_read"  on value_history for select using (membership_id in (select game_member_ids()));
create policy "vh_write" on value_history for all
  using (membership_id in (select my_membership_ids()))
  with check (membership_id in (select my_membership_ids()));

-- latest known account value (value_history → daily snapshot → fallback)
create or replace function _last_value(p_mid uuid, p_fallback numeric) returns numeric
language sql stable set search_path = public as $$
  select coalesce(
    (select value from value_history where membership_id = p_mid order by t desc limit 1),
    (select value from portfolio_snapshots where membership_id = p_mid order by day desc limit 1),
    p_fallback)
$$;

-- deposit cron: apply due deposits + notify + write a value STEP at deposit time
-- (markets are closed at the scheduled time, so last value + deposit = the new value).
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
    insert into value_history(membership_id, t, value) values (m.id, now(), lastv + add);
  end loop;
end $$;

-- creator grant: add money + notify + write a value STEP at grant time
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
  insert into value_history(membership_id, t, value) values (m.id, now(), lastv + amt);
end $$;

select cron.unschedule('apply-deposits') where exists (select 1 from cron.job where jobname = 'apply-deposits');
select cron.schedule('apply-deposits', '*/30 * * * *', $$ select apply_due_deposits(); $$);
