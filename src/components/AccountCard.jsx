import { useState } from "react";
import { C } from "../theme.js";
import { P, pct } from "../lib/format.js";
import { PERF_TFS, buildPerf } from "../lib/perf.js";
import { usePrices } from "../lib/pricesContext.js";
import BigChart from "./BigChart.jsx";

// Account summary for the top of the Market tab's left column. Renders BARE
// (no card wrapper) so it sits inside the one connected white Market container.
// The change stat + chart follow a timeframe toggle and the REAL stored snapshot
// history (buildPerf) — same source as the leaderboard, so all views agree.
export default function AccountCard({ totalValue, cash, positions, invested, history }) {
  const [perfTf, setPerfTf] = useState("1D");
  const { priceOf, detailOf } = usePrices();
  const investedNow = totalValue - cash; // amount currently in holdings
  // Real intraday day change: Σ shares × (price − prevClose), only when a real
  // prevClose is present (live). Feeds buildPerf's 1D branch.
  const dayChange = Object.entries(positions).reduce((s, [t, p]) => {
    const d = detailOf(t);
    return d.prevClose != null ? s + p.shares * (priceOf(t) - d.prevClose) : s;
  }, 0);
  const { points: perfPoints, chg: perfChg, pct: perfPct, up: perfUp, label: perfLabel } = buildPerf(history, totalValue, dayChange, invested, perfTf);

  return (
    <div style={{ padding: "20px 20px 16px" }}>
      <div style={{ fontSize: 11, color: C.dim, fontWeight: 400, letterSpacing: "0.06em", marginBottom: 4 }}>ACCOUNT VALUE</div>
      <div style={{ fontSize: 32, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 10 }}>{P(totalValue)}</div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10.5, color: C.dim, fontWeight: 400, letterSpacing: "0.04em", marginBottom: 2, textTransform: "uppercase" }}>{perfLabel}</div>
        <div style={{ fontSize: 13.5, fontWeight: 400, color: C.blue }}>{perfUp ? "↗" : "↘"} {P(Math.abs(perfChg))} ({pct(perfPct)})</div>
      </div>

      <div style={{ display: "flex", gap: 26, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Invested</div>
          <div style={{ fontSize: 15, fontWeight: 400 }}>{P(investedNow)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Cash</div>
          <div style={{ fontSize: 15, fontWeight: 400 }}>{P(cash)}</div>
        </div>
      </div>

      <BigChart points={perfPoints} resolution="1d" height={70} blue bare />
      <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 8 }}>
        {PERF_TFS.map(([key]) => (
          <button key={key} onClick={() => setPerfTf(key)} className="tfbtn" style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 8, background: perfTf === key ? C.fill : "transparent", color: perfTf === key ? C.ink : C.dim }}>{key === "MAX" ? "All" : key}</button>
        ))}
      </div>
    </div>
  );
}
