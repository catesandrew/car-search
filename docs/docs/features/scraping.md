---
sidebar_position: 2
---

# Scraping Pipeline

The scraping system runs as a **standalone cron worker** alongside the Next.js app, querying multiple sources and deduplicating results into the SQLite database.

## Architecture

```
pnpm dev
├── next dev                              (Next.js app on :3000)
└── tsx watch scripts/worker.ts           (cron worker)
        │
        └─ on each tick:
              read cronInterval from DB
              check scrape mutex (scrape_runs table)
              if not running:
                run all enabled scrapers
                compute deal scores
                recompute all scores
```

The worker is a standalone Node.js process (`scripts/worker.ts`) that does not share process memory with Next.js. It communicates exclusively through the SQLite database.

**The worker re-reads the interval from the database on every tick** — so you can change the scrape interval in the Settings page and it takes effect on the next tick without restarting anything.

## Scrape Mutex

The worker checks for a stuck or in-progress scrape before starting:

1. Queries `scrape_runs` for any row with `status = 'running'`
2. If the most recent running row is older than **10 minutes** (staleness TTL), it's considered stuck and a new scrape proceeds
3. Otherwise, the tick is skipped

This prevents concurrent scrape runs even if multiple processes are started. Use `POST /api/scrape/clear` to manually clear stuck "running" runs if needed.

## Sources

### KBB (via Car Deals Search MCP)

The best data source. Returns:

- Vehicle title (year/make/model/trim)
- Price
- Mileage
- Location
- Image URL
- Deal rating ("Great Deal", "Good Deal", "Fair", etc.)
- One owner / no accidents / personal use flags (when available)

KBB is scraped via the `car_deals_search_mcp` MCP server using Playwright.

### Autotrader (via Car Deals Search MCP)

Returns titles, prices, images, and mileage. Deal ratings and history flags are less consistently available than KBB.

### Facebook Marketplace (via Playwright scraper)

Returns image URLs, prices, location, and listing URLs. All Facebook listings are treated as private-party sales. Facebook scraping is **disabled by default** — toggle it on in Settings.

### Cars.com (via Car Deals Search MCP)

Currently **blocked by bot detection** — returns 0 listings. The integration remains in the codebase for future improvements.

## Multi-Zip Search

Rather than searching only your configured zip code, the scraper queries **7 zip codes** covering a ~50-mile radius around the primary zip (default `92648` — Huntington Beach, CA):

| Zip | Area |
|-----|------|
| 92648 | Huntington Beach (primary) |
| 90802 | Long Beach |
| 92708 | Fountain Valley |
| 92612 | Irvine |
| 90247 | Gardena |
| 91101 | Pasadena |
| 92832 | Fullerton |

Results from all zips are merged before deduplication. Listings that appear in multiple zip searches are only stored once.

To change the zip code coverage, edit `src/lib/scrapers/runner.ts`.

## Deduplication Logic

### VIN-Based (Dealer Listings)

Listings with a VIN (typically dealer listings from KBB/Autotrader) are deduplicated by VIN using a partial unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_vin_unique
ON listings(vin) WHERE vin IS NOT NULL;
```

When a listing with the same VIN is scraped again, it triggers an upsert — `lastSeenAt` is updated and any new data (price, image, mileage) is backfilled.

### URL-Based (Facebook Listings)

Facebook listings are deduplicated by a composite unique index on `(source, external_id)`, where `external_id` is the Facebook listing ID extracted from the URL (with tracking parameters stripped):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_external_id_unique
ON listings(source, external_id) WHERE external_id IS NOT NULL;
```

### In-Memory Dedup Across Zips

Before hitting the database, duplicate listings found within the same scrape run (across multiple zip searches) are deduped in memory by matching `year + make + model + price + mileage`.

## Price History

When an upserted listing has a **different price** than what's stored, the old price is written to the `price_history` table with the current timestamp:

```typescript
// If the existing listing has a different price, record it in price_history
if (existing.price !== null && existing.price !== listing.price) {
  db.insert(priceHistory).values({
    listingId: existing.id,
    price: existing.price,
    observedAt: new Date().toISOString(),
  }).run();
}
```

Price history is displayed as a chart on the listing detail page.

## Data Backfill

If a re-scraped listing has new data that was missing before (e.g., an image URL that wasn't available on the first scrape), the missing fields are filled in during the upsert. This means listings improve in quality as they're re-seen across scrape runs.

## Manual Scrape Trigger

Click **Scan Now** in the dashboard toolbar, or `POST /api/scrape`. This queues an immediate scrape run outside the normal cron schedule. The endpoint returns `202 Accepted` on success and `409 Conflict` if a scrape is already running.

## Scrape Run History

Every scrape run is recorded in the `scrape_runs` table with:

- `source` — which scraper ran
- `status` — `running`, `completed`, or `failed`
- `new_count` — number of new listings inserted
- `updated_count` — number of existing listings updated
- `error` — error message if the run failed
- `started_at` / `completed_at` — timestamps

The last scrape run status is available via `GET /api/scrape/status`.
