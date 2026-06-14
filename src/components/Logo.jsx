import { useState, useEffect } from "react";
import { C } from "../theme.js";
import { usePrices } from "../lib/pricesContext.js";

// Real company logo (from the Edge Function's live `logo` URL) with a graceful
// fallback to a coloured letter tile when there's no logo or the image fails.
export default function Logo({ ticker, size = 30, round = false, src = null }) {
  const { detailOf } = usePrices();
  // Candidate cascade (advance to the next on each load error, tile if all fail):
  //   owner src → live Finnhub logo → FMP by FULL ticker (e.g. SMGB.L.png, which
  //   FMP stores under the suffixed symbol) → FMP by base symbol → coloured tile.
  const base = ticker ? ticker.split(".")[0] : null;
  const FMP = (s) => `https://financialmodelingprep.com/image-stock/${s}.png`;
  const candidates = [src, detailOf(ticker)?.logo, ticker && FMP(ticker), base && FMP(base)]
    .filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i); // dedupe (US tickers: full === base)
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [candidates[0], candidates.length]);
  const radius = round ? "50%" : size * 0.28;
  const url = candidates[idx];

  if (url) {
    return (
      <img
        src={url} alt={ticker} width={size} height={size} onError={() => setIdx((i) => i + 1)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", background: "#fff", border: `1px solid ${C.line}`, flexShrink: 0 }}
      />
    );
  }

  const palette = {
    NVDA: "#76B900", AAPL: "#111", MSFT: "#00A4EF", GOOGL: "#4285F4", AMZN: "#FF9900",
    TSLA: "#E82127", AVGO: "#CC092F", TSM: "#D6001C", ORCL: "#F80000", SPY: "#1B5E9E",
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: palette[ticker] || "#888", color: "#fff",
      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.36, fontFamily: C.sans,
    }}>
      {ticker[0]}
    </div>
  );
}
