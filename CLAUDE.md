# Paper Exchange — Project Context (read this first)

A paper-trading web app: friends compete on a shared leaderboard with fake money
(P£10,000 starting balance) and real stock prices. Owner is new to web dev — explain
setup steps clearly, don't assume prior knowledge.

This file is the running memory for the build. Update it whenever a decision is made.

---

## Stack (all free tiers)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite | Plain JS (no TypeScript), inline-style design system |
| Auth | Supabase Auth | Email + password; username tied to auth user (Milestone 2) |
| Database | Supabase Postgres | RLS enforced. Schema is in `paper-exchange-build-plan.md` (Milestone 2) |
| Prices | Finnhub | **Called ONLY through a Supabase Edge Function** so the API key stays server-side |
| Deploy | Vercel | Shareable URL (Milestone 6) |

GitHub username: `williamblomley-del`

### The #1 rule this rebuild exists to enforce
The Finnhub API key must **NEVER** reach the browser. The old prototype leaked it via a
client-side fetch. All price calls go: browser → Supabase Edge Function → Finnhub. The
key lives only as a Supabase secret (`supabase secrets set FINNHUB_KEY=...`).

---

## Free-tier scope — do NOT build features that need paid data

- **Market tab** = search, selected-stock detail, price chart with 1W / 1M / 1Y / MAX
  toggles, OHLC row, market cap, P/E.
- **NO** news feed, **NO** related-stocks sidebar, **NO** earnings cards — these need
  data Finnhub free doesn't give cheaply.
- **1D intraday** may not be reliably free. Daily candles and up are fine. If 1D data
  isn't available when wiring real prices, **flag it — don't fake it.**
- **Company logos** via Clearbit / Finnhub `profile2` where available, with a graceful
  fallback to a coloured letter tile (the `Logo` component already does the tile).
- Finnhub free tier: 60 calls/min; US stocks fully supported; UK/EU tickers sometimes
  differ (e.g. `AZN` not `AZN.L`); UCITS ETFs (VUAG, VFEM) not covered — known gap.

---

## Milestone order (strict — one per session, don't jump ahead)

1. **Local frontend, mock data** ✅ DONE — Vite running, UI split into components,
   mock data + in-memory state. Includes the new-mockup redesign of all three tabs
   (see "Milestone 1 redesign" below). Market + Portfolio fully styled to Trading 212;
   **Leaderboard still needs a matching pass** (older look, green/red chart not blue).
2. **Supabase auth + database** ⏳ NEXT — real login, data persists in Postgres. Run schema SQL,
   create `.env.local`, wire `src/lib/supabase.js`, replace in-memory state with queries.
3. **Finnhub prices via Edge Function** ⏳ IN PROGRESS — deploy `supabase/functions/quote`,
   swap mock data for `src/lib/prices.js`. This is where the API-key-server-side rule lands.
4. **Social features** — leaderboard hover card + click-through to friend portfolio
   (`/user/:username`), add `react-router-dom`.
5. **Company logos** — real logos from `price_cache.logo`, coloured-tile fallback.
6. **Deploy to Vercel** — push to GitHub, import, set env vars, add redirect URL in
   Supabase, share link.

Full architecture, DB schema, Edge Function code, and per-milestone steps live in
`paper-exchange-build-plan.md`. Read it before starting any milestone.

---

## Design lock

> ⚠️ **SUPERSEDED (M1 redesign).** `PaperExchange.jsx` was the *original* locked design.
> During Milestone 1 the owner provided a **new mockup** and asked to rebuild all three
> tabs to match it. The live design is now what's in `src/` — see "M1 redesign" below.
> `PaperExchange.jsx` is kept only as historical reference; **`src/` is the source of
> truth for appearance now.** The currency stays **P£** (the mockup showed `$` but that's
> just the mock image).

`PaperExchange.jsx` (project root) was the original frontend design — kept untouched as a
historical reference, do not delete it. The design tokens (`C`), helpers, and trading
logic from it still carry over; only the layout of the three tabs changed.

