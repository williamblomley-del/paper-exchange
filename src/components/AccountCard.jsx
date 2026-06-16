import { useState } from "react";
import { C } from "../theme.js";
import { P, pct } from "../lib/format.js";
import { PERF_TFS } from "../lib/perf.js";
import { usePortfolioPerf } from "../lib/usePortfolioPerf.js";
import BigChart from "./BigChart.jsx";

// Account summary for the top of the Market tab's left column. Renders BARE
// (no card wrapper) so it sits inside the one connected white Market container.
// The change stat + chart follow a timeframe toggle and a REAL market-following
// portfolio curve at the per-timeframe resolution (1D = 10-min, 1W = hourly, daily above).
export default function AccountCard({ totalValue, cash, positions, startCash, deposited, history, vhistory, depCadence, gameStart }) {
  const [perfTf, setPerfTf] = useState("1D");
  const investedNow = totalValue - cash; // amount currently in holdings
  const { points: perfPoints, chg: perfChg, pct: perfPct, up: perfUp, label: perfLabel, resolution: perfRes } = usePortfolioPerf(positions, cash, startCash, totalValue, perfTf, history, gameStart, "own", deposited, vhistory, depCadence);

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

      <BigChart points={perfPoints} resolution={perfRes} height={70} blue bare />
      <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 8 }}>
        {PERF_TFS.map(([key]) => (
          <button key={key} onClick={() => setPerfTf(key)} className="tfbtn" style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 8, background: perfTf === key ? C.fill : "transparent", color: perfTf === key ? C.ink : C.dim }}>{key === "MAX" ? "All" : key}</button>
        ))}
      </div>
    </div>
  );
}
