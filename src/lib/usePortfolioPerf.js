import { useState, useEffect } from "react";
import { fetchHistories } from "./prices.js";

// Rebuilds a REAL, market-following portfolio-value curve for a timeframe from the
// holdings' price histories: value(t) = cash + Σ shares × price_i(t). It ends at
// the live `totalValue` and moves with the market at stock-like resolution
// (1D ≈ 15m, 1W ≈ 30m, 1M/1Y ≈ daily). Assumes today's shares were held across the
// window (a "what-if-held" view) — we don't store minute-by-minute account history.
const LABEL = { "1D": "Last 24h", "1W": "Last week", "1M": "Last month", "1Y": "Last year", "MAX": "All time" };

export function usePortfolioPerf(positions, cash, invested, totalValue, tf, history) {
  const [hist, setHist] = useState(null); // [{t,c}] reconstructed history (no live tail)
  const tickers = Object.keys(positions);
  // Don't reconstruct before the account existed — valuing today's shares at prices
  // from before you joined gives nonsense (e.g. NVDA years ago → fake +490%).
  const accountStartT = history && history.length ? Math.floor(Date.parse(history[0].day) / 1000) : 0;
  const key = tickers.slice().sort().join(",") + "|" + tf + "|" + cash + "|" + accountStartT;

  useEffect(() => {
    let alive = true;
    if (tickers.length === 0) { setHist(null); return; }
    fetchHistories(tickers, tf).then((hmap) => {
      if (!alive) return;
      const series = tickers.map((t) => ({ shares: positions[t].shares, h: (hmap[t] || []).filter((p) => p && p.c != null && p.t >= accountStartT) }));
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

  const label = LABEL[tf];
  const now = Math.floor(Date.now() / 1000);
  const baseCap = invested || totalValue || 1;
  // Append the LIVE current value as the final point, UN-scaled, so the line ENDS
  // exactly on the headline total value. (Start = the account's real value at the
  // window's beginning, not forced to 10k — owner's chosen trade-off.)
  const tail = { t: now, c: totalValue };
  const points = hist && hist.length ? [...hist, tail] : [{ t: now - 86400, c: baseCap }, tail];
  const base = points[0].c;
  const chg = points[points.length - 1].c - base;
  const pct = base ? (chg / base) * 100 : 0;
  return { points, chg, pct, up: chg >= 0, label };
}
