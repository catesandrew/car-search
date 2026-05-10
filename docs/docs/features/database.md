---
sidebar_position: 3
---

# Database Schema

Car Search Dashboard uses **SQLite** stored at `data/car-search.db`, accessed via [Drizzle ORM](https://orm.drizzle.team/).

## Configuration

The database is configured with:

- **WAL mode** (`PRAGMA journal_mode=WAL`) — allows concurrent reads while a write is in progress, which matters since Next.js API routes and the cron worker access the DB simultaneously
- **`busy_timeout=5000`** — waits up to 5 seconds before throwing a "database is locked" error
- **`globalThis` singleton** — the Drizzle client is stored on `globalThis` so Next.js dev hot-reloads don't create multiple database connections

## Tables

### `listings`

The main table. One row per vehicle listing.

```typescript
export const listings = sqliteTable('listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vin: text('vin'),
  externalId: text('external_id'),
  source: text('source').notNull(),          // 'cars.com' | 'autotrader' | 'kbb' | 'facebook'
  url: text('url'),
  imageUrl: text('image_url'),
  year: integer('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  price: integer('price'),                   // stored in cents
  mileage: integer('mileage'),
  location: text('location'),
  dealerName: text('dealer_name'),
  dealerType: text('dealer_type'),           // 'dealer' | 'private'
  oneOwner: integer('one_owner', { mode: 'boolean' }).default(false),
  noAccidents: integer('no_accidents', { mode: 'boolean' }).default(false),
  personalUse: integer('personal_use', { mode: 'boolean' }).default(false),
  dealRating: text('deal_rating'),
  dealScore: real('deal_score'),
  viewStatus: text('view_status').default('new'),  // 'new' | 'seen'
  isFavorited: integer('is_favorited', { mode: 'boolean' }).default(false),
  isDismissed: integer('is_dismissed', { mode: 'boolean' }).default(false),
  favoritedAt: text('favorited_at'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});
```

**Notes:**
- `price` is stored in **cents** (integer) to avoid floating-point issues. Divide by 100 to display as dollars.
- `viewStatus` tracks whether the user has viewed the listing: `'new'` (unseen) or `'seen'`
- `isFavorited` and `isDismissed` are split status fields — a listing can be favorited but not dismissed, or dismissed but not favorited
- `dealScore` is recomputed after each scrape and when config changes

### `price_history`

Records price changes over time. A row is inserted whenever a re-scraped listing has a different price than what's currently stored.

```typescript
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').references(() => listings.id),
  price: integer('price'),       // cents — the OLD price before the change
  observedAt: text('observed_at').notNull(),
});
```

The chart on the listing detail page combines the current price with all `price_history` rows to show a price trend over time.

### `notes`

User notes and call logs attached to a listing.

```typescript
export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').references(() => listings.id),
  type: text('type').default('note'),   // 'note' | 'call' | 'system'
  content: text('content').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});
```

Note types:
- `'note'` — free-form user note
- `'call'` — call log entry (e.g., "Called dealer, asking $12,500 firm")
- `'system'` — auto-generated notes (e.g., price drop notifications)

### `scrape_runs`

Tracks every scrape execution. Also serves as the **scrape mutex** — before starting a new scrape, the worker checks this table for any row with `status = 'running'` that is less than 10 minutes old.

```typescript
export const scrapeRuns = sqliteTable('scrape_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  status: text('status').default('running'),    // 'running' | 'completed' | 'failed'
  newCount: integer('new_count').default(0),
  updatedCount: integer('updated_count').default(0),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
});
```

### `search_config`

A singleton table (always one row with `id = 1`) storing the user's search criteria and app settings.

```typescript
export const searchConfig = sqliteTable('search_config', {
  id: integer('id').primaryKey().default(1),
  zip: text('zip').default('92648'),
  radiusMiles: integer('radius_miles').default(150),
  priceMax: integer('price_max').default(1500000),    // $15,000 in cents
  mileageMax: integer('mileage_max').default(200000),
  yearMin: integer('year_min').default(2005),
  yearMax: integer('year_max').default(2025),
  makesModels: text('makes_models').default('["Toyota Tacoma","Toyota 4Runner"]'),
  cronInterval: integer('cron_interval').default(30), // minutes
  fbEnabled: integer('fb_enabled', { mode: 'boolean' }).default(false),
  lastViewedAt: text('last_viewed_at'),
});
```

**Notes:**
- `makesModels` is a JSON array stored as text: `'["Toyota Tacoma","Toyota 4Runner"]'`
- `cronInterval` is in minutes; the cron worker re-reads this on every tick
- `fbEnabled` controls whether the Facebook scraper runs; default `false`

## Key Indexes

These indexes are created in `src/lib/db/migrate.ts` via raw SQL because Drizzle ORM cannot express partial unique indexes declaratively:

```sql
-- VIN dedup: listings with VINs must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_vin_unique
ON listings(vin) WHERE vin IS NOT NULL;

-- Facebook dedup: same listing from same source can't be inserted twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_external_id_unique
ON listings(source, external_id) WHERE external_id IS NOT NULL;
```

Standard indexes defined in the Drizzle schema (created by `pnpm db:push`):

| Index | Column(s) | Purpose |
|-------|-----------|---------|
| `idx_listings_view_status` | `view_status` | Filter by new/seen |
| `idx_listings_is_favorited` | `is_favorited` | Filter favorites |
| `idx_listings_is_dismissed` | `is_dismissed` | Exclude dismissed |
| `idx_listings_source` | `source` | Filter by source |
| `idx_listings_deal_score` | `deal_score` | Sort by score |
| `idx_listings_first_seen` | `first_seen_at` | Sort by date |
| `idx_price_history_listing` | `listing_id` | Join price history |
| `idx_notes_listing` | `listing_id` | Join notes |
| `idx_scrape_runs_started` | `started_at` | Query recent runs |

## Database Location

The SQLite file is stored at `data/car-search.db` relative to the project root. This directory is git-ignored. If you delete the file, re-run `pnpm db:push && pnpm db:migrate` to recreate it.
