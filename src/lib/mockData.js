// Mock market data + seeded price-series generator — copied verbatim from
// PaperExchange.jsx. In Milestone 3 this whole file gets replaced by live
// Finnhub data fetched through the Supabase Edge Function. Until then, these
// deterministic mock series let the charts, watchlist and trading all work.

// Seeded PRNG so the generated price history is identical on every reload.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a ~260-point price series ending at `end`, walking backwards.
export function genSeries(seed, end, vol = 0.018, drift = 0.0006) {
  const rnd = mulberry32(seed);
  const n = 260;
  const arr = new Array(n);
  let p = end;
  for (let i = n - 1; i >= 0; i--) {
    arr[i] = p;
    p = p / (1 + drift + (rnd() - 0.5) * vol * 2);
  }
  return arr.map((v) => +v.toFixed(2));
}

export const MOCK_STOCKS = {
  NVDA:  { name: "NVIDIA Corporation", price: 1037.89, mcap: "2.56T", pe: 64.2, vol: "42.83M", seed: 11 },
  AAPL:  { name: "Apple Inc.",         price: 196.42,  mcap: "3.01T", pe: 33.1, vol: "51.20M", seed: 22 },
  MSFT:  { name: "Microsoft Corp.",    price: 445.68,  mcap: "3.31T", pe: 38.4, vol: "18.40M", seed: 33 },
  GOOGL: { name: "Alphabet Inc.",      price: 168.58,  mcap: "2.08T", pe: 27.5, vol: "22.10M", seed: 44 },
  AMZN:  { name: "Amazon.com Inc.",    price: 198.51,  mcap: "2.05T", pe: 44.0, vol: "35.60M", seed: 55 },
  TSLA:  { name: "Tesla, Inc.",        price: 178.91,  mcap: "569B",  pe: 71.8, vol: "98.70M", seed: 66 },
  AVGO:  { name: "Broadcom Inc.",      price: 1642.30, mcap: "762B",  pe: 58.9, vol: "2.10M",  seed: 77 },
  TSM:   { name: "TSMC",               price: 174.22,  mcap: "903B",  pe: 29.7, vol: "9.80M",  seed: 88 },
  ORCL:  { name: "Oracle Corp.",       price: 142.11,  mcap: "391B",  pe: 36.2, vol: "7.30M",  seed: 99 },
  SPY:   { name: "SPDR S&P 500 ETF",   price: 612.78,  mcap: "—",     pe: 26.1, vol: "61.40M", seed: 111 },
};
// Attach a generated series to each stock + a short low-vol intraday series (1D).
Object.values(MOCK_STOCKS).forEach((s) => {
  s.series = genSeries(s.seed, s.price);
  s.intraday = genSeries(s.seed + 7, s.price, 0.004, 0.0002).slice(-40);
});

