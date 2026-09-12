# Truck Search Dashboard — Implementation Plan (v2)

**Goal:** Build a Next.js dashboard that aggregates used Toyota Tacoma and 4Runner listings from multiple sources, scores deals, and helps track/favorite/annotate results.

**Target:** Toyota Tacoma + 4Runner, under $15,000, near Huntington Beach, CA.

---

## Requirements Summary

1. **Automated scraping** from 3 sources on a configurable schedule (default: every 30 min):
   - Car Deals Search MCP (Cars.com, Autotrader, KBB)
   - Facebook Marketplace (optional, disposable account)
   - Price history tracking over time
2. **SQLite database** storing all listings, deduped by VIN (or source+external_id for FB), with price history
3. **Next.js dashboard** with:
   - New listings since last visit (badge count)
   - Filter by source, price, mileage, year, deal score
   - Favorite/unfavorite listings (independent of new/seen status)
   - Add call history and notes to any listing
   - View modes: All, New, Favorites, Dismissed
   - Deal score visualization and price trend charts
4. **Deal scoring engine** ranking listings by value, history, and risk factors

---

## Acceptance Criteria

- [ ] AC1: `npm run dev` starts both Next.js (port 3000) and cron worker with no errors
- [ ] AC2: Cron worker runs on schedule and inserts new listings into SQLite, deduped by VIN or source+external_id
- [ ] AC3: Dashboard shows listing count badge for "new since last viewed" (count of listings where `view_status='new'`)
- [ ] AC4: User can filter listings by: source, price range (dynamic from config), mileage, year range, deal score (0-10)
- [ ] AC5: User can favorite a listing without changing its new/seen status; favorites persist across sessions
- [ ] AC6: User can add timestamped notes and call history to any listing
- [ ] AC7: User can dismiss a listing (hides from default view, recoverable via "show dismissed" toggle)
- [ ] AC8: Deal score is computed per listing and displayed as a colored badge (green >=7, yellow 4-6.9, red <4)
- [ ] AC9: Price history chart (Recharts) shows price over time for listings seen multiple times
- [ ] AC10: Manual "Scan Now" button triggers an immediate scrape; returns 409 if a scan is already running
- [ ] AC11: Settings page allows editing search criteria and triggers deal score recomputation on save
- [ ] AC12: FB Marketplace scraper is toggleable, default OFF, with ToS warning text in settings

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | Full-stack, API routes + frontend in one project |
| Database | SQLite via `better-sqlite3` | Zero infra, single file, fast for local use |
| ORM | Drizzle ORM | Lightweight, type-safe, great SQLite support |
| UI | Tailwind CSS + shadcn/ui | Fast to build, polished components |
| Charts | Recharts (client-only, `'use client'` components) | Lightweight, React-native, good for price trends |
| Scraping | `@modelcontextprotocol/sdk` (MCP client) | Calls Car Deals Search MCP via stdio transport |
| FB Scraper | Node.js child_process calling Python script | Isolates the risky FB scraper |
| Scheduling | Standalone `node-cron` worker via `concurrently` | Separate process avoids Next.js hot-reload issues |
| State | React Query (TanStack Query) | Server state caching, refetching, optimistic updates |

**Next.js config requirement:** `next.config.ts` must include `serverExternalPackages: ['better-sqlite3']` — native C++ module cannot be bundled by webpack. Database connection must use `globalThis` singleton to survive dev hot-reloads.

---

## Database Schema (Drizzle + SQLite)

**Convention:** All prices stored in cents. Frontend converts to dollars for display. All timestamps are ISO 8601 strings.

