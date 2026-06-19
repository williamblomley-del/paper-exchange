// Supabase Edge Function: quote
// Browser → THIS function → Finnhub (+ Yahoo). FINNHUB_KEY lives only here.
//
// Finnhub (US-focused) is the primary snapshot; for non-US listings (e.g. AZN.L,
// MC.PA) it falls back to Yahoo, which also reports the CURRENCY. London pence
// (GBp) is converted to pounds (GBP). Real history always comes from Yahoo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINNHUB_KEY = Deno.env.get("FINNHUB_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CACHE_TTL_MIN = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const fh = (path: string) => fetch(`https://finnhub.io/api/v1/${path}&token=${FINNHUB_KEY}`).then((r) => r.json()).catch(() => null);
const yf = (url: string) => fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.json()).catch(() => null);

// Verbose exchange strings (Finnhub or Yahoo) → short label (NASDAQ / NYSE / LSE …).
function normExchange(s: string | null | undefined): string | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u.includes("NASDAQ")) return "NASDAQ";
  if (u.includes("NYSE") || u.includes("NEW YORK")) return "NYSE";
  if (u.includes("ARCA")) return "NYSE Arca";
  if (u.includes("LSE") || u.includes("LONDON")) return "LSE";
  if (u.includes("XETRA") || u.includes("FRANKFURT") || u === "GER" || u === "FRA") return "XETRA";
  if (u.includes("PARIS")) return "Euronext Paris";
  if (u.includes("AMSTERDAM")) return "Euronext AMS";
  if (u.includes("MILAN") || u.includes("ITALIANA")) return "Borsa Italiana";
  if (u.includes("TORONTO") || u === "TOR") return "TSX";
  if (u.includes("CBOE") || u.includes("BATS")) return "CBOE";
  return s.length <= 6 ? s : s.split(/[ ,]/)[0];
}

// [yahooRange, yahooInterval, downsampleFactor]. Yahoo has no native 20m / 6h / 12h
// intervals, so we fetch the nearest finer native interval and keep every Nth bar:
//   1W → 5m fetched, every 4th = 20-min.  3M → 60m, every 6th = 6-hour (quarter day).
//   6M → 60m, every 12th = 12-hour (half day).
const YF: Record<string, [string, string, number]> = {
  "1D": ["2d", "5m", 1], "1W": ["5d", "5m", 4], "1M": ["1mo", "60m", 1],
  "3M": ["3mo", "60m", 6], "6M": ["6mo", "60m", 12], "1Y": ["1y", "1d", 1], "MAX": ["max", "1wk", 1],
};

// One Yahoo chart call → meta (snapshot) + history. Converts GBp (pence) → GBP.
async function yahoo(sym: string, range: string | null) {
  const [r, intv, factor] = range ? (YF[range] || ["1mo", "1d", 1]) : ["1d", "1d", 1];
  const res = await yf(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${r}&interval=${intv}&includePrePost=true`);
  const result = res?.chart?.result?.[0];
  if (!result?.meta) return null;
  const meta = result.meta;
  let cur = meta.currency || "USD";
  const div = cur === "GBp" || cur === "GBX" ? 100 : 1;
  if (div !== 1) cur = "GBP";
  const closes = result.indicators?.quote?.[0]?.close || [];
  const ts = result.timestamp || [];
  let history = range
    ? ts.map((t: number, i: number) => ({ t, c: closes[i] != null ? closes[i] / div : null })).filter((p: { c: number | null }) => p.c != null)
    : [];
  // downsample to the requested spacing, always keeping the most recent bar
  if (factor > 1) history = history.filter((_: unknown, i: number, a: unknown[]) => i % factor === 0 || i === a.length - 1);
  const d = (v: number | null | undefined) => (v == null ? null : v / div);
  return {
    price: d(meta.regularMarketPrice), prevClose: d(meta.chartPreviousClose ?? meta.previousClose),
    open: d(meta.regularMarketOpen), high: d(meta.regularMarketDayHigh), low: d(meta.regularMarketDayLow),
    currency: cur, name: meta.longName || meta.shortName || sym, history,
    exchange: normExchange(meta.fullExchangeName || meta.exchangeName),
  };
}

// Latest EXTENDED-HOURS price (pre/post-market) + correct day change. The normal
// price field ignores pre/post-market; this reads the last 1-min bar (incl pre/post)
// and picks the right baseline: vs the last regular close while in pre/post, vs
// yesterday's close during regular hours.
async function yahooLive(sym: string) {
  const res = await yf(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1m&includePrePost=true`);
  const r = res?.chart?.result?.[0];
  if (!r?.meta) return null;
  const meta = r.meta;
  let cur = meta.currency || "USD";
  const div = cur === "GBp" || cur === "GBX" ? 100 : 1;
  if (div !== 1) cur = "GBP";
  const closes = r.indicators?.quote?.[0]?.close || [];
  let lastC: number | null = null;
  for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { lastC = closes[i]; break; } }
  const price = lastC ?? meta.regularMarketPrice;
  if (price == null) return null;
  // Day change is always measured vs the PREVIOUS close (the standard "day change").
  // Using the regular close as the baseline during extended hours broke non-US markets
  // like the LSE (.L) — after the London close there's no post-market, so price ≈ regular
  // close → ~0.00%. Vs previous close it's correct for US, London, and pre/post-market.
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
  const change = price - prev;
  return { price: price / div, prevClose: prev / div, change: change / div, changePct: prev ? (change / prev) * 100 : 0, currency: cur };
}

