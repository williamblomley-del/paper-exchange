# Paper Exchange — Build Plan

> Keep this open in a second tab. Work through it milestone by milestone — don't jump ahead.

---

## What carries over from the artifact (untouched)

- `C` design tokens object — keep as-is
- All presentational components: `Shell`, `Card`, `RowLine`, `Center`, `HistoryChart`, `Spark`
- All helpers: `fmt`, `P`, `ago`, `pill`, `inputStyle`
- All business logic: `execute()`, `commit()`, `totalValue()`
- All four tab UIs (Portfolio, Trade, History, Leaderboard) — structure is solid

## What gets ripped out entirely

| Old (artifact) | New (real app) | Why |
|---|---|---|
| `window.storage.get/set` | Supabase Postgres queries | Shared across users, real persistence |
| `fetchQuote()` / `fetchPrices()` | Supabase Edge Function → Finnhub | API key server-side, real market data |
| `sGet` / `sSet` helpers | Supabase JS client | Same reason |
| Name-only onboard flow | Supabase Auth (email + password) | Real identity, username tied to auth user |

---

## Architecture

```
Browser (React + Vite, deployed on Vercel)
    │
    ├─[auth]──────────▶ Supabase Auth
    │
    ├─[read/write]────▶ Supabase Postgres (RLS enforced)
    │                       ├── profiles
    │                       ├── positions
    │                       ├── trades
    │                       └── value_history
    │
    └─[prices]────────▶ Supabase Edge Function ──▶ Finnhub API
                        (FINNHUB_KEY never hits the browser)
```

---

## Database schema

Run this entire block in the Supabase SQL editor (Dashboard → SQL Editor → New Query):

```sql
-- Profiles: one per auth user
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null check(char_length(username) <= 16),
  cash numeric not null default 10000,
  created_at timestamptz default now()
);

-- Current holdings
create table positions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  ticker text not null,
  shares numeric not null check(shares > 0),
  avg_cost numeric not null,
  ticker_name text,           -- cached from Finnhub profile2
  updated_at timestamptz default now(),
  unique(user_id, ticker)
);

-- Trade history
create table trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  ticker text not null,
  side text not null check(side in ('buy','sell')),
  shares numeric not null,
  price numeric not null,
  value numeric not null,
  created_at timestamptz default now()
);

-- Portfolio value snapshots (feeds the sparkline)
create table value_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  value numeric not null,
  recorded_at timestamptz default now()
);

-- Price cache (server-side, avoids hammering Finnhub)
create table price_cache (
  ticker text primary key,
  price numeric not null,
  name text,
  logo text,
  fetched_at timestamptz default now()
);

-- ── Row Level Security ──────────────────────────────────────────
alter table profiles enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table value_history enable row level security;
alter table price_cache enable row level security;

-- Own data: full access
create policy "own profile"        on profiles      for all using (auth.uid() = id);
create policy "own positions"      on positions     for all using (auth.uid() = user_id);
create policy "own trades"         on trades        for all using (auth.uid() = user_id);
create policy "own value_history"  on value_history for all using (auth.uid() = user_id);

-- Public leaderboard: everyone can read profiles + positions (needed for hover/click features)
create policy "public profiles read"   on profiles  for select using (true);
create policy "public positions read"  on positions for select using (true);

-- Price cache: anyone can read, only service role can write (done inside Edge Function)
create policy "public price cache read" on price_cache for select using (true);
```

---

## File structure

```
paper-exchange/
├── public/
├── src/
│   ├── lib/
│   │   ├── supabase.js      ← createClient instance + auth helpers
│   │   └── prices.js        ← calls Edge Function (replaces fetchQuote/fetchPrices)
│   ├── components/
│   │   ├── design.js        ← C tokens + pill/inputStyle/etc (copied from artifact)
│   │   ├── Shell.jsx
│   │   ├── Card.jsx
│   │   ├── RowLine.jsx
│   │   ├── HistoryChart.jsx ← copied from artifact, unchanged
│   │   ├── Spark.jsx        ← copied from artifact, unchanged
│   │   └── PieChart.jsx     ← new, for leaderboard hover card
│   ├── tabs/
│   │   ├── Portfolio.jsx
│   │   ├── Trade.jsx
│   │   ├── History.jsx
│   │   └── Leaderboard.jsx  ← hover card + click-through to friend view
│   ├── pages/
│   │   └── FriendView.jsx   ← /user/:username — full portfolio of any player
│   ├── App.jsx              ← auth gate + tab router
│   └── main.jsx
├── supabase/
│   └── functions/
│       └── quote/
│           └── index.ts     ← Deno, calls Finnhub
├── .env.local               ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── .gitignore               ← include .env.local
└── package.json
```

---

## Supabase Edge Function

