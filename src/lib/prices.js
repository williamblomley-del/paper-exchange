// Talks to the `quote` Edge Function (which talks to Finnhub + Yahoo). No keys
// here — only the Supabase URL + anon key, which are safe in the browser.
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// range: a timeframe label ("1D".."MAX") to also fetch real history, or null for
// a snapshot only. Passing a range also bypasses the function's 10-min cache.
export async function fetchQuote(ticker, range = null) {
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ ticker, range }),
  });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { err = (await res.json()).error || err; } catch { /* ignore */ }
    throw new Error(err);
  }
  return res.json();
}

// Autocomplete: query → [{ symbol, name, exchange }].
export async function searchSymbols(query) {
  if (!query || query.trim().length < 1) return [];
  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ search: query.trim() }),
    });
    if (!res.ok) return [];
    return (await res.json()).results || [];
  } catch { return []; }
}

// Real market lists (Top Gainers / Losers / Most Active) from Yahoo screeners.
export async function fetchLists() {
  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ lists: true }),
    });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

// Fresh live quotes (price + daily change) for several tickers, bypassing the cache
// → { ticker: { price, change, changePct, prevClose } }. For the live holdings refresh.
export async function fetchQuotes(tickers) {
  if (!tickers || !tickers.length) return {};
  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ quotes: tickers }),
    });
    if (!res.ok) return {};
    return (await res.json()).quotes || {};
  } catch { return {}; }
}

// Price histories for several tickers at once (Yahoo-only, cheap) → { ticker: [{t,c}] }.
export async function fetchHistories(tickers, range) {
  if (!tickers || !tickers.length) return {};
  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ histories: tickers, range }),
    });
    if (!res.ok) return {};
    return (await res.json()).histories || {};
  } catch { return {}; }
}

// Bulk snapshots (no history) for the watchlist + held tickers.
export async function fetchPrices(tickers) {
  const results = await Promise.allSettled(tickers.map((t) => fetchQuote(t, null)));
  const out = {};
  results.forEach((r, i) => { if (r.status === "fulfilled" && r.value?.price != null) out[tickers[i]] = r.value; });
  return out;
}
