import { useState } from "react";
import { C } from "../theme.js";
import { fmt, P, pct, money } from "../lib/format.js";
import { MOCK_STOCKS, META } from "../lib/mockData.js";
import { PERF_TFS } from "../lib/perf.js";
import { usePortfolioPerf } from "../lib/usePortfolioPerf.js";
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
  tf, setTf, tradeMode, setTradeMode, tradeAmt, setTradeAmt, trade, active, history, startCash, deposited, vhistory, gameStart,
  readOnly = false, initialStock = null, onRequestMoney,
}) {
  const [selected, setSelected] = useState(initialStock);
  const [allocBy, setAllocBy] = useState("Shares"); // Shares | Industry | Country
  const [perfTf, setPerfTf] = useState("MAX");       // performance-graph timeframe
  const [reqOpen, setReqOpen] = useState(false);     // "request more money" form
  const [reqAmt, setReqAmt] = useState("");
  const [reqNote, setReqNote] = useState("");
  const { priceOf, curOf, detailOf } = usePrices();
  const totalRetPct = (totalPL / (deposited || startCash || 1)) * 100;
  function openStock(t) { setActive(t); setSelected(t); }

  // Performance graph: a REAL market-following portfolio curve (cash + Σ shares ×
  // each holding's price history) at the per-timeframe resolution (1D = 10-min,
  // 1W = hourly, 1M/1Y/All = daily), with a relabeling change.
  const { points: perfPoints, chg: perfChg, pct: perfPct, up: perfUp, label: perfLabel, resolution: perfRes } = usePortfolioPerf(positions, cash, startCash, totalValue, perfTf, history, gameStart, "own", deposited, vhistory);

  // Holdings enriched + sorted by value (desc) for the right-pane table.
  const holdings = Object.entries(positions).map(([t, p]) => {
    const px = priceOf(t);
    return { t, p, px, val: p.shares * px, plP: ((px - p.avgCost) / p.avgCost) * 100 };
  }).sort((a, b) => b.val - a.val);

  // Allocation items grouped by the active view (Shares / Industry / Country).
  function allocItems() {
    if (allocBy === "Shares") {
      return [...holdings.map((h) => ({ label: h.t, value: h.val, ticker: h.t })), { label: "Cash", value: cash }]
        .sort((a, b) => b.value - a.value);
    }
    const key = allocBy === "Industry" ? "industry" : "country";
    const map = {};
    // Prefer curated META (the 10 mock tickers); fall back to LIVE industry/country
    // (Finnhub profile2) so searched / foreign holdings aren't all lumped into "Other".
    holdings.forEach((h) => { const k = META[h.t]?.[key] || detailOf(h.t)?.[key] || "Other"; map[k] = (map[k] || 0) + h.val; });
    map["Cash"] = (map["Cash"] || 0) + cash;
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  return (
    <Panel pad={0}>
      {/* Fixed-height grid so each column scrolls independently (Trading 212 style):
          scrolling holdings/heatmap on the left doesn't move the allocation on the right. */}
      <div style={{ display: "grid", gridTemplateColumns: "470px 1fr", height: "calc(100vh - 84px)" }}>
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
            <BigChart points={perfPoints} resolution={perfRes} height={110} blue bare />
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
            const day = plP; // return since bought (profit/loss vs average buy price)
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
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: day >= 0 ? C.green : C.red }}>{pct(day)}</div>
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

          {/* request more money from the game creator */}
          {!readOnly && onRequestMoney && (
            <div style={{ padding: "16px 20px 22px", borderTop: `1px solid ${C.line}` }}>
              {!reqOpen ? (
                <button onClick={() => setReqOpen(true)} className="btn" style={{ width: "100%", padding: "11px 0", fontSize: 13.5, fontWeight: 700, border: `1px solid ${C.line}`, borderRadius: 10, background: C.card, color: C.ink, cursor: "pointer" }}>Request more money</button>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Request money from the creator</div>
                  <input type="number" value={reqAmt} onChange={(e) => setReqAmt(e.target.value)} placeholder="Amount (P£)" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 8, background: C.fill }} />
                  <input value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="Note (optional)" maxLength={80} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 8, background: C.fill }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setReqOpen(false); setReqAmt(""); setReqNote(""); }} className="btn" style={{ flex: 1, padding: "10px 0", fontSize: 13.5, fontWeight: 600, border: `1px solid ${C.line}`, borderRadius: 10, background: C.card, color: C.dim, cursor: "pointer" }}>Cancel</button>
                    <button onClick={async () => { if (!(Number(reqAmt) > 0)) return; const r = await onRequestMoney(Number(reqAmt), reqNote); if (!r?.error) { setReqOpen(false); setReqAmt(""); setReqNote(""); } }} className="trbtn" style={{ flex: 1, padding: "10px 0", fontSize: 13.5, fontWeight: 700, border: "none", borderRadius: 10, background: C.blue, color: "#fff", cursor: "pointer" }}>Send request</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT (wide) — own scroll */}
        <div className="colscroll" style={{ overflowY: "auto", minHeight: 0 }}>
          {selected ? (
            <StockDetail
              active={active} stock={detailOf(active)} tf={tf} setTf={setTf} positions={positions}
              tradeMode={tradeMode} setTradeMode={setTradeMode} tradeAmt={tradeAmt}
              setTradeAmt={setTradeAmt} trade={trade} cash={cash} onBack={() => setSelected(null)} readOnly={readOnly}
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
              <AllocationDonut items={allocItems()} centerLabel={allocBy} onSelect={openStock} />

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