### `listings` table
```
id              INTEGER PRIMARY KEY AUTOINCREMENT
vin             TEXT                 -- dedup key (nullable for FB listings without VIN)
external_id     TEXT                 -- source-specific ID (listing URL or source ID)
source          TEXT NOT NULL        -- 'cars.com' | 'autotrader' | 'kbb' | 'facebook'
url             TEXT
image_url       TEXT
year            INTEGER
make            TEXT                 -- 'Toyota'
model           TEXT                 -- 'Tacoma' | '4Runner'
trim            TEXT
price           INTEGER              -- current price in cents
mileage         INTEGER
location        TEXT                 -- city/state or zip
dealer_name     TEXT
dealer_type     TEXT                 -- 'dealer' | 'private'
one_owner       BOOLEAN DEFAULT false
no_accidents    BOOLEAN DEFAULT false
personal_use    BOOLEAN DEFAULT false
deal_rating     TEXT                 -- from source: 'Great', 'Good', 'Fair', etc.
deal_score      REAL                 -- our computed score (0-10)
view_status     TEXT DEFAULT 'new'   -- 'new' | 'seen' (independent of user actions)
is_favorited    BOOLEAN DEFAULT false
is_dismissed    BOOLEAN DEFAULT false
favorited_at    TEXT                 -- ISO timestamp, set when is_favorited=true
first_seen_at   TEXT NOT NULL        -- ISO timestamp (also serves as created_at)
last_seen_at    TEXT NOT NULL
```

### `price_history` table
```
id              INTEGER PRIMARY KEY AUTOINCREMENT
listing_id      INTEGER REFERENCES listings(id)
price           INTEGER              -- price in cents
observed_at     TEXT NOT NULL         -- ISO timestamp
```

### `notes` table
```
id              INTEGER PRIMARY KEY AUTOINCREMENT
listing_id      INTEGER REFERENCES listings(id)
type            TEXT DEFAULT 'note'  -- 'note' | 'call' | 'system'
content         TEXT NOT NULL
created_at      TEXT DEFAULT CURRENT_TIMESTAMP
```

### `scrape_runs` table
```
id              INTEGER PRIMARY KEY AUTOINCREMENT
source          TEXT NOT NULL
status          TEXT DEFAULT 'running' -- 'running' | 'completed' | 'failed'
new_count       INTEGER DEFAULT 0
updated_count   INTEGER DEFAULT 0
error           TEXT
started_at      TEXT NOT NULL
completed_at    TEXT
```

### `search_config` table
```
id              INTEGER PRIMARY KEY DEFAULT 1
zip             TEXT DEFAULT '92648'  -- Huntington Beach
radius_miles    INTEGER DEFAULT 150
price_max       INTEGER DEFAULT 1500000 -- $15,000 in cents
mileage_max     INTEGER DEFAULT 200000
year_min        INTEGER DEFAULT 2005
year_max        INTEGER DEFAULT 2025
makes_models    TEXT DEFAULT '["Toyota Tacoma","Toyota 4Runner"]' -- JSON array
cron_interval   INTEGER DEFAULT 30    -- minutes
fb_enabled      BOOLEAN DEFAULT false
last_viewed_at  TEXT                   -- tracks "new since" threshold
```

### Indexes and Constraints
```sql
-- Dedup: VIN-based (for Cars.com/Autotrader/KBB)
CREATE UNIQUE INDEX idx_listings_vin ON listings(vin) WHERE vin IS NOT NULL;

-- Dedup: source+external_id (for FB Marketplace and as VIN fallback)
CREATE UNIQUE INDEX idx_listings_source_extid ON listings(source, external_id) WHERE external_id IS NOT NULL;

-- Query indexes
CREATE INDEX idx_listings_view_status ON listings(view_status);
CREATE INDEX idx_listings_is_favorited ON listings(is_favorited);
CREATE INDEX idx_listings_is_dismissed ON listings(is_dismissed);
CREATE INDEX idx_listings_source ON listings(source);
CREATE INDEX idx_listings_deal_score ON listings(deal_score);
CREATE INDEX idx_listings_first_seen ON listings(first_seen_at);
CREATE INDEX idx_price_history_listing ON price_history(listing_id);
CREATE INDEX idx_notes_listing ON notes(listing_id);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at);
```

---

## Deal Scoring Algorithm

