import { useState, useEffect, useMemo, useRef } from "react";
import { C, DONUT } from "./theme.js";
import { fmt, P, money, pct, currencyOf } from "./lib/format.js";
import { MOCK_STOCKS, WATCH } from "./lib/mockData.js";
import { supabase, configured, signOut, loadMemberships, createGame, joinGame, loadGameData, recordSnapshot, loadBoardRows, updateUsername, loadNotifications, markNotificationsRead, grantFunds, requestFunds, updateDepositConfig } from "./lib/supabase.js";
import { fetchQuote, fetchQuotes, fetchPrices, searchSymbols, fetchLists } from "./lib/prices.js";
import { PricesCtx } from "./lib/pricesContext.js";
import GlobalStyles from "./components/GlobalStyles.jsx";
import Avatar from "./components/Avatar.jsx";
import Logo from "./components/Logo.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import GamePicker from "./components/GamePicker.jsx";
import Market from "./tabs/Market.jsx";
import Portfolio from "./tabs/Portfolio.jsx";
import Leaderboard from "./tabs/Leaderboard.jsx";

// Nav tab icons (Trading 212 style): chart / pie / leaderboard bars.
const NAV_ICON = {
  market: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 3-3 3 2 5-6" /></svg>),
  portfolio: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 12V3" /><path d="m12 12 7.5 4.5" /></svg>),
  board: (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="5" height="9" rx="1" /><rect x="9.5" y="5" width="5" height="15" rx="1" /><rect x="16" y="14" width="5" height="6" rx="1" /></svg>),
};

// Default "biggest companies" shown when the search box is empty.
const TOP_STOCKS = [
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ" },
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ" },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" },
  { symbol: "BRK-B", name: "Berkshire Hathaway Inc.", exchange: "NYSE" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE" },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE" },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE" },
];
const Center = ({ children }) => (
  <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.sans, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
    <div style={{ maxWidth: 440 }}>{children}</div>
  </div>
);