The complete `supabase/functions/quote/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FINNHUB_KEY = Deno.env.get("FINNHUB_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const CACHE_TTL_MINUTES = 10

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors })

  const { ticker, includeHistory } = await req.json()
  const sym = ticker.trim().toUpperCase()

  // Check cache first (avoids hammering Finnhub)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: cached } = await supabase
    .from("price_cache")
    .select("*")
    .eq("ticker", sym)
    .single()

  const cacheAgeMinutes = cached
    ? (Date.now() - new Date(cached.fetched_at).getTime()) / 60000
    : Infinity

  let price: number, name: string, logo: string | null, history: object[] = []

  if (cached && cacheAgeMinutes < CACHE_TTL_MINUTES && !includeHistory) {
    // Fresh cache, no history needed — return immediately
    price = cached.price
    name = cached.name
    logo = cached.logo
  } else {
    // Fetch live quote
    const quoteRes = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`
    )
    const quote = await quoteRes.json()

    if (!quote.c || quote.c === 0) {
      return new Response(JSON.stringify({ error: "Ticker not found on Finnhub. For London listings try without .L (e.g. BARC not BARC.L). Some UCITS ETFs (VUAG, VFEM) are not on Finnhub — check the limitations note." }), {
        headers: cors, status: 404,
      })
    }

    price = quote.c

    // Fetch company profile (name + logo)
    const profileRes = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_KEY}`
    )
    const profile = await profileRes.json()
    name = profile.name || sym
    logo = profile.logo || null

    // Upsert cache
    await supabase.from("price_cache").upsert({
      ticker: sym, price, name, logo, fetched_at: new Date().toISOString(),
    })

    // Fetch 1 year of weekly candles if history requested
    if (includeHistory) {
      const to = Math.floor(Date.now() / 1000)
      const from = to - 365 * 24 * 3600
      const candleRes = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=W&from=${from}&to=${to}&token=${FINNHUB_KEY}`
      )
      const candles = await candleRes.json()

      if (candles.s === "ok" && candles.c?.length > 1) {
        const n = candles.c.length
        // Sample 6 key points from the weekly series
        const points = [
          { label: "1Y", idx: 0 },
          { label: "6M", idx: Math.floor(n * 0.5) },
          { label: "3M", idx: Math.floor(n * 0.75) },
          { label: "1M", idx: Math.max(0, n - 5) },
          { label: "1W", idx: Math.max(0, n - 2) },
          { label: "1D", idx: n - 1 },
        ]
        history = points.map(({ label, idx }) => ({ label, price: candles.c[idx] }))
      }
    }
  }

  return new Response(
    JSON.stringify({ price, name, logo, history }),
    { headers: cors }
  )
})
```

---

## src/lib/supabase.js

```js
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Auth helpers
export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()
```

---

## src/lib/prices.js

Replaces `fetchQuote` and `fetchPrices` from the artifact:

```js
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote`

export async function fetchQuote(ticker, includeHistory = true) {
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ticker, includeHistory }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return { ...data, fetchedAt: Date.now() }
}

export async function fetchPrices(tickers) {
  // Fire requests concurrently (no history needed for bulk refresh)
  const results = await Promise.allSettled(
    tickers.map((t) => fetchQuote(t, false))
  )
  const out = {}
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out[tickers[i]] = r.value.price
  })
  return out
}
```

---

## Build sequence

### Milestone 1 — Local frontend, mock data (1–2 hours)
Goal: app running at localhost:5173, looking identical to the artifact.

```bash
npm create vite@latest paper-exchange -- --template react
cd paper-exchange
npm install @supabase/supabase-js
npm run dev
```