```typescript
// src/lib/scoring.ts
// All prices in cents. Pure function, no side effects.

function computeDealScore(listing: Listing, config: SearchConfig): number {
  let score = 5.0; // baseline

  // Price vs budget: lower price relative to max = better deal
  const priceRatio = listing.price / config.price_max; // both in cents
  if (priceRatio < 0.6) score += 2.0;
  else if (priceRatio < 0.8) score += 1.0;
  else if (priceRatio > 0.95) score -= 1.0;

  // Mileage: lower miles-per-year = better condition
  const age = new Date().getFullYear() - listing.year;
  const milesPerYear = listing.mileage / Math.max(age, 1);
  if (milesPerYear < 10000) score += 1.0;
  else if (milesPerYear < 12000) score += 0.5;
  else if (milesPerYear > 15000) score -= 0.5;
  else if (milesPerYear > 20000) score -= 1.5;

  // History bonuses
  if (listing.one_owner) score += 0.5;
  if (listing.no_accidents) score += 1.0;
  if (listing.personal_use) score += 0.5;

  // Private party bonus (usually cheaper, no dealer fees)
  if (listing.dealer_type === 'private') score += 0.5;

  // Source deal rating bonus
  if (listing.deal_rating === 'Great') score += 1.0;
  else if (listing.deal_rating === 'Good') score += 0.5;

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

// Recompute scores for all non-dismissed listings (called when config changes)
function recomputeAllScores(db: Database, config: SearchConfig): number {
  const listings = db.select().from(listingsTable).where(eq(listingsTable.is_dismissed, false)).all();
  let updated = 0;
  for (const listing of listings) {
    const newScore = computeDealScore(listing, config);
    if (newScore !== listing.deal_score) {
      db.update(listingsTable).set({ deal_score: newScore }).where(eq(listingsTable.id, listing.id)).run();
      updated++;
    }
  }
  return updated;
}
```

---

## Project Structure

```
car-search/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  -- Root layout with sidebar nav
│   │   ├── page.tsx                    -- Dashboard (new listings, stats)
│   │   ├── listings/
│   │   │   └── page.tsx                -- All listings with filters
│   │   ├── favorites/
│   │   │   └── page.tsx                -- Favorited listings
│   │   ├── listing/
│   │   │   └── [id]/
│   │   │       └── page.tsx            -- Detail view: images, price chart, notes
│   │   ├── settings/
│   │   │   └── page.tsx                -- Search config, scraper controls
│   │   └── api/
│   │       ├── listings/
│   │       │   ├── route.ts            -- GET (list/filter), PATCH (bulk update)
│   │       │   └── [id]/
│   │       │       ├── route.ts        -- GET (detail), PATCH (favorite/dismiss/seen)
│   │       │       └── notes/
│   │       │           └── route.ts    -- GET, POST notes/calls
│   │       ├── scrape/
│   │       │   ├── route.ts            -- POST: trigger manual scan (checks mutex)
│   │       │   └── status/
│   │       │       └── route.ts        -- GET: last run status
│   │       ├── config/
│   │       │   └── route.ts            -- GET, PUT search config (+recompute scores)
│   │       └── stats/
│   │           └── route.ts            -- GET: dashboard stats
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts               -- Drizzle client + globalThis singleton + WAL mode
│   │   │   ├── schema.ts              -- Drizzle schema definitions
│   │   │   └── migrate.ts             -- Migration runner (auto-runs on first connect)
│   │   ├── scrapers/
│   │   │   ├── mcp-client.ts          -- MCP SDK client for Car Deals Search
│   │   │   ├── facebook.ts            -- FB Marketplace scraper wrapper
│   │   │   ├── normalize.ts           -- Normalize listings to common schema
│   │   │   ├── dedup.ts               -- VIN + source/external_id dedup logic
│   │   │   └── runner.ts              -- Orchestrates a full scrape cycle (with mutex)
│   │   ├── scoring.ts                 -- Deal scoring + recomputeAllScores()
│   │   └── types.ts                   -- Shared TypeScript interfaces (Listing, SearchConfig, etc.)
│   ├── components/
│   │   ├── ui/                         -- shadcn/ui components
│   │   ├── listing-card.tsx            -- Card component for grid view
│   │   ├── listing-table.tsx           -- Table component for list view
│   │   ├── listing-filters.tsx         -- Filter sidebar/toolbar
│   │   ├── listing-detail.tsx          -- Detail panel
│   │   ├── price-chart.tsx             -- Recharts price history ('use client')
│   │   ├── deal-score-badge.tsx        -- Colored score indicator
│   │   ├── notes-panel.tsx             -- Notes/call history
│   │   ├── stats-cards.tsx             -- Dashboard summary cards
│   │   ├── nav-sidebar.tsx             -- Navigation sidebar
│   │   └── scan-button.tsx             -- Manual scan trigger
│   └── hooks/
│       ├── use-listings.ts             -- TanStack Query hooks for listings
│       ├── use-config.ts               -- Config read/write hooks
│       └── use-scrape.ts               -- Scrape trigger + status hooks
├── scripts/
│   ├── worker.ts                       -- Standalone cron worker (node-cron + scrapers)
│   ├── seed.ts                         -- Dev seed script with sample listings
│   └── fb-scraper/                     -- Facebook Marketplace Python scraper
│       ├── requirements.txt            -- Python 3.10+, selenium, etc.
│       └── scrape.py                   -- Adapted from kevmaindev/Facebook-Marketplace_Scraper
├── drizzle/
│   └── migrations/                     -- Auto-generated migrations
├── data/
│   └── .gitkeep                        -- car-search.db created at runtime
├── drizzle.config.ts
├── next.config.ts                      -- serverExternalPackages: ['better-sqlite3']
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .gitignore                          -- node_modules, data/*.db, .env.local, .next
├── .env.local.example                  -- Template: CAR_DEALS_MCP_PATH, FB_EMAIL, FB_PASSWORD
└── .env.local                          -- Actual secrets (gitignored)
```

