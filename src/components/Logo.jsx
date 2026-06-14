import { useState, useEffect } from "react";
import { C } from "../theme.js";
import { usePrices } from "../lib/pricesContext.js";

// Manual logo overrides for tickers where the free logo services return the WRONG
// image (e.g. FMP serves a valid-but-wrong logo for RR.L). Clearbit fetches the
// real logo by company domain. Add more here as they come up.
const LOGO_OVERRIDE = {
  "RR.L": "https://logo.clearbit.com/rolls-royce.com",
};

// Real company logo (from the Edge Function's live `logo` URL) with a graceful
// fallback to a coloured letter tile when there's no logo or the image fails.
export default function Logo({ ticker, size = 30, round = false, src = null }) {
  const { detailOf } = usePrices();
  const override = ticker ? LOGO_OVERRIDE[ticker] : null;
  // For an overridden ticker, ONLY try the override → tile (never FMP, which is
  // wrong for it). Otherwise the normal cascade:
  //   owner src → live Finnhub logo → FMP by FULL ticker → FMP base (US only) → tile.
  // A SUFFIXED ticker (RR.L) never falls back to the base symbol ("RR" = Richtech).
  const hasSuffix = ticker ? ticker.includes(".") : false;
  const base = ticker ? ticker.split(".")[0] : null;
  const FMP = (s) => `https://financialmodelingprep.com/image-stock/${s}.png`;
  const candidates = (override
    ? [override]
    : [src, detailOf(ticker)?.logo, ticker && FMP(ticker), !hasSuffix && base && FMP(base)])
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