### ⚠️ Important: the build plan describes an OLDER prototype
`paper-exchange-build-plan.md` was written against an earlier version of the frontend.
Where the two disagree, **`PaperExchange.jsx` wins** (owner's explicit instruction).
Specifically, the plan is out of date on:

| Plan says | Actual locked design (`PaperExchange.jsx`) |
|---|---|
| Components: `Shell`, `Card`, `RowLine`, `Center`, `HistoryChart`, `Spark` | `Panel`, `Stat`, `Avatar`, `Logo`, `MiniSpark`, `Donut`, `BigChart` |
| 4 tabs: Portfolio / **Trade** / **History** / Leaderboard | 3 tabs: **Market** / Portfolio / Leaderboard |
| Helpers `ago`, `pill`; fns `execute()`, `commit()`; `window.storage` | Helpers `fmt`, `P`, `pct`, `userColor`; single `trade()` fn; in-memory `useState` |

The plan is still **correct and authoritative** on the big architecture: Supabase,
the Edge Function pattern, the DB schema, the free-tier limits, and the milestone order.
Only the frontend component/tab specifics are stale — follow the actual JSX there.

---

## Current code structure (after Milestone 1)

```
paper-exchange/
├── PaperExchange.jsx              ← original locked design (reference, untouched)
├── paper-exchange-build-plan.md   ← architecture + milestones (frontend bits stale)
├── CLAUDE.md                      ← this file
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── .gitignore
├── public/
└── src/
    ├── main.jsx                   ← Vite entry, renders <App/>
    ├── App.jsx                    ← top nav + ALL shared state + trade()/searchOpen()
    ├── theme.js                   ← C design tokens, START_CASH, DONUT palette
    ├── lib/
    │   ├── format.js              ← fmt, P, pct, userColor
    │   └── mockData.js            ← genSeries + MOCK_STOCKS/WATCH/TIMEFRAMES/MOCK_USERS
    │                                 (gets replaced by live Finnhub data in M3)
    ├── components/                ← presentational
    │   ├── GlobalStyles.jsx       ← font import + hover/transition CSS
    │   ├── Panel.jsx  Stat.jsx  Avatar.jsx  Logo.jsx
    │   ├── MiniSpark.jsx  Donut.jsx
    │   ├── BigChart.jsx           ← now supports `axes` prop (gridlines + price labels)
    │   └── MarketWatch.jsx        ← NEW (M1 redesign): 4 sub-tabs, used by Market tab
    └── tabs/
        ├── Market.jsx  Portfolio.jsx  Leaderboard.jsx
```

**State pattern:** all shared state (`cash`, `positions`, `trades`, `active`, `tab`, …)
lives in `App.jsx` and is passed to the three tab components as props.

### Milestone 1 decisions
- **In-place scaffold** in the existing folder (kept the two original files in root).
- Built with React 19 + Vite 8 (from the official `npm create vite` template).
- **Did not** add `@supabase/supabase-js` yet, and **did not** add the localStorage /
  mock-fetch shims the plan mentions for M1 — the locked design uses pure in-memory
  `useState`, so there was nothing to shim. Those land in M2/M3 instead.
- `trades` state is tracked but not displayed (no History tab in this design) — matches
  the locked design; kept for future use.

### Milestone 1 redesign (new mockup) — DECISIONS
The owner supplied a richer mockup mid-M1 and asked to rebuild the three tabs to it.

**Global**
- Removed the left sidebar entirely — navigation is the 3 top tabs only.
- Top nav now: logo (left) · centred tabs · search + 🔔 bell + avatar▾ (right).
- Tab 1 is labelled **"Market"** (the mockup called it "Home"; kept "Market" as that's
  what the owner calls it — trivial to rename in `App.jsx` if desired).
- `BigChart` gained an `axes` prop → horizontal gridlines + right-side price labels.
  Labels derive from the data (min→max), nothing faked. No x-axis date labels because
  mock series have no real dates (revisit at M3 with real candles).

**Market tab**
- Removed **Company Earnings** and **Top Movers** panels (owner request + free-tier).
- Removed the **About company** block and **Dividend Yield** (not free-tier viable).
- Added **Volume** to the OHLC row (free-tier safe via candle data).
- Timeframes: 1W / 1M / 3M / 6M / 1Y / MAX — **no 1D** (intraday not reliably free).
- New **Market Watch** panel with 4 sub-tabs. DECISION: only **Trending** (= watchlist)
  goes live in M3; **Top Gainers / Top Losers / Most Active stay static mock data
  permanently** (Finnhub free has no screener feed). See `MARKET_LISTS` in mockData.js.
- Buy/Sell redesigned: a Buy/Sell segmented toggle (`side` state, local to Market) +
  P£/Shares mode + amount + a single action button + "Buying Power". Same `trade()`
  logic underneath. NOTE: the mockup's button said "Review Order" but there's no order-
  review step yet, so the button is labelled by its action ("Buy NVDA"/"Sell NVDA") and
  executes immediately — honest about what it does. Add a confirm step later if wanted.

**Portfolio tab**
- Restructured to a two-pane, Leaderboard-style layout: LEFT = scrollable holdings list
  (`maxHeight:560, overflowY:auto`), RIGHT = sticky column with Overview + Performance +
  Allocation. Same data as before, reorganised.

**Leaderboard tab**
- Kept its two-pane structure; restyled to the shared theme (gridded performance chart).
- Hover card + click-through to a friend's full portfolio is still **Milestone 4** work.

**Free-tier reminders that will bite at M3** (flag, don't fake):
- Market Watch gainers/losers/most-active = permanent mock (no data source).
- 1D intraday omitted; if added later and unavailable, grey it out.
- Real company logos = M5 (Logo.jsx coloured tile is the fallback).

### Milestone 1 — second visual pass (Trading 212 reference) — DECISIONS
Owner gave a Trading 212 screenshot and asked for: a fuller Market tab that "uses
the space," a lighter background ("very minimal gray"), and fonts like the photos.

**Theme (`theme.js`) — applies to ALL tabs**
- Page background is now **white** (`C.bg = #FFFFFF`). Gray is used ONLY for small
  inner fill boxes / inputs via a new token **`C.fill` (#F4F5F7)** (plus `fillSoft`).
  Replaced the old heavy gray canvas. `Stat`, the trade panel, search, and inner
  boxes use `C.fill`; cards stay white, separated by border + soft shadow.
- Font switched to **Manrope** (rounded fintech sans, close to the references),
  used everywhere. **Monospace dropped** — `C.mono` now points at the Manrope stack
  and `html{font-variant-numeric:tabular-nums}` (GlobalStyles) keeps numbers aligned.
- Content width widened to **maxWidth 1320** (was 1180) to use the space; search is a
  pill. `C.sh` shadow slightly stronger so white cards read on the white page.

**Market tab — now Trading-212-style (fuller left + right)**
- LEFT column = new **`AccountCard.jsx`** (ACCOUNT VALUE, Last-24h + All-time, Invested
  / Cash boxes, mini chart) stacked ABOVE Market Watch. Day change is computed honestly
  from mock data: Σ shares × (price − prev close).
- Market Watch rows gained **sparklines** (MiniSpark) + stacked price/% on the right.
- RIGHT column reordered to match the reference: header (ticker · Stock, name, ★, ⋯) →
  big price with **timeframe-aware change** ("…last year/month/week", from `TF_LABEL`) →
  prominent **Sell/Buy** pills + amount entry + Buying Power → chart → **timeframes BELOW
  the chart** → stats row → **"Your investment"** block (Value / Shares / Avg / Return),
  shown only when the user holds the active stock.
- Same `trade()` logic; `side` state is local to Market.

Portfolio + Leaderboard structure unchanged from the first redesign — they just inherit
the new white/Manrope theme automatically.

### Milestone 1 — third visual pass (flatten / connect) — DECISIONS
Owner: fewer curves, less grey (white everywhere), connect each tab into one surface
with thin grey divider *lines* (not grey gaps/fills) like Trading 212.

**Global**
- Panel radius 18 → **14**; buttons/inputs ~10; removed most full pills.
- **`Stat` is now flat** (no grey fill box) — just label + value.
- Grey (`C.fill`) is used very sparingly now (mainly the active timeframe chip).

**Market tab — one connected white container**
- Single `Panel pad={0}` holding a 2-col grid: LEFT (`AccountCard` + `MarketWatch`,
  both now render BARE / no own card, nothing between them) | one `borderRight` grey
  line | RIGHT (`StockDetail`). No floating cards, no grey gutters.
- **Buy/Sell are now plain blue buttons** (no grey container). Clicking one opens an
  inline **order summary** (mode, amount, estimated cost/shares, Confirm, buying power)
  with an ✕ to close. New local `order` state in `StockDetail`.

**Shared `StockDetail.jsx` (NEW)** — the entire stock-detail view (header, price,
Buy/Sell + order summary, chart, timeframes, stats, "Your investment") extracted so it
can be reused. Optional `onBack` prop renders a ← button. Used by BOTH:
- Market tab right side (no `onBack`).
- Portfolio tab right side (with `onBack`).

**Portfolio tab**
- LEFT (one panel): Total Value + Performance on top, then the Holdings list below.
- RIGHT: **Allocation by default**; clicking a holding calls `openStock()` (sets global
  `active` + local `selected`) and swaps the right pane to `<StockDetail onBack=…/>` for
  that ticker — the same view as the Market tab. Back arrow returns to Allocation.
- App now passes the trade props (`tf/setTf`, `tradeMode`, `tradeAmt`, `trade`, `active`)
  into Portfolio so the embedded StockDetail can trade.

**Leaderboard tab**
- Connected into one `Panel pad={0}`: rankings list | grey divider line | trader detail.
  Flat stats, reduced curves (Follow / View-full-portfolio buttons radius 10).

**Tooling note:** the Claude Preview MCP in this env sometimes reloads page state between
eval/screenshot calls and `.click()` doesn't flush React synchronously in-eval — so
verify UI via screenshots, not by reading DOM after an eval click. Build is the real gate.

### Milestone 1 — fourth visual pass (type/weight + Portfolio connect) — DECISIONS
- **Lighter numbers everywhere** — dropped most `fontWeight: 800` → `700` (hero numbers,
  stats, values, list prices) because the bold Manrope figures read as too "punchy".
  Manrope font kept.
- **Market header rebalanced:** the ticker line (`NVDA · Stock`) is now larger (18px) and
  **blue** (`C.blue`); the company name (`NVIDIA Corporation`) is smaller/secondary (dim).
- **Buy/Sell buttons** → compact **blue pills** (width 148, radius 999, 16px/700 text),
  side by side, not full-width — Trading-212 style. (Both blue per earlier instruction.)
- **Portfolio is now ONE connected container** like Market: `Panel pad={0}` with a 2-col
  grid (`1fr 420px`), left has `borderRight` divider. No grey gaps. Same left/right ratio.
- **Allocation donut enlarged** (`Donut` got a `size` prop; Portfolio uses `size={184}`,
  donut centred above its legend). Clicking a holding still swaps to `StockDetail`.
- Leaderboard left for a later pass (owner's call).

### Milestone 1 — fifth visual pass (font + blue accents + Portfolio ratio) — DECISIONS
- **Font → Plus Jakarta Sans** (was Manrope). Closest FREE Google Font to Trading 212's
  geometric sans; their exact face is proprietary, so this is an approximation. If the
  owner still finds it off, candidates to try next: DM Sans, Mona Sans, Mulish.
- **`NVDA · Stock` ticker is BLACK again** (`C.ink`), not blue. Company name stays smaller/dim.
- **Chart price lines are now BLUE** (Trading 212 style). Added a `blue` prop to `BigChart`
  that forces `C.blue` for line+fill regardless of up/down. Applied to: StockDetail chart,
  AccountCard mini chart, Portfolio Performance chart. (Leaderboard chart still green/red —
  update when Leaderboard gets its pass.)
- **+/- figures stay red/green** (price change, Your investment return, holdings %,
  watchlist 24h%) — EXCEPT the **Account Value change** (Last 24h / All-time) which is now
  **blue** per owner request.
- **Portfolio now uses the SAME ratio as Market**: narrow LEFT (`360px`) + wide RIGHT
  (`1fr`). Left = overview + blue performance chart + a COMPACT holdings list (logo + ticker
  /name | value + total%, like the watchlist). Right = big Allocation donut (`size={220}`)
  by default; clicking a holding swaps to the wide `StockDetail` with "Your investment" at
  the bottom. (Holdings detail columns like avg/shares now live in StockDetail, not the list.)

### Milestone 1 — sixth visual pass (spacing, weight, blue shade) — DECISIONS
- **Lighter blue:** `C.blue` `#3B6FF5` → **`#2E90FA`** (lighter azure, closer to Trading 212).
  Subtle hardcoded `rgba(59,111,245,…)` row-tints left as-is (close enough); button glow
  shadows updated to the new blue rgb in StockDetail.
- **Numbers are weight 600** now (were 700) — same sizes, just less thick. Applied to hero
  numbers + value figures across StockDetail, AccountCard, Portfolio, MarketWatch, Stat.
  Section headings + button labels stay 700 for hierarchy.
- **StockDetail is roomier** (less compact, Trading 212 rhythm): 28px horizontal padding,
  extra space above the price, chart height **272** (was 220), bigger section gaps.
- **Portfolio allocation donut much bigger**: `size={300}` (was 220).

### Milestone 1 — seventh visual pass (buttons, blue, weight, holdings table) — DECISIONS
- **Blue lighter again:** `C.blue` `#2E90FA` → **`#46A0FF`**.
- **Buy/Sell buttons taller** (Trading 212 proportions): padding `10px`→`14px`, width 150→168,
  still pill (radius 999). `blueBtn` in StockDetail (also used by Confirm).
- **Numbers weight 600 → 500** (one more step lighter, same sizes) across StockDetail,
  AccountCard, Portfolio, MarketWatch, Stat. Headings/buttons still 700; +/- %s stay 600
  for legibility.
- **Portfolio right pane now shows a sorted Holdings TABLE under the Allocation** (default
  view): columns Symbol · Shares · Avg price · Price · Change% · Value, sorted by value desc
  (`holdings` array). Rows click through to StockDetail. The left compact holdings list is
  also sorted by value now.

### Milestone 1 — eighth visual pass (flat white + header) — DECISIONS
- **`Panel` is now flat white** — removed the grey border AND the shadow. Tabs are pure
  white surfaces; structure comes only from internal divider lines + the nav's bottom
  border. (`C.sh`/`C.line` still exist for dividers/other uses.)
- **Expanded width:** content + nav `maxWidth` 1320 → **1500**, top padding 24 → 20. Less
  framing, more breathing room — the "edges were shrinking everything" complaint.
- **StockDetail header now matches the Trading 212 reference:** small **grey** ticker line
  (`{TICKER} · Stock` + a small status dot) on top, big **black** company name (27px/600)
  below. (Previously the ticker was the big black element — now flipped per the reference.)

### Milestone 1 — ninth visual pass (header revert, change-below, width, weight) — DECISIONS
- **Header reverted (owner overrode the photo):** **NVDA · Stock is the BIG one again**
  (19px, black, 700, + status dot); **company name is small/grey** (13.5px, 500) beneath.
  (The previous pass had made the name big — owner wanted the opposite, as in earlier rounds.)
- **% change moved BELOW the price** (stacked), matching the reference photo — was inline
  to the right.
- **Left column widened to `560px`** (Market + Portfolio) so the divider lands ~at the end
  of the "Market" nav label. (Was 340/360 → 460 → 560.)
- **Numbers thinner again:** weight 500 → **400** across StockDetail, AccountCard, Portfolio,
  MarketWatch, Stat. +/- %s stay 600; tickers/headings/buttons stay 600–700. (400 is the
  lightest weight in the loaded Plus Jakarta Sans set — can't go thinner without adding 300.)

### Milestone 1 — tenth visual pass (asset heatmap + divider) — DECISIONS
- **NEW `AssetHeatmap.jsx`** — Trading-212-style asset-allocation heatmap added to the
  Portfolio LEFT column, below the holdings list (shows on scroll). Tiles tinted green/red
  by each holding's **daily** change (`chg24`), opacity scaled by magnitude; the largest
  holding gets a 2×2 tile, others 2×1 (4-col dense grid). Click a tile → opens that stock.
- **Divider width 560 → 570px** (Market + Portfolio). Measured via DOM rects at 1900px:
  "Market" label ends at x≈790; 570px left col puts the divider at x≈798 — i.e. just to the
  right of "Market", as requested. NOTE: this alignment is exact only around ~1900px wide
  (fixed-px left column vs a centred nav); it drifts a little at very different widths.

### Milestone 1 — eleventh visual pass (big batch) — DECISIONS
- **Nav is now ICONS** (chart=Market, pie=Portfolio, bars=Leaderboard), via `NAV_ICON` in
  App.jsx. Search bar longer + thinner (width 360, slimmer padding, placeholder "Search").
  Bell is a bare glyph (no box). **Avatar has no ring** now. Divider re-measured for the
  icon nav → left column **539px** (Market + Portfolio): market-icon ends ~x765, divider
  ~x767 (0.2 into the 8px icon gap) at 1900px.
- **Asset heatmap is now a real TREEMAP** (`AssetHeatmap.jsx`) — recursive binary-split
  layout, one rect divided proportionally by holding value, tiles tinted green/red by
  daily change, % shown. Replaces the old grid-span version.
- **NEW `AllocationDonut.jsx`** — monochrome blue/grey donut with external connector-line
  labels (reference style). Portfolio's Allocation now uses it + a **Shares / Industry /
  Country** toggle (`allocBy` state; groups via `META` industry/country). Old colourful
  `Donut` no longer used by Portfolio (still exists for any future use).
- **StockDetail:** added **1D** timeframe (uses `stock.intraday`, a separate mock series);
  Buy/Sell dropped down (26px gap above) for breathing room; **% change moved BELOW the
  price**; **NVDA ticker is big + black again, company name small/grey** (reverted per
  owner — opposite of the photo); numbers thinned to **weight 400**; added an **About**
  block at the bottom (description with See-all expand + CEO/HQ/Employees/Sector/Industry/
  Country) using `META`.

**⚠️ FREE-TIER FLAGS (mock now, will bite at M3 — flag, don't fake):**
- **1D intraday** — likely NOT free on Finnhub; grey it out at M3 if unavailable.
- **About block** — `country` + `industry` ARE free (profile2); but **description, CEO,
  HQ, employees, sector are NOT** free-tier. Either drop those rows at M3 or find a source.
- **Allocation by Industry/Country** — needs `industry`/`country` per holding; both come
  from Finnhub profile2 free tier, so these groupings are viable. "Sector" is not free.

### Milestone 1 — twelfth pass (donut labels) — DECISIONS
- `AllocationDonut` labels now **de-overlap** per side (`spread()` pushes them to a 30px
  min gap, clamped to the SVG box) and connector lines bend to the adjusted y. Long labels
  truncate at 14 chars. **>7 slices → smallest roll into "Other"** so it stays readable
  with many holdings. ≤5 holdings show all (as requested). **Milestone 1 is now complete.**
- **Asset heatmap upgraded to a SQUARIFIED treemap** (`AssetHeatmap.jsx`) — proportional,
  near-square tiles ("puzzle", not slivers) for any weights. Each tile centred on logo +
  ticker + daily %. **Graded colour scale** via `tint(chg)`: lerps light→strong red for
  falls and light→strong green for gains (|chg| capped at 2.5% = full intensity); text goes
  white on strong tiles. Rounded corners + white gaps. Computed in a 500×300 virtual box,
  rendered with % positions.

### Milestone 2 — kickoff (in progress) — DECISIONS
- Installed `@supabase/supabase-js`. Created `src/lib/supabase.js` (client + auth helpers)
  and a placeholder **`.env.local`** (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). `.gitignore`
  now also ignores `.env`/`.env.*`. **supabase.js is NOT imported by App yet** — the app
  still runs on mock data, so nothing is broken while the owner creates their project.
- **Waiting on the owner** to: create a Supabase project (London region), run the schema SQL
  (from `paper-exchange-build-plan.md`), and paste Project URL + anon key into `.env.local`.

### Milestone 2 — auth + data layer BUILT (awaiting real creds) — DECISIONS
- **`AuthScreen.jsx`** — sign in / sign up toggle (email + password, + username on sign up).
  Username is stored in auth user_metadata; the `profiles` row is created on first sign-in
  (`ensureProfile`), so it works whether email confirmation is ON or OFF. If signUp returns
  no session (confirmation ON), it shows "check your email" and flips to sign-in.
- **`App.jsx` rewired**: `supabase.auth.onAuthStateChange` + `getSession` drive a 3-phase
  gate — `loading` / `auth` (AuthScreen) / `app`. On session, it ensures the profile then
  loads `profiles.cash`, `positions`, `trades` into state. `cash`/`positions` now start
  EMPTY and come from the DB (new users start at P£10,000 cash, no holdings).
- **`trade()` is now async** and writes to Supabase: updates `profiles.cash`, upserts/deletes
  the `positions` row (onConflict user_id,ticker), inserts a `trades` row — then updates local
  state. Wrapped in try/catch → shows "Trade failed: …" on error.
- **Avatar dropdown** added (shows username + Sign out → `supabase.auth.signOut()`).
- **Resilience:** `supabase.js` exports `configured` (false if env still has placeholders);
  App shows a "Supabase not configured" screen instead of crashing. VERIFIED: config screen,
  login screen, and sign-up screen all render (tested with dummy keys; restored placeholders).
- **Prices stay MOCK** (MOCK_STOCKS) until M3 — only auth + persistence are real now.
- **Leaderboard still uses MOCK_USERS** ("You" row is real) — real leaderboard data is M4.
- ⚠️ Email confirmation: Supabase projects default to "Confirm email" ON. For a friends app,
  the owner may want to turn it OFF (Auth → Providers → Email) so sign-up logs in instantly.
- ✅ M2 VERIFIED by owner: signed in, bought, persisted. (Owner left email confirmation as-is.)
- Supabase project ref: **pyewyjetwcnqruunvzpz**. `.env.local` holds the real URL + anon key.

### Milestone 3 — kickoff (Edge Function written, awaiting deploy) — DECISIONS
- **`supabase/functions/quote/index.ts`** written: browser → this function → Finnhub, with
  `FINNHUB_KEY` as a server-side secret (never in browser). Returns live price + day stats
  (open/high/low/prevClose/change/%), name, logo, marketCap, industry, country, and P/E +
  history *attempts* that degrade gracefully. Caches price/name/logo 10 min in `price_cache`.
- **`src/lib/prices.js`** written: `fetchQuote(ticker, includeHistory)` + `fetchPrices(list)`,
  calls the Edge Function with the anon key (safe). No Finnhub key client-side.
- **Free-tier reality (confirmed plan):** `/quote` + `/profile2` are FREE. `/stock/candle`
  (chart history) and likely `/stock/metric` (P/E) are PREMIUM → function tolerates failure
  (history → [], pe → null).
- **OWNER DECISION on charts:** *real prices, mock chart (labelled "illustrative")*. So when
  wiring the frontend: use live data for headline price, day stats, trading, portfolio
  valuation, watchlist, treemap day-change; keep the chart SERIES on synthetic `genSeries`
  with a small "illustrative" label. Volume also not in free /quote → keep mock or hide.
- **Graceful fallback plan:** live-price layer should fall back to MOCK_STOCKS prices if the
  Edge Function isn't reachable, so the app keeps working pre-deploy and "upgrades" once live.
- **NEXT (after owner deploys):** wire the frontend to `prices.js` + verify live prices.
  Then later passes: M4 social, M5 logos, M6 deploy. (Leaderboard styling pass still pending.)

### Milestone 3 — frontend WIRED to live prices — DECISIONS
- **`src/lib/pricesContext.js`** (NEW): `PricesCtx` + `usePrices()` → `priceOf`, `chgOf`,
  `detailOf`, `isLive`. Falls back to MOCK_STOCKS so the UI never breaks if the function
  is unreachable or a ticker hasn't loaded.
- **App.jsx**: `live` state; bulk `fetchPrices(WATCH+held)` on entering the app + per-active
  `fetchQuote(active,false)`; valuation/allocation/trade all use live `priceOf`; `stock`
  passed down is `{...MOCK_STOCKS[active], ...live[active]}`; wrapped app in `PricesCtx.Provider`.
- **Components** now read live data via `usePrices`: MarketWatch (price+%), AssetHeatmap
  (value+day colour), Portfolio (holdings list/table + detailOf for StockDetail), AccountCard
  (day change). **StockDetail**: real headline price; real day change ("today") + Open/High/
  Low/Prev close + Mkt cap (`fmtCap`, millions→T/B) + P/E **when live present**, else falls
  back to synthetic; dropped Volume (not in free /quote) → added Prev close; chart stays
  synthetic with an **"Illustrative chart"** caption. `fetchPrices` now returns full objects.
- ✅ **FULLY VERIFIED via curl after owner redeployed** the enhanced function. AAPL returns
  price 291.13, change −4.50 (−1.52%), open/high/low/prevClose, marketCap 4,275,930M (→4.28T),
  **pe 34.88**, industry Technology, exchange NASDAQ. So live day stats/change/mktcap/PE all
  work. **P/E IS available on the free tier** (metric endpoint) — shows a real number.
- **10-min `price_cache`**: a cached ticker returns the minimal `{price,name,logo}` shape;
  view a fresh ticker (or wait 10 min) to see full fields. (Acceptable for a friends app.)
- M3 data layer DONE. Remaining: owner to eyeball in-app after sign-in. Then M4/M5/M6 +
  the still-pending Leaderboard styling pass.

### Milestone 3 — fix: live/chart consistency + heatmap text — DECISIONS
- **BUG (owner spotted):** active stock showed live price (184.13) but +28% change + mock
  OHLC/cap/PE. Cause: active fetch used `includeHistory=false` → hit the 10-min cache →
  minimal `{price,name,logo}` → isLive=false → change computed as live price − mock series.
- **FIX 1:** App active-detail effect now calls `fetchQuote(active, true)` — includeHistory
  bypasses the cache, so the viewed stock always gets full live change/OHLC/mktcap/PE.
  (Verified via curl: ORCL full = 184.13, +0.02% today, OHLC 179–185, cap 529B, pe 32.67.)
- **FIX 2:** `StockDetail` now **anchors the illustrative chart to the live price** — scales
  the mock series so its last point = current price (chart endpoint matches the headline).
- **Heatmap text:** company ticker on tiles is now smaller, **weight 400 (not bold), black**
  (`C.ink`) per owner. (% stays coloured.)
- Known minor: watchlist %/colour for *cached* tickers may fall back to mock `chg24` (price
  is live; bulk fetch uses cache). Acceptable; revisit if it bugs the owner.

### Milestone 3 — REAL charts via Yahoo + hover crosshair — DECISIONS
- Owner rejected the illustrative chart → wants REAL history. **Source = Yahoo Finance**
  public chart endpoint (no key, unofficial) — chosen over Twelve Data (key + 800/day limit)
  and Alpha Vantage (25/day, too low). Flagged: unofficial, small risk it changes.
- **Edge Function updated** (`supabase/functions/quote/index.ts`): request is now `{ticker, range}`.
  `range` = timeframe label → Yahoo `range`+`interval`: 1D→1d/15m, 1W→5d/60m, 1M→1mo/1d,
  3M→3mo/1d, 6M→6mo/1d, 1Y→1y/1d, MAX→max/1mo. Returns `history:[{t,c}]`. Quote/profile/metric
  still from Finnhub. Cache short-circuit only when no `range`. **OWNER MUST REDEPLOY.**
- **`prices.js`**: `fetchQuote(ticker, range)`; passing a range also bypasses cache.
- **App**: active-stock effect refetches on `active` OR `tf` change with `range=tf` → real
  history at the right resolution.
- **`BigChart` reworked**: accepts `points`([{t,c}]) + `resolution` (real mode) with a HOVER
  CROSSHAIR tooltip (price + time bucket: 15m/1h → "Mon 14:30", 1d → "14 Jun 2025", 1mo →
  "Jun 2025"); falls back to `series`+`count` synthetic mode (account/perf charts). Line
  thinner (1.8). "Illustrative" caption only shows while real history is missing/loading.
- **`StockDetail`**: uses real `stock.history` for the active timeframe; resolution via `RES`.
- Chart now ANY US ticker works (Yahoo+Finnhub handle arbitrary symbols) → sets up the
  "add more companies" feature (search any ticker) as the NEXT task (not done yet).
- Asset heatmap ticker text → smaller, weight 400, black (done).

### Milestone 3 — multi-currency display + circular heatmap logo — DECISIONS
- **AZN confusion explained**: "AZN" = US ADR on NYSE in USD ($178.75); London line is
  "AZN.L" = 13,462 GBp = £134.62. Different listings. Owner wants each stock shown in its
  NATIVE currency ($ US / £ UK / € EU).
- **Edge Function reworked (hybrid + currency)**: Finnhub quote primary (US); if it returns
  no price, falls back to **Yahoo** (`yahoo()` helper, meta+history) which reports CURRENCY
  and covers global listings. **GBp (pence) → GBP** (÷100) on price + history. Returns a
  `currency` field. profile2/metric still give logo/mcap/pe/industry (often null for non-US).
  **OWNER MUST REDEPLOY the function.**
- **Frontend native currency**: `format.js` adds `curSym`/`money(n,cur)`; `pricesContext`
  adds `curOf(t)`. Per-share PRICES now show native symbol (StockDetail headline + OHLC +
  avg cost; MarketWatch price; Portfolio holdings price/avg). **Aggregate ledger stays P£**
  (cash, total value, invested, position value, allocation) — i.e. the game money.
- **No FX (deliberate)**: P£ is fake money; a £-priced share simply costs that number of
  P£ (1:1, no currency conversion). Flagged to owner; real FX would need a rates source.
- **London/EU access**: search the suffixed ticker — AZN.L (London), MC.PA (Paris),
  SAP.DE (Frankfurt). Plain "AZN" stays the US ADR. Non-US logos/mcap/PE often blank.
- **Heatmap centre logo** is now circular (`Logo` got a `round` prop).

### Milestone 3 — search resolution + small currency symbol — DECISIONS
- **AZN clarified (not a bug)**: plain "AZN" = US ADR ($178.75); "AZN.L" = London (£134.62).
  Verified both return correctly. Dual-listed names default to the US line; use .L for London.
- **Search fallback added** (Edge Function `yahooSearch`): when a typed ticker isn't found
  via Finnhub or direct Yahoo, it does a Yahoo symbol SEARCH and retries with the top match
  → so "P911" resolves to P911.DE (Porsche, €49.10), names work too. **OWNER MUST REDEPLOY.**
  (Verified P911.DE = €49.10 already works; the search makes bare "P911" resolve to it.)
- **Currency symbol smaller**: StockDetail headline renders the symbol ($/£/€) at 0.5em,
  slightly raised, via `curSym` (Trading-212 style). Number stays full size.

### Milestone 3 — exchange label, logo fallback, autocomplete search — DECISIONS
- **Header shows the EXCHANGE** instead of "· Stock": `{TICKER} · NASDAQ/NYSE/LSE/XETRA…`.
  Edge Function returns a normalised `exchange` (`normExchange()` maps verbose Finnhub/Yahoo
  strings → short codes; prefers Yahoo's, which is global).
- **Logo fallback for suffixed tickers**: if profile2(sym) has no logo and sym has a "."
  (e.g. AZN.L), it fetches profile2(base) (AZN) for the logo → AZN.L now shows AstraZeneca's.
- **Price number thicker**: StockDetail headline weight 400 → 500 (symbol stays 0.5em).
- **AUTOCOMPLETE SEARCH (owner choice)**: Edge Function `{search:"query"}` → Yahoo search →
  `{results:[{symbol,name,exchange}]}`. `prices.js` `searchSymbols()`. App nav: debounced
  (220ms) dropdown under the search box (Logo + name + symbol · exchange), click to open;
  Enter opens the top match. Verified Yahoo search ("porsche" → P911.DE · XETRA top).
- **OWNER MUST REDEPLOY** the function (search branch + exchange + logo fallback).

### Milestone 3 — search MODAL (command palette) — DECISIONS
- Owner wanted search to open CENTERED (not an inline dropdown) and list all related stocks.
- **Nav search is now a trigger button** ("Search companies…") → opens a centered modal
  (`searchModal` state): backdrop + card at ~12vh, autofocus input, scrollable results list
  (Logo + clean name + `SYMBOL · EXCHANGE`). Click a row or Enter (top match) opens it; Esc /
  backdrop closes. Enter with no matches tries the typed text as a ticker.
- **Cleaner names**: function now uses Yahoo `longname` (→ "AstraZeneca PLC", not
  "ASTRAZENECA PLC ORD SHS $0.25") and returns up to 12 matches. **REDEPLOY for these two**;
  the modal UI itself is frontend-only (works on refresh).
- Old inline-dropdown + `searchOpen()` left in place but unused (harmless).

### Milestone 3 — Portfolio crash fix + search upgrades + logos — DECISIONS
- **CRITICAL FIX (Portfolio crashed)**: `chg24(t)` threw for tickers not in MOCK_STOCKS, so
  buying a non-US/searched stock (AZN.L, P911.DE) crashed the Portfolio tab (heatmap calls
  chg24). Guarded → returns 0 for unknown tickers. Also Portfolio holding NAMES now fall back
  to `detailOf(t).name` (live) so foreign holdings aren't blank. (Frontend — works on refresh.)
- **Search default**: modal now shows `TOP_STOCKS` (curated megacaps) when the box is empty
  ("biggest companies"); typing switches to live results. (Frontend.)
- **Search by name works** (Yahoo): "astrazeneca" → AZN (NYSE) + AZN.L (London) + Frankfurt/
  Munich/India. A bare TICKER search ("AZN") only returned the US line, so the function now
  ENRICHES: it re-searches the top match's company name and merges other listings → "AZN"
  now also surfaces AZN.L. (Function change — REDEPLOY.) NOTE: typed results use Yahoo's
  relevance order, not strict market-cap sort (can't get a free cap-sorted screener).
- **Logos**: search rows pass a best-effort Finnhub logo URL (`logoUrl`, base symbol) via the
  new `Logo` `src` prop; `Logo` still falls back to the coloured letter tile on error. Real
  logos can't be guaranteed for every foreign listing on free data — tile is the guaranteed
  fallback (never blank).
- Redeploy needed for: AZN-enrich + cleaner longnames + 12 results. Everything else = refresh.

### Milestone 3 — universal logos + Trading-212 search modal — DECISIONS
- **Logo coverage fixed**: Finnhub stores some logos under quirky URLs (AstraZeneca = `AZN.L.png`),
  so a guessed `AZN.png` 404'd → no logo in search. **`Logo` now falls back to FMP**
  (`financialmodelingprep.com/image-stock/{BASE}.png`, free, no key, verified AZN=200): order
  is live Finnhub logo → FMP → coloured tile. Applies everywhere (search, watchlist, holdings,
  heatmap, detail). Some foreign-only listings may still 404 → tile (guaranteed, never blank).
- **Search modal now Trading-212-style**: rows show Logo + name + `SYMBOL · EXCHANGE` +
  **live price + % change** (fetched via `ensurePrices` for the shown/typed symbols, missing-only
  to limit calls). Default (empty) = `TOP_STOCKS` "biggest companies" with prices on open.
  **No Buy/Sell in results** (per owner) — clicking a row just opens the stock detail.
- All frontend → works on refresh. (AZN→both-listings still needs the earlier redeploy.)

### Milestone 3 — portrait heatmap tiles + recently-viewed + redeploy reminder — DECISIONS
- **Heatmap tiles now PORTRAIT**: `AssetHeatmap` virtual box widened to `VW=720, VH=350`
  while the rendered container stays ~460px wide → squarified tiles get squished
  horizontally → taller rectangles (per owner's reference). Container size is fixed
  regardless of holding count.
- **Recently viewed**: `recents` state (localStorage `pe_recents`, max 8, most-recent first),
  recorded via an effect on `active`. Search modal shows a horizontal card strip
  (logo + ticker + %) above "Biggest companies" when the box is empty.
- **⚠️ AZN→all-listings NOT live**: verified the DEPLOYED function still returns only AZN for
  `{search:"AZN"}` — the enrich code (look()+topName re-search, in index.ts lines ~85-96) is
  written but **NOT deployed**. Owner redeployed an earlier version (currency/exchange/logo
  work) but not the latest. **OWNER MUST REDEPLOY `quote`** to get: AZN→US+London, cleaner
  longnames, 12 results.

### Milestone 3 — currency-by-suffix + longer/thinner heatmap — DECISIONS
- ✅ AZN-enrich redeploy CONFIRMED (search shows all AstraZeneca listings).
- **Currency display fix**: cached foreign tickers returned `currency:"USD"` (cache has no
  currency col) → AZN.L showed `$`. Added `currencyOf(symbol, dataCur)` in format.js: a
  SUFFIX→currency map (.L→GBP, .DE/.PA/…→EUR, .ST→SEK, .TO→CAD, .HK→HKD, .T→JPY, etc.) that
  overrides the data currency. Used by `curOf` (pricesContext), StockDetail `cur`, and the
  App search rows. Frontend-only — no schema/redeploy. (Obscure suffixes like .XC fall back
  to the data currency, correct when fresh.)
- **Heatmap longer + thinner**: `VW 720→920, VH 350→430` → more portrait tiles, taller block.
- **Ratio**: Market + Portfolio left column 500→470 (more room on the right).

### Milestone 3 — chart polish + logos + search-any-ticker — DECISIONS
- **Reverted horizontal-scroll chart** (ScrollChart) → back to fit-to-width. Real-data
  chart is now `PointsChart`: fit-to-width + **WHEEL-ZOOM** (scroll over the graph zooms
  in/out around the cursor; native non-passive listener so the page doesn't scroll). Pan
  not added yet (zoom centres on cursor) — can add drag-pan later if wanted.
- **Fixed the "blue blob"**: it was the SVG crosshair circle distorted by the tiny
  `viewBox=denom` under preserveAspectRatio=none. Crosshair dot + end dot are now **HTML
  overlays** (perfect circles), tooltip/avg-label also HTML.
- **Avg-cost dashed line**: BigChart takes `avgCost`; draws a dashed line + "Avg P£x"
  label ONLY when avg is within the visible price range (per owner's spec).
- **Heatmap colours → opacity-based** (`tint`): ~0.4% ≈ very see-through, ~10% ≈ opaque.
  Ticker text black, % coloured green/red.
- **Finer chart resolution** (Edge Function `YF`): 1D→5m, 1W→30m, 1M→60m, 3M/6M/1Y→1d,
  MAX→1wk(all history). **OWNER MUST REDEPLOY the function** for the finer intervals.
- **Search any US ticker**: `searchOpen` now fetches the typed ticker live; if valid it
  opens in Market (works for tickers beyond the 10 mock ones). Errors show a toast.
  **BUGFIX:** searched tickers crashed `StockDetail` (it read mock `stock.series`/`intraday`
  which don't exist for non-mock tickers). Guarded `rawSeries` → `[]` fallback. Search by
  TICKER SYMBOL (KO, NFLX, JPM) — name→symbol lookup (Finnhub /search) is a future add.
- **Real company logos**: `Logo` uses the live `logo` URL (Finnhub) via `usePrices`, with
  the coloured letter tile as fallback (onError).
- **Toast**: now a FIXED overlay (top-centre) that survives scrolling + auto-dismisses
  after 5s (solid green/red).
- **Ratio/size tweaks**: Market + Portfolio left column 539→500px (more room on the right);
  Market Watch rows slightly bigger (logo 32, fonts up, more padding).
- **24/5 → extended hours**: owner wanted "24/5 trading" charts. True overnight isn't free;
  added `&includePrePost=true` to the Yahoo fetch → pre-market + after-hours (~4am–8pm ET).
  Verified: NVDA 1D 5m goes 79→193 points. Frontend needs no change. **REDEPLOY covers both
  this AND the finer-interval change (one redeploy).**

---

## Local dev (machine notes)

- Node lives at `/usr/local/bin/node` (v24) but isn't on the default shell PATH here.
  If `node`/`npm` aren't found, prefix with `export PATH="/usr/local/bin:$PATH"`.
- Run the app: `npm install` (once), then `npm run dev` → http://localhost:5173/
- Production sanity check: `npm run build`

### Milestone 4 — game lobby + per-game leaderboard (BUILT, awaiting setup)
- **Username auth** (no email up front): signUpUser/signInUser map username → hidden synthetic
  email `username@players.paperexchange.app`. Real email attachable later. **REQUIRES "Confirm
  email" OFF** in Supabase (synthetic emails can't confirm).
- **Lobby** (AuthScreen): home → Start a game / Join a game / Sign in. Chosen action stashed in
  sessionStorage `pe_pending`; App finishes it after the account exists (no race).
- **Games**: `games` table (code, name, created_by) + `profiles.game_id`. createGame (retries on
  code collision) / findGame in supabase.js. App init: ensureProfile → run pending → load game.
- **Per-game leaderboard**: loadBoard() queries profiles(+positions) where game_id = mine, values
  each with live prices (fallback avg_cost), ranks. Leaderboard.jsx renders real board + blue
  chart + YOU badge; loads when the tab opens. Game code shown in avatar menu (click to copy).
- **OWNER SETUP**: (1) turn OFF email confirmation; (2) run the games SQL. Old M2 email accounts
  won't log in via username — make fresh ones via Start a game.
- ⚠️ The games SQL was previously only described, never saved. Now written to
  **`supabase/games.sql`** (session 3f): creates `games` + adds `profiles.game_id` + RLS
  (read-all so you can join by code; insert where created_by = you). Idempotent / safe to re-run.

### Milestone 4 — session 2: chart/about fixes + OPEN requests + DREAM DESIGN
DONE this session (frontend, refresh):
- **Crosshair correlation FIXED**: PointsChart onMove now maps the cursor to the DATA area
  (px…W-padR), not the whole container, so the dot/tooltip sit under the mouse.
- **Zoom sensitivity reduced**: wheel factor 0.8/1.25 → 0.9/1.111.
- **Timeframe-aware % change**: StockDetail headline change now = (history start → now) for the
  selected tf, labelled via TF_LABEL ("today"/"last week"/"last month"/…). Falls back to live
  day change, then synthetic.
- **About for ANY company**: StockDetail About now uses live `industry`/`country`/`exchange`
  (+ a generated one-line description) when META is absent; the 10 mock tickers still get the
  rich META (CEO/HQ/employees/sector/full description). Renders only if there's data.
- Email auth restored: lobby collects REAL email + password + username (signUp/signIn in
  supabase.js). "Confirm email" still recommended OFF for instant game create/join.

⚠️ STILL OPEN (do next chat — context ran out here, ~93%):
- **Asset-allocation treemap → match Trading 212 EXACTLY** (owner sent photos): rounded
  rectangles, varied sizes, bigger centred logo + ticker + % below. Current = squarified
  portrait (`AssetHeatmap.jsx`, VW=920/VH=430) — owner wants the T212 look, not this.
- **Independent column scroll**: on Market + Portfolio, scrolling the LEFT column must NOT move
  the RIGHT (they should scroll separately, like T212). Today the whole page scrolls together.
  Needs: content area = fixed viewport height, each grid column its own `overflow-y:auto`.
- **Pie chart hover-enlarge**: hovering a slice (e.g. ORCL) in `AllocationDonut` should grow it
  slightly (add hover state + scale transform on the path).
- **ETFs in search**: Yahoo search filter already includes `quoteType==="ETF"` — confirm ETFs
  show; owner wants them searchable.
- **VanEck SMGB (SMGB.L) has no logo**: not on Finnhub/FMP → falls back to tile. Known free-data
  gap; could special-case a logo URL or accept the tile.

### Milestone 4 — session 3: open frontend requests (DONE this session)
All build-clean (`npm run build` ✓). Visual verify pending (app gates on login):
- **Independent column scroll ✅**: Market + Portfolio grids now have a FIXED height
  (`calc(100vh - 124px)`) and each grid column is `overflowY:auto; minHeight:0` (removed
  the old `alignItems:start` so rows stretch to the grid height). Left (watchlist/holdings/
  heatmap) and right (StockDetail/allocation) now scroll separately like T212. In Market,
  StockDetail got wrapped in a scrolling `<div>`; Portfolio's right `<div>` got the scroll
  styles. NOTE: the `124px` = 64 nav + 40 content padding + 20 buffer; tuned for the sticky
  nav — revisit if nav height changes.
- **Pie hover-enlarge ✅**: `AllocationDonut` slices pop OUT radially on hover. Added
  `useState hover`, stored each slice's mid-angle unit vector (`mx,my`), and on hover apply
  `transform: translate(mx*9, my*9)` with `transition: transform .13s`. (Radial pop, not
  scale — closer to T212.)
- **Treemap polish ✅** (`AssetHeatmap.jsx`): tiles now size their logo + ticker + % to the
  tile's approx rendered px (`rw/rh` from the virtual box → `m=min`), so big holdings get a
  big centred logo (22–46px) + larger ticker/%, small ones degrade to ticker+% or just %.
  Rounded corners 10→12, `lift` hover class added. Kept squarified layout + opacity `tint`.
  ⚠️ This is a refinement, NOT a pixel-match to the T212 photos (owner's photos not in this
  session) — if owner still wants exact T212, needs the reference images.
- **ETFs in search ✅ (no change needed)**: Edge Function search already filters
  `quoteType==="EQUITY" || "ETF"` (index.ts lines 74, 87) — ETFs already surface.
- **SMGB.L logo**: still a known free-data gap (no Finnhub/FMP logo) → coloured tile. Not fixed.

### Milestone 4 — session 3b: refinements off a T212 screenshot (DONE, build ✓)
Owner sent a Trading 212 asset-allocation screenshot + 3 asks:
- **Hide the scrollbar grey line ✅**: added `.colscroll` to GlobalStyles
  (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) and applied it to the
  independent-scroll columns in Market + Portfolio. Columns still scroll; no grey track.
- **Treemap less blocky/chunky → match T212 ✅**: the chunkiness was from forcing a WIDE
  virtual box (920×430) that squished tiles into tall slivers. Now the virtual box is
  PORTRAIT and aspect-matched to the rendered container (`VW=430, VH=620`), so squarified
  tiles render at TRUE proportions = natural varied rectangles like the photo. Colours
  softened to pastels (`tint`: alpha 0.10→0.44, was 0.05→0.95). White gap 3→4px, radius
  12→14. (`AssetHeatmap.jsx`.)
- **Desensitise zoom again ✅**: BigChart wheel factor 0.9/1.111 → **0.94/1.064**; added a
  guard so rounding never stalls the zoom at deep levels.

### Milestone 4 — session 3c: zoom-on-MAX, logo fix, uniform heatmap tiles (DONE, build ✓)
- **Zoom only on MAX ✅**: wheel-zoom is now gated by a `zoomable` prop on BigChart, set
  `tf === "MAX"` in StockDetail. Other timeframes don't zoom (wheel listener not attached).
- **SMGB.L logo FIXED ✅ (supersedes the old "known gap")**: root cause = `Logo` stripped the
  suffix and asked FMP for `SMGB.png` (404), but FMP actually stores the logo under the FULL
  suffixed symbol `SMGB.L.png` (verified 200; same for AZN.L, P911.DE, VUAG.L, PSON.L). `Logo`
  is now a proper fallback CASCADE that advances on each <img> error: owner `src` → live
  Finnhub logo → **FMP full ticker** → FMP base symbol → coloured tile. So suffixed listings
  get real logos now; tile remains the guaranteed last resort.
- **Heatmap tiles uniform ✅**: logo/ticker/% are now a FIXED small size on EVERY tile
  (logo 20, ticker 11px, % 10.5px) instead of scaling per tile. The three only render when the
  tile is big enough to contain them (logo dropped first at rh<58/rw<36, then ticker at
  rh<32/rw<30) so nothing overflows the rectangle.

### Milestone 4 — session 3d: headline tracks chart hover (DONE, build ✓)
- **Hover the chart → headline price/change update (T212 style) ✅**: `BigChart`/`PointsChart`
  gained an `onHover` callback firing `{ value, label }` on mouse-move (label = the formatted
  time bucket) and `null` on leave. `StockDetail` holds `hover` state, passes `onHover={setHover}`,
  and when hovering shows the hovered point's price as the big headline + change computed vs the
  timeframe's start baseline (`hist[0].c`, else prevClose, else synthetic start); reverts to the
  live price on leave. Hover is cleared on ticker/timeframe switch. Only active in REAL-history
  mode (PointsChart); the synthetic fallback chart has no hover (rare/loading path).

### Milestone 4 — session 3e: trade clamping + Sell all + perf timeframes (DONE, build ✓)
- **Amount clamps to max + Max/Sell-all button ✅** (`StockDetail.jsx`): the order-summary
  input now CLAMPS as you type — buy locks to your cash (or cash/price in shares mode), sell
  locks to your whole position (value, or share count). Added a button next to the input:
  **"Max"** on buy (fills the affordable max in the current mode), **"Sell all"** on sell
  (switches to shares mode + sets exact `pos.shares` so no rounding dust is left). Floors the
  locked value so it never exceeds the real max (passes trade()'s cash/holding checks).
- **Portfolio + Account performance timeframes ✅**: new `PERF_TFS` + `perfSeries(end,tf)` in
  mockData.js (timeframes 1D/1W/1M/1Y/MAX). Portfolio's Performance graph + the Market tab's
  AccountCard both got a timeframe toggle (D/W/M/Y/All) under the chart and a change readout
  that **RELABELS** with the selection ("Last 24h" → "Last week/month/year" → "All time").
  AccountCard's old fixed "LAST 24H"+"ALL-TIME" dual stat is now ONE dynamic stat driven by
  the toggle.
  ⚠️ Day change & All-time change are REAL; W/M/Y were illustrative HERE — **now made REAL in
  session 3f below** (snapshots). The synthetic `perfSeries` was removed.

### Milestone 4 — session 3f: REAL portfolio-value history (snapshots) (DONE, build ✓)
Owner wants performance tracked for real — each player's account value recorded over time,
graph shows real balance history (starts empty for new accounts, fills in).
- **DB table `portfolio_snapshots`**: (user_id, day, value, created_at), PK (user_id, day),
  RLS own-only. SQL saved to **`supabase/portfolio_snapshots.sql`**. ⚠️ **OWNER MUST RUN IT**
  (Supabase → SQL Editor) before the graph shows real data.
- **`supabase.js`**: `recordSnapshot(userId, value)` (upsert today, onConflict user_id,day) +
  `loadSnapshots(userId)` (ascending).
- **App.jsx**: `history` state. On entering the app, the bulk-price effect records today's value
  (with fresh prices) then loads history. `trade()` re-records today's snapshot with the
  post-trade value + updates `history` locally. `history` passed to Market→AccountCard + Portfolio.
- **`lib/perf.js` (NEW)**: `PERF_TFS` (keys+labels) + `buildPerf(history, totalValue, dayChange,
  totalPL, tf)` → real series + change. 1D = live day change; MAX = totalPL (vs START_CASH);
  W/M/Y = windowed snapshots (base = first in window, else flat/0 until history accrues).
  Removed the synthetic `perfSeries`/`PERF_TFS` from mockData.js.
- **AccountCard + Portfolio** now drive their perf chart + relabeling change line from `buildPerf`.
  New accounts: 1D & All-time real immediately; W/M/Y are flat (0) until daily snapshots build up.
  One snapshot/day per user (latest value on load + after trades) — fine for a friends game.

### Milestone 5 — MULTI-GAME + configurable economics (BUILT, awaiting SQL) (build ✓)
Owner: one account should run MANY games (own party + friends'), usernames reusable across
games, and the game creator picks starting cash + a recurring deposit (amount + cadence).
Owner decisions: **fresh start (wipe old data)**, cadences = daily/2d/twice-a-week/weekly/monthly,
deposits via a **scheduled server job** (pg_cron).
- **NEW DATA MODEL** (`supabase/schema_v2.sql` — ⚠️ OWNER MUST RUN; it DROPS old tables):
  one account → many `memberships` (one row per user per game). Cash, holdings, trades,
  username, snapshots ALL scoped to `membership_id`. `games` gained `start_cash`,
  `deposit_amount`, `deposit_cadence`. memberships have `cash`, `deposited` (net capital in),
  `next_deposit_at`. Username unique WITHIN a game only (reusable across games). RLS uses
  SECURITY DEFINER helpers (`my_game_ids`/`my_membership_ids`/`game_member_ids`) to avoid
  self-recursion; read rivals in your games, write only your own.
- **DEPOSITS CRON** (`supabase/deposits_cron.sql` — ⚠️ OWNER MUST RUN; needs pg_cron):
  `apply_due_deposits()` adds the deposit to `cash` AND `deposited` and advances
  `next_deposit_at` per cadence (catches up missed periods); scheduled every 30 min.
- **supabase.js** rewritten: email-only account auth; `loadMemberships`, `createGame(config)`,
  `joinGame(code,username)`, `loadGameData(membershipId)`, `recordSnapshot(membershipId)`,
  `loadBoardRows(gameId)`, `nextDepositAt(cadence)`.
- **App.jsx** rewritten: phases loading|auth|**games**|app. `memberships`+`currentMid`+`invested`
  state; `enterGame(m)` loads that game's data; last game remembered in localStorage
  (`pe_current_game`). trade()/snapshots/leaderboard all keyed by `membership_id`. Returns use
  `deposited` (not the old flat START_CASH). Avatar menu has **Switch / new game**.
- **AuthScreen.jsx** = account auth ONLY (email+password + default display name).
- **GamePicker.jsx** (NEW, post-login): your games list · Create (name, starting cash, optional
  recurring deposit amount+cadence, your username) · Join (code + username).
- **perf.js** `buildPerf` now takes `invested` (per-membership) as the all-time baseline.
  Portfolio/AccountCard/Market pass `invested`; Leaderboard `meId` is now the membership id.
- ⚠️ **OWNER SETUP for M5**: run `supabase/schema_v2.sql` (wipes old test data — chosen), then
  `supabase/deposits_cron.sql`. Email confirmation already OFF. Old accounts/data are gone;
  sign up fresh. (The earlier `games.sql`/`portfolio_snapshots.sql` are superseded by schema_v2.)

### Milestone 5 — fix: membership RLS via server-side RPC (build ✓)
- **BUG**: creating a game failed with "new row violates RLS for table memberships" even
  though the `mem_insert` policy was provably correct (`user_id = auth.uid()`) and the `games`
  insert (identical `auth.uid() = created_by` pattern) succeeded in the same call. Two separate
  browser inserts didn't reliably share auth context for the second one.
- **FIX**: moved create/join into SECURITY DEFINER Postgres functions
  (`supabase/game_rpc.sql`: `create_game(...)`, `join_game(...)`, `_next_deposit(...)`) that do
  both inserts server-side in one authenticated call, setting user_id/created_by from auth.uid()
  directly. `supabase.js` `createGame`/`joinGame` now call `supabase.rpc(...)` instead of two
  table inserts. ⚠️ **OWNER MUST RUN `supabase/game_rpc.sql`.**
- (Trades/positions/snapshots still use direct inserts under their RLS, which work because the
  user's membership row now exists; revisit if they show the same symptom.)

### Milestone 5 — session 2: social + market lists + profile (build ✓)
- **Join on first login ✅** (`GamePicker.jsx`): home view is now the default ALWAYS and shows
  Start + Join buttons even with 0 games (was forcing the Create form with no way to reach Join).
- **Leaderboard click-through to portfolios ✅**: `loadBoard` now attaches each player's
  `holdings` (+ cash) to the board rows; `Leaderboard.jsx` selected-player panel renders their
  real holdings (logo/ticker/name/value/shares@avg, live-priced via usePrices) + cash. Read-only.
- **Edit profile / change username ✅** (shared across games): `supabase.js updateUsername(userId,
  name)` updates EVERY membership's username + auth metadata; avatar menu → "Edit profile" opens a
  modal (name input + avatar preview). Avatar stays the initial+colour tile. **Photo upload
  deliberately deferred** (owner's call — would need a Storage bucket; modal says "coming soon").
- **REAL market lists ✅ (needs redeploy)**: Top Gainers / Losers / Most Active now come from
  Yahoo predefined screeners (`day_gainers`/`day_losers`/`most_actives`) via a new `{lists:true}`
  branch in the Edge Function → `fetchLists()` in prices.js → App fetches on entry, passes `lists`
  to Market → MarketWatch. "Trending" stays the curated watchlist (live prices + sparkline).
  Non-trending tabs render real rows (symbol/name/price/%); **fall back to the old sample lists if
  the screener is unavailable** (Yahoo screener is unofficial/free, may need watching). ⚠️ **OWNER
  MUST REDEPLOY the `quote` Edge Function** for real lists (frontend already falls back gracefully).
- **Finnhub stays** (owner asked): free, server-side (key safe), gives P/E + mkt cap + industry
  that Yahoo doesn't. No change.

### Milestone 5 — session 3: perf accuracy + hover + tab-reset + leaderboard (build ✓)
- **Day-change now real**: AccountCard + Portfolio only count a holding's day move when a REAL
  `prevClose` is present (no more mock fallback that produced a fake +1.54%). App also fetches
  FULL quotes for HELD tickers (`fetchQuote(t,"1D")`, bypasses the 10-min cache) so prevClose is
  available → accurate day change + perf line.
- **Performance charts are now hoverable real lines**: `buildPerf` returns `points:[{t,c}]`
  (timestamps from snapshot days; 1D = start-of-day→now; MAX prepends the invested baseline).
  AccountCard + Portfolio render `<BigChart points=… resolution="1d" blue>` → built-in crosshair
  tooltip shows value + date on mouse-over. (W/M/Y fill in as daily snapshots accrue.)
- **Tab no longer resets to Market on refocus**: added `loadedUid` ref — the session effect skips
  the full reload when the user id is unchanged (token refresh / tab refocus), and the auth
  listener already ignores TOKEN_REFRESHED/USER_UPDATED.
- **Leaderboard demo line removed**: dropped the synthetic `genSeries` performance chart for the
  selected player (it was fake/misleading; other players' real history isn't readable yet —
  snapshots are own-only RLS). Kept the REAL holdings list + stats. (To show rivals' real history
  later: widen `snap_read` to game-scoped + fetch their snapshots.)
- Real market lists confirmed working after the owner redeployed the `quote` function.

### Milestone 5 — session 4: polish batch (build ✓)
- **Footer removed**: dropped the "Live prices via Finnhub · …" caption line in App.jsx.
- **Pie "Other" only for <4% ✅** (`AllocationDonut.jsx`): replaced the top-7 cap with — keep every
  slice ≥4%, roll only the <4% ones into "Other" (a lone small slice keeps its own name).
- **Rolls-Royce logo fix (SERVER) ✅**: the Edge Function was borrowing the BASE symbol's logo for
  suffixed tickers (`RR.L` → `RR` = Richtech, wrong company). Removed that base-symbol logo
  fallback in `index.ts`; frontend already tries FMP by full ticker, else tile. ⚠️ **REDEPLOY.**
- **Richer About ✅ (needs redeploy)**: Edge Function now also returns `weburl`, `ipo`,
  `shareOutstanding`, `week52High`, `week52Low` (all free tier); StockDetail About shows IPO date,
  shares out, 52-wk high/low, and a clickable website link, for ANY company. ⚠️ **REDEPLOY.**
- **Live auto-refresh ✅**: App re-pulls prices every 60s while in the app (watchlist + held full +
  active) so value/day-change/charts tick without a manual refresh. Watchlist is server-cached so
  it stays under Finnhub's 60/min.
- **Real per-player leaderboard performance ✅ (needs SQL)**: `loadBoardRows` now returns each
  player's `deposited`; Leaderboard fetches the selected player's snapshots (`loadSnapshots`) and
  renders a real `buildPerf` points chart (all-time). Needs `snap_read` widened to game-scoped:
  `using (membership_id in (select game_member_ids()))` — see `supabase/leaderboard_history.sql`.
  ⚠️ **OWNER MUST RUN that SQL** (else rivals' charts are just the invested→now baseline).
- ⏳ **Photo upload still DEFERRED** (needs a Storage bucket; avatar stays initial+colour tile).

### Milestone 5 — session 5: About card + See-all takeover + search/logo (build ✓)
- **About = bordered card** (T212 style) in StockDetail; description clamped to 3 lines, first 6
  fields shown. **"See all"** opens a full-screen takeover overlay (logo + ticker + name header,
  full description, ALL fields) — `aboutFull` state, resets on ticker/tf switch.
- **Richer About confirmed live** (US): PLTR shows IPO/shares/52-wk/website. Foreign (RR.L) stays
  sparse — Finnhub free has no London data (expected; not a bug).
- **Search single-letter fix**: searching now needs ≥2 chars (a lone letter gave noisy Yahoo
  results like "R"→Ryder). 1 char shows "Biggest companies". Verified function: "rolls"→Rolls-Royce,
  "tesla"→Tesla all work — search was never broken, just single-letter was noisy.
- **RR.L logo override** (Clearbit rolls-royce.com) confirmed working in holdings list.

🎯 OWNER'S DREAM DESIGN (future direction — build for friends, maybe public later):
- **Landing page**: two options — **Join a game** or **Create a game**; **Sign in** button top-right.
- **Join**: enter username + password (or create username + password) → land in the portfolio
  (the 3-tab app we built).
- **Create a game**: choose **initial payment** (starting balance, instead of fixed P£10,000)
  AND an **increment / recurring deposit** — amount + frequency (e.g. "£150 a day" drip-fed in).
  Then the same 3 tabs. → This means games need configurable `start_cash` + a recurring-deposit
  schedule (amount, cadence) applied over time. New feature; not built yet.
