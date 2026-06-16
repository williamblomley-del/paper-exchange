import { useState, useEffect } from "react";
import { fetchHistories } from "./prices.js";

// Rebuilds a REAL, market-following portfolio-value curve for a timeframe from the
// holdings' price histories: value(t) = cash + Σ shares × price_i(t). It ends at
// the live `totalValue` and moves with the market. (A "what-if-held-today's-shares"
// view — we don't store minute-by-minute account history.)
const LABEL = { "1D": "Last 24h", "1W": "Last week", "1M": "Last month", "1Y": "Last year", "MAX": "All time" };

// Chart-resolution policy. The visible WINDOW is per-timeframe, but the price FEED that
// drives the estimate is chosen by ACCOUNT AGE (not the timeframe) so every timeframe
// reconstructs the SAME underlying curve and just shows a different window of it — i.e.
// 1W / 1M / All agree where they overlap. (The recorded recent points are identical
// across timeframes already.) `down10` halves the 5-min 1D feed → 10-min spacing.
//   By account age: 30-min < 7d, hourly < month, daily < year, then weekly.
const WINDOW_DAYS = { "1D": 1, "1W": 7, "1M": 31, "1Y": 366, "MAX": 36500 };
function resolve(tf, ageDays) {
  const windowDays = WINDOW_DAYS[tf] ?? 36500;
  let range = "MAX", res = "1d";              // > 1 year → weekly
  if (ageDays <= 7) { range = "1W"; res = "15m"; }       // 30-min feed
  else if (ageDays <= 31) { range = "1M"; res = "1h"; }  // hourly
  else if (ageDays <= 366) { range = "1Y"; res = "1d"; } // daily
  if (tf === "1D") { range = "1D"; res = "15m"; }        // intraday always fine on the day view
  return { range, windowDays, down10: tf === "1D", res };
}

// cadence → days between recurring deposits (for the estimated pre-recording schedule)
const CAD_DAYS = { daily: 1, "2d": 2, "2pw": 3.5, weekly: 7, monthly: 30 };

