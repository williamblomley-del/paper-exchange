import { useState, useEffect } from "react";
import { fetchHistories } from "./prices.js";

// Rebuilds a REAL, market-following portfolio-value curve for a timeframe from the
// holdings' price histories: value(t) = cash + Σ shares × price_i(t). It ends at
// the live `totalValue` and moves with the market. (A "what-if-held-today's-shares"
// view — we don't store minute-by-minute account history.)
const LABEL = { "1D": "Last 24h", "1W": "Last week", "1M": "Last month", "1Y": "Last year", "MAX": "All time" };

// Chart-resolution policy. No Edge redeploy — reuses existing feeds and trims/downsamples
// client-side. `range` = an existing feed label to fetch; `windowDays` = keep only the
// last N days; `down10` = keep every-other 5-min bar → 10-min spacing; `res` = the time
// format BigChart shows in its tooltip ("15m"/"1h" → time, "1d" → date).
//   Own portfolio (fixed per timeframe): 1D = every 10 min, 1W = hourly, 1M/1Y/MAX = daily.
//   Leaderboard (adaptive to account age): 30 min < 7d, hourly < month, daily < year, else weekly.
function resolve(tf, ageDays, mode) {
  if (mode === "leaderboard") {
    if (ageDays <= 7) return { range: "1W", windowDays: 7, down10: false, res: "15m" };   // 30-min bars
    if (ageDays <= 31) return { range: "1M", windowDays: 31, down10: false, res: "1h" };   // 60-min bars
    if (ageDays <= 366) return { range: "1Y", windowDays: 366, down10: false, res: "1d" }; // daily
    return { range: "MAX", windowDays: 36500, down10: false, res: "1d" };                   // weekly
  }
  switch (tf) {
    case "1D": return { range: "1D", windowDays: 1, down10: true, res: "15m" };  // 5-min feed → 10-min
    case "1W": return { range: "1M", windowDays: 7, down10: false, res: "1h" };   // 60-min feed, trimmed to a week
    case "1M": return { range: "3M", windowDays: 31, down10: false, res: "1d" };  // daily feed, trimmed to a month
    case "1Y": return { range: "1Y", windowDays: 366, down10: false, res: "1d" }; // daily
    default: return { range: ageDays <= 360 ? "1Y" : "MAX", windowDays: 36500, down10: false, res: "1d" }; // all-time: daily <~1y, else weekly
  }
}

export function usePortfolioPerf(positions, cash, invested, totalValue, tf, history, startAt, mode = "own") {
  const [hist, setHist] = useState(null); // [{t,c}] reconstructed history (no live tail)
  const tickers = Object.keys(positions);
  // Don't reconstruct before the account existed — valuing today's shares at prices
  // from before you joined gives nonsense. Anchor to game/membership creation; fall
  // back to the first snapshot day.
  const accountStartT = startAt ? Math.floor(Date.parse(startAt) / 1000)
    : (history && history.length ? Math.floor(Date.parse(history[0].day) / 1000) : 0);
  const ageDays = accountStartT ? (Math.floor(Date.now() / 1000) - accountStartT) / 86400 : 9999;
  const { range, windowDays, down10, res } = resolve(tf, ageDays, mode);
  // Earliest timestamp to keep: the window start, but never before the account existed.
  // If the account start is unknown (e.g. a rival with no readable snapshots), floor at
  // ~1 year ago so an unbounded "all-time" window doesn't reach back to epoch 1970.
  const nowS = Math.floor(Date.now() / 1000);
  const cutoff = Math.max(nowS - windowDays * 86400, accountStartT || (nowS - 366 * 86400));
  const key = tickers.slice().sort().join(",") + "|" + range + "|" + cutoff + "|" + cash + "|" + down10;

  useEffect(() => {
    let alive = true;
    if (tickers.length === 0) { setHist(null); return; }
    fetchHistories(tickers, range).then((hmap) => {
      if (!alive) return;
      const series = tickers.map((t) => {
        let h = (hmap[t] || []).filter((p) => p && p.c != null && p.t >= cutoff);
        if (down10) h = h.filter((_, i) => i % 2 === 0); // 5-min feed → 10-min points
        return { shares: positions[t].shares, h };
      });
      const tsSet = new Set();
      series.forEach((s) => s.h.forEach((p) => tsSet.add(p.t)));
      const ts = [...tsSet].sort((a, b) => a - b);
      if (ts.length < 2) { setHist(null); return; }
      const ptr = series.map(() => 0);
      const last = series.map((s) => (s.h[0] ? s.h[0].c : null)); // value pre-first-tick at its first price
      const pts = ts.map((time) => {
        let v = cash;
        series.forEach((s, i) => {
          while (ptr[i] < s.h.length && s.h[ptr[i]].t <= time) { last[i] = s.h[ptr[i]].c; ptr[i]++; }
          if (last[i] != null) v += s.shares * last[i];
        });
        return { t: time, c: v };
      });
      setHist(pts);
    }).catch(() => { if (alive) setHist(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const label = LABEL[tf] || "All time";
  const baseCap = invested || totalValue || 1; // starting capital (start cash + deposits)
  const tail = { t: nowS, c: totalValue };     // ends exactly on the live total value
  // Does this view reach back to when the account opened? If so, every account begins
  // at its STARTING CAPITAL ("10k") — anchor the curve there with a flat "day before
  // you opened" segment, then let it move once shares are actually bought.
  const includesOpen = !!accountStartT && cutoff <= accountStartT + 300;

  let points;
  if (hist && hist.length) {
    let lead;
    if (includesOpen) {
      // flat at the starting capital from the day before open; hold flat through open
      // unless the first market bar is right at open (avoids a duplicate timestamp).
      lead = [{ t: accountStartT - 86400, c: baseCap }];
      if (hist[0].t > accountStartT + 300) lead.push({ t: accountStartT, c: baseCap });
    } else if (hist[0].t > cutoff + 300) {
      // window starts after open → flat baseline at the window-start market value
      lead = [{ t: cutoff, c: hist[0].c }];
    } else {
      lead = [];
    }
    points = [...lead, ...hist, tail];
  } else {
    // no market data yet (e.g. all cash) → flat line at the starting capital
    const startT = accountStartT ? accountStartT - 86400 : nowS - 86400;
    points = [{ t: startT, c: baseCap }, tail];
  }
  const base = points[0].c;
  const chg = points[points.length - 1].c - base;
  const pct = base ? (chg / base) * 100 : 0;
  return { points, chg, pct, up: chg >= 0, label, resolution: res };
}
