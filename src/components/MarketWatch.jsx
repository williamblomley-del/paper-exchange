import { useState } from "react";
import { C } from "../theme.js";
import { money, pct, currencyOf } from "../lib/format.js";
import { MOCK_STOCKS, MARKET_LISTS } from "../lib/mockData.js";
import { usePrices } from "../lib/pricesContext.js";
import Logo from "./Logo.jsx";
import MiniSpark from "./MiniSpark.jsx";

const TABS = ["Trending", "Top Gainers", "Top Losers", "Most Active"];
const LIST_KEY = { "Top Gainers": "gainers", "Top Losers": "losers", "Most Active": "actives" };

// Market Watch panel. "Trending" is the curated watchlist (live prices, with a
// sparkline). Top Gainers / Losers / Most Active are REAL, pulled from Yahoo's
// screeners (passed in as `lists`); if that data isn't available they fall back
// to the sample lists so the panel never breaks.
export default function MarketWatch({ active, setActive, lists = {} }) {
  const [sub, setSub] = useState("Trending");
  const { priceOf, curOf, chgOf, detailOf } = usePrices();
  const isTrending = sub === "Trending";
  const real = !isTrending ? (lists[LIST_KEY[sub]] || []) : [];

  // Rows: for Trending use the watchlist tickers; otherwise the real screener
  // rows, falling back to the sample list (as plain tickers) if none loaded.
  const rows = isTrending
    ? MARKET_LISTS.Trending.map((t) => ({ symbol: t }))
    : (real.length ? real : MARKET_LISTS[sub].map((t) => ({ symbol: t })));

  return (
    <div>
      <div style={{ padding: "16px 18px 10px", fontWeight: 700, fontSize: 15 }}>Market Watch</div>

      {/* sub-tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 12px", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setSub(t)} className="tfbtn" style={{
            padding: "6px 10px", fontSize: 11.5, fontWeight: 700, border: "none", borderRadius: 8,
            whiteSpace: "nowrap", background: sub === t ? "rgba(59,111,245,0.1)" : "transparent",
            color: sub === t ? C.blue : C.dim,
          }}>{t}</button>
        ))}
      </div>

      {rows.map((row) => {
        const t = row.symbol;
        const mock = MOCK_STOCKS[t];
        // name + price + change: prefer the live/real-list values, fall back to mock.
        const name = row.name || detailOf(t)?.name || mock?.name || t;
        const price = row.price != null ? row.price : priceOf(t);
        const cur = row.currency ? currencyOf(t, row.currency) : curOf(t);
        const chg = row.changePct != null ? row.changePct : chgOf(t);
        const on = active === t;
        return (
          <div key={t} onClick={() => setActive(t)} className="wrow" style={{
            display: "grid", gridTemplateColumns: isTrending ? "1fr 50px auto" : "1fr auto", gap: 12, alignItems: "center",
            padding: "13px 18px", cursor: "pointer",
            borderLeft: `3px solid ${on ? C.blue : "transparent"}`,
            background: on ? "rgba(59,111,245,0.05)" : "transparent",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              <Logo ticker={t} size={32} />
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
                <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{name}</div>
              </span>
            </span>
            {isTrending && mock?.series && <MiniSpark series={mock.series.slice(-30)} up={chg >= 0} />}
            <span style={{ textAlign: "right", minWidth: 66 }}>
              <div style={{ fontSize: 14, fontWeight: 400 }}>{money(price, cur)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: chg >= 0 ? C.green : C.red }}>{pct(chg)}</div>
            </span>
          </div>
        );
      })}

      <div style={{ textAlign: "center", padding: "12px 0", borderTop: `1px solid ${C.lineSoft}`, color: C.blue, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>View all markets</div>
    </div>
  );
}