---

## Implementation Steps

### Phase 0: MCP Verification (Step 0)

**Step 0: Verify MCP server works standalone**
- Clone the MCP server: `git clone https://github.com/SiddarthaKoppaka/car_deals_search_mcp.git` then `cd car_deals_search_mcp && npm install && npm run build`
- Test it manually: run the MCP server, call `search_car_deals` with `{ make: "Toyota", model: "Tacoma", zip: "92648", priceMax: 15000 }`
- Verify it returns listing data with year, price, mileage, dealer info
- If it fails (bot detection, Chrome issues), troubleshoot before proceeding — the entire pipeline depends on this
- Document the working command in `.env.local` as `CAR_DEALS_MCP_PATH=/path/to/car_deals_search_mcp/dist/index.js`

### Phase 1: Project Scaffolding (Steps 1-3)

**Step 1: Initialize Next.js project**
- `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir`
- Install core deps: `drizzle-orm better-sqlite3 @tanstack/react-query recharts zod node-cron @modelcontextprotocol/sdk`
- Install dev deps: `drizzle-kit @types/better-sqlite3 @types/node-cron concurrently tsx`
- Configure `next.config.ts`:
  ```ts
  const nextConfig = { serverExternalPackages: ['better-sqlite3'] };
  ```
- Initialize shadcn/ui: `npx shadcn@latest init`
- Add shadcn components: `button card input select table badge dialog sheet tabs separator dropdown-menu tooltip slider`
- Create `.gitignore` with: `node_modules/`, `.next/`, `data/*.db`, `.env.local`
- Set up `package.json` scripts:
  ```json
  {
    "dev": "concurrently \"next dev\" \"tsx watch --watch-path scripts scripts/worker.ts\"",
    "build": "next build",
    "start": "concurrently \"next start\" \"tsx scripts/worker.ts\""
  }
  ```

**Step 2: Database setup**
- Create `src/lib/db/schema.ts` with all tables defined above (using split view_status/is_favorited/is_dismissed fields)
- Create `src/lib/db/index.ts`:
  - Use `globalThis` singleton pattern: `globalThis.__db ??= new Database('data/car-search.db')`
  - Execute `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;` on connection init
  - Export Drizzle client wrapping the connection
- Create `src/lib/types.ts` with shared TypeScript interfaces:
  ```ts
  export interface Listing { id: number; vin: string | null; source: string; ... }
  export interface SearchConfig { zip: string; radius_miles: number; ... }
  export interface ScrapeResult { new: number; updated: number; errors: string[] }
  ```
- Create `data/` directory: `mkdir -p data && touch data/.gitkeep`
- Create `drizzle.config.ts` pointing to schema and `data/car-search.db`
- Run `npx drizzle-kit push` (dev mode — applies schema directly)
- Seed `search_config` row with defaults via `scripts/seed.ts`

**Step 3: Deal scoring engine**
- Create `src/lib/scoring.ts` with `computeDealScore()` and `recomputeAllScores()` functions
- Pure functions, unit-testable — scoring depends only on listing fields and config

