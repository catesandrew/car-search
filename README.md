# Car Search Dashboard

A Next.js dashboard that automatically scrapes Toyota truck listings from KBB, Autotrader, and Facebook Marketplace, scores deals against market comparables, and lets you favorite, annotate, and track price changes.

Built to help find a used Toyota Tacoma, 4Runner, or Tundra under $15k near Huntington Beach, CA.

## Features

- **Multi-source scraping** — KBB, Autotrader, Facebook Marketplace (Cars.com planned)
- **Market-relative deal scoring** — compares each listing against similar vehicles (same model, +/-3 years) to determine if price is above or below market median
- **Automated cron worker** — scrapes every 30 minutes (configurable), deduplicates by VIN or listing URL
- **Price history tracking** — tracks price changes over time with charts
- **Favorites and notes** — favorite listings, add call logs and notes
- **Filter and sort** — by source, price, mileage, year, deal score, status
- **Grid and table views** — with URL-synced pagination

## Quick Start

```bash
# Clone
git clone https://github.com/catesandrew/car-search.git
cd car-search

# Install dependencies
pnpm install

# Set up the database
pnpm db:push
pnpm db:migrate

# Seed with sample data (optional)
pnpm db:seed

# Configure scrapers (see docs for details)
cp .env.local.example .env.local
# Edit .env.local with your MCP server path

# Start the app + cron worker
pnpm dev
# Open http://localhost:3000
```

## Documentation

Full documentation is available at [catesandrew.github.io/car-search](https://catesandrew.github.io/car-search/).

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Scraping | MCP SDK + Playwright (FB) |
| Scheduling | Standalone node-cron worker |

## Architecture

```
car-search/
├── src/app/          # Next.js pages + API routes
├── src/lib/db/       # SQLite schema + Drizzle client
├── src/lib/scrapers/ # MCP client, FB wrapper, dedup, runner
├── src/components/   # React components (shadcn/ui)
├── scripts/          # Cron worker + seed script
└── docs/             # Docusaurus documentation site
```

## Forked Dependencies

This project uses two forked scrapers with improvements:

- **[catesandrew/car_deals_search_mcp](https://github.com/catesandrew/car_deals_search_mcp)** — Forked from [SiddarthaKoppaka/car_deals_search_mcp](https://github.com/SiddarthaKoppaka/car_deals_search_mcp). Added structured JSON output, search radius support, all sources enabled by default, improved wait strategies, and image extraction.

- **[catesandrew/Facebook-Marketplace_Scraper](https://github.com/catesandrew/Facebook-Marketplace_Scraper)** — Forked from [kevmaindev/Facebook-Marketplace_Scraper](https://github.com/kevmaindev/Facebook-Marketplace_Scraper). Added `capture_session.py` for manual login/session capture and `search_for_app.py` for headless CLI scraping with JSON output, configurable radius, and vehicle type filtering.

## License

MIT