1. Split the monolithic artifact JSX into the file structure above — copy components and business logic wholesale.
2. Replace `sGet`/`sSet` with simple `useState` + `localStorage` temporarily (just so it runs — you'll replace this in M2).
3. Replace `fetchQuote`/`fetchPrices` with hardcoded mock data temporarily.
4. App renders, trades work locally, UI is intact. ✓

---

### Milestone 2 — Supabase auth + database (2–3 hours)
Goal: real login, data persists in Postgres.

1. Create project at supabase.com (free tier, pick the London region).
2. Run the schema SQL above in SQL Editor.
3. Create `.env.local` in the project root:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Wire `src/lib/supabase.js`.
5. Replace the name-only onboard flow with a proper auth screen:
   - Sign up: email + password + username (creates auth user, then inserts into `profiles`)
   - Sign in: email + password
6. Replace all `sGet`/`sSet` calls with Supabase queries:
   - `acct.cash` → read/write `profiles.cash`
   - `acct.positions` → read/write `positions` table
   - `acct.history` → read/write `trades` table
   - `acct.valueHistory` → read/write `value_history` table

The pattern for loading account state on mount becomes:
```js
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) { setPhase("onboard"); return }
    // fetch profile + positions + recent trades
  })
}, [])
```

---

### Milestone 3 — Finnhub prices via Edge Function (1–2 hours)
Goal: real prices, no Claude API dependency.

```bash
# Install Supabase CLI (if not already)
brew install supabase/tap/supabase

# Login + link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Create the function
supabase functions new quote

# Paste the Edge Function code from above into supabase/functions/quote/index.ts

# Set your Finnhub API key as a secret (never goes in .env or git)
supabase secrets set FINNHUB_KEY=your_finnhub_key_here

# Deploy
supabase functions deploy quote
```

Then swap `src/lib/prices.js` in — remove the mock, plug in the real `fetchQuote`/`fetchPrices` from above.

---

### Milestone 4 — Social features (2–3 hours)
Goal: leaderboard hover card, click-through to friend portfolio.

**Leaderboard data query:**
```js
// Pull all profiles + aggregate position values
const { data } = await supabase
  .from("profiles")
  .select(`
    id, username, cash,
    positions(ticker, shares, avg_cost)
  `)
```
Compute total value client-side using the price cache (fetch any missing prices via the Edge Function).

**Hover card:** `onMouseEnter` on a leaderboard row → render a floating `Card` with:
- Total value + return
- Simple SVG pie chart of holdings (use `positions` array, colour by ticker)

**Click-through:** `onClick` → navigate to `/user/:username`, which is `FriendView.jsx`:
```jsx
// Reads that user's positions + trades (public via RLS policy above)
// Shows their full portfolio table and trade history, read-only
```
For routing, add `react-router-dom`:
```bash
npm install react-router-dom
```

**PieChart.jsx (simple SVG, no library needed):**
```jsx
function PieChart({ slices }) {
  // slices: [{ label, value, color }]
  const total = slices.reduce((s, x) => s + x.value, 0)
  let angle = 0
  return (
    <svg width={80} height={80} viewBox="-1 -1 2 2">
      {slices.map((s) => {
        const pct = s.value / total
        const a1 = angle, a2 = angle + pct * 2 * Math.PI
        const x1 = Math.cos(a1), y1 = Math.sin(a1)
        const x2 = Math.cos(a2), y2 = Math.sin(a2)
        const large = pct > 0.5 ? 1 : 0
        angle = a2
        return (
          <path
            key={s.label}
            d={`M0,0 L${x1},${y1} A1,1,0,${large},1,${x2},${y2}Z`}
            fill={s.color}
          />
        )
      })}
    </svg>
  )
}
```

---

### Milestone 5 — Company logos (30 min, do alongside M4)
The Edge Function already returns `logo` from Finnhub's `profile2` endpoint. Store it in `price_cache.logo` and display it in the portfolio row:
```jsx
{logo && <img src={logo} width={20} height={20} style={{ borderRadius: 3 }} onError={(e) => e.target.style.display='none'} />}
```
`onError` fallback handles tickers with no logo gracefully.

---

### Milestone 6 — Deploy to Vercel (30 min)
Goal: shareable URL.

1. Push repo to GitHub:
   ```bash
   git init
   git remote add origin https://github.com/williamblomley-del/paper-exchange.git
   git add . && git commit -m "init"
   git push -u origin main
   ```
2. Go to vercel.com → Add New Project → import `williamblomley-del/paper-exchange`
3. Add environment variables in Vercel dashboard (same two `VITE_` vars from `.env.local`)
4. In Supabase: Authentication → URL Configuration → add `https://your-app.vercel.app` to allowed redirect URLs
5. Deploy. Share the link.

---

## Finnhub free tier — what to know before you start

- **60 API calls/minute** — fine for a friend group, but calls all go through the Edge Function (not the browser), and the Edge Function caches for 10 minutes, so real-world load is minimal.
- **US stocks:** Full support. NVDA, AAPL, GOOGL, MSFT, ORCL, PLTR, AVGO, etc. all work.
- **UK/EU stocks:** Supported but the ticker format sometimes differs from what you'd type into Trading 212. Finnhub uses `AZN` not `AZN.L`. Test edge cases — the error message in the Edge Function tells the user if a ticker fails.
- **UCITS ETFs (VUAG, VFEM, EIMI):** These are LSEETF-listed and Finnhub free tier doesn't cover them. Options: (a) document it as a known gap, (b) fall back to a Yahoo Finance quote scrape for tickers that return 0, (c) use the `VUSA` or `VHVG` Vanguard equivalents which have US-listed proxies. Handle this in M3 when you're wiring up real prices.
- **Historical candles:** Available on free tier at weekly resolution. Enough for the 6-point history chart.

---

## After June 19 — suggested time budget

| Session | Goal | Time estimate |
|---|---|---|
| 1 | Vite running locally, UI intact, mock data | 1–2 hrs |
| 2 | Supabase project, schema, auth wired | 2–3 hrs |
| 3 | Finnhub Edge Function, real prices | 1–2 hrs |
| 4 | Leaderboard hover + click-through | 2–3 hrs |
| 5 | Logos, polish, deploy | 1 hr |

Total: roughly 8–11 hours across a week of sessions. Do one milestone per sitting.

---

## .gitignore — make sure this is in there

```
node_modules/
dist/
.env.local
.env
```

Never commit `.env.local`. The `VITE_SUPABASE_ANON_KEY` is designed to be public (it's protected by RLS policies), but keep the habit.