### Phase 2: Scraper Backend (Steps 4-6)

**Step 4: MCP client scraper**
- Install `@modelcontextprotocol/sdk`
- Create `src/lib/scrapers/mcp-client.ts`:
  - Read MCP server path from `process.env.CAR_DEALS_MCP_PATH`
  - Create `StdioClientTransport` spawning the MCP server as a child process
  - Connect MCP Client, call `search_car_deals` with params from `search_config`
  - **Timeout:** 90-second timeout per `callTool` request. If exceeded, kill the child process and log error.
  - **Lifecycle:** Keep client alive for the duration of one scrape cycle (multiple make/model calls), then close and kill subprocess.
  - **Error handling:** Catch connection errors, Puppeteer crashes, empty results. Log to `scrape_runs` with error message. Never throw unhandled.
  - Returns normalized listing array
- Create `src/lib/scrapers/normalize.ts` to map MCP response fields to our schema:
  - Map source deal ratings ('Great Deal', 'Good Deal') to our enum
  - Parse price strings to cents (remove $ and commas, multiply by 100)
  - Extract year/make/model from title if not separate fields

**Step 5: Dedup and storage logic**
- Create `src/lib/scrapers/dedup.ts`:
  - For each incoming listing:
    1. If VIN is present: `INSERT ... ON CONFLICT(vin) DO UPDATE SET last_seen_at=now, price=new_price`
    2. If VIN is null (FB): `INSERT ... ON CONFLICT(source, external_id) DO UPDATE SET last_seen_at=now, price=new_price`
    3. On conflict update: if price changed, insert row into `price_history`
    4. On new insert: compute deal_score, set `view_status='new'`
  - Return counts: `{ new: N, updated: M }`
- Use SQLite's `ON CONFLICT` (upsert) for atomic dedup — no check-then-insert race condition

**Step 6: Facebook Marketplace scraper (optional)**
- Clone `kevmaindev/Facebook-Marketplace_Scraper` into `scripts/fb-scraper/`
- Requires: Python 3.10+, `pip install -r requirements.txt`
- Create `src/lib/scrapers/facebook.ts` wrapper:
  - Check `search_config.fb_enabled` — skip if false
  - Read `FB_EMAIL` and `FB_PASSWORD` from `.env.local`
  - Call Python script via `child_process.execFile` with 120-second timeout
  - Parse JSON output, normalize to common listing schema
  - FB listings have no VIN — dedup uses `source='facebook'` + `external_id` (FB listing URL)
- Gate behind `search_config.fb_enabled` flag

### Phase 3: Scheduling (Step 7)

**Step 7: Standalone cron worker**
- Create `scripts/worker.ts` — a standalone Node.js script (NOT inside Next.js):
  ```ts
  // Runs independently via `tsx scripts/worker.ts`
  // Reads cron_interval from search_config on each tick (no restart needed on config change)
  // Uses node-cron for scheduling
  // Shares the same DB file (data/car-search.db) as Next.js
  ```
- Create `src/lib/scrapers/runner.ts` — shared scrape orchestrator:
  - **Mutex:** Check `scrape_runs` for any row with `status='running'`. If `started_at` is older than 10 minutes, treat as stale (update to `status='failed'`). If a non-stale running row exists, skip (return early).
  - Insert new `scrape_runs` row with `status='running'`
  - Run MCP scraper for each make/model combo from `search_config`
  - Optionally run FB scraper if enabled
  - Update `scrape_runs` row with `status='completed'` (or `'failed'`), counts, and `completed_at`
  - **On crash/timeout:** A `finally` block updates the run to `status='failed'`
- The cron worker calls `runner.ts` on each tick
- The `POST /api/scrape` route also calls `runner.ts` (same mutex protects against overlap)
- **Config reload:** Worker re-reads `cron_interval` from `search_config` DB on each tick via `setTimeout` loop (not `cron.schedule` with fixed expression). This avoids needing IPC to restart cron when config changes.

### Phase 4: API Routes (Steps 8-10)

**API error contract:** All error responses return `{ error: string, code?: string }` with appropriate HTTP status (400 for bad input, 404 for not found, 409 for conflict, 500 for server error). Input validation uses Zod schemas.