// Company meta — for the About block + allocation groupings. On Finnhub FREE only
// `country` and `industry` are available; sector/ceo/hq/employees/description are
// NOT free-tier (mock here, flagged for Milestone 3).
export const META = {
  NVDA:  { sector: "Technology", industry: "Semiconductors", country: "United States", ceo: "Jensen Huang", hq: "Santa Clara, CA", employees: "29,600", desc: "NVIDIA designs graphics processing units (GPUs) and system-on-chip units for gaming, professional visualisation, data-centre and automotive markets, and is a leading supplier of AI accelerators." },
  AAPL:  { sector: "Technology", industry: "Consumer Electronics", country: "United States", ceo: "Tim Cook", hq: "Cupertino, CA", employees: "161,000", desc: "Apple designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories, and sells a range of related services." },
  MSFT:  { sector: "Technology", industry: "Software", country: "United States", ceo: "Satya Nadella", hq: "Redmond, WA", employees: "221,000", desc: "Microsoft develops and licenses software, devices and cloud services, including Windows, Office, Azure and the Xbox platform." },
  GOOGL: { sector: "Communication", industry: "Interactive Media", country: "United States", ceo: "Sundar Pichai", hq: "Mountain View, CA", employees: "182,000", desc: "Alphabet is the parent of Google, providing search, advertising, cloud, Android, YouTube and a range of hardware and other ventures." },
  AMZN:  { sector: "Consumer", industry: "Internet Retail", country: "United States", ceo: "Andy Jassy", hq: "Seattle, WA", employees: "1,525,000", desc: "Amazon is an online retailer and cloud-computing provider, operating marketplaces, AWS, advertising, devices and subscription services." },
  TSLA:  { sector: "Consumer", industry: "Automobiles", country: "United States", ceo: "Elon Musk", hq: "Austin, TX", employees: "140,000", desc: "Tesla designs and manufactures electric vehicles along with energy generation and storage systems." },
  AVGO:  { sector: "Technology", industry: "Semiconductors", country: "United States", ceo: "Hock Tan", hq: "Palo Alto, CA", employees: "20,000", desc: "Broadcom designs and supplies a broad range of semiconductor and infrastructure-software solutions." },
  TSM:   { sector: "Technology", industry: "Semiconductors", country: "Taiwan", ceo: "C. C. Wei", hq: "Hsinchu, Taiwan", employees: "76,000", desc: "TSMC is the world's largest dedicated semiconductor foundry, manufacturing chips for fabless customers worldwide." },
  ORCL:  { sector: "Technology", industry: "Software", country: "United States", ceo: "Safra Catz", hq: "Austin, TX", employees: "164,000", desc: "Oracle provides database software, cloud-engineered systems and enterprise software products." },
  SPY:   { sector: "ETF", industry: "Index Fund", country: "United States", ceo: "—", hq: "—", employees: "—", desc: "SPDR S&P 500 ETF Trust tracks the S&P 500 index of large-cap US equities." },
};

export const WATCH = ["NVDA","AAPL","MSFT","GOOGL","AMZN","TSLA","AVGO","TSM","ORCL","SPY"];

// [label, trailing points]. 1D uses the separate intraday series (handled in
// StockDetail). NOTE: real 1D intraday may NOT be free on Finnhub — flag at M3.
export const TIMEFRAMES = [["1D",40],["1W",5],["1M",22],["3M",66],["6M",132],["1Y",252],["MAX",260]];

// 24h % change for a ticker, derived from its mock series (last two points).
// Returns 0 for tickers not in the mock set (e.g. searched/bought foreign stocks)
// so callers never crash — live data (chgOf) supplies the real % when available.
export function chg24(t) {
  const s = MOCK_STOCKS[t];
  if (!s) return 0;
  return ((s.price - s.series[s.series.length - 2]) / s.series[s.series.length - 2]) * 100;
}

// Market Watch sub-tab lists.
//  - "Trending" = the user's watchlist; this is the ONLY one that goes live in M3.
//  - "Top Gainers" / "Top Losers" / "Most Active" need a market-screener feed that
//    Finnhub's free tier does NOT provide, so per the design decision they stay as
//    static sample data permanently. Gainers/Losers are sorted by mock 24h change so
//    the signs read correctly; Most Active uses a fixed plausible order.
export const MARKET_LISTS = {
  "Trending":    WATCH,
  "Top Gainers": [...WATCH].sort((a, b) => chg24(b) - chg24(a)).slice(0, 6),
  "Top Losers":  [...WATCH].sort((a, b) => chg24(a) - chg24(b)).slice(0, 6),
  "Most Active": ["TSLA", "NVDA", "SPY", "AAPL", "AMZN", "MSFT"],
};

export const MOCK_USERS = [
  { username: "InvestWizard",   value: 12543.07, ret: 25.43, seed: 201 },
  { username: "MarketMaster99", value: 11823.48, ret: 18.23, seed: 202 },
  { username: "BullishBen",     value: 11280.04, ret: 12.80, seed: 203 },
  { username: "GreenGraph",     value: 10676.52, ret: 6.77,  seed: 204 },
  { username: "TradeTitan",     value: 10542.83, ret: 5.43,  seed: 205 },
  { username: "AlphaAce",       value: 10120.99, ret: 1.21,  seed: 206 },
  { username: "DataDriven",     value: 9783.22,  ret: -2.17, seed: 207 },
  { username: "ValueHunter",    value: 9011.47,  ret: -9.89, seed: 209 },
];
