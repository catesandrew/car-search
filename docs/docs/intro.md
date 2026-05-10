---
sidebar_position: 1
slug: /
---

# Getting Started

Car Search Dashboard is a self-hosted Next.js app that automatically scrapes used Toyota truck listings from KBB, Autotrader, and Facebook Marketplace, scores each deal against market comparables, and gives you a filterable dashboard to track favorites, notes, and price changes.

Built to find a used Toyota Tacoma, 4Runner, or Tundra under $15k near Huntington Beach, CA — but easily reconfigured for any make, model, price range, and zip code.

## What the Dashboard Does

- **Auto-scrapes** KBB, Autotrader, and Facebook Marketplace for Toyota trucks matching your search criteria
- **Scores every deal** on a 0–10 scale using a two-layer algorithm: absolute factors (price vs budget, mileage/year, history flags) plus relative comparison against current market comps
- **Deduplicates** listings by VIN or listing URL across sources and across multiple zip codes
- **Tracks price changes** over time with charts so you can see if a listing is dropping
- **Multi-zip search** — automatically searches ~7 zip codes in a 50-mile radius around your configured zip
- **Favorites and notes** — star listings you're interested in, log calls, add notes
- **Filter and sort** — by source, price, mileage, year, deal score, and status
- **Grid and table views** with URL-synced pagination
- **Configurable cron** — scrapes every 30 minutes by default, adjustable in the Settings page without restarting

## Key Features

| Feature | Details |
|---------|---------|
| Sources | KBB, Autotrader, Facebook Marketplace (Cars.com currently blocked by bot detection) |
| Deal scoring | 0–10 scale, green ≥ 7, yellow 4–6.9, red < 4 |
| Deduplication | VIN-based for dealer listings, URL-based for Facebook |
| Price history | Charts on the listing detail page |
| Cron interval | Configurable in-app, default 30 minutes |
| Database | SQLite (WAL mode) via Drizzle ORM |
| FB scraping | Optional, toggle in Settings, requires Python + Playwright setup |

## Prerequisites

- **Node.js 18+** (20 recommended)
- **pnpm** (`npm install -g pnpm`)
- **Python 3.12** — only needed for the Facebook Marketplace scraper (optional)
- The **car_deals_search_mcp** server cloned and built — see [MCP Server Setup](./setup/mcp-server.md)

## Quick Install (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/catesandrew/car-search.git
cd car-search

# 2. Install dependencies
pnpm install

# 3. Set up the database
pnpm db:push
pnpm db:migrate

# 4. Seed with sample data (optional but recommended for first run)
pnpm db:seed

# 5. Configure environment variables
cp .env.local.example .env.local
# Edit .env.local — set CAR_DEALS_MCP_PATH to your MCP server path

# 6. Start the app + cron worker
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

The `pnpm dev` command starts both the Next.js dev server and the standalone cron worker via `concurrently`. The worker runs in the background and fires scrapes on the configured interval.

---

_Dashboard screenshot coming soon_

## Next Steps

- [Installation](./setup/installation.md) — detailed setup walkthrough
- [MCP Server Setup](./setup/mcp-server.md) — required for KBB/Autotrader scraping
- [Facebook Marketplace Setup](./setup/facebook-scraper.md) — optional FB scraping
- [Deal Scoring Algorithm](./features/deal-scoring.md) — how scores are calculated
- [Scraping Pipeline](./features/scraping.md) — how the cron worker and dedup work
- [Database Schema](./features/database.md) — table definitions
- [API Reference](./features/api.md) — all REST endpoints