**Pagination:** All list endpoints accept `page` (default 1) and `limit` (default 20, max 100). Response includes `{ data: T[], total: number, page: number, limit: number }`.

**Step 8: Listings API**
- `GET /api/listings` — query with filters:
  - `source` (string, optional)
  - `priceMin`, `priceMax` (number in cents, optional)
  - `mileageMin`, `mileageMax` (number, optional)
  - `yearMin`, `yearMax` (number, optional)
  - `scoreMin` (number 0-10, optional)
  - `viewStatus` ('new' | 'seen', optional)
  - `isFavorited` (boolean, optional)
  - `isDismissed` (boolean, default false — dismissed hidden by default)
  - `sortBy` ('deal_score' | 'price' | 'mileage' | 'first_seen_at', default 'first_seen_at')
  - `sortDir` ('asc' | 'desc', default 'desc')
  - `page`, `limit`
- `PATCH /api/listings/[id]` — update fields: `is_favorited`, `is_dismissed`, `view_status`
  - When `is_favorited` set to true, also set `favorited_at` to now
  - When `is_favorited` set to false, clear `favorited_at`
  - Returns 404 `{ error: "Listing not found" }` if ID doesn't exist
- `GET /api/listings/[id]` — full detail with price history array and notes array

**Step 9: Notes API**
- `GET /api/listings/[id]/notes` — all notes/calls for a listing, ordered by `created_at desc`
- `POST /api/listings/[id]/notes` — add note. Body: `{ type: 'note' | 'call', content: string }`
  - Validates with Zod: type must be enum, content must be non-empty string
  - Returns 404 if listing ID doesn't exist

**Step 10: Config + Stats APIs**
- `GET /api/config` — current search config (single row from `search_config`)
- `PUT /api/config` — update search config
  - Validates with Zod schema
  - After saving, calls `recomputeAllScores()` if `price_max` changed (scores depend on it)
  - Returns updated config
- `GET /api/stats` — returns:
  ```ts
  {
    totalListings: number,
    newCount: number,         // view_status='new'
    favoritesCount: number,   // is_favorited=true
    avgDealScore: number,     // rounded to 1 decimal
    lastScrapeAt: string | null,
    sourceBreakdown: { source: string, count: number }[]
  }
  ```
- `GET /api/scrape/status` — last scrape run details from `scrape_runs` (ordered by `started_at desc`)
- `POST /api/scrape` — trigger immediate scan via `runner.ts`:
  - Returns 409 `{ error: "Scan already in progress" }` if mutex held
  - Returns 202 `{ runId: number }` on success (scan runs async)

### Phase 5: Frontend Pages (Steps 11-16)

**Step 11: Layout + Navigation**
- `src/app/layout.tsx` — root layout wrapping TanStack QueryClientProvider, sidebar nav
- `src/components/nav-sidebar.tsx` — sidebar with icons (Truck, List, Star, Settings), active route highlighting, "new" badge count fetched from `/api/stats`
- Responsive: sidebar on left for `md:` and up (768px+), bottom tab bar on mobile

**Step 12: Dashboard page (`/`)**
- Summary stat cards: new listings count, total tracked, favorites, avg deal score (from `/api/stats`)
- "New Listings" section: card grid of listings where `view_status='new'`, max 10, "View all" link
- Last scrape status (time ago + result counts) + "Scan Now" button
- Quick source filter tabs (All / Cars.com / Autotrader / KBB / Facebook)

**Step 13: Listings page (`/listings`)**
- Filter toolbar: source dropdown, price range slider, mileage slider, year range, deal score threshold, view_status toggle, favorites toggle, show/hide dismissed
- Toggle between card grid and table view (persisted in localStorage)
- Sort by: deal score, price, mileage, date found
- Pagination with page/limit controls (default 20 per page, total count display)
- Bulk actions: favorite selected, dismiss selected, mark as seen

**Step 14: Listing detail page (`/listing/[id]`)**
- Hero: image (with fallback placeholder if image_url broken) + key stats
- Deal score badge (large, colored: green >=7, yellow 4-6.9, red <4)
- Price history chart (Recharts line chart, `'use client'` component with `dynamic()` import)
- Vehicle details: dealer info, history flags (one_owner, no_accidents, personal_use), source link
- Notes panel: timeline of notes/calls, "Add Note" and "Log Call" buttons with text input
- Action buttons: favorite toggle, dismiss toggle, "Open on [Source]" external link

