import { useState, useEffect } from "react";
import { C } from "../theme.js";
import { fmt, P, pct, money, curSym, currencyOf } from "../lib/format.js";
import { TIMEFRAMES, META } from "../lib/mockData.js";
import Logo from "./Logo.jsx";
import BigChart from "./BigChart.jsx";

const TF_LABEL = { "1D": "today", "1W": "last week", "1M": "last month", "3M": "last 3 months", "6M": "last 6 months", "1Y": "last year", "MAX": "all time" };

// Finnhub market cap is in millions USD → "2.56T" / "762B" / "120M".
function fmtCap(m) {
  if (m == null) return "—";
  if (m >= 1e6) return (m / 1e6).toFixed(2) + "T";
  if (m >= 1e3) return (m / 1e3).toFixed(2) + "B";
  return m.toFixed(0) + "M";
}

// Shared stock-detail view (Market right side + Portfolio right side on click).
export default function StockDetail({
  active, stock, tf, setTf, positions,
  tradeMode, setTradeMode, tradeAmt, setTradeAmt, trade, cash, onBack,
}) {
  const [order, setOrder] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [hover, setHover] = useState(null); // { value, label } from chart hover, or null
  useEffect(() => { setHover(null); }, [active, tf]); // clear stale hover on switch

  // Chart series is ALWAYS synthetic (free Finnhub has no history) — illustrative.
  // Anchor it to the live price: scale the mock series so its LAST point equals the
  // current price, keeping the chart's endpoint consistent with the headline.
  const is1D = tf === "1D";
  // May be undefined for searched tickers (no mock data) — guard so it never crashes.
  const rawSeries = (is1D ? stock.intraday : stock.series) || [];
  const rawEnd = rawSeries.length ? rawSeries[rawSeries.length - 1] : (stock.price || 1);
  const scale = stock.price && rawEnd ? stock.price / rawEnd : 1;
  const series = rawSeries.length > 1 ? rawSeries.map((v) => v * scale) : [stock.price || 0, stock.price || 0];
  const count = is1D ? series.length : (TIMEFRAMES.find((t) => t[0] === tf)?.[1] ?? 40);
  const sl = series.slice(-count);
  const pos = positions[active];
  const m = META[active] || {};
  const cur = currencyOf(active, stock.currency); // native currency (suffix-aware)

  // Real history (from Yahoo via the Edge Function) for the current timeframe.
  const RES = { "1D": "15m", "1W": "15m", "1M": "1h", "3M": "1d", "6M": "1d", "1Y": "1d", "MAX": "1mo" };
  const hist = Array.isArray(stock.history) ? stock.history : [];
  const hasReal = hist.length > 1;

  // Headline price + change: REAL when live data is present (day change, "today");
  // otherwise fall back to the (scaled) synthetic series' move over the timeframe.
  const isLive = stock.changePct != null;
  const prevClose = isLive && stock.prevClose != null ? stock.prevClose
    : (is1D ? series[0] : series[series.length - 2]);
  // Change reflects the SELECTED timeframe: real history start → now (so 1W shows
  // the week's move "last week", 1M the month's, etc.). Falls back to live day
  // change, then to the synthetic series.
  let chg, chgP, changeLabel;
  if (hasReal) {
    const first = hist[0].c || stock.price;
    chg = stock.price - first; chgP = first ? (chg / first) * 100 : 0; changeLabel = TF_LABEL[tf];
  } else if (isLive) {
    chg = stock.change ?? (stock.price - prevClose); chgP = stock.changePct; changeLabel = "today";
  } else {
    chg = stock.price - sl[0]; chgP = sl[0] ? ((stock.price - sl[0]) / sl[0]) * 100 : 0; changeLabel = TF_LABEL[tf];
  }
  const up = chg >= 0;

  // While hovering the chart, the headline tracks the hovered point (T212 style):
  // price = hovered value, change = hovered value vs the timeframe's start baseline.
  const baseline = hasReal ? (hist[0].c || stock.price) : isLive ? prevClose : sl[0];
  const dispPrice = hover ? hover.value : stock.price;
  const dispChg = hover ? dispPrice - baseline : chg;
  const dispChgP = hover ? (baseline ? (dispChg / baseline) * 100 : 0) : chgP;
  const dispLabel = hover ? hover.label : changeLabel;
  const dispUp = dispChg >= 0;

  // Day stats — real when live, else derived from the synthetic series.
  const dHigh = isLive && stock.high != null ? stock.high : Math.max(...sl);
  const dLow = isLive && stock.low != null ? stock.low : Math.min(...sl);
  const dOpen = isLive && stock.open != null ? stock.open : prevClose;
  const stats = [
    ["Open", money(dOpen, cur)], ["High", money(dHigh, cur)], ["Low", money(dLow, cur)],
    ["Prev close", money(prevClose, cur)],
    ["Mkt cap", stock.marketCap != null ? fmtCap(stock.marketCap) : (stock.mcap || "—")],
    ["P/E ratio", stock.pe != null ? fmt(stock.pe) : "—"],
  ];

  const blueBtn = { padding: "14px 0", fontSize: 16, fontWeight: 700, border: "none", borderRadius: 999, background: C.blue, color: "#fff" };
  function confirm() { trade(order); setOrder(null); }

  // Max the user can buy/sell in the current mode (cash = P£, shares = units):
  //  buy  → cash you have (or cash/price in shares mode)
  //  sell → your whole position's value (or its share count in shares mode)
  const px = stock.price || 0;
  function maxAmt() {
    if (order === "sell") return pos ? (tradeMode === "cash" ? pos.shares * px : pos.shares) : 0;
    return tradeMode === "cash" ? cash : px ? cash / px : 0;
  }
  // floor so the locked value never exceeds the real max (2dp cash / 4dp shares)
  const fmtMax = (mx) => String(tradeMode === "cash" ? Math.floor(mx * 100) / 100 : Math.floor(mx * 1e4) / 1e4);
  // On input: clamp to the max immediately if the typed amount is too high.
  function onAmt(v) {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (cleaned === "" || cleaned === ".") return setTradeAmt(cleaned);
    const num = parseFloat(cleaned), mx = maxAmt();
    setTradeAmt(!isNaN(num) && num > mx ? fmtMax(mx) : cleaned);
  }
  // "Max" (buy) / "Sell all" (sell). Sell-all switches to shares mode for an exact
  // full liquidation (no rounding dust left behind).
  function fillMax() {
    if (order === "sell" && pos) { setTradeMode("shares"); setTradeAmt(String(pos.shares)); }
    else setTradeAmt(fmtMax(maxAmt()));
  }

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "26px 28px 20px" }}>
        {onBack && (
          <button onClick={onBack} className="btn" aria-label="Back" style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.dim, fontSize: 16 }}>←</button>
        )}
        <Logo ticker={active} size={46} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, color: C.ink, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 1 }}>
            {active} · {stock.exchange || "Stock"}
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.muted, display: "inline-block" }} />
          </div>
          <div style={{ fontSize: 13.5, color: C.dim, fontWeight: 400 }}>{stock.name}</div>
        </div>
        <button className="btn" style={{ padding: "8px 15px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontWeight: 600, fontSize: 13, color: C.ink }}>★ Watchlist</button>
      </div>

      {/* price + change below */}
      <div style={{ padding: "10px 28px 0" }}>
        <div style={{ fontSize: 42, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          <span style={{ fontSize: "0.5em", fontWeight: 500, marginRight: 2, verticalAlign: "0.18em" }}>{curSym(cur)}</span>{fmt(dispPrice)}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: dispUp ? C.green : C.red, marginTop: 6 }}>{dispUp ? "↗" : "↘"} {fmt(Math.abs(dispChg))} ({pct(dispChgP)}) {dispLabel}</div>
      </div>

      {/* buy / sell — dropped down for breathing room */}
      <div style={{ display: "flex", gap: 12, padding: "26px 28px 22px" }}>
        <button onClick={() => setOrder("sell")} className="trbtn" style={{ ...blueBtn, width: 168, ...(order === "sell" ? { boxShadow: "0 4px 16px rgba(70,160,255,0.35)" } : {}) }}>Sell</button>
        <button onClick={() => setOrder("buy")} className="trbtn" style={{ ...blueBtn, width: 168, ...(order === "buy" ? { boxShadow: "0 4px 16px rgba(70,160,255,0.35)" } : {}) }}>Buy</button>
      </div>

      {/* order summary */}
      {order && (
        <div style={{ margin: "0 28px 22px", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{order === "buy" ? "Buy" : "Sell"} {active}</span>
            <button onClick={() => setOrder(null)} aria-label="Close" style={{ border: "none", background: "none", color: C.dim, fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 9, padding: 3 }}>
              {[["cash", "P£"], ["shares", "Shares"]].map(([k, l]) => (
                <button key={k} onClick={() => setTradeMode(k)} style={{ padding: "6px 13px", fontSize: 12.5, fontWeight: 600, border: "none", borderRadius: 7, background: tradeMode === k ? C.ink : "transparent", color: tradeMode === k ? "#fff" : C.dim }}>{l}</button>
              ))}
            </div>
            <input autoFocus value={tradeAmt} onChange={(e) => onAmt(e.target.value)} placeholder={tradeMode === "cash" ? "Amount, e.g. 500" : "Shares, e.g. 2.5"} inputMode="decimal" className="pi" style={{ flex: 1, minWidth: 70, padding: "10px 13px", fontSize: 15, background: C.card, border: `1px solid ${C.line}`, borderRadius: 9 }} />
            <button onClick={fillMax} className="btn" style={{ flexShrink: 0, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, border: `1px solid ${C.line}`, borderRadius: 9, background: C.fill, color: C.ink }}>{order === "sell" ? "Sell all" : "Max"}</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.dim, marginBottom: 4 }}>
            <span>Estimated {order === "buy" ? "cost" : "proceeds"}</span>
            <span style={{ fontWeight: 600, color: C.ink }}>{tradeMode === "cash" ? P(parseFloat(tradeAmt || 0)) : P(parseFloat(tradeAmt || 0) * stock.price)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.dim, marginBottom: 14 }}>
            <span>{tradeMode === "cash" ? "Shares" : "Amount"}</span>
            <span style={{ fontWeight: 600, color: C.ink }}>{tradeMode === "cash" ? `${fmt(parseFloat(tradeAmt || 0) / stock.price, 4)}` : P(parseFloat(tradeAmt || 0) * stock.price)}</span>
          </div>
          <button onClick={confirm} className="trbtn" style={{ ...blueBtn, width: "100%" }}>Confirm {order === "buy" ? "Buy" : "Sell"}</button>
          <div style={{ textAlign: "center", fontSize: 12, color: C.dim, marginTop: 10 }}>Buying Power <b style={{ color: C.ink }}>{P(cash)}</b></div>
        </div>
      )}

      {/* chart */}
      <div style={{ padding: "0 28px" }}>
        <BigChart {...(hasReal ? { points: hist, resolution: RES[tf] } : { series, count })} avgCost={pos ? pos.avgCost : undefined} height={272} axes blue zoomable={tf === "MAX"} onHover={setHover} />
        <div style={{ display: "flex", gap: 2, justifyContent: "center", margin: "14px 0 6px" }}>
          {TIMEFRAMES.map(([label]) => (
            <button key={label} onClick={() => setTf(label)} className="tfbtn" style={{ padding: "7px 15px", fontSize: 12.5, fontWeight: 600, border: "none", borderRadius: 8, background: tf === label ? C.fill : "transparent", color: tf === label ? C.ink : C.dim }}>{label}</button>
          ))}
        </div>
        {!hasReal && <div style={{ textAlign: "center", fontSize: 10.5, color: C.muted, marginBottom: 2 }}>Illustrative chart · loading live history…</div>}
      </div>

      {/* stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, padding: "22px 28px 0", margin: "22px 0 0", borderTop: `1px solid ${C.line}` }}>
        {stats.map(([l, v]) => (
          <div key={l} style={{ paddingTop: 22 }}>
            <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 400 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* your investment */}
      {pos && (() => {
        const value = pos.shares * stock.price;
        const plPct = ((stock.price - pos.avgCost) / pos.avgCost) * 100;
        const win = plPct >= 0;
        return (
          <div style={{ padding: "22px 28px 0", margin: "22px 0 0", borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Your investment</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
              <div><div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>Value</div><div style={{ fontSize: 16, fontWeight: 400 }}>{P(value)}</div></div>
              <div><div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>Shares</div><div style={{ fontSize: 16, fontWeight: 400 }}>{fmt(pos.shares, 4)}</div></div>
              <div><div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>Avg cost</div><div style={{ fontSize: 16, fontWeight: 400 }}>{money(pos.avgCost, cur)}</div></div>
              <div><div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>Total return</div><div style={{ fontSize: 16, fontWeight: 400, color: win ? C.green : C.red }}>{win ? "↗" : "↘"} {pct(plPct)}</div></div>
            </div>
          </div>
        );
      })()}

      {/* about — works for any company using live profile fields */}
      {(() => {
        const industry = m.industry || stock.industry;
        const country = m.country || stock.country;
        const fields = [["CEO", m.ceo], ["Headquarters", m.hq], ["Employees", m.employees], ["Sector", m.sector], ["Industry", industry], ["Country", country], ["Exchange", stock.exchange]];
        if (!m.desc && !fields.some(([, v]) => v)) return null;
        const desc = m.desc || `${stock.name} is listed on ${stock.exchange || "the market"}${industry ? `, in the ${industry} industry` : ""}.`;
        return (
          <div style={{ padding: "22px 28px 28px", margin: "22px 0 0", borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>About</div>
              {m.desc && <button onClick={() => setShowAbout((s) => !s)} style={{ border: "none", background: "none", color: C.blue, fontWeight: 600, fontSize: 13 }}>{showAbout ? "See less" : "See all"}</button>}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6, color: C.dim, ...(m.desc && !showAbout ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{desc}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px" }}>
              {fields.map(([l, v]) => v && (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.lineSoft}`, paddingBottom: 8, fontSize: 13 }}>
                  <span style={{ color: C.dim }}>{l}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
