---
sidebar_position: 1
---

# Installation

This guide walks through a full installation of Car Search Dashboard, including database setup and environment configuration.

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ (20 recommended) | |
| pnpm | any recent | `npm install -g pnpm` |
| Python | 3.12 | Only for Facebook scraper (optional) |

## 1. Clone the Repository

```bash
git clone https://github.com/catesandrew/car-search.git
cd car-search
```

## 2. Install Dependencies

```bash
pnpm install
```

This installs all Next.js, Drizzle ORM, MCP SDK, and scraper dependencies.

## 3. Database Setup

The app uses SQLite stored at `data/car-search.db`. Run both commands:

```bash
# Push the Drizzle schema to create tables
pnpm db:push

# Run migration script to create partial unique indexes
# (VIN dedup index and source+external_id index for Facebook)
pnpm db:migrate
```

Both commands are required. `db:push` creates the tables from the Drizzle schema; `db:migrate` runs `src/lib/db/migrate.ts` which adds partial unique indexes that Drizzle can't express declaratively.

### Seed Sample Data (Optional)

To pre-populate the database with sample listings for testing the UI:

```bash
pnpm db:seed
```

This runs `scripts/seed.ts` and inserts a mix of Toyota Tacoma, 4Runner, and Tundra listings with varied prices, mileage, and sources.

## 4. Environment Variables

Copy the example file and edit it:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set the following variables:

### `CAR_DEALS_MCP_PATH` (required for KBB/Autotrader/Cars.com scraping)

```
CAR_DEALS_MCP_PATH=/path/to/car_deals_search_mcp/src/server.js
```

Path to the `src/server.js` entry point in the cloned `car_deals_search_mcp` fork. See [MCP Server Setup](./mcp-server.md) for how to clone and configure the fork.

### `FB_EMAIL` (optional, for Facebook Marketplace)

```
FB_EMAIL=your-facebook-email@example.com
```

The email address for the Facebook account used by the Playwright scraper. Facebook scraping is disabled by default — toggle it on in the Settings page once configured. See [Facebook Marketplace Setup](./facebook-scraper.md) for full instructions.

### `FB_PASSWORD` (optional)

```
FB_PASSWORD=your-facebook-password
```

Used only if you want automated login (not recommended — Facebook's bot detection is aggressive). The preferred flow is to run `capture_session.py` manually instead.

## 5. Start the Development Server

```bash
pnpm dev
```

This uses `concurrently` to start two processes simultaneously:

- `next dev` — the Next.js app on port 3000
- `tsx watch --watch-path scripts scripts/worker.ts` — the standalone cron worker (hot-reloads when `scripts/` changes)

The worker polls the database on each cron tick to read the current interval, so you can change the scrape interval in Settings without restarting.

## 6. Verify the Installation

Open [http://localhost:3000](http://localhost:3000). You should see:

- The main listings grid (empty if you skipped seeding, or with sample data if you ran `db:seed`)
- A "Scan Now" button in the top toolbar
- The Settings page at `/settings` where you can configure search criteria, cron interval, and the Facebook toggle

Click **Scan Now** to trigger an immediate scrape. Check your terminal for output like:

```
[MCP] Total listings: 42
[Scraper] Inserted 38 new, updated 4
```

If you see errors about `CAR_DEALS_MCP_PATH`, make sure the path in `.env.local` is correct and the MCP server is set up — see [MCP Server Setup](./mcp-server.md).

## Production Start

To run in production mode:

```bash
pnpm build
pnpm start
```

`pnpm start` also uses `concurrently` to run `next start` and the cron worker together.
