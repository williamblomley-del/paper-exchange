import { createContext, useContext } from "react";
import { MOCK_STOCKS, chg24 } from "./mockData.js";
import { currencyOf } from "./format.js";

// Live-price layer. `live` is { ticker: quoteData } from the Edge Function.
// Everything falls back to MOCK_STOCKS if a ticker hasn't loaded (or the
// function is unreachable), so the UI never breaks.
export const PricesCtx = createContext({ live: {} });

export function usePrices() {
  const { live } = useContext(PricesCtx);
  return {
    live,
    isLive: (t) => live[t]?.price != null,
    priceOf: (t) => live[t]?.price ?? MOCK_STOCKS[t]?.price ?? 0,
    curOf: (t) => currencyOf(t, live[t]?.currency), // native currency (suffix-aware)
    chgOf: (t) => (live[t]?.changePct != null ? live[t].changePct : chg24(t)), // daily %
    detailOf: (t) => ({ ...(MOCK_STOCKS[t] || {}), ...(live[t] || {}) }),
  };
}