// Resolve a typed query (e.g. "P911", "porsche") to a Yahoo symbol (e.g. P911.DE).
async function yahooSearch(q: string): Promise<string | null> {
  const res = await yf(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`);
  const quotes = res?.quotes || [];
  const eq = quotes.find((x: { quoteType?: string; symbol?: string }) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF")) || quotes[0];
  return eq?.symbol || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();

    // SEARCH mode: { search: "query" } → list of matching companies (autocomplete)
    if (body.search) {
      const look = async (qq: string) => {
        const res = await yf(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(qq)}&quotesCount=14&newsCount=0`);
        return (res?.quotes || []).filter((x: { symbol?: string; quoteType?: string }) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF"));
      };
      let quotes = await look(body.search);
      // Enrich a ticker search with the company's OTHER listings (so "AZN" also
      // surfaces AZN.L London etc.) by re-searching the top match's company name.
      const topName = quotes[0]?.longname || quotes[0]?.shortname;
      if (topName && topName.toLowerCase() !== String(body.search).toLowerCase()) {
        const seen = new Set(quotes.map((q: { symbol: string }) => q.symbol));
        for (const m of await look(topName)) if (!seen.has(m.symbol)) { quotes.push(m); seen.add(m.symbol); }
      }
      const results = quotes.slice(0, 12).map((x: { symbol: string; shortname?: string; longname?: string; exchDisp?: string; exchange?: string }) => ({
        symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: normExchange(x.exchDisp || x.exchange),
      }));
      return new Response(JSON.stringify({ results }), { headers: cors });
    }

    // LISTS mode: { lists:true } → real Top Gainers / Losers / Most Active from
    // Yahoo's predefined screeners (free, unofficial — same source as the charts).
    if (body.lists) {
      const scr = async (id: string) => {
        const r = await yf(`https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=12&scrIds=${id}`);
        const quotes = r?.finance?.result?.[0]?.quotes || [];
        return quotes.map((q: { symbol: string; longName?: string; shortName?: string; regularMarketPrice?: number; regularMarketChangePercent?: number; currency?: string }) => ({
          symbol: q.symbol, name: q.longName || q.shortName || q.symbol,
          price: q.regularMarketPrice ?? null, changePct: q.regularMarketChangePercent ?? null,
          currency: q.currency || "USD",
        }));
      };
      const [gainers, losers, actives] = await Promise.all([scr("day_gainers"), scr("day_losers"), scr("most_actives")]);
      return new Response(JSON.stringify({ gainers, losers, actives }), { headers: cors });
    }

    // QUOTES mode: { quotes:[tickers] } → fresh { ticker:{price,change,changePct,prevClose} }
    // Light: 1 Finnhub call/ticker (Yahoo fallback), NO cache — for live holdings refresh.
    if (body.quotes) {
      const syms = (body.quotes || []).slice(0, 40);
      const out: Record<string, unknown> = {};
      await Promise.all(syms.map(async (raw: string) => {
        const sym = String(raw).toUpperCase();
        // Yahoo extended-hours first (so pre/post-market moves show); Finnhub fallback.
        const lv = await yahooLive(sym);
        if (lv && lv.price != null) {
          out[sym] = { price: lv.price, change: lv.change, changePct: lv.changePct, prevClose: lv.prevClose };
        } else {
          const q = await fh(`quote?symbol=${sym}`);
          if (q && q.c) out[sym] = { price: q.c, change: q.d, changePct: q.dp, prevClose: q.pc };
        }
      }));
      return new Response(JSON.stringify({ quotes: out }), { headers: cors });
    }

    // HISTORIES mode: { histories:[tickers], range } → { histories:{ ticker:[{t,c}] } }
    // Yahoo-only (no Finnhub) so it's cheap — used to rebuild the portfolio curve.
    if (body.histories) {
      const range = body.range || "1Y";
      const syms = (body.histories || []).slice(0, 40);
      const out: Record<string, unknown> = {};
      await Promise.all(syms.map(async (sym: string) => {
        const y = await yahoo(String(sym).toUpperCase(), range);
        out[sym] = y?.history || [];
      }));
      return new Response(JSON.stringify({ histories: out }), { headers: cors });
    }

    const { ticker, range = null } = body;
    const sym = String(ticker || "").trim().toUpperCase();
    if (!sym) return new Response(JSON.stringify({ error: "No ticker" }), { headers: cors, status: 400 });
    const wantHistory = !!range;

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cached } = await db.from("price_cache").select("*").eq("ticker", sym).single();
    const ageMin = cached ? (Date.now() - new Date(cached.fetched_at).getTime()) / 60000 : Infinity;
    if (cached && ageMin < CACHE_TTL_MIN && !wantHistory) {
      return new Response(JSON.stringify({ price: cached.price, name: cached.name, logo: cached.logo, currency: "USD", cached: true }), { headers: cors });
    }

    // Fire all the independent data calls IN PARALLEL (was sequential → slow).
    // For US tickers ySym = sym, so the Yahoo history + live can run alongside the
    // Finnhub calls; non-US (rare) falls back to a resolve-then-fetch path below.
    let ySym = sym; // symbol used for Yahoo history (may be resolved)
    const [p, m, q, lvSym, yresSym] = await Promise.all([
      fh(`stock/profile2?symbol=${sym}`).then((x) => x || {}),
      fh(`stock/metric?symbol=${sym}&metric=all`).then((x) => x || {}),
      fh(`quote?symbol=${sym}`),
      yahooLive(sym),
      wantHistory ? yahoo(sym, range) : Promise.resolve(null),
    ]);

    let snap: Record<string, number | string | null>;
    let lv = lvSym;
    let yres = yresSym;
    if (q && q.c && q.c !== 0) {
      // US / Finnhub-covered listing (quoted in its native currency, usually USD)
      let cur = p.currency || "USD";
      const div = cur === "GBp" || cur === "GBX" ? 100 : 1;
      if (div !== 1) cur = "GBP";
      snap = { price: q.c / div, change: q.d / div, changePct: q.dp, open: q.o / div, high: q.h / div, low: q.l / div, prevClose: q.pc / div, currency: cur };
    } else {
      // non-US: resolve via Yahoo (direct, then SEARCH) and re-fetch for that symbol.
      let y = await yahoo(sym, null);
      if (!y || y.price == null) {
        const resolved = await yahooSearch(sym);
        if (resolved) { ySym = resolved; y = await yahoo(ySym, null); }
      }
      if (!y || y.price == null) {
        return new Response(JSON.stringify({ error: `Couldn't find "${sym}". Try the company name or a suffixed ticker (AZN.L London, P911.DE Frankfurt, MC.PA Paris).` }), { headers: cors, status: 404 });
      }
      const change = y.price - (y.prevClose ?? y.price);
      snap = { price: y.price, change, changePct: y.prevClose ? (change / y.prevClose) * 100 : 0, open: y.open ?? y.prevClose, high: y.high, low: y.low, prevClose: y.prevClose, currency: y.currency, _yname: y.name, _yexch: y.exchange };
      // the parallel lv/yres were for `sym`; refetch for the resolved symbol
      [lv, yres] = await Promise.all([yahooLive(ySym), wantHistory ? yahoo(ySym, range) : Promise.resolve(null)]);
    }

    // Override headline price/change with EXTENDED-HOURS data (pre/post-market).
    if (lv && lv.price != null) {
      snap.price = lv.price; snap.change = lv.change; snap.changePct = lv.changePct; snap.prevClose = lv.prevClose;
      if (lv.currency) snap.currency = lv.currency;
    }

    const logo = p.logo || null;
    const met = m?.metric || {};

    const out: Record<string, unknown> = {
      ...snap,
      name: p.name || snap._yname || sym,
      logo, marketCap: p.marketCapitalization ?? null,
      exchange: yres?.exchange || snap._yexch || normExchange(p.exchange) || null,
      industry: p.finnhubIndustry || null, country: p.country || null, pe: met.peTTM ?? null,
      // extra profile/metric fields for a richer About section (all free tier)
      weburl: p.weburl || null, ipo: p.ipo || null, shareOutstanding: p.shareOutstanding ?? null,
      week52High: met["52WeekHigh"] ?? null, week52Low: met["52WeekLow"] ?? null,
      history: yres?.history ?? [],
    };
    delete out._yname; delete out._yexch;

    await db.from("price_cache").upsert({ ticker: sym, price: out.price, name: out.name, logo: out.logo, fetched_at: new Date().toISOString() });
    return new Response(JSON.stringify(out), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { headers: cors, status: 500 });
  }
});
