-- Let players in the SAME game read each other's value-history snapshots, so the
-- leaderboard can show a real performance line for each rival (not just holdings).
-- Writing stays own-only. Supabase → SQL Editor → New query → paste → Run.

drop policy if exists "snap_read" on portfolio_snapshots;
create policy "snap_read" on portfolio_snapshots
  for select using (membership_id in (select game_member_ids()));