export function usePortfolioPerf(positions, cash, startCash, totalValue, tf, history, startAt, mode = "own", deposited = null, vh = null, depCadence = null) {
  const [hist, setHist] = useState(null); // [{t,c}] reconstructed history (no live tail)
  const tickers = Object.keys(positions);
  // Don't reconstruct before the account existed — valuing today's shares at prices
  // from before you joined gives nonsense. Anchor to game/membership creation; fall
  // back to the first snapshot day.
  const accountStartT = startAt ? Math.floor(Date.parse(startAt) / 1000)
    : (history && history.length ? Math.floor(Date.parse(history[0].day) / 1000) : 0);
  const ageDays = accountStartT ? (Math.floor(Date.now() / 1000) - accountStartT) / 86400 : 9999;
  const { range, windowDays, down10, res } = resolve(tf, ageDays);
  // Earliest timestamp to keep: the window start, but never before the account existed.
  // If the account start is unknown (e.g. a rival with no readable snapshots), floor at
  // ~1 year ago so an unbounded "all-time" window doesn't reach back to epoch 1970.
  const nowS = Math.floor(Date.now() / 1000);
  const cutoff = Math.max(nowS - windowDays * 86400, accountStartT || (nowS - 366 * 86400));
  const key = tickers.slice().sort().join(",") + "|" + range + "|" + cutoff + "|" + cash + "|" + down10;

  // Recurring-deposit schedule (so deposits show as clean steps on the estimate). The
  // real total added beyond start cash is spread across the cadence from account open,
  // which for a young daily-deposit account lands ≈ the actual deposits (e.g. two 150s).
  const totalDep = Math.max(0, (deposited != null ? deposited : (startCash || 0)) - (startCash || 0));
  const depTimes = [];
  if (totalDep > 0 && accountStartT) {
    const ivS = (CAD_DAYS[depCadence] || 1) * 86400;
    for (let te = accountStartT + ivS; te <= nowS && depTimes.length < 4000; te += ivS) depTimes.push(te);
  }
  const depPer = depTimes.length ? totalDep / depTimes.length : 0;
  const depositsAfter = (t) => depPer * depTimes.filter((te) => te > t).length;
  const ekey = key + "|" + depPer + "|" + depTimes.length;

  useEffect(() => {
    let alive = true;
    if (tickers.length === 0) { setHist(null); return; }
    fetchHistories(tickers, range).then((hmap) => {
      if (!alive) return;
      const series = tickers.map((t) => {
        let h = (hmap[t] || []).filter((p) => p && p.c != null && p.t >= cutoff);
        if (down10) h = h.filter((_, i) => i % 2 === 0); // 5-min feed → 10-min points
        return { shares: positions[t].shares, avgCost: positions[t].avgCost, h };
      });
      const tsSet = new Set();
      series.forEach((s) => s.h.forEach((p) => tsSet.add(p.t)));
      const ts = [...tsSet].sort((a, b) => a - b);
      if (ts.length < 2) { setHist(null); return; }
      const ptr = series.map(() => 0);
      const last = series.map((s) => (s.h[0] ? s.h[0].c : null)); // price pre-first-tick = its first price
      const pts = ts.map((time) => {
        // COST-BASIS model: start cash + deposits-so-far + each holding's gain/loss vs what
        // you PAID. Starts ≈ start cash (no back-projection dip) and ends exactly on the live
        // value; deposits show as steps. (price − avgCost so a holding contributes 0 at cost.)
        let pl = 0;
        series.forEach((s, i) => {
          while (ptr[i] < s.h.length && s.h[ptr[i]].t <= time) { last[i] = s.h[ptr[i]].c; ptr[i]++; }
          if (last[i] != null) pl += s.shares * (last[i] - s.avgCost);
        });
        return { t: time, c: (startCash || 0) + (totalDep - depositsAfter(time)) + pl };
      });
      setHist(pts);
    }).catch(() => { if (alive) setHist(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ekey]);

  const label = LABEL[tf] || "All time";
  const baseCap = startCash || totalValue || 1; // the game's ORIGINAL start cash ("10k")
  const tail = { t: nowS, c: totalValue };      // ends exactly on the live total value
  // Does this view reach back to when the account opened? If so, every account begins
  // at its ORIGINAL START CASH ("10k") — anchor the curve there with a flat "day before
  // you opened" segment. Recurring deposits then show up as the line stepping up over
  // time (they're part of your balance growth — the "simple" model).
  const includesOpen = !!accountStartT && cutoff <= accountStartT + 300;

  // Use the smooth cost-basis ESTIMATE for the curve shape: holdings priced via Yahoo +
  // clean deposit steps + ends on the live value. We do NOT plot the raw recorded points
  // as the shape — for inactive accounts those are just sparse deposit rows written at
  // ESTIMATED heights (the server can't price holdings), which produced a jagged line
  // (the "+315 / dip / re-rise"). Recording continues in the background for future use.
  let core = (hist && hist.length) ? hist : null;
  if (core && core.length > 350) { const step = Math.ceil(core.length / 350); core = core.filter((_, i) => i % step === 0); }

  let points;
  if (core && core.length) {
    let lead;
    if (includesOpen) {
      // flat at the starting capital from the day before open; hold flat through open
      // unless the first point is right at open (avoids a duplicate timestamp).
      lead = [{ t: accountStartT - 86400, c: baseCap }];
      if (core[0].t > accountStartT + 300) lead.push({ t: accountStartT, c: baseCap });
    } else if (core[0].t > cutoff + 300) {
      lead = [{ t: cutoff, c: core[0].c }]; // window starts after open → baseline at window start
    } else {
      lead = [];
    }
    points = [...lead, ...core, tail];
  } else if (depTimes.length) {
    // all cash, no recorded points → flat line stepping up at each estimated deposit
    const startT = accountStartT ? accountStartT - 86400 : nowS - 86400;
    points = [{ t: startT, c: baseCap }, ...depTimes.map((te) => ({ t: te, c: cash - depositsAfter(te) })), tail];
  } else {
    const startT = accountStartT ? accountStartT - 86400 : nowS - 86400;
    points = [{ t: startT, c: baseCap }, tail];
  }
  const resForChart = res;
  // % EXCLUDES deposits: for views back to account open, measure vs total capital in
  // (`deposited` = start cash + every deposit) so a deposit doesn't count as performance.
  // The graph still STARTS at the start cash and shows deposits as the line rising — the
  // % just doesn't credit them. Shorter windows (not back to open) use the window start.
  let chg, pct;
  if (includesOpen && deposited != null) {
    chg = totalValue - deposited;
    pct = deposited ? (chg / deposited) * 100 : 0;
  } else {
    const base = points[0].c;
    chg = points[points.length - 1].c - base;
    pct = base ? (chg / base) * 100 : 0;
  }
  return { points, chg, pct, up: chg >= 0, label, resolution: resForChart };
}
