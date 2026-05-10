---
sidebar_position: 2
---

# MCP Server Setup (Car Deals Search)

The Car Deals Search MCP server handles scraping from KBB, Autotrader, and Cars.com using Playwright. This is required for the primary scraping sources.

## Which Fork to Use

**We use a forked version** with several improvements over the original:

| | URL |
|--|-----|
| **Fork (use this)** | https://github.com/catesandrew/car_deals_search_mcp |
| Original | https://github.com/SiddarthaKoppaka/car_deals_search_mcp |

## What We Changed and Why

### 1. Structured JSON Output

The original MCP server returned only a markdown text block. Our fork adds a JSON content block alongside the markdown so the dashboard can parse listings programmatically instead of scraping the text.

**Why:** The Next.js scraper runner calls `callTool()` via the MCP SDK and reads the JSON block directly. Without this, all listing data would need to be regex-parsed from markdown.

### 2. Search Radius for Cars.com

The original Cars.com URL had no `maximum_distance` parameter, so it only searched the exact zip code. Our fork adds `maximum_distance` to the URL.

**Why:** Without a radius, results were very sparse — only listings with a dealer address matching the exact zip code.

### 3. All Sources Enabled by Default

The original defaulted to Cars.com only. Our fork enables KBB, Autotrader, and Cars.com by default.

**Why:** KBB and Autotrader have the most complete data (images, prices, deal ratings, mileage). Cars.com is currently blocked by bot detection but is left in as a future improvement.

### 4. Improved Wait Strategies

The original used `domcontentloaded` + a fixed 5-second `setTimeout`. Our fork uses `networkidle2` + `waitForSelector` with a 10-second timeout, waiting specifically for vehicle listing card elements to appear.

**Why:** The fixed timeout was unreliable — on slow connections the page wouldn't have loaded listings yet; on fast connections it wasted time. Waiting for actual card selectors is more robust.

### 5. Image Extraction

Our fork extracts image URLs from KBB and Autotrader listing cards.

**Why:** The original returned no image data. The dashboard displays listing images in the grid view.

### 6. Autotrader URL Fix

The original hardcoded `beverly-hills-ca-{zip}` in the Autotrader URL slug. Our fork replaces this with a proper search URL format using `zip` and `searchRadius` query parameters.

**Why:** The hardcoded slug only worked for one geographic area and produced incorrect results everywhere else.

### 7. Better Autotrader Parsing

Our fork adds a wider price regex, fallback element queries for price and mileage fields, and location extraction from listing cards.

**Why:** Autotrader's DOM structure varies by listing type. The original had brittle single-selector queries that failed silently, producing listings with no price or mileage.

## Setup

```bash
git clone https://github.com/catesandrew/car_deals_search_mcp.git
cd car_deals_search_mcp
npm install
```

No build step is needed — the entry point is `src/server.js` directly.

## Configure in Car Search

Set `CAR_DEALS_MCP_PATH` in your `.env.local` to point to the `src/server.js` file:

```bash
# In car-search/.env.local
CAR_DEALS_MCP_PATH=/absolute/path/to/car_deals_search_mcp/src/server.js
```

Use an absolute path. Relative paths will not work because Next.js and the cron worker may resolve them from different working directories.

Example:

```bash
CAR_DEALS_MCP_PATH=/Users/yourname/projects/car_deals_search_mcp/src/server.js
```

## Testing

1. Start the car-search app: `pnpm dev`
2. Open [http://localhost:3000](http://localhost:3000)
3. Click **Scan Now**
4. Watch the terminal — you should see output like:

```
[MCP] Calling search_car_deals with zip=92646 radius=50
[MCP] KBB: 18 listings
[MCP] Autotrader: 24 listings
[MCP] Total listings: 42
[Scraper] Inserted 38 new, updated 4
```

If you see `spawn ENOENT` or `Error: CAR_DEALS_MCP_PATH not set`, double-check the path in `.env.local`.

If KBB or Autotrader returns 0 listings, the site's DOM structure may have changed. Check the MCP server's Playwright selectors in `src/server.js`.

## Playwright Dependencies

The MCP server uses Playwright internally. If Playwright's browser binaries are not installed, install them:

```bash
cd car_deals_search_mcp
npx playwright install chromium
```