**Step 15: Favorites page (`/favorites`)**
- Same layout as listings page, pre-filtered to `is_favorited=true`
- Shows notes count badge on each card
- Sort by: date favorited (`favorited_at`), deal score, price

**Step 16: Settings page (`/settings`)**
- Search criteria form: zip, radius (miles), price max ($), mileage max, year range, vehicle multi-select
- Scraper schedule: interval dropdown (15/30/60 min) — takes effect on next worker tick
- FB Marketplace toggle with warning: "Experimental — requires Facebook credentials and a disposable account. May violate Facebook ToS."
- Last 10 scrape runs log table (from `scrape_runs`, ordered by `started_at desc`)
- "Scan Now" button with spinner while running, shows result when complete

### Phase 6: Polish (Steps 17-18)

**Step 17: UX refinements**
- "Mark all as seen" button on dashboard — bulk updates `view_status='seen'` for all `'new'` listings, updates `last_viewed_at`
- Toast notifications (shadcn toast) for: scrape completion, favorite added, note saved
- Loading skeletons for all data-fetching states (shadcn Skeleton component)
- Empty states: "No new listings" with truck illustration, "No favorites yet" with star illustration

**Step 18: Data seeding and testing**
- `scripts/seed.ts` inserts 20 sample listings with varied scores, sources, prices for dev/demo
- Manual E2E walkthrough:
  1. Run `npm run dev`, verify both Next.js and worker start
  2. Trigger scan via "Scan Now", verify listings appear on dashboard
  3. Click into a listing detail, verify all fields populated
  4. Favorite a listing, verify it appears on Favorites page AND retains `view_status='new'`
  5. Add a note and a call log, verify they persist on reload
  6. Dismiss a listing, verify it disappears from default view, appears with "show dismissed"
  7. Change settings (zip code), trigger scan, verify new results
  8. Wait one cron interval, verify `scrape_runs` table has auto-triggered run

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Car Deals MCP uses Puppeteer — may fail with bot detection | Empty scrape results | 90s timeout per call; retry with 30s backoff (max 2 retries); log to `scrape_runs` with error; show last success time in UI |
| FB Marketplace scraper violates ToS | Account ban, legal risk | Default OFF, ToS warning in UI, disposable account only, isolated Python subprocess |
| No VIN on FB listings → dedup issues | Duplicate listings | Composite unique index `(source, external_id)` enforced at DB level via `ON CONFLICT` upsert |
| SQLite concurrent writes from worker + API | Database locked errors | WAL mode enabled on init (`PRAGMA journal_mode=WAL`); scrape mutex via `scrape_runs` status check prevents concurrent writes |
| MCP server not installed | Scraper fails on first run | Phase 0 verification step; clear error: "Set CAR_DEALS_MCP_PATH in .env.local"; setup instructions in README |
| Puppeteer/Chrome not available | MCP server can't launch browser | Document Chrome requirement in README; `car_deals_search_mcp` bundles Puppeteer which auto-downloads Chromium |
| Source image URLs go stale | Broken images in UI | Fallback placeholder image in `listing-card.tsx` and `listing-detail.tsx` via `onError` handler |
| Price_history table grows unbounded | Disk usage | Acceptable for personal use (< 1MB/year at current scale); future: add retention policy if needed |

---

## Verification Steps

