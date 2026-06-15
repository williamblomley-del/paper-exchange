-- ============================================================================
-- Milestone 5 — GAME ECONOMY: notifications, creator "give money", player
-- "request money" (notifies the creator), and editable deposit amount + time.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL → Run. (Run once.)
-- Safe to re-run (idempotent). Requires schema_v2.sql + game_rpc.sql already run.
-- The deposits cron (deposits_cron.sql) is REPLACED below — re-run not needed
-- separately, this file redefines apply_due_deposits() and reschedules it.
-- ============================================================================

-- ── deposit "time of day" on games (Europe/London wall-clock) ────────────────
alter table games add column if not exists deposit_time time;  -- null = no fixed time

-- ── notifications (one row per recipient membership) ─────────────────────────
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  kind          text not null,                 -- deposit | grant | request
  message       text not null,
  amount        numeric,
  read          boolean not null default false,
  created_at    timestamptz default now()
);
create index if not exists notifications_mem_idx on notifications(membership_id, created_at desc);

alter table notifications enable row level security;
-- Read + mark-read your OWN notifications only. Inserts happen only via the
-- SECURITY DEFINER functions below (grant/request) and the cron — never from the client.
drop policy if exists "notif_read"   on notifications;
drop policy if exists "notif_update" on notifications;
create policy "notif_read"   on notifications for select using (membership_id in (select my_membership_ids()));
create policy "notif_update" on notifications for update using (membership_id in (select my_membership_ids())) with check (membership_id in (select my_membership_ids()));

-- ── helpers ──────────────────────────────────────────────────────────────────
-- next future deposit instant for a cadence, optionally pinned to a time-of-day
-- (Europe/London). Falls back to now()+interval when no time is set.
create or replace function _next_deposit_at(cad text, tod time) returns timestamptz
language plpgsql stable as $$
declare iv interval; base timestamptz;
begin
  if cad is null then return null; end if;
  iv := case cad
    when 'daily'   then interval '1 day'
    when '2d'      then interval '2 days'
    when '2pw'     then interval '84 hours'
    when 'weekly'  then interval '7 days'
    when 'monthly' then interval '1 month'
    else interval '1 day' end;
  if tod is null then return now() + iv; end if;
  -- today at `tod` London wall-time, advanced by the cadence until it's in the future
  base := ((now() at time zone 'Europe/London')::date + tod) at time zone 'Europe/London';
  while base <= now() loop base := base + iv; end loop;
  return base;
end $$;

-- is the current user the creator of this game?
create or replace function is_game_creator(p_game_id uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from games where id = p_game_id and created_by = auth.uid()) $$;

-- ── creator grants money to a player ─────────────────────────────────────────
create or replace function grant_funds(p_membership_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare m memberships; amt numeric := round(coalesce(p_amount,0)::numeric, 2);
begin
  if amt <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  select * into m from memberships where id = p_membership_id;
  if m.id is null then raise exception 'Player not found.'; end if;
  if not is_game_creator(m.game_id) then raise exception 'Only the game creator can give money.'; end if;
  -- cash AND deposited go up (net capital in) so returns stay correct
  update memberships set cash = cash + amt, deposited = deposited + amt where id = m.id;
  insert into notifications(membership_id, kind, message, amount)
  values (m.id, 'grant', 'The game creator gave you P£' || trim(to_char(amt, 'FM999999990.00')) || '.', amt);
end $$;

-- ── player requests money → notifies the creator (no auto-grant) ─────────────
create or replace function request_funds(p_membership_id uuid, p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare m memberships; creator_mid uuid; amt numeric := round(coalesce(p_amount,0)::numeric, 2);
begin
  select * into m from memberships where id = p_membership_id;
  if m.id is null or m.user_id <> auth.uid() then raise exception 'Not your membership.'; end if;
  if amt <= 0 then raise exception 'Enter an amount greater than 0.'; end if;
  -- the creator's membership in this same game (where the notification lands)
  select mem.id into creator_mid from memberships mem
    join games g on g.id = mem.game_id
    where mem.game_id = m.game_id and mem.user_id = g.created_by;
  if creator_mid is null then raise exception 'This game has no creator to notify.'; end if;
  if creator_mid = m.id then raise exception 'You are the creator — use Give money instead.'; end if;
  insert into notifications(membership_id, kind, message, amount)
  values (creator_mid, 'request',
    m.username || ' requested P£' || trim(to_char(amt, 'FM999999990.00'))
      || coalesce(' — "' || nullif(trim(p_note),'') || '"', '') || '.', amt);
end $$;

-- ── creator edits the recurring-deposit config ───────────────────────────────
create or replace function update_deposit_config(
  p_game_id uuid, p_amount numeric, p_cadence text, p_time time
) returns void language plpgsql security definer set search_path = public as $$
declare amt numeric := case when coalesce(p_amount,0) > 0 then round(p_amount::numeric,2) else 0 end;
        cad text := case when amt > 0 then p_cadence else null end;
        tod time := case when amt > 0 then p_time else null end;
begin
  if not is_game_creator(p_game_id) then raise exception 'Only the game creator can change deposits.'; end if;
  update games set deposit_amount = amt, deposit_cadence = cad, deposit_time = tod where id = p_game_id;
  -- reseed everyone's next deposit time to the new schedule
  update memberships set next_deposit_at = case when amt > 0 then _next_deposit_at(cad, tod) else null end
  where game_id = p_game_id;
end $$;

grant execute on function grant_funds(uuid, numeric) to authenticated;
grant execute on function request_funds(uuid, numeric, text) to authenticated;
grant execute on function update_deposit_config(uuid, numeric, text, time) to authenticated;

-- ── deposits cron (REPLACES deposits_cron.sql) — now notifies + honours time ──
create extension if not exists pg_cron;

create or replace function apply_due_deposits() returns void
language plpgsql security definer set search_path = public as $$
declare m record; iv interval; nx timestamptz; add numeric; tod time;
begin
  for m in
    select mem.id, mem.username, mem.next_deposit_at as nda,
           g.deposit_amount as amt, g.deposit_cadence as cad, g.deposit_time as dtime
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
    update memberships set cash = cash + add, deposited = deposited + add, next_deposit_at = nx
    where id = m.id;
    insert into notifications(membership_id, kind, message, amount)
    values (m.id, 'deposit', 'Deposit received: P£' || trim(to_char(add, 'FM999999990.00')) || '.', add);
  end loop;
end $$;

select cron.unschedule('apply-deposits') where exists (select 1 from cron.job where jobname = 'apply-deposits');
select cron.schedule('apply-deposits', '*/30 * * * *', $$ select apply_due_deposits(); $$);
