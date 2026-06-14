import { createClient } from "@supabase/supabase-js";

// Reads your project's URL + anon key from .env.local (VITE_ vars are exposed to
// the browser by Vite). The anon key is SAFE to ship — it's protected by Row
// Level Security. The Finnhub key is NOT here; it stays server-side in the Edge
// Function (Milestone 3).
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(URL && KEY && URL.startsWith("http") && !URL.includes("PASTE_"));
export const supabase = configured ? createClient(URL, KEY) : null;

// ── Account auth (email + password) ─────────────────────────────────────────
// The account is identified by EMAIL. The in-game display name is chosen PER
// GAME (so the same username can be reused across different games). `username`
// here is just a default that pre-fills the per-game name. With "Confirm email"
// OFF, sign-up returns a session immediately.
export const signUp = (email, password, username) =>
  supabase.auth.signUp({ email, password, options: { data: { username } } });
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();
export const getSession = () => supabase.auth.getSession();

// ── Games + memberships ─────────────────────────────────────────────────────
const genCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

// First deposit due-time from a cadence (server cron advances it after that).
export function nextDepositAt(cadence) {
  if (!cadence) return null;
  const d = new Date();
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "2d") d.setDate(d.getDate() + 2);
  else if (cadence === "2pw") d.setHours(d.getHours() + 84); // twice a week
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else if (cadence === "monthly") d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString();
}

// All games this user belongs to, with the game details joined.
export async function loadMemberships(userId) {
  const { data } = await supabase
    .from("memberships")
    .select("id, game_id, username, cash, deposited, next_deposit_at, created_at, games(id, code, name, start_cash, deposit_amount, deposit_cadence)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data || [];
}

// Create a game (with config) + the creator's membership in ONE server-side call
// (a SECURITY DEFINER function) so both inserts share the same auth context.
export async function createGame({ name, startCash, depositAmount, depositCadence, username }) {
  const { data, error } = await supabase.rpc("create_game", {
    p_name: name || null,
    p_username: (username || "").trim(),
    p_start_cash: Number(startCash) > 0 ? Number(startCash) : 10000,
    p_deposit_amount: Number(depositAmount) > 0 ? Number(depositAmount) : 0,
    p_deposit_cadence: Number(depositAmount) > 0 ? depositCadence : null,
  });
  if (error) return { error };
  return { membership: data };
}

// Join an existing game by code with a chosen username (server-side function).
export async function joinGame(code, username) {
  const { data, error } = await supabase.rpc("join_game", {
    p_code: (code || "").trim(),
    p_username: (username || "").trim(),
  });
  if (error) return { error };
  return { membership: data };
}

// Change display name everywhere (shared across games): updates every membership
// this user has + the account metadata. Username must stay unique within a game.
export async function updateUsername(userId, newName) {
  const name = (newName || "").trim();
  if (name.length < 2 || name.length > 16) return { error: { message: "Name must be 2–16 characters." } };
  const { error } = await supabase.from("memberships").update({ username: name }).eq("user_id", userId);
  if (error) return { error: { message: error.code === "23505" ? "That name is taken in one of your games — pick another." : error.message } };
  await supabase.auth.updateUser({ data: { username: name } });
  return { ok: true, name };
}

// ── Per-membership game data ────────────────────────────────────────────────
export async function loadGameData(membershipId) {
  const [{ data: pos }, { data: tr }, { data: snaps }] = await Promise.all([
    supabase.from("positions").select("ticker, shares, avg_cost").eq("membership_id", membershipId),
    supabase.from("trades").select("*").eq("membership_id", membershipId).order("created_at", { ascending: false }).limit(50),
    supabase.from("portfolio_snapshots").select("day, value").eq("membership_id", membershipId).order("day", { ascending: true }),
  ]);
  return { positions: pos || [], trades: tr || [], snapshots: snaps || [] };
}

export async function loadSnapshots(membershipId) {
  if (!membershipId) return [];
  const { data } = await supabase.from("portfolio_snapshots").select("day, value").eq("membership_id", membershipId).order("day", { ascending: true });
  return data || [];
}

export async function recordSnapshot(membershipId, value) {
  if (!membershipId || value == null || isNaN(value)) return;
  const day = new Date().toISOString().slice(0, 10);
  await supabase.from("portfolio_snapshots").upsert({ membership_id: membershipId, day, value }, { onConflict: "membership_id,day" });
}

// Everyone in a game (+ their holdings) for the leaderboard.
export async function loadBoardRows(gameId) {
  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, username, cash, deposited, positions(ticker, shares, avg_cost)")
    .eq("game_id", gameId);
  return data || [];
}
