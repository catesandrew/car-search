# Data Portability — Implementation Plan (v2)

**Epic:** car-search-6ju "Epic: Data Portability" (backlog, out of scope in v1 build)

**Goal:** Add two independent, opt-in capabilities that were explicitly deferred from the v1 truck-search dashboard: (1) CSV/JSON export of the listings table, and (2) a research spike (with conditional follow-up) into the previously-rejected "rebrowser static dataset" as an additional listing source.

---

## Requirements Summary

1. **CSV/JSON export** (car-search-1zp, P3): Users can download the current filtered listings view as CSV or JSON from the `/listings` page, or hit a dedicated API endpoint directly. Must respect the same filter params as `GET /api/listings` and must not require re-implementing filter logic. Scope is the `listings` table only (per the bead's own wording); `notes`/`price_history`/`search_config` export is explicitly deferred — see Out of Scope.
2. **Rebrowser dataset spike** (car-search-f4j, P4): v1 rejected a "rebrowser static dataset" as a scraping source. No confirmed dataset source, format, or access method exists in this repo. Treat as a research spike, not a build task — and see the reframing below: independent review from two reviewers concluded "rebrowser" most likely does **not** refer to a dataset at all.
3. These two tasks are **independent** — no shared code, no ordering dependency between them.

---

## Current State (grounding)

- `GET /api/listings` (`src/app/api/listings/route.ts`) builds a `conditions[]` array from query params and returns `{ data, total, page, limit }`. Prices stored in **cents**. Sort options (`sortColumn` map, lines 41-46) are **not unique** — `first_seen_at` alone has 124 distinct values across 330 current rows (largest tie group 13); `deal_score` has 28 distinct values and is nullable.
- `src/lib/db/index.ts` uses `better-sqlite3` — **fully synchronous**. There is no async streaming benefit to be had from batching a query into a `ReadableStream` in this process model.
- `src/lib/db/schema.ts` / `src/lib/types.ts`: `listings` columns as camelCase `Listing` interface; `price: number | null` (cents, nullable — ~20 of 330 current rows have `price IS NULL`).
- `src/components/listing-filters.tsx` owns `ListingFilters`; `src/app/listings/page.tsx`'s `filtersToParams()` converts UI filters (dollars) → API params (cents) and renders the toolbar row — natural home for an Export control. `filtersToParams` is currently module-local/unexported.
- `scripts/worker.ts` (cron scraper) runs as a **separate process** on a separate DB connection (`package.json`'s `concurrently "next start" "tsx scripts/worker.ts"`), writing new rows continuously. Any export mechanism that issues multiple separate SELECT statements is not snapshot-consistent against this writer.
- `.omc/plans/truck-search-dashboard.md` "Out of Scope (Future)" lists both deferred items this plan follows up on. Its "Risks" section (`:533`) separately flags: *"Car Deals MCP uses Puppeteer — may fail with bot detection"* — relevant to Task 2, below.
- No "rebrowser dataset" source, URL, schema, or credential exists anywhere in this repo.

---

## Independent Review Findings (incorporated below)

An architect review and a critic review were run against the v1 draft of this plan. Both independently flagged the same root issue in Task 1's original design (a `LIMIT/OFFSET` batch-streaming export loop is **unsound**: SQLite gives no stable row ordering across separate statements when the sort key has ties, which it does — batches would silently duplicate and drop rows, worse under concurrent writes from the cron worker but present even without them) and the same root issue in Task 2 (the spike question presupposes "rebrowser" means a dataset, when the more likely referent — `rebrowser-patches`, an anti-bot-detection Puppeteer patch set — is not a dataset at all, and is directly relevant to this project's known Puppeteer bot-detection risk). Both are corrected in this v2. Additional accepted findings: null-price CSV corruption, CSV formula-injection risk, contradictory `columns=` semantics (resolved by cutting the param), and missing falsifiable spike criteria.

---

## Task 1: CSV/JSON Data Export (car-search-1zp)

### Design (v2)

- **New endpoint:** `GET /api/listings/export?format=csv|json&<same filter params as /api/listings>`. `format` defaults to `csv`; an unrecognized `format` value returns `400`. No `page`/`limit` accepted — a hand-crafted URL that includes them gets them ignored (the export route never reads them).
- **Single buffered query, not batched/streamed.** At current scale (330 rows / ~28 KB) and given `better-sqlite3`'s synchronous driver, a `LIMIT/OFFSET` batch loop delivers no real memory or concurrency benefit and introduces a correctness bug (unstable ordering across separate statements). Do one `.all()` call inside a single implicit transaction, build the full CSV string or JSON array in memory, and return it as one `Response`. As a cheap safety valve against pathological future growth: run `count()` first, and if it exceeds 50,000 rows, return `400` asking the user to narrow filters, rather than ever looping/paginating internally.
- **Shared query builder:** Extract filter + sort logic out of `src/app/api/listings/route.ts` into `src/lib/listings-query.ts` as **one** function, `buildListingsQuery(searchParams: URLSearchParams): { where: SQL | undefined; orderBy: SQL[] }`, parsing params exactly once (not two functions independently re-parsing the same params, which can drift from each other). `orderBy` always ends with `asc(listings.id)` as a tiebreaker — this is a deliberate, documented behavior change (not "no behavior change") that fixes a latent instability in `/api/listings`'s own pagination as a side effect. Explicitly preserve the existing `isDismissed` quirk: `isDismissed=true` means "show both dismissed and non-dismissed," not "show only dismissed" (matches current `route.ts:19,37` behavior) — call this out by name in code comments so a future refactor doesn't "fix" it and break filter parity.
- **Export defaults match `/api/listings`:** dismissed listings excluded unless `isDismissed=true` is passed, same as the list view — for consistency, not because export "should" default to everything.
- **No `columns=` parameter.** The v1 draft's column-selection param had no consumer (no UI column picker planned) and produced a genuine contract contradiction between CSV's human-oriented default columns and JSON's full-`Listing`-shape contract. Cut entirely for v1; export the full default column set always. Add a column picker back only if/when a real need appears (noted in Out of Scope).
- **Column sets:**
  - **JSON** = the full `Listing` shape, raw cents pricing, unmodified field names — a faithful mirror of what `/api/listings` returns per-row, for programmatic consumption.
  - **CSV** = a fixed human-oriented column set (excludes `imageUrl`; **includes `url`** so exported listings stay clickable — the v1 draft wrongly excluded `url` as "internal"): `id, vin, source, url, year, make, model, trim, price_usd, mileage, location, dealerName, dealerType, dealScore, viewStatus, isFavorited, isDismissed, firstSeenAt`.
- **Price conversion (CSV only):** `price` (cents) → `price_usd` column, dollars, **null-guarded**: `price == null ? '' : (price / 100).toFixed(2)`. The header is renamed to `price_usd` specifically so CSV and JSON never both use the bare name `price` for different units. JSON keeps raw cents under `price`, matching `/api/listings`.
- **Boolean rendering (CSV):** literal `true`/`false` strings. **Dates:** raw ISO-8601 strings, unmodified, in both formats (no reformatting) — documented explicitly so it isn't re-litigated during implementation.
- **CSV serialization + injection safety:** `src/lib/csv.ts` — `toCsvValue()` escapes `,`/`"`/newlines, renders `null`/`undefined` as an empty string, and additionally **guards against CSV formula injection**: if a stringified value begins with `= + - @` or a tab/CR, prefix it with a single quote before quoting, since `dealerName`/`location`/`make`/`model`/`trim` are scraped third-party text and the plan's own stated use case is opening the file in Excel/Sheets. Emit a leading UTF-8 BOM (`﻿`) on the CSV body so accented characters in `location`/`dealerName` don't mojibake in Excel on Windows. `rowsToCsv()` still emits a header row when the result set is empty (zero-row export = header-only CSV, not a zero-byte file); empty JSON export = `[]`.
- **Headers:** `Content-Disposition: attachment; filename="listings-export-<YYYY-MM-DD>.csv"` (date-only — a full ISO timestamp contains colons, illegal in Windows filenames) and `.json` variant; `Content-Type: text/csv; charset=utf-8` or `application/json`.
- **UI:** Add an "Export" control (shadcn `dropdown-menu`) to the toolbar in `src/app/listings/page.tsx`, next to "Mark page as seen." Label it **"Export all N results"** (the page already has `total` in scope) to avoid reading as "export this page." On click: `fetch()` the export URL (built from `filtersToParams(filters)` minus `page`/`limit`, plus `format=`), show a toast (`sonner`, already a dependency) on non-2xx response, otherwise convert the response to a `Blob` and trigger the download via an object URL — chosen over bare `window.location.href` navigation specifically so a server error produces visible user feedback instead of a silent no-op or a downloaded error page. Revoke the object URL after triggering the download. Export `filtersToParams` from `page.tsx` if the button is factored into its own component.

### Implementation Steps

1. **Extract shared listings query builder**
   Create `src/lib/listings-query.ts` exporting `buildListingsQuery(searchParams: URLSearchParams): { where: SQL | undefined; orderBy: SQL[] }`, moving the `conditions[]` and `sortColumn` logic out of `src/app/api/listings/route.ts` in one pass, and appending `asc(listings.id)` to `orderBy` as a stable tiebreaker. Update `route.ts` to use it.
   - Acceptance criteria:
     - `src/lib/listings-query.ts` exports one function covering both filtering and sorting; preserves the `isDismissed=true` "show both" semantics with an explanatory comment.
     - `GET /api/listings` returns the same rows as before for a fixed set of test query strings, now additionally stably ordered by `id` on ties (documented as an intentional change, not a regression).
     - Verification: `curl -s 'localhost:3000/api/listings?source=cars.com&priceMax=1500000&limit=100' | jq -r '.data[].id' | sort` produces the same ID set before/after the refactor.
   - Dependency: none.

2. **Add CSV serialization utility with injection guarding**
   Create `src/lib/csv.ts`: `toCsvValue(value: unknown): string` (empty string for null/undefined; quotes/escapes `,`/`"`/newlines; prefixes values starting with `= + - @`/tab/CR with `'` before quoting) and `rowsToCsv(rows, columns): string` (header row always emitted, even for zero rows; `\r\n` line endings; leading `﻿` BOM).
   - Acceptance criteria:
     - A value containing a comma, a quote, and a value starting with `=SUM(1+1)` each round-trip safely (manual verification via a spreadsheet app import, since no test runner exists in this project yet — see note below).
     - Zero-row input still produces a header row, not an empty file.
   - Dependency: none.
   - Note: this project has no test framework configured (`package.json` has no `test` script). If/when the separate Quality & CI Foundation work lands a test runner, add `csv.test.ts` covering these cases; until then, verification is manual per the criteria above.

3. **Build `GET /api/listings/export` route**
   New `src/app/api/listings/export/route.ts`: parse `format` (default `csv`, `400` on unrecognized value), call `buildListingsQuery` from Step 1, run `count()` then (if ≤ 50,000) a single `.all()` with the shared `where`/`orderBy`, convert `price`→`price_usd` (null-guarded) and select the fixed CSV column set for CSV, or return the full `Listing[]` shape for JSON. Set `Content-Disposition`/`Content-Type` per Design.
   - Acceptance criteria:
     - `GET /api/listings/export?format=csv` returns a BOM-prefixed CSV with a header row and one row per listing; a listing with `price IS NULL` exports an empty `price_usd` cell, not `0.00`.
     - `GET /api/listings/export?format=json` returns the full `Listing[]` shape with raw cents pricing.
     - Filter parity: the same filters passed to `/api/listings` (paginated) and `/api/listings/export` (unpaginated) yield the same ID set — verified via `curl ... /api/listings?... | jq '.data[].id' | sort` vs `curl ... /api/listings/export?format=json&...| jq '.[].id' | sort` and `diff`.
     - `format=xml` (or any unrecognized value) returns `400`.
     - No writes occur: `scrape_runs` and `listings` row counts are identical before and after an export call.
   - Dependency: "Extract shared listings query builder", "Add CSV serialization utility with injection guarding".

4. **Wire an Export control into the listings page**
   Add a shadcn `dropdown-menu` "Export" control to the toolbar in `src/app/listings/page.tsx`, labeled "Export all N results" (using the already-in-scope `total`). On selection, `fetch()` `/api/listings/export?format=csv|json&...` built from `filtersToParams(filters)` (minus `page`/`limit`); on non-2xx, show a `sonner` error toast; on success, download via a `Blob`/object-URL, then revoke the URL.
   - Acceptance criteria:
     - Clicking "Export as CSV" with active filters downloads a CSV containing only matching listings.
     - A simulated server error (e.g. temporarily throwing in the route) surfaces a visible toast rather than a silent failure or a downloaded error page.
     - Button is visible in both grid and table view modes (lives in the shared toolbar).
   - Dependency: "Build `GET /api/listings/export` route".

**Independent of Task 2.**

---

## Task 2: Rebrowser — Referent Research Spike (car-search-f4j)

### Framing (revised)

The only trace of "rebrowser" in this project is one line in `truck-search-dashboard.md`'s Out of Scope section: *"Rebrowser dataset integration (static data, less useful than live scraping)."* The v1 draft of this plan took "dataset" at face value and scoped the spike around confirming/rejecting a static listings dataset. Independent review (architect + critic, run separately, same conclusion) flagged that "rebrowser" is the name of a well-known **anti-bot-detection Puppeteer patch set** (`rebrowser-patches` / `rebrowser-puppeteer`), not a dataset — and that this project's scraper is Puppeteer-based via the Car Deals Search MCP, with bot detection already logged as its top operational risk (`truck-search-dashboard.md:533`; see also the open scraper-reliability issue for Cars.com being blocked by bot detection). If that's what the original note meant, this task isn't a data-source question at all.

### Implementation Steps

1. **Resolve what "rebrowser" referred to (ask before researching)**
   Before spending research time, ask the user directly what they meant by "rebrowser" when writing the original Out of Scope line — they wrote it and may simply remember. If unavailable/unrecalled, investigate both branches: (a) `rebrowser-patches`/anti-CDP-detection tooling for Puppeteer — check current maintenance status, compatibility with this project's MCP-based scraper, and whether it would help with known bot-detection failures; (b) a static listings dataset — check whether one exists, is current, accessible, and its licensing. Produce a short written recommendation.
   - Acceptance criteria (falsifiable, timeboxed):
     - Timeboxed to 90 minutes; write up whatever is found at that point regardless of completeness.
     - States explicitly which branch (a, b, both, or neither) the evidence points to.
     - If branch (a): recommendation is either "pursue as a scraper-reliability fix" or "not worth pursuing," with a one-line reason — this is not a Data Portability task if so, and should be re-filed rather than built here.
     - If branch (b): each of the following is answered yes/no, not descriptively — "updated within the last 90 days", "usable at $0 or negligible cost for personal use", "ToS permits personal, non-redistributive use" (hard veto — a "yes" on coverage/currency does not override a "no" here), "covers at least one source not already covered by cars.com/autotrader/kbb/facebook".
     - No code is written in this step.
   - Dependency: none.

2. **Conditional integration (only if Step 1's branch-(b) gate is all "yes")**
   If and only if Step 1 concludes a static dataset exists, is current, ToS-permitted, and adds real coverage: design and build a new scraper/normalizer following the existing `src/lib/scrapers/normalize.ts` → `src/lib/scrapers/dedup.ts` pattern, gated behind a new `search_config` flag mirroring `fb_enabled` (opt-in, default off). If Step 1 instead points to branch (a) (anti-detection tooling), this step does not apply as written — close `car-search-f4j` with a pointer to the spike findings and, if warranted, treat the anti-detection fix as separate scraper-reliability follow-up work rather than continuing under Data Portability. Concrete table/column mapping and fetch mechanism are deferred to whichever follow-up bead is actually opened, since they cannot be specified before Step 1 resolves.
   - Acceptance criteria:
     - Only proceeds on an unambiguous "go" per Step 1's binary gate.
     - On "no-go" (either branch, or a "no" on any gate criterion including ToS): closed as won't-do with a one-line pointer to the findings.
     - If pursued: integrates through the existing `normalize.ts` → `dedup.ts` → `listings` pipeline; feature flag defaults off.
   - Dependency: "Resolve what 'rebrowser' referred to (ask before researching)".

**Independent of Task 1.**

---

## Cross-Task Notes

- No shared files or schema between the two tasks; Task 1 is fully specified and buildable now, Task 2's second step is conditional and may resolve to no engineering work at all — don't pre-size it as guaranteed effort.
- Minor, non-blocking coupling: if Task 2 ever adds a new `listings` column, Task 1's hardcoded CSV column list won't pick it up automatically — a one-line note, not a real dependency.
- Task 1 satisfies car-search-1zp's stated scope (listings table export) but not the full spirit of the "Data Portability" epic name — `notes`, `price_history`, and `search_config` (the genuinely irreplaceable, non-re-scrapable data) remain unexported. This is a deliberate v1 scope cut, not an oversight; flagged in Out of Scope so the epic isn't considered fully "done" once car-search-1zp closes.

---

## Out of Scope (still, for this plan)

- Export of `notes`, `price_history`, or `search_config` tables (see Cross-Task Notes — worth its own follow-up bead if wanted).
- Column selection UI / `columns=` query param (cut from v1 design; add back only with a real consumer).
- Scheduled/automatic recurring exports.
- Export formats beyond CSV/JSON (XLSX, PDF).
- Import (re-ingesting an exported file back into the DB).
- Any concrete rebrowser integration code prior to the Task 2 spike's findings.