export default function App() {
  // auth/session
  const [session, setSession] = useState(undefined); // undefined = not checked yet
  const [phase, setPhase] = useState("loading");      // loading | auth | games | app
  const [memberships, setMemberships] = useState([]);
  const [currentMid, setCurrentMid] = useState(null); // current membership id
  const [board, setBoard] = useState([]);             // [{ id, username, value, ret }]
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);           // current membership's notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // ui state
  const [tab, setTab] = useState(() => localStorage.getItem("pe_tab") || "market"); // survive refresh
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searchModal, setSearchModal] = useState(false);
  const [recents, setRecents] = useState(() => { try { return JSON.parse(localStorage.getItem("pe_recents") || "[]"); } catch { return []; } });
  const searchTimer = useRef();
  const [active, setActive] = useState("NVDA");
  const [tf, setTf] = useState(() => localStorage.getItem("pe_tf") || "1D"); // default Day; last choice persists
  const [tradeMode, setTradeMode] = useState("cash");
  const [tradeAmt, setTradeAmt] = useState("");
  const [msg, setMsg] = useState(null);
  const [selUser, setSelUser] = useState(null);

  // account data (per current membership)
  const [cash, setCash] = useState(0);
  const [invested, setInvested] = useState(0); // net capital in (start cash + deposits)
  const [positions, setPositions] = useState({});
  const [trades, setTrades] = useState([]); // eslint-disable-line no-unused-vars
  const [live, setLive] = useState({});
  const [history, setHistory] = useState([]); // [{day, value}]
  const [lists, setLists] = useState({}); // real {gainers, losers, actives} from Yahoo

  const loadedUid = useRef(null); // which user we've already loaded (avoids reload on tab refocus)
  const mem = memberships.find((m) => m.id === currentMid) || null;
  const game = mem?.games || null;
  const username = mem?.username || session?.user?.user_metadata?.username || "You";
  const isCreator = !!(game && session?.user && game.created_by === session.user.id);
  const unread = notifs.filter((n) => !n.read).length;

  // Reload notifications for the current membership. Also re-pulls memberships +
  // board when balances may have changed (after a grant / new deposit).
  async function refreshNotifs(reloadBalances = false) {
    if (!currentMid) return;
    const list = await loadNotifications(currentMid);
    setNotifs(list);
    if (reloadBalances && session?.user) {
      const mems = await loadMemberships(session.user.id);
      setMemberships(mems);
      const m = mems.find((x) => x.id === currentMid);
      if (m) { setCash(Number(m.cash)); setInvested(Number(m.deposited)); }
      if (tab === "board") loadBoard();
    }
  }

  // Creator gives a player money → reload balances + board + that player's notif.
  async function handleGrant(membershipId, amount) {
    const r = await grantFunds(membershipId, amount);
    if (r.error) { setMsg({ kind: "err", text: r.error.message }); return r; }
    setMsg({ kind: "ok", text: `Gave P£${Number(amount).toLocaleString("en-GB")} to the player.` });
    await refreshNotifs(true);
    return r;
  }
  // Player requests money → pings the creator (no balance change).
  async function handleRequest(amount, note) {
    const r = await requestFunds(currentMid, amount, note);
    if (r.error) { setMsg({ kind: "err", text: r.error.message }); return r; }
    setMsg({ kind: "ok", text: `Requested P£${Number(amount).toLocaleString("en-GB")} from the game creator.` });
    return r;
  }
  // Creator edits the recurring deposit (amount + cadence + time of day).
  async function handleDepositConfig(amount, cadence, time) {
    if (!game?.id) return { error: { message: "No game." } };
    const r = await updateDepositConfig(game.id, amount, cadence, time);
    if (r.error) { setMsg({ kind: "err", text: r.error.message }); return r; }
    setMsg({ kind: "ok", text: "Deposit settings updated." });
    const mems = await loadMemberships(session.user.id); setMemberships(mems);
    return r;
  }

  // ── auth wiring ──────────────────────────────────────────────
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Token refreshes (e.g. when you switch browser tabs and come back) and
      // metadata updates must NOT trigger a full reload — that was resetting the
      // open tab back to Market. The client keeps using the fresh token anyway.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the data for one game and enter it.
  async function enterGame(m) {
    setCurrentMid(m.id);
    try { localStorage.setItem("pe_current_game", m.id); } catch { /* ignore */ }
    setPhase("loading");
    setCash(Number(m.cash));
    setInvested(Number(m.deposited));
    const { positions: pos, trades: tr, snapshots } = await loadGameData(m.id);
    const map = {};
    pos.forEach((p) => { map[p.ticker] = { shares: Number(p.shares), avgCost: Number(p.avg_cost) }; });
    setPositions(map);
    setTrades(tr);
    setHistory(snapshots);
    setPhase("app");
  }

  async function refreshMemberships() {
    const mems = await loadMemberships(session.user.id);
    setMemberships(mems);
    return mems;
  }

  // On session change → load this account's games, then pick where to land.
  useEffect(() => {
    if (!configured || session === undefined) return;
    if (!session) { setPhase("auth"); setMemberships([]); setCurrentMid(null); loadedUid.current = null; return; }
    // Already loaded this exact user? Then this is a token refresh / tab refocus —
    // do NOT reload (that was bouncing you back to the Market tab).
    if (session.user.id === loadedUid.current) return;
    loadedUid.current = session.user.id;
    let cancelled = false;
    (async () => {
      setPhase("loading");
      const mems = await loadMemberships(session.user.id);
      if (cancelled) return;
      setMemberships(mems);
      const saved = localStorage.getItem("pe_current_game");
      const found = mems.find((m) => m.id === saved);
      if (found) enterGame(found);
      else setPhase("games"); // pick / create / join
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── live prices + daily snapshot ─────────────────────────────
  useEffect(() => {
    if (phase !== "app" || !currentMid) return;
    const tickers = Array.from(new Set([...WATCH, ...Object.keys(positions)]));
    fetchPrices(tickers).then(async (map) => {
      setLive((prev) => ({ ...prev, ...map }));
      const px = (t) => map[t]?.price ?? live[t]?.price ?? MOCK_STOCKS[t]?.price ?? 0;
      let v = cash;
      Object.entries(positions).forEach(([t, p]) => { v += p.shares * px(t); });
      await recordSnapshot(currentMid, v).catch(() => {});
      const today = new Date().toISOString().slice(0, 10);
      setHistory((h) => [...h.filter((x) => x.day !== today), { day: today, value: v }]);
    }).catch(() => {});
    // Fresh live quotes for HELD tickers (bypasses cache) → real price + daily change,
    // merged per-ticker so logo/name/currency from the full load are kept.
    fetchQuotes(Object.keys(positions)).then((qmap) => setLive((prev) => {
      const n = { ...prev };
      for (const k in qmap) n[k] = { ...prev[k], ...qmap[k] };
      return n;
    })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentMid]);

  // Full detail + REAL history for the active stock at the current timeframe.
  useEffect(() => {
    if (phase !== "app") return;
    fetchQuote(active, tf).then((d) => setLive((prev) => ({ ...prev, [active]: d }))).catch(() => {});
  }, [active, tf, phase]);

  // Fast, cheap price tick for the stock you're VIEWING (every 12s) so its headline
  // + chart edge move on their own without a full history refetch. (Yahoo-only.)
  useEffect(() => {
    if (phase !== "app" || !active) return;
    const id = setInterval(() => {
      fetchQuotes([active]).then((qmap) => { if (qmap[active]) setLive((prev) => ({ ...prev, [active]: { ...prev[active], ...qmap[active] } })); }).catch(() => {});
    }, 12000);
    return () => clearInterval(id);
  }, [active, phase]);

  // Live auto-refresh: re-pull prices every 60s so value/day-change/charts tick
  // with the market without a manual refresh. (Watchlist is server-cached so this
  // stays well under Finnhub's free 60/min limit.)
  useEffect(() => {
    if (phase !== "app") return;
    const id = setInterval(() => {
      // Lightweight tick: one cheap (server-cached) bulk price pull, MERGED per
      // ticker so we keep each holding's prevClose (a daily value fetched on load).
      // No per-holding history refetch here — that was heavy and caused jank.
      const merge = (map) => setLive((prev) => { const n = { ...prev }; for (const k in map) n[k] = { ...prev[k], ...map[k] }; return n; });
      fetchPrices(WATCH).then(merge).catch(() => {});                 // watchlist (cheap, cached)
      fetchQuotes(Object.keys(positions)).then(merge).catch(() => {}); // holdings: FRESH price + daily %
      if (active) fetchQuote(active, tf).then((d) => setLive((prev) => ({ ...prev, [active]: d }))).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, positions, active, tf]);

  // Notifications: load on entering a game, then poll every 60s (deposits land
  // server-side via cron, grants/requests via other players → arrive in the bell).
  useEffect(() => {
    if (phase !== "app" || !currentMid) return;
    refreshNotifs(false);
    const id = setInterval(() => refreshNotifs(false), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentMid]);

  // Real market lists (gainers/losers/most active) once in the app.
  useEffect(() => {
    if (phase !== "app") return;
    fetchLists().then((d) => {
      setLists(d || {});
      const merge = {};
      ["gainers", "losers", "actives"].forEach((k) => (d?.[k] || []).forEach((it) => { if (it.price != null) merge[it.symbol] = { price: it.price, changePct: it.changePct, name: it.name, currency: it.currency }; }));
      setLive((prev) => ({ ...merge, ...prev })); // keep richer existing entries
    }).catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(id);
  }, [msg]);

  // Persist current tab + timeframe so a refresh keeps you where you were.
  useEffect(() => { try { localStorage.setItem("pe_tab", tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => { try { localStorage.setItem("pe_tf", tf); } catch { /* ignore */ } }, [tf]);

  useEffect(() => {
    if (phase !== "app" || !active) return;
    setRecents((prev) => {
      const next = [active, ...prev.filter((x) => x !== active)].slice(0, 8);
      try { localStorage.setItem("pe_recents", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [active, phase]);

  useEffect(() => {
    if (!searchModal) return;
    const miss = [...TOP_STOCKS.map((x) => x.symbol), ...recents].filter((s) => !live[s]);
    if (miss.length) fetchPrices(miss).then((map) => setLive((prev) => ({ ...prev, ...map }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchModal]);

  const priceOf = (t) => (live[t]?.price != null ? live[t].price : (MOCK_STOCKS[t]?.price ?? 0));

  // Per-game leaderboard: everyone in this game, ranked by total value.
  async function loadBoard() {
    if (!game?.id) { setBoard([]); return; }
    const rows = await loadBoardRows(game.id);
    const tickers = new Set();
    rows.forEach((r) => (r.positions || []).forEach((x) => tickers.add(x.ticker)));
    const priceMap = await fetchPrices([...tickers]).catch(() => ({}));
    setLive((prev) => ({ ...prev, ...priceMap }));
    const px = (t) => priceMap[t]?.price ?? live[t]?.price ?? MOCK_STOCKS[t]?.price ?? null;
    const ranked = rows.map((r) => {
      let v = Number(r.cash);
      (r.positions || []).forEach((x) => { v += Number(x.shares) * (px(x.ticker) ?? Number(x.avg_cost)); });
      const inv = Number(r.deposited) || 1;
      return {
        id: r.id, username: r.username, value: v, ret: ((v - inv) / inv) * 100,
        cash: Number(r.cash), deposited: inv,
        holdings: (r.positions || []).map((x) => ({ ticker: x.ticker, shares: Number(x.shares), avgCost: Number(x.avg_cost) })),
      };
    }).sort((a, b) => b.value - a.value);
    setBoard(ranked);
  }
  useEffect(() => {
    if (phase === "app" && tab === "board") loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, phase, currentMid]);

  // ── derived ──────────────────────────────────────────────────
  const stock = { ...MOCK_STOCKS[active], ...live[active] };
  const totalValue = useMemo(() => {
    let v = cash;
    Object.entries(positions).forEach(([t, p]) => { v += p.shares * priceOf(t); });
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cash, positions, live]);
  const totalPL = totalValue - invested;
  const allocation = useMemo(() => {
    const items = Object.entries(positions).map(([t, p], i) => ({
      ticker: t, name: MOCK_STOCKS[t]?.name ?? t,
      value: p.shares * priceOf(t), color: DONUT[i % DONUT.length],
    }));
    items.push({ ticker: "CASH", name: "Cash", value: cash, color: "#CBD2DC" });
    items.sort((a, b) => b.value - a.value);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, cash, live]);

  // Search ANY US ticker — fetch it live; if valid, open it in the Market tab.
  async function searchOpen(sym) {
    const t = sym.trim().toUpperCase();
    if (!t) return;
    setSearch("");
    try {
      const d = await fetchQuote(t, tf);
      if (!d || d.price == null) throw new Error("not found");
      setLive((prev) => ({ ...prev, [t]: d }));
      setActive(t);
      setTab("market");
      setMsg(null);
    } catch {
      setMsg({ kind: "err", text: `Couldn't find "${t}". Try a US ticker (e.g. NVDA, AAPL, TSLA, KO).` });
    }
  }

  function ensurePrices(symbols) {
    const miss = symbols.filter((s) => !live[s]);
    if (miss.length) fetchPrices(miss).then((map) => setLive((prev) => ({ ...prev, ...map }))).catch(() => {});
  }

  function onSearchChange(v) {
    setSearch(v);
    clearTimeout(searchTimer.current);
    if (v.trim().length < 2) { setResults([]); return; } // a single letter gives noisy Yahoo results
    searchTimer.current = setTimeout(async () => {
      const r = await searchSymbols(v);
      setResults(r);
      ensurePrices(r.map((x) => x.symbol));
    }, 220);
  }
  function openSymbol(sym) {
    setActive(sym); setTab("market"); setMsg(null);
    setSearchModal(false); setSearch(""); setResults([]);
  }
  function closeSearch() { setSearchModal(false); setSearch(""); setResults([]); }

  // ── trading (writes to Supabase, scoped to current membership) ───────────
  async function trade(side) {
    const price = stock.price;
    const amt = parseFloat(tradeAmt);
    if (!amt || amt <= 0) return setMsg({ kind: "err", text: "Enter an amount first." });
    const shares = tradeMode === "cash" ? amt / price : amt;
    const cost = shares * price;
    const mid = currentMid;
    let newCash, newPositions;
    try {
      if (side === "buy") {
        if (cost > cash + 1e-9) return setMsg({ kind: "err", text: `Not enough cash — you have ${P(cash)}.` });
        const pos = positions[active] || { shares: 0, avgCost: 0 };
        const ns = pos.shares + shares;
        const na = (pos.shares * pos.avgCost + cost) / ns;
        newCash = cash - cost;
        newPositions = { ...positions, [active]: { shares: ns, avgCost: na } };
        await supabase.from("memberships").update({ cash: newCash }).eq("id", mid);
        await supabase.from("positions").upsert({ membership_id: mid, ticker: active, shares: ns, avg_cost: na, ticker_name: stock.name }, { onConflict: "membership_id,ticker" });
        await supabase.from("trades").insert({ membership_id: mid, ticker: active, side: "buy", shares, price, value: cost });
        setCash(newCash); setPositions(newPositions);
      } else {
        const pos = positions[active];
        if (!pos || pos.shares < shares - 1e-9) return setMsg({ kind: "err", text: `You hold ${pos ? fmt(pos.shares, 4) : 0} ${active}.` });
        const rem = pos.shares - shares;
        newCash = cash + cost;
        newPositions = { ...positions }; if (rem < 1e-7) delete newPositions[active]; else newPositions[active] = { ...pos, shares: rem };
        await supabase.from("memberships").update({ cash: newCash }).eq("id", mid);
        if (rem < 1e-7) await supabase.from("positions").delete().eq("membership_id", mid).eq("ticker", active);
        else await supabase.from("positions").update({ shares: rem }).eq("membership_id", mid).eq("ticker", active);
        await supabase.from("trades").insert({ membership_id: mid, ticker: active, side: "sell", shares, price, value: cost });
        setCash(newCash); setPositions(newPositions);
      }
      const today = new Date().toISOString().slice(0, 10);
      let v = newCash;
      Object.entries(newPositions).forEach(([t, p]) => { v += p.shares * priceOf(t); });
      recordSnapshot(mid, v).catch(() => {});
      setHistory((h) => [...h.filter((x) => x.day !== today), { day: today, value: v }]);
      setMemberships((ms) => ms.map((m) => (m.id === mid ? { ...m, cash: newCash } : m)));
      setTrades((t) => [{ side, ticker: active, shares, price, value: cost, ts: Date.now() }, ...t].slice(0, 50));
      setTradeAmt("");
      setMsg({ kind: "ok", text: `${side === "buy" ? "Bought" : "Sold"} ${fmt(shares, 4)} ${active} at ${P(price)} — ${P(cost)} total.` });
    } catch (err) {
      setMsg({ kind: "err", text: `Trade failed: ${err.message || err}` });
    }
  }

  // Save a new display name (applies to all your games).
  async function saveName() {
    const r = await updateUsername(session.user.id, nameDraft);
    if (r.error) return setMsg({ kind: "err", text: r.error.message });
    setMemberships((ms) => ms.map((m) => ({ ...m, username: r.name })));
    await supabase.auth.refreshSession().catch(() => {});
    setProfileOpen(false);
    setMsg({ kind: "ok", text: "Name updated across your games." });
  }

  // ── gates ────────────────────────────────────────────────────
  if (!configured) return (
    <><GlobalStyles /><Center>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Supabase not configured</div>
      <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>Add your <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the dev server (<code>npm run dev</code>).</div>
    </Center></>
  );
  if (phase === "loading") return (<><GlobalStyles /><Center><div style={{ color: C.dim, fontSize: 14 }}>Loading…</div></Center></>);
  if (phase === "auth") return (<><GlobalStyles /><AuthScreen /></>);
  if (phase === "games") return (
    <><GlobalStyles />
      <GamePicker
        userId={session.user.id}
        defaultName={session.user.user_metadata?.username || ""}
        memberships={memberships}
        onEnter={enterGame}
        refresh={refreshMemberships}
        onSignOut={signOut}
      />
    </>
  );

  // ── app ──────────────────────────────────────────────────────
  return (
    <PricesCtx.Provider value={{ live }}>
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.sans, color: C.ink }}>
      <GlobalStyles />

      {/* top nav */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 28px", height: 64, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg,${C.blue},#6366F1)` }} />
            PaperExchange
          </div>

          <div style={{ flex: 1 }} />

          {/* centered tabs (icons) */}
          <div style={{ display: "flex", gap: 8 }}>
            {[["market", "Market"], ["portfolio", "Portfolio"], ["board", "Leaderboard"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="nav-tab" aria-label={l} title={l} style={{ background: "none", border: "none", padding: "8px 18px", display: "flex", alignItems: "center", color: tab === k ? C.blue : C.dim }}>
                {NAV_ICON[k]}{tab === k && <div style={{ position: "absolute", left: 16, right: 16, bottom: -21, height: 2.5, background: C.blue, borderRadius: 2 }} />}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* right group: search + bell + avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => setSearchModal(true)} style={{ width: 300, display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", fontSize: 14, background: C.fill, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 14 }}>⌕</span> Search
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => { const next = !notifOpen; setNotifOpen(next); if (next && unread) { markNotificationsRead(currentMid).then(() => refreshNotifs(false)); } }} className="btn" aria-label="Notifications" title="Notifications" style={{ border: "none", background: "none", padding: 0, color: notifOpen ? C.blue : C.dim, lineHeight: 0, cursor: "pointer", position: "relative" }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                {unread > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unread > 9 ? "9+" : unread}</span>}
              </button>
              {notifOpen && (
                <>
                  <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                  <div style={{ position: "absolute", right: 0, top: 38, zIndex: 31, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: C.sh, width: 320, maxHeight: 420, overflowY: "auto" }}>
                    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontWeight: 700, fontSize: 14 }}>Notifications</div>
                    {notifs.length === 0 ? (
                      <div style={{ padding: "20px 14px", color: C.dim, fontSize: 13, textAlign: "center" }}>No notifications yet.</div>
                    ) : notifs.map((n) => (
                      <div key={n.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 15, lineHeight: "20px" }}>{n.kind === "deposit" ? "💰" : n.kind === "grant" ? "🎁" : "🙋"}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{n.message}</div>
                          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{new Date(n.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen((o) => !o)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }} aria-label="Account"><Avatar name={username} size={34} /></button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                  <div style={{ position: "absolute", right: 0, top: 44, zIndex: 31, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: C.sh, minWidth: 240, overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
                      <div style={{ fontSize: 11, color: C.dim }}>Playing as</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{username}</div>
                    </div>
                    {game && (
                      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
                        <div style={{ fontSize: 11, color: C.dim }}>{game.name || "Game"} · share code</div>
                        <button onClick={() => { navigator.clipboard?.writeText(game.code); setMsg({ kind: "ok", text: `Game code ${game.code} copied — share it with friends!` }); }} style={{ marginTop: 2, fontFamily: C.mono, fontWeight: 800, fontSize: 18, letterSpacing: "0.12em", color: C.blue, border: "none", background: "none", padding: 0, cursor: "pointer" }}>{game.code}</button>
                      </div>
                    )}
                    <button onClick={() => { setMenuOpen(false); setNameDraft(username); setProfileOpen(true); }} className="wrow" style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "none", fontSize: 14, color: C.ink, fontWeight: 600 }}>Edit profile</button>
                    <button onClick={() => { setMenuOpen(false); setPhase("games"); }} className="wrow" style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "none", fontSize: 14, color: C.ink, fontWeight: 600 }}>Switch / new game</button>
                    <button onClick={() => { setMenuOpen(false); signOut(); }} className="wrow" style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "none", fontSize: 14, color: C.red, fontWeight: 600 }}>Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* centered search modal (command-palette style) */}
      {searchModal && (
        <div onClick={closeSearch} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(13,17,23,0.35)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
          {(() => {
            const searching = search.trim().length >= 2;
            const shown = searching ? results : TOP_STOCKS;
            return (
              <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px,92vw)", background: C.card, borderRadius: 16, boxShadow: "0 24px 64px rgba(13,17,23,0.28)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ color: C.muted, fontSize: 16 }}>⌕</span>
                  <input autoFocus value={search} onChange={(e) => onSearchChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && search.trim()) openSymbol(results.length ? results[0].symbol : search.trim().toUpperCase()); if (e.key === "Escape") closeSearch(); }} placeholder="Search companies (Porsche, AstraZeneca, NVDA)…" style={{ flex: 1, border: "none", outline: "none", fontSize: 16, background: "none", color: C.ink, fontFamily: C.sans }} />
                  <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 6px" }}>esc</span>
                </div>
                {!search.trim() && recents.length > 0 && (
                  <>
                    <div style={{ padding: "10px 18px 6px", fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.04em" }}>RECENTLY VIEWED</div>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 18px 12px" }}>
                      {recents.map((t) => {
                        const d = live[t];
                        return (
                          <button key={t} onClick={() => openSymbol(t)} className="lift" style={{ flexShrink: 0, width: 96, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 8px", background: C.card, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                            <Logo ticker={t} size={30} />
                            <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t}</div>
                            {d?.changePct != null && <div style={{ fontSize: 11, fontWeight: 600, color: d.changePct >= 0 ? C.green : C.red }}>{pct(d.changePct)}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <div style={{ padding: "8px 18px 4px", fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.04em" }}>{searching ? "RESULTS" : "BIGGEST COMPANIES"}</div>
                <div style={{ maxHeight: "52vh", overflowY: "auto", paddingBottom: 6 }}>
                  {shown.map((r) => {
                    const d = live[r.symbol];
                    return (
                      <button key={r.symbol} onClick={() => openSymbol(r.symbol)} className="wrow" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "10px 18px", border: "none", background: "none", cursor: "pointer" }}>
                        <Logo ticker={r.symbol} size={32} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: C.dim }}>{r.symbol}{r.exchange ? ` · ${r.exchange}` : ""}</div>
                        </span>
                        {d && d.price != null && (
                          <span style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{money(d.price, currencyOf(r.symbol, d.currency))}</div>
                            {d.changePct != null && <div style={{ fontSize: 12, fontWeight: 600, color: d.changePct >= 0 ? C.green : C.red }}>{pct(d.changePct)}</div>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {searching && shown.length === 0 && <div style={{ padding: "10px 18px", fontSize: 13, color: C.dim }}>No matches — try a company name or ticker.</div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* edit-profile modal */}
      {profileOpen && (
        <div onClick={() => setProfileOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(13,17,23,0.35)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "16vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px,92vw)", background: C.card, borderRadius: 16, boxShadow: "0 24px 64px rgba(13,17,23,0.28)", padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Edit profile</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <Avatar name={nameDraft || username} size={56} />
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>Your avatar is your initial + colour for now. Photo upload is coming soon.</div>
            </div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: 6, display: "block" }}>Display name (used in all your games)</label>
            <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={16} onKeyDown={(e) => { if (e.key === "Enter") saveName(); }} className="pi" style={{ width: "100%", padding: "12px 14px", fontSize: 15, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setProfileOpen(false)} className="btn" style={{ flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 700, border: `1px solid ${C.line}`, borderRadius: 10, background: C.card, color: C.ink }}>Cancel</button>
              <button onClick={saveName} className="trbtn" style={{ flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 10, background: C.blue, color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* fixed toast */}
      {msg && (
        <div style={{ position: "fixed", top: 78, left: "50%", transform: "translateX(-50%)", zIndex: 60, padding: "12px 18px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, background: msg.kind === "ok" ? "#0CAF71" : "#E5484D", color: "#fff", boxShadow: "0 8px 24px rgba(13,17,23,0.18)" }}>
          <span>{msg.kind === "ok" ? "✓" : "✕"}</span>{msg.text}
        </div>
      )}

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "20px 28px 0" }}>
        {tab === "market" && (
          <Market
            active={active} setActive={setActive} tf={tf} setTf={setTf} stock={stock}
            positions={positions} tradeMode={tradeMode} setTradeMode={setTradeMode}
            tradeAmt={tradeAmt} setTradeAmt={setTradeAmt} trade={trade} cash={cash}
            totalValue={totalValue} history={history} invested={invested} lists={lists} gameStart={mem?.created_at}
          />
        )}

        {tab === "portfolio" && (
          <Portfolio
            totalValue={totalValue} totalPL={totalPL} cash={cash} positions={positions}
            allocation={allocation} setActive={setActive} active={active}
            tf={tf} setTf={setTf} tradeMode={tradeMode} setTradeMode={setTradeMode}
            tradeAmt={tradeAmt} setTradeAmt={setTradeAmt} trade={trade} history={history} invested={invested} gameStart={mem?.created_at}
            onRequestMoney={handleRequest}
          />
        )}

        {tab === "board" && (
          <Leaderboard
            board={board} meId={currentMid} game={game} selUser={selUser} setSelUser={setSelUser}
            active={active} setActive={setActive} tf={tf} setTf={setTf}
            tradeMode={tradeMode} setTradeMode={setTradeMode} tradeAmt={tradeAmt} setTradeAmt={setTradeAmt}
            isCreator={isCreator} onGrant={handleGrant} onDepositConfig={handleDepositConfig}
          />
        )}
      </div>

    </div>
    </PricesCtx.Provider>
  );
}
