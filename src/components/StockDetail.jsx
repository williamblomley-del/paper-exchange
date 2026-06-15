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
  const [amtFocus, setAmtFocus] = useState(false); // amount field focused (so the resting "0" clears)
  const [aboutFull, setAboutFull] = useState(false); // "See all" → full About takeover
  const [hover, setHover] = useState(null); // { value, label } from chart hover, or null
  useEffect(() => { setHover(null); setAboutFull(false); }, [active, tf]); // clear on switch

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

      {/* buy / sell */}
      <div style={{ display: "flex", gap: 12, padding: "26px 28px 22px" }}>
        <button onClick={() => { setTradeAmt(""); setAmtFocus(false); setOrder("sell"); }} className="trbtn" style={{ ...blueBtn, width: 168 }}>Sell</button>
        <button onClick={() => { setTradeAmt(""); setAmtFocus(false); setOrder("buy"); }} className="trbtn" style={{ ...blueBtn, width: 168 }}>Buy</button>
      </div>

      {/* trade popup (centered, like the search modal) — slider + quick % chips */}
      {order && (() => {
        const isBuy = order === "buy";
        const max = maxAmt();
        const amt = parseFloat(tradeAmt) || 0;
        const shares = tradeMode === "cash" ? (stock.price ? amt / stock.price : 0) : amt;
        const cost = shares * stock.price;
        return (
          <div onClick={() => setOrder(null)} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(13,17,23,0.4)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "11vh" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "min(430px,94vw)", background: C.card, borderRadius: 20, boxShadow: "0 24px 64px rgba(13,17,23,0.3)", padding: "22px 24px 24px" }}>
              {/* header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <Logo ticker={active} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: C.dim }}>{active}{stock.exchange ? ` · ${stock.exchange}` : ""}</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{isBuy ? "Buy" : "Sell"} · {money(stock.price, cur)}</div>
                </div>
                <button onClick={() => setOrder(null)} aria-label="Close" style={{ border: "none", background: C.fill, width: 30, height: 30, borderRadius: 8, color: C.dim, fontSize: 15, cursor: "pointer" }}>✕</button>
              </div>

              {/* mode segmented */}
              <div style={{ display: "flex", background: C.fill, borderRadius: 10, padding: 3, marginBottom: 18 }}>
                {[["cash", "Amount (P£)"], ["shares", "Shares"]].map(([k, l]) => (
                  <button key={k} onClick={() => setTradeMode(k)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 8, background: tradeMode === k ? C.card : "transparent", color: tradeMode === k ? C.ink : C.dim, boxShadow: tradeMode === k ? C.sh : "none" }}>{l}</button>
                ))}
              </div>

              {/* big centered amount — shows a resting "0" that clears when you click in */}
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <input value={amtFocus ? tradeAmt : (tradeAmt === "" ? "0" : tradeAmt)} onFocus={() => setAmtFocus(true)} onBlur={() => setAmtFocus(false)} onChange={(e) => onAmt(e.target.value)} inputMode="decimal"
                  style={{ width: "100%", textAlign: "center", border: "none", outline: "none", fontSize: 38, fontWeight: 600, color: tradeAmt === "" && !amtFocus ? C.muted : C.ink, background: "none", fontFamily: C.sans, letterSpacing: "-0.02em" }} />
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>{tradeMode === "cash" ? `≈ ${fmt(shares, 4)} shares` : `≈ ${P(cost)}`}</div>
              </div>

              {/* slider */}
              <input type="range" min={0} max={max || 1} step={tradeMode === "cash" ? 1 : 0.0001} value={Math.min(amt, max || 0)} onChange={(e) => onAmt(e.target.value)} disabled={max <= 0}
                style={{ width: "100%", accentColor: C.blue, cursor: max > 0 ? "pointer" : "default" }} />

              {/* max / sell-all */}
              <div style={{ display: "flex", margin: "14px 0 18px" }}>
                <button onClick={fillMax} className="btn" style={{ flex: 1, padding: "9px 0", fontSize: 12.5, fontWeight: 700, border: `1px solid ${C.line}`, borderRadius: 9, background: C.fill, color: C.ink }}>{isBuy ? "Max" : "Sell all"}</button>
              </div>

              {/* summary */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginBottom: 6 }}>
                <span>Estimated {isBuy ? "cost" : "proceeds"}</span><span style={{ fontWeight: 600, color: C.ink }}>{P(cost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginBottom: 18 }}>
                <span>{isBuy ? "Buying power" : "You hold"}</span><span style={{ fontWeight: 600, color: C.ink }}>{isBuy ? P(cash) : `${fmt(pos ? pos.shares : 0, 4)} ${active}`}</span>
              </div>

              <button onClick={confirm} disabled={!(amt > 0)} className="trbtn" style={{ ...blueBtn, width: "100%", opacity: amt > 0 ? 1 : 0.5 }}>Confirm {isBuy ? "Buy" : "Sell"}</button>
            </div>
          </div>
        );
      })()}

      {/* chart */}
      <div style={{ padding: "0 28px" }}>
        <BigChart {...(hasReal ? { points: hist, resolution: RES[tf] } : { series, count })} avgCost={pos ? pos.avgCost : undefined} height={272} bare blue zoomable={tf === "MAX"} onHover={setHover} />
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
        // shareOutstanding is in millions → show as B/M
        const shares = stock.shareOutstanding != null ? (stock.shareOutstanding >= 1000 ? (stock.shareOutstanding / 1000).toFixed(2) + "B" : Math.round(stock.shareOutstanding) + "M") : null;
        const web = stock.weburl ? <a href={stock.weburl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontWeight: 500, textDecoration: "none" }}>{stock.weburl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : null;
        const fields = [
          ["CEO", m.ceo], ["Headquarters", m.hq], ["Employees", m.employees], ["Sector", m.sector],
          ["Industry", industry], ["Country", country], ["Exchange", stock.exchange],
          ["IPO date", stock.ipo], ["Shares out", shares],
          ["52-wk high", stock.week52High != null ? money(stock.week52High, cur) : null],
          ["52-wk low", stock.week52Low != null ? money(stock.week52Low, cur) : null],
          ["Website", web],
        ];
        const shownFields = fields.filter(([, v]) => v);
        if (!m.desc && shownFields.length === 0) return null;
        const desc = m.desc || `${stock.name} is listed on ${stock.exchange || "the market"}${industry ? `, in the ${industry} industry` : ""}.`;
        const fieldRow = ([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${C.lineSoft}`, paddingBottom: 8, fontSize: 13 }}>
            <span style={{ color: C.dim }}>{l}</span>
            <span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
          </div>
        );
        return (
          <div style={{ padding: "22px 28px 28px", margin: "22px 0 0", borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>About</div>
              <button onClick={() => setAboutFull(true)} style={{ border: "none", background: "none", color: C.blue, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>See all</button>
            </div>
            {/* bordered card (Trading 212 style) */}
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
              <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6, color: C.dim, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{desc}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px" }}>
                {shownFields.slice(0, 6).map(fieldRow)}
              </div>
            </div>

            {/* full takeover when "See all" is clicked */}
            {aboutFull && (
              <div onClick={() => setAboutFull(false)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(13,17,23,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "6vh 16px" }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,96vw)", maxHeight: "88vh", overflowY: "auto", background: C.card, borderRadius: 20, boxShadow: "0 24px 64px rgba(13,17,23,0.3)", padding: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                    <button onClick={() => setAboutFull(false)} className="btn" aria-label="Back" style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.dim, fontSize: 16 }}>←</button>
                    <Logo ticker={active} size={44} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.dim }}>{active}{stock.exchange ? ` · ${stock.exchange}` : ""}</div>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>{stock.name}</div>
                    </div>
                  </div>
                  <p style={{ margin: "0 0 22px", fontSize: 14.5, lineHeight: 1.7, color: C.ink }}>{desc}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 40px" }}>
                    {shownFields.map(fieldRow)}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
