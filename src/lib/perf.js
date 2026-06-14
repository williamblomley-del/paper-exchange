// Portfolio-performance timeframes for the toggle: [key, label].
export const PERF_TFS = [
  ["1D", "Last 24h"], ["1W", "Last week"], ["1M", "Last month"],
  ["1Y", "Last year"], ["MAX", "All time"],
];

const DAYS = { "1W": 7, "1M": 31, "1Y": 366 };

// Build the performance series + change for a timeframe from REAL stored history.
//   history    : [{ day:"YYYY-MM-DD", value:Number }] ascending (own snapshots)
//   totalValue : live current account value (the latest point)
//   dayChange  : live intraday change (Σ shares × (price − prevClose))
//   invested   : net capital in (start cash + deposits) — the all-time baseline
// Day & All-time changes are always real. Week/Month/Year fill in as snapshots
// accrue over time (a brand-new account shows a flat line / 0 change — honest).
export function buildPerf(history, totalValue, dayChange, invested, tf) {
  const label = (PERF_TFS.find((p) => p[0] === tf) || [])[1];
  const now = Math.floor(Date.now() / 1000);
  const dayT = (d) => Math.floor(Date.parse(d) / 1000);
  let points, base, chg;

  if (tf === "1D") {
    base = totalValue - dayChange; chg = dayChange;
    points = [{ t: now - 86400, c: base }, { t: now, c: totalValue }];
  } else if (tf === "MAX") {
    base = invested; chg = totalValue - invested;
    const hp = (history || []).map((h) => ({ t: dayT(h.day), c: Number(h.value) }));
    points = [{ t: (hp[0]?.t ?? now) - 86400, c: invested }, ...hp, { t: now, c: totalValue }];
  } else {
    const cutoff = new Date(Date.now() - DAYS[tf] * 86400000).toISOString().slice(0, 10);
    const win = (history || []).filter((h) => h.day >= cutoff);
    base = win.length ? Number(win[0].value) : totalValue;
    chg = totalValue - base;
    points = [...win.map((h) => ({ t: dayT(h.day), c: Number(h.value) })), { t: now, c: totalValue }];
  }

  // de-duplicate identical timestamps + guarantee at least two points
  points = points.filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
  if (points.length < 2) points = [{ t: now - 86400, c: base ?? totalValue }, { t: now, c: totalValue }];
  const pct = base ? (chg / base) * 100 : 0;
  return { points, chg, pct, up: chg >= 0, label };
}
