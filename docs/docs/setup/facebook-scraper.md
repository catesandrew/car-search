---
sidebar_position: 3
---

# Facebook Marketplace Setup (Optional)

The Facebook Marketplace scraper uses Playwright to browse FB Marketplace listings. **This is entirely optional** and carries Terms of Service risk — use a disposable Facebook account.

Facebook scraping is **disabled by default**. You can toggle it on in the Settings page once configured.

## Which Fork to Use

**We use a forked version** with two new scripts added:

| | URL |
|--|-----|
| **Fork (use this)** | https://github.com/catesandrew/Facebook-Marketplace_Scraper |
| Original | https://github.com/kevmaindev/Facebook-Marketplace_Scraper |

## What We Added and Why

### 1. `capture_session.py`

Opens a visible (non-headless) browser so you can log into Facebook manually, solve any CAPTCHAs, then saves the session cookies to disk for reuse by the headless scraper.

**Why:** The original script's automated login was failing due to Facebook's aggressive bot detection. Manual login via a visible browser bypasses this entirely. The saved session is then reused for headless searches without triggering login flows again.

### 2. `search_for_app.py`

A headless CLI wrapper that:

- Accepts command-line arguments: zip code, price range, makes/models list, radius
- Outputs JSON to stdout (instead of writing CSV files) so the dashboard can consume it directly
- Filters to trucks and SUVs only via the `topLevelVehicleType` parameter
- Uses `exact=true` and a configurable search radius
- Extracts listings via stable `a[href*="/marketplace/item/"]` selectors instead of brittle CSS class names that Facebook changes frequently

**Why:** The original script wrote CSV output files and used CSS class-based selectors that break whenever Facebook deploys a new frontend. Our version outputs JSON to stdout for direct consumption by the Node.js scraper and uses attribute-based selectors that survive Facebook redesigns.

## Setup Steps

### 1. Clone the Fork

```bash
git clone https://github.com/catesandrew/Facebook-Marketplace_Scraper.git
cd Facebook-Marketplace_Scraper
```

### 2. Install Python Dependencies

```bash
pip install playwright beautifulsoup4 pandas python-dotenv lxml
```

### 3. Install Playwright's Chromium Browser

The `NODE_OPTIONS=""` prefix is required because Next.js sets `--experimental-strip-types` in `NODE_OPTIONS`, which Playwright's bundled Node binary doesn't support.

```bash
NODE_OPTIONS="" python3 -m playwright install chromium
```

### 4. Capture a Facebook Session

Run the session capture script with your Facebook email:

```bash
NODE_OPTIONS="" python3 capture_session.py your-facebook-email@example.com
```

A visible Chrome window will open. Log in to Facebook manually, solve any CAPTCHA or security check, then come back to your terminal and press **Enter**. The script saves your session cookies to a local file.

:::tip Use a Disposable Account
Create a throwaway Facebook account for this. Do not use your personal account — if Facebook detects scraping activity, the account may be restricted.
:::

### 5. Configure car-search

Set `FB_EMAIL` in your `car-search/.env.local`:

```bash
FB_EMAIL=your-facebook-email@example.com
```

The car-search app passes this to the Python scraper to locate the correct session cookie file.

### 6. Enable in the Dashboard

Go to **Settings** in the dashboard and toggle **Facebook Marketplace** on. The next scheduled scrape (or a manual **Scan Now**) will include Facebook listings.

## Important Notes

### Session Expiry

Facebook session cookies expire after some time (days to weeks). When FB listings stop appearing, re-run `capture_session.py` to refresh the session:

```bash
NODE_OPTIONS="" python3 capture_session.py your-facebook-email@example.com
```

### NODE_OPTIONS Prefix

Always use `NODE_OPTIONS=""` before Python/Playwright commands when running inside a shell that has the Next.js `NODE_OPTIONS` set. Without it, you'll see an error like:

```
error: unknown option '--experimental-strip-types'
```

This is because Next.js injects `--experimental-strip-types` into `NODE_OPTIONS` for TypeScript support, and Playwright's internal Node binary doesn't recognize that flag.

### Listing Deduplication

Facebook listings are deduplicated by their listing URL (with tracking parameters stripped). If the same listing appears across multiple search zips, it's only stored once — `lastSeenAt` is updated on subsequent scrapes.

### ToS Risk

Using automated tools to scrape Facebook Marketplace violates Facebook's Terms of Service. This scraper is provided for personal/educational use. The risk of account suspension is real — use a disposable account.
