import { useState, useEffect } from "react";
import { C } from "../theme.js";
import { usePrices } from "../lib/pricesContext.js";

// Manual logo overrides for tickers where the free logo services return the WRONG
// image (e.g. FMP serves a valid-but-wrong logo for RR.L). Clearbit fetches the
// real logo by company domain. Add more here as they come up.
const LOGO_OVERRIDE = {
  // RR.L (London) has no logo on FMP, but its US ADR "RYCEY" does — use that.
  "RR.L": "https://financialmodelingprep.com/image-stock/RYCEY.png",
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
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setIdx(0); setLoaded(false); }, [candidates[0], candidates.length]);
  const radius = round ? "50%" : size * 0.28;
  const url = candidates[idx];

  const palette = {
    NVDA: "#76B900", AAPL: "#111", MSFT: "#00A4EF", GOOGL: "#4285F4", AMZN: "#FF9900",
    TSLA: "#E82127", AVGO: "#CC092F", TSM: "#D6001C", ORCL: "#F80000", SPY: "#1B5E9E",
  };

  // The coloured tile renders INSTANTLY underneath; the real logo fades in over it
  // the moment it loads (and on error we advance to the next source). So there's
  // never a blank wait — you always see something immediately.
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: radius, background: palette[ticker] || "#888", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36, fontFamily: C.sans,
      }}>{ticker ? ticker[0] : "?"}</div>
      {url && (
        <img
          src={url} alt={ticker} width={size} height={size}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(false); setIdx((i) => i + 1); }}
          style={{ position: "absolute", inset: 0, width: size, height: size, borderRadius: radius, objectFit: "contain", background: "#fff", border: `1px solid ${C.line}`, opacity: loaded ? 1 : 0, transition: "opacity .15s" }}
        />
      )}
    </div>
  );
}
