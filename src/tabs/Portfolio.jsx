import { useState } from "react";
import { C } from "../theme.js";
import { fmt, P, pct, money } from "../lib/format.js";
import { MOCK_STOCKS, META } from "../lib/mockData.js";
import { PERF_TFS, buildPerf } from "../lib/perf.js";
import { usePrices } from "../lib/pricesContext.js";
import Panel from "../components/Panel.jsx";
import Logo from "../components/Logo.jsx";
import AllocationDonut from "../components/AllocationDonut.jsx";
import BigChart from "../components/BigChart.jsx";
import StockDetail from "../components/StockDetail.jsx";
import AssetHeatmap from "../components/AssetHeatmap.jsx";

// PORTFOLIO TAB — narrow LEFT (overview + performance + compact holdings) | grey
// divider | wide RIGHT (Allocation + a sorted holdings table by default; a clicked
// holding swaps to the shared StockDetail). Numbers are weight 500 (light).
export default function Portfolio({
  totalValue, totalPL, cash, positions, allocation, setActive,
  tf, setTf, tradeMode, setTradeMode, tradeAmt, setTradeAmt, trade, active, history, invested,
}) {
  const [selected, setSelected] = useState(null);
  const [allocBy, setAllocBy] = useState("Shares"); // Shares | Industry | Country
  const [perfTf, setPerfTf] = useState("MAX");       // performance-graph timeframe
  const { priceOf, curOf, detailOf } = usePrices();
  const totalRetPct = (totalPL / (invested || 1)) * 100;
  function openStock(t) { setActive(t); setSelected(t); }

  // Day change = Σ shares × (price − prev close) using live data where available.
  let dayChange = 0;
  Object.entries(positions).forEach(([t, p]) => {
    const s = detailOf(t);
    if (s.price != null && s.prevClose != null) dayChange += p.shares * (s.price - s.prevClose);
  });

  // Performance graph from REAL stored snapshots + a change readout that RELABELS
  // (Last 24h → Last week/month/year → All time). Week/Month/Year fill in as the
  // account's daily value history accrues over time.
  const perf = buildPerf(history, totalValue, dayChange, invested, perfTf);
  const { points: perfPoints, chg: perfChg, pct: perfPct, up: perfUp, label: perfLabel } = perf;

  // Holdings enriched + sorted by value (desc) for the right-pane table.
  const holdings = Object.entries(positions).map(([t, p]) => {
    const px = priceOf(t);
    return { t, p, px, val: p.shares * px, plP: ((px - p.avgCost) / p.avgCost) * 100 };
  }).sort((a, b) => b.val - a.val);

  // Allocation items grouped by the active view (Shares / Industry / Country).
  function allocItems() {
    if (allocBy === "Shares") {
      return [...holdings.map((h) => ({ label: h.t, value: h.val })), { label: "Cash", value: cash }]
        .sort((a, b) => b.value - a.value);
    }
    const key = allocBy === "Industry" ? "industry" : "country";
    const map = {};
    holdings.forEach((h) => { const k = META[h.t]?.[key] || "Other"; map[k] = (map[k] || 0) + h.val; });
    map["Cash"] = (map["Cash"] || 0) + cash;
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  return (
    <Panel pad={0}>
      {/* Fixed-height grid so each column scrolls independently (Trading 212 style):
          scrolling holdings/heatmap on the left doesn't move the allocation on the right. */}
      <div style={{ display: "grid", gridTemplateColumns: "470px 1fr", height: "calc(100vh - 124px)" }}>
        {/* LEFT (narrow) — own scroll */}
        <div className="colscroll" style={{ borderRight: `1px solid ${C.line}`, overflowY: "auto", minHeight: 0 }}>
          {/* overview */}
          <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 4 }}>TOTAL VALUE</div>
            <div style={{ fontSize: 32, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 6 }}>{P(totalValue)}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: totalPL >= 0 ? C.green : C.red, marginBottom: 16 }}>{totalPL >= 0 ? "↗" : "↘"} {P(Math.abs(totalPL))} ({pct(totalRetPct)})</div>
            <div style={{ display: "flex", gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Cash</div>
                <div style={{ fontSize: 15, fontWeight: 400 }}>{P(cash)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Invested</div>
                <div style={{ fontSize: 15, fontWeight: 400 }}>{P(totalValue - cash)}</div>
              </div>
            </div>
          </div>

          {/* performance */}
          <div style={{ padding: "16px 20px 18px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Performance</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: perfUp ? C.green : C.red }}>{perfUp ? "↗" : "↘"} {P(Math.abs(perfChg))} ({pct(perfPct)}) <span style={{ color: C.dim, fontWeight: 500 }}>{perfLabel}</span></span>
            </div>
            <BigChart points={perfPoints} resolution="1d" height={110} blue />
            <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 8 }}>
              {PERF_TFS.map(([key, label]) => (
                <button key={key} onClick={() => setPerfTf(key)} className="tfbtn" style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 8, background: perfTf === key ? C.fill : "transparent", color: perfTf === key ? C.ink : C.dim }}>{key === "MAX" ? "All" : key}</button>
              ))}
            </div>
          </div>

          {/* holdings (compact) */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 20px 10px" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Holdings</span>
            <span style={{ fontSize: 12, color: C.dim }}>{holdings.length} positions</span>
          </div>
          {holdings.map(({ t, val, plP }) => {
            const on = selected === t;
            return (
              <div key={t} onClick={() => openStock(t)} className="wrow" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "11px 20px", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}`, borderLeft: `3px solid ${on ? C.blue : "transparent"}`, background: on ? "rgba(70,160,255,0.06)" : "transparent" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Logo ticker={t} size={30} />
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</div>
                    <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{detailOf(t)?.name || MOCK_STOCKS[t]?.name || t}</div>
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 400 }}>{P(val)}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: plP >= 0 ? C.green : C.red }}>{pct(plP)}</div>
                </span>
              </div>
            );
          })}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "11px 20px 18px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: C.amberSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>💷</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Cash</span>
            </span>
            <span style={{ textAlign: "right", fontSize: 13.5, fontWeight: 400 }}>{P(cash)}</span>
          </div>

          {/* asset heatmap (Trading 212 style) — shows on scroll */}
          <AssetHeatmap positions={positions} onSelect={openStock} />
        </div>

        {/* RIGHT (wide) — own scroll */}
        <div className="colscroll" style={{ overflowY: "auto", minHeight: 0 }}>
          {selected && MOCK_STOCKS[active] ? (
            <StockDetail
              active={active} stock={detailOf(active)} tf={tf} setTf={setTf} positions={positions}
              tradeMode={tradeMode} setTradeMode={setTradeMode} tradeAmt={tradeAmt}
              setTradeAmt={setTradeAmt} trade={trade} cash={cash} onBack={() => setSelected(null)}
            />
          ) : (
            <div style={{ padding: 32 }}>
              {/* allocation header + grouping toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Allocation</div>
                <div style={{ display: "flex", gap: 2, background: C.fill, borderRadius: 999, padding: 3 }}>
                  {["Shares", "Industry", "Country"].map((m) => (
                    <button key={m} onClick={() => setAllocBy(m)} style={{ padding: "6px 14px", fontSize: 12.5, fontWeight: 600, border: "none", borderRadius: 999, background: allocBy === m ? C.card : "transparent", color: allocBy === m ? C.ink : C.dim, boxShadow: allocBy === m ? C.sh : "none" }}>{m}</button>
                  ))}
                </div>
              </div>
              <AllocationDonut items={allocItems()} centerLabel={allocBy} />

              {/* holdings detail table (sorted by value) */}
              <div style={{ marginTop: 38, paddingTop: 26, borderTop: `1px solid ${C.line}` }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Holdings</div>
                <div style={{ display: "grid", gridTemplateColumns: "1.7fr .9fr 1.1fr 1.1fr 1fr 1.2fr", gap: 8, padding: "0 0 10px", fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
                  <span>Symbol</span><span style={{ textAlign: "right" }}>Shares</span><span style={{ textAlign: "right" }}>Avg price</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "right" }}>Change</span><span style={{ textAlign: "right" }}>Value</span>
                </div>
                {holdings.map(({ t, p, px, val, plP }) => (
                  <div key={t} onClick={() => openStock(t)} className="wrow" style={{ display: "grid", gridTemplateColumns: "1.7fr .9fr 1.1fr 1.1fr 1fr 1.2fr", gap: 8, padding: "13px 0", alignItems: "center", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Logo ticker={t} size={28} />
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{t}</div>
                        <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detailOf(t)?.name || MOCK_STOCKS[t]?.name || t}</div>
                      </span>
                    </span>
                    <span style={{ textAlign: "right", fontWeight: 400 }}>{fmt(p.shares, 2)}</span>
                    <span style={{ textAlign: "right", fontWeight: 400, color: C.dim }}>{money(p.avgCost, curOf(t))}</span>
                    <span style={{ textAlign: "right", fontWeight: 400 }}>{money(px, curOf(t))}</span>
                    <span style={{ textAlign: "right", fontWeight: 600, color: plP >= 0 ? C.green : C.red }}>{pct(plP)}</span>
                    <span style={{ textAlign: "right", fontWeight: 400 }}>{P(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