| # | What | Command / Action | Expected Result |
|---|------|-----------------|-----------------|
| 1 | DB tables created | `sqlite3 data/car-search.db ".tables"` | Shows: `listings notes price_history scrape_runs search_config` |
| 2 | WAL mode enabled | `sqlite3 data/car-search.db "PRAGMA journal_mode;"` | Returns `wal` |
| 3 | Scraper works | `curl -X POST localhost:3000/api/scrape` | Returns 202 with `{ runId: N }` |
| 4 | Listings appear | `curl localhost:3000/api/listings` | Returns `{ data: [...], total: N }` with N > 0 after scan |
| 5 | Dedup works | Trigger scan twice; `curl localhost:3000/api/stats` | `totalListings` stays same; second `scrape_runs` row shows `updated_count > 0`, `new_count = 0` |
| 6 | Price tracking | Trigger scan; if a price changed since last scan, check `sqlite3 data/car-search.db "SELECT count(*) FROM price_history;"` | Count > 0 |
| 7 | Mutex works | Click "Scan Now" twice rapidly | First returns 202, second returns 409 `"Scan already in progress"` |
| 8 | Favorite persists | Favorite a listing via UI, reload page | Listing still shows as favorited; `view_status` unchanged |
| 9 | Notes persist | Add note via UI, reload detail page | Note appears with correct timestamp |
| 10 | Filters work | Set price filter to $5k-$10k on listings page | Only listings with price between 500000-1000000 cents shown |
| 11 | Deal score colors | Find listing with score >= 7 | Badge is green |
| 12 | Config recomputes scores | Change `price_max` in settings, save | `deal_score` values update for existing listings |
| 13 | Cron runs | Wait one interval; `sqlite3 data/car-search.db "SELECT count(*) FROM scrape_runs;"` | Count increases by 1 per interval |

---

## Out of Scope (Future)

- Email/SMS notifications (user chose dashboard-only for now)
- User authentication (single-user personal tool)
- Deployment to cloud (local dev only)
- Rebrowser dataset integration (static data, less useful than live scraping)
- Mobile app (responsive web is sufficient)
- Data export (CSV/JSON download of listings)

---

## Revision Changelog (v1 → v2)

Incorporated findings from Architect + Critic review:

1. **Split `status` field** into `view_status` + `is_favorited` + `is_dismissed` + `favorited_at` — a listing can now be both "new" and "favorited" (Architect #3, Critic #1)
2. **Added composite unique index** `(source, external_id)` for FB dedup — prevents application-level race conditions (Architect #4, Critic #2)
3. **Added `serverExternalPackages` requirement** to next.config.ts — prevents build failure from native `better-sqlite3` module (Architect #2, Critic #3)
4. **Extracted cron to standalone worker** (`scripts/worker.ts` via `concurrently`) — avoids Next.js hot-reload orphaned cron processes (Architect #1/synthesis, Critic #4)
5. **Added scrape mutex** via `scrape_runs` status check — prevents concurrent scrapes from "Scan Now" + cron overlap (Architect #6, Critic #5)
6. **Added WAL mode** to DB initialization step — was only mentioned in risks, now in implementation (Critic #6)
7. **Worker re-reads config interval each tick** — no restart/IPC needed when user changes cron_interval (Critic #7)
8. **Added `recomputeAllScores()`** — when `price_max` changes, existing scores are recalculated (Critic #8)
9. **Removed `created_at` redundancy** — `first_seen_at` serves the same purpose (Critic minor #2)
10. **Added Phase 0** — verify MCP server works before building the full app (Critic suggestion)
11. **Added `.gitignore`, API error contract, pagination spec, Zod validation, scrape timeouts** (Critic gaps)
12. **Recharts marked as `'use client'`** with `dynamic()` import note (Critic minor #5)
13. **Added `globalThis` singleton pattern** for DB connection in dev mode (Architect #2, Critic #4)
14. **Added `scrape_runs(started_at)` index** (Architect #7, Critic minor #7)
15. **Added image fallback placeholder** for stale URLs (Critic minor #8)
16. **VIN unique index now partial** (`WHERE vin IS NOT NULL`) — SQLite NULL uniqueness fix (Critic finding)
17. **Added `PRAGMA busy_timeout=5000`** alongside WAL mode for concurrent access safety (Architect v2 #2)
18. **Scrape mutex staleness TTL** — running rows older than 10 min treated as failed, self-healing (Architect v2 #1)
19. **Scoped `tsx watch` to `scripts/`** only — prevents worker restart on frontend file changes (Architect v2 #3)
20. **Consolidated all deps into Step 1** — `node-cron`, `@types/node-cron`, `@modelcontextprotocol/sdk` added (Critic v2 #1/#3)
21. **Clarified MCP server install** — exact git clone + build command, not ambiguous npm install (Critic v2 ambiguity)
22. **Added `mkdir -p data`** to Step 2 and `.env.local.example` to project structure (Critic v2 #5/gap)
