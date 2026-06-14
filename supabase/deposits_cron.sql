-- ============================================================================
-- Milestone 5 — recurring deposits via a SCHEDULED job (pg_cron).
--
-- Every game can drip-feed cash to its players: deposit_amount on a cadence
-- (daily / 2d / twice-a-week / weekly / monthly). This runs server-side on a
-- schedule, so deposits land even when nobody is logged in. Cash AND `deposited`
-- (net capital in) both go up, so returns stay correct.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL → Run. (Run once.)
-- Requires the pg_cron extension (this script enables it).
-- ============================================================================

create extension if not exists pg_cron;

-- Apply every deposit that is now due, catching up multiple missed periods.
create or replace function apply_due_deposits() returns void
language plpgsql security definer set search_path = public as $$
declare
  m   record;
  iv  interval;
  nx  timestamptz;
  add numeric;
begin
  for m in
    select mem.id, mem.next_deposit_at as nda, g.deposit_amount as amt, g.deposit_cadence as cad
    from memberships mem
    join games g on g.id = mem.game_id
    where mem.next_deposit_at is not null
      and coalesce(g.deposit_amount, 0) > 0
      and mem.next_deposit_at <= now()
  loop
    iv := case m.cad
      when 'daily'   then interval '1 day'
      when '2d'      then interval '2 days'
      when '2pw'     then interval '84 hours'   -- twice a week (3.5 days)
      when 'weekly'  then interval '7 days'
      when 'monthly' then interval '1 month'
      else interval '1 day'
    end;
    nx := m.nda;
    add := 0;
    while nx <= now() loop
      add := add + m.amt;
      nx := nx + iv;
    end loop;
    update memberships set cash = cash + add, deposited = deposited + add, next_deposit_at = nx
    where id = m.id;
  end loop;
end;
$$;

-- Run it every 30 minutes. (Unschedule first so re-running this file is safe.)
select cron.unschedule('apply-deposits') where exists (select 1 from cron.job where jobname = 'apply-deposits');
select cron.schedule('apply-deposits', '*/30 * * * *', $$ select apply_due_deposits(); $$);
