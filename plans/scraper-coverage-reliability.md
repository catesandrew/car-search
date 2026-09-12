# Scraper Coverage & Reliability — Implementation Plan (v2)

**Epic:** car-search-79v
**Tasks:** car-search-b2o (multi-zip search), car-search-3r1 (Cars.com bot detection)

**Goal:** Close the gap between what `docs/docs/features/scraping.md` claims the scraper does and what `src/lib/scrapers/mcp-client.ts` actually does, and make an explicit, documented, data-backed call on the dead Cars.com source instead of leaving silent drift.

**Provenance note:** This is a merged v2. Two independent draft→architect→critic review cycles ran against this repo (both escalated to adversarial mode and queried the live `data/car-search.db`, not just source). This document combines both sets of verified findings; see the Changelog for what came from which pass.

---

## Ground Truth (verified against code AND the live DB/environment, not docs)

- `src/lib/scrapers/mcp-client.ts::getSearchZips()` returns `[primaryZip]` only, and is **not exported**. `radiusMiles` is never read by this file. The in-memory cross-zip dedup (`seenTitles`, keyed `year-make-model-price-mileage`) already exists at `mcp-client.ts:159-168` — it's a no-op today only because the zip array has one element.
- **Live `search_config` row:** `zip=92646`, `radius_miles=150`, `makes_models=["Toyota Tacoma","Toyota 4Runner","Toyota Tundra","Ford Mustang"]` (4 vehicles, not the 2 assumed in early drafts). `92648` (Huntington Beach) appears only in docs/seed data — the actual configured zip is `92646`. Any zip-fanout design keyed on an exact-match to a hardcoded `'92648'` string is a dead branch on this deployment.
- `radiusMiles` defaults to **150**, not the ~50mi the docs describe for the 7-zip table. At 150mi, the 7 documented zips (all within ~45mi of each other) are almost fully redundant with each other — sending a wide radius *and* fanning out to 7 zips is 7x the cost for near-zero marginal coverage. These two mechanisms were never meant to combine.
- No MCP tool-argument name for "radius" is confirmed. `mcp-server.md` uses `maximum_distance` (Cars.com URL param), `searchRadius` (Autotrader URL param), and `radius` (a log line) for three different things — none is confirmed to be a `search_car_deals` **tool call** argument. Sending an unrecognized key risks a hard failure of the whole call under a strict schema.
- **Observed run history:** longest completed runs took 473-499s (~8 min) at a **single** zip. Worst-case time for the full documented fan-out is `zips × makesModels × TOOL_TIMEOUT_MS` = up to `7 × 4 × 90s` ≈ **42 minutes** with the live 4-vehicle config — not the ~21 min estimated against an assumed 2-vehicle config. `STALE_RUN_THRESHOLD_MS` (10 min) is duplicated in `runner.ts:9` and hardcoded again in `src/app/api/scrape/route.ts:18`; both are far below this worst case.
- **The cron worker has not produced a real scrape since 2026-05-08.** There is no `dotenv`/`--env-file` loading anywhere in the repo; Next.js loads `.env.local` for the Next process only, but `scripts/worker.ts` is spawned as bare `tsx scripts/worker.ts` and never receives it. So in the worker process, `CAR_DEALS_MCP_PATH` and `FB_SCRIPT_PATH` are both undefined, and `searchCarDeals`/`searchFacebook` warn and return `[]`. Recent `scrape_runs` rows (ids 115-126) all complete in 1-2ms with 0 new/0 updated — a silent no-op, not a working baseline. Every run with real data (up to 8 min, 116 new) came from the Next-hosted `/api/scrape` route months ago. **This blocks the entire epic from having any observable effect** until fixed, independent of anything else in this plan.
- **DB-level dedup does not cover most MCP-sourced listings.** Of 330 live `listings` rows, 228 (44 autotrader + 184 kbb, ~69%) have both `vin` and `external_id` NULL, so they fall into `dedup.ts`'s unconditional `else { insert }` branch — every scrape run that re-sees them inserts a fresh duplicate row instead of updating. The DB already shows duplicate groups with **up to 4 copies** of the same vehicle from different `first_seen_at` timestamps (97 rows share a duplicate URL). The in-memory `seenTitles` set is the *only* dedup protecting these rows, and only within a single run.
- The in-memory dedup key (`year-make-model-price-mileage`) collapses to the same key whenever `price` or `mileage` fails to parse to a number, silently dropping every subsequent distinct listing that shares that degenerate key (confirmed live: multiple null-price/null-mileage 2006 Autotrader Tacomas collapse to one). It also ignores VIN, so a VIN-bearing record can be shadowed by an earlier VIN-less record for the same vehicle.
- `runner.ts`'s success-path update (`runner.ts:113-122`) has **no `status = 'running'` guard**, unlike the failure-path update at `runner.ts:142` (`AND status = 'running'`). Combined with the `/api/scrape` route's independent 10-minute staleness check that can start a second concurrent run, a long-running scrape can have its own row later flipped from `failed` (written by the second run's stale-eviction) back to `completed` by the first run finishing late — corrupting run history and masking the concurrency bug.
- Cars.com: docs (`scraping.md:63-65`, `mcp-server.md:36`, `README.md:9`) already state it's blocked by bot detection — `README.md`'s "(Cars.com planned)" is the one line out of step, implying not-yet-built rather than built-but-disabled. The 7 `source='cars.com'` rows in the live DB are confirmed **seed fixtures** from `scripts/seed.ts` (URLs `cars.com/vehicledetail/1..18`, cities Denver/Seattle/Nashville — not the configured search area), not real scraped duplicates. `listings.source` is already populated correctly per-row by `normalize.ts`, so "is Cars.com producing anything" is answerable today with a zero-migration `SELECT source, COUNT(*), MAX(last_seen_at) FROM listings GROUP BY source` query — no new schema needed.
- This repo has **zero test infrastructure** (no test script, no vitest/jest, no `*.test.*` files); a sibling epic is standing this up. Any step here wanting a unit-tested AC is soft-coupled to that landing first or ships as a documented manual-verification procedure instead.

## Decisions

1. **car-search-b2o: implement the fan-out, but fix the foundation first, and defensively.** Don't gate on an exact-match hardcoded zip (dead on the live config); prepend `config.zip` to the documented 7-zip table instead, deduped. Don't fight the radius/zip-count contradiction — drop "pass `radiusMiles` unconditionally into MCP args," probe the tool schema first and use a small distance value only if the schema supports one. Fix the worker's env-loading gap so the feature is observable at all. Fix the null-collapsing in-memory dedup key and the DB-level keyless-insert gap before multiplying the volume flowing through both. Extract and correctly size the stale-run threshold from the real (4-vehicle) worst case. Add a rollback flag and inter-call pacing.
2. **car-search-3r1: decide now using data that already exists, don't leave it open-ended.** Query `listings` grouped by source to confirm Cars.com's real contribution (expected: 0 genuine rows). Decision: **keep Cars.com wired but treat as effectively disabled** — it already fails cleanly (bounded by the existing timeout/try-catch) and costs one extra failed call per cycle; removing it touches ~11 files including a user-facing filter and orphans the seeded sample rows, which is disproportionate to act on today given it's already documented correctly everywhere except one README line. Fix that one line, add a dated follow-up bead with a pre-registered drop threshold instead of an open-ended wait.

## Implementation Steps

### car-search-b2o — Multi-zip search

**Step 0: Fix worker environment loading (new prerequisite, discovered during this review)**
`scripts/worker.ts` is spawned via bare `tsx scripts/worker.ts` (see `package.json`'s `dev`/`start` scripts) and never loads `.env.local` — only the Next.js process does. As a result `CAR_DEALS_MCP_PATH` and `FB_SCRIPT_PATH` are `undefined` in the worker, and every cron-triggered scrape since 2026-05-08 has silently returned 0 listings in 1-2ms. Add explicit env loading at the top of `scripts/worker.ts` (e.g. `dotenv`/`dotenv-expand` reading `.env.local`, mirroring whatever convention `car-search-qep`'s config work establishes if it lands first). This is not part of the original bug description but is a blocking dependency: none of Steps 1-6 below have any observable effect in production without it.
- Acceptance: with the worker started standalone (`tsx scripts/worker.ts`, not via `next dev`), `process.env.CAR_DEALS_MCP_PATH` is defined and a triggered scrape produces non-zero listings when the MCP server is reachable; `scrape_runs` rows from a worker-triggered cycle show real durations (seconds, not milliseconds) and non-zero counts when data exists to find.
- Depends on: none. Recommend flagging to the orchestrator as a candidate standalone bead if finer granularity is preferred — it is orthogonal to the doc/impl mismatch that b2o was originally filed for, but everything else in this task is unverifiable without it.

**Step 1: Export `getSearchZips` and build the fan-out list from `config.zip`, not a hardcoded match**
In `src/lib/scrapers/mcp-client.ts`, `export` the function. Return `config.zip` first, followed by the documented 7-zip table (92648, 90802, 92708, 92612, 90247, 91101, 92832) with any duplicate of `config.zip` removed (so a `92646` config yields 8 distinct entries deduped correctly, not 7 hardcoded ones ignoring the real config, and not an accidental 8-with-duplicate). This works correctly for the live `92646` config without needing to match `92648` exactly, unlike a hardcoded exact-match gate.
- Acceptance: `getSearchZips('92646')` returns 8 distinct zips with `92646` first; `getSearchZips('92648')` returns exactly the 7 documented zips (no duplicate) with `92648` first; `getSearchZips(null)` returns `[]`. Add a unit test once test infra lands; until then, document manual verification via a one-off script.
- Depends on: none (soft-coupled to test-infra epic for automated verification).

**Step 2: Add a rollback flag and inter-zip pacing**
Add `search_config.zip_fanout_enabled` (boolean, default `true`) so the fan-out can be disabled from Settings without a code revert. Add a short delay (~1-2s) between successive `callSearchTool` invocations in the per-zip loop — rapid sequential calls are the same request pattern documented to have contributed to Cars.com's bot-blocking, and the still-working KBB/Autotrader paths are worth defending cheaply.
- Acceptance: with `zip_fanout_enabled=false`, behavior is unchanged from today (single zip); with it `true` (default), all zips from Step 1 are searched with an observable pacing delay between `[mcp-client] Searching...` log lines.
- Depends on: Step 1.

**Step 3: Probe the MCP tool schema before sending any distance-like argument**
Do not hardcode a `radiusMiles`/`maximum_distance` argument name. Call `client.listTools()` once per scrape cycle, inspect `search_car_deals`'s declared `inputSchema`, and only include a distance argument if the schema advertises one — using a small value (~15-20mi, sized to reduce overlap between adjacent zips in the fan-out table) rather than the 150mi `radiusMiles` config default, since the fan-out itself is the coverage mechanism, not the radius. Log a one-line notice ("no radius arg in tool schema, skipped") when absent; treat that as a safe no-op.
- Acceptance: scrape logs show either "radius arg sent: Xmi" or the skip notice — never a hard failure caused by an unrecognized argument. While introspecting the schema, also check for a `sources`/`sites`-style parameter (relevant to car-search-3r1 — see cross-task note below) and record whether one exists, even if not acted on in this task.
- Depends on: Step 1.

**Step 4: Fix the null-collapsing in-memory dedup key**
In `mcp-client.ts`'s cross-zip dedup (`${year}-${make}-${model}-${price}-${mileage}`), a `null` `price` or `mileage` currently collapses distinct listings into one key, silently dropping all but the first. Prefer `vin` as the key when present; when `price`/`mileage` is null, do not dedupe against other listings on that basis (always include). This bug is confirmed live (multiple null-price/null-mileage Autotrader listings already collapsing) and would fire more often once more zips are searched.
- Acceptance: two distinct listings sharing `year`/`make`/`model` but with `price: null` and/or `mileage: null` both survive the in-memory dedup step (unit test once infra lands; manual verification script until then).
- Depends on: Step 1.

**Step 5: Close the DB-level dedup gap for keyless (no VIN, no external_id) listings**
228 of 330 live rows (mostly KBB/Autotrader) have neither `vin` nor `external_id`, so `dedup.ts` always inserts them fresh — the DB already has duplicate groups up to 4 copies deep. Add `url` as a fallback dedup key in `dedup.ts::upsertListings` (a partial unique index on `url` where `vin` and `external_id` are both null, or a straightforward `WHERE url = ?` existence check before insert in the no-key branch) so re-seeing the same listing across scrape runs updates rather than duplicates. This is a pre-existing bug, not something Steps 1-4 introduce, but shipping more coverage without it makes the duplicate accumulation worse, not better.
- Acceptance: running two scrape cycles that return the same listing (same `url`, no `vin`/`external_id`) results in one row with `updated_count` incremented on the second run, not two rows.
- Depends on: none (independent of Steps 1-4, but should land before or alongside them).

**Step 6: Add the missing `status = 'running'` guard on the success-path update**
`runner.ts`'s completion update (`status: 'completed'`) has no `WHERE status = 'running'` guard, unlike the `finally` block's failure-path update which has one. This allows a late-finishing run to overwrite a row that a concurrent stale-eviction (from `/api/scrape`'s independent 10-minute check) already marked `failed`. Add the same guard to the success-path `.where()` clause.
- Acceptance: given a run whose row was externally marked `failed` while still executing, the run's own completion update does not flip it back to `completed`.
- Depends on: none.

**Step 7: Extract and correctly size the stale-run threshold**
`STALE_RUN_THRESHOLD_MS` (10 min) is independently defined in `runner.ts` and hardcoded again in `src/app/api/scrape/route.ts`. Extract one shared constant. Size it from the real worst case using the **live 4-vehicle config**: `zips.length × makesModels.length × TOOL_TIMEOUT_MS` ≈ `8 × 4 × 90s` ≈ 48 min (using Step 1's 8-zip output for the live config) plus the pacing delay from Step 2 — not the 2-vehicle/21-minute estimate from earlier drafts. Prefer computing this dynamically from actual config lengths at call time over a fixed comment-derived constant, so it stays correct if the user adds a 5th vehicle later.
- Acceptance: `grep -rn STALE_RUN_THRESHOLD_MS src/` shows one definition, imported everywhere used; the value (or its computation) is derived from actual `zips.length × makesModels.length × TOOL_TIMEOUT_MS`, not a hardcoded guess, and exceeds the real worst case.
- Depends on: Steps 1, 2 (need the real zip count and pacing delay to compute the worst case).

**Step 8: Update docs to match reality, across all affected files**
Once Steps 0-7 ship, fix: (a) the "Multi-Zip Search" section in `scraping.md` to describe the config.zip-first fan-out (not a fixed 7-zip list); (b) the index-name mismatch `idx_listings_source_external_id_unique` → `idx_listings_source_extid` in **both** `scraping.md` and `docs/docs/features/database.md`; (c) `scraping.md`'s "To change the zip code coverage, edit `src/lib/scrapers/runner.ts`" → correct file is `mcp-client.ts`; (d) `mcp-server.md`'s worked example log (`zip=92646 radius=50`) to reflect real current behavior (fan-out + schema-probed radius, not a single fixed radius); (e) spot-check `docs/docs/intro.md`, `docs/docs/features/api.md`, and `docs/docs/setup/installation.md` for any stale zip/index/radius claims picked up incidentally.
- Acceptance: `grep -rn idx_listings_source_external_id_unique docs/docs/` returns nothing; `grep -rn "edit.*runner.ts" docs/docs/features/scraping.md` returns nothing; the mcp-server.md example and the Multi-Zip Search section both reflect the shipped behavior.
- Depends on: Steps 1-7 (docs must describe the code as actually shipped).

**Out of Scope (this task):** real geocoding/distance-based zip discovery beyond the hardcoded SoCal table; changes to the external `catesandrew/car_deals_search_mcp` repo; a full mutex/heartbeat redesign beyond the two targeted fixes in Steps 6-7 (a proper heartbeat-based liveness check is a reasonable future improvement but a larger change than this bug warrants).

### car-search-3r1 — Cars.com bot detection

**Step 1: Confirm the decision using data that already exists (no schema change)**
Run `SELECT source, COUNT(*) AS cnt, MAX(last_seen_at) AS last_seen FROM listings GROUP BY source;` against `data/car-search.db`. Confirmed result as of this review: the only `source='cars.com'` rows are `scripts/seed.ts` fixtures (non-search-area cities, sequential fake URLs), not real scraper output — supporting "0 real listings" without needing to wait further. Record the result and decision on the bead: **keep Cars.com wired but treat as effectively disabled** — it fails cleanly within the existing 90s timeout/try-catch per make/model/zip, and removing it touches ~11 files (including the user-facing source filter in `listing-filters.tsx` and `seed.ts`) for a source that's already correctly documented as broken everywhere except one line.
- Acceptance: the query result is recorded in the bead notes; the decision is recorded with that evidence — this step alone can close the bead's investigation phase without an open-ended wait.
- Depends on: none.

**Step 2: Fix the one inconsistent line**
`README.md` says "(Cars.com planned)," implying not-yet-built; every other doc correctly says "integrated but blocked by bot detection." Change the README line to match: "(Cars.com integration exists but is disabled — blocked by bot detection, see docs)."
- Acceptance: `grep -rn "Cars.com planned" README.md` returns nothing; README's Cars.com language matches `scraping.md`/`mcp-server.md` in substance.
- Depends on: Step 1.

**Step 3: File a dated follow-up bead with a pre-registered drop threshold**
Create a deferred bead (e.g. ~90 days out) titled "Revisit Cars.com keep/drop decision," with the exact falsifiable check written into it now: *"If `SELECT COUNT(*) FROM listings WHERE source='cars.com' AND first_seen_at > '<this review's date>'` is still 0 at revisit, remove Cars.com from `listing-filters.tsx`, `seed.ts`, `README.md`, and the docs' Cars.com sections in one pass; otherwise close as resolved."* This avoids an open-ended "wait and see."
- Acceptance: the follow-up bead exists, is deferred to a concrete date, and contains the exact query/threshold.
- Depends on: Step 1.

**Step 4 (informational, not blocking): note the `sources` MCP param possibility**
If b2o's Step 3 schema probe (`client.listTools()`) turns up a `sources`/`sites`-style parameter on `search_car_deals`, that would let car-search-search request only `['kbb','autotrader']` server-side — strictly better than any client-side string filter and would also reclaim the per-call time currently spent on Cars.com's failed attempts. Not required to close this bead; record the finding on the follow-up bead from Step 3 if discovered.
- Acceptance: n/a — informational; captured only if b2o's Step 3 happens to reveal it.
- Depends on: b2o Step 3 (informational only, not a blocking dependency).

## Cross-Task Dependency

**Independent for the core work.** b2o and 3r1 touch disjoint files for their required steps (b2o: `mcp-client.ts`, `dedup.ts`, `runner.ts`, `api/scrape/route.ts`, `scripts/worker.ts`, docs; 3r1: `README.md`, a bead, no code). They can ship in either order or in parallel. The only link is informational and non-blocking: 3r1's Step 4 benefits from b2o's Step 3 (MCP tool schema probe) if that probe happens to reveal a `sources` parameter — but 3r1 does not need to wait for b2o to close.

## Risks

| Risk | Mitigation |
|---|---|
| Worker has been silently producing no-op scrapes for months; nothing else in this plan matters until fixed | Step 0, called out as a blocking prerequisite even though it's outside the original bug description |
| 7-8 zip fan-out at the live 4-vehicle config takes up to ~48 min — far longer than earlier estimates | Worst-case math redone against the real config (Step 7); rollback flag (Step 2) if it proves too slow or triggers blocking |
| Unconfirmed MCP tool argument name for radius could hard-fail every call | Step 3's schema-introspection-first approach never assumes a param name |
| Null-collapse in-memory dedup key gets worse at higher scrape volume | Step 4 fixes the key logic before the zip list (Step 1) multiplies volume through it |
| 69% of live listings have no DB-level dedup key; duplicates already exist (up to 4 copies) | Step 5 adds `url` as a fallback key — independent of and lower-risk than the fan-out itself |
| Concurrent-run row corruption via the missing `status='running'` guard | Step 6, small and independent |
| `STALE_RUN_THRESHOLD_MS` drift between two files, sized against the wrong (2-vehicle) assumption | Step 7 extracts one constant and sizes it from the live config |
| Removing the Cars.com UI/seed footprint touches ~11 files for a source already correctly documented as broken | Deferred to a dated, threshold-based follow-up bead (3r1 Step 3) rather than acted on now |

## Out of Scope

- Real geocoding/distance-based zip discovery.
- Any changes to the external `catesandrew/car_deals_search_mcp` repo.
- A full heartbeat-based mutex redesign (Steps 6-7 are targeted fixes, not a rewrite).
- Standing up test infrastructure (soft-coupled to the sibling `car-search-qep` epic).

---

## Revision Changelog

### v1 → v2 (first review pass: Architect + Critic reviewing the original single-zip-hardcode / drop-Cars.com draft)

1. Dropped "pass `radiusMiles` unconditionally into MCP args" — radius (150 default) and the 7-zip table (~50mi coverage) contradict each other, and no MCP tool-arg name was confirmed. Replaced with schema-introspection-first (Step 3).
2. Exported `getSearchZips` so it's testable at all.
3. Added `zip_fanout_enabled` rollback flag and inter-zip pacing (Step 2) — no rollback path existed before, and no defense against the same rapid-call pattern documented to have contributed to Cars.com's bot-block.
4. Added a dedicated step to fix the null-collapsing in-memory dedup key (Step 4).
5. Extracted and resized `STALE_RUN_THRESHOLD_MS` (Step 7) instead of leaving it as an unverified assumption.
6. Replaced a proposed new `source_breakdown` schema/column with a zero-migration `GROUP BY listings.source` query (3r1 Step 1) — the data already exists per-listing.
7. Replaced "wait 2 weeks then decide" for Cars.com with decide-now via existing data plus a dated, threshold-based follow-up bead (3r1 Steps 1-3).
8. Widened the doc-fix step to cover `database.md`'s index-name mismatch and the wrong "edit runner.ts" instruction, not just one file.
9. Scoped the Cars.com "drop" alternative precisely (11 files enumerated) rather than an open "strip references" instruction, and made it the deferred (not default) path.

### v2 → v2 consolidated (second, independent review pass against the same draft, escalated to adversarial mode, queried the live DB and environment directly)

10. **Added Step 0 (worker env-loading fix)** — the cron worker has not produced a real scrape since 2026-05-08 because `.env.local` is never loaded for the standalone `tsx scripts/worker.ts` process. Without this, every other fix in this plan is unobservable in production. This is the single highest-priority finding from either review pass.
11. **Fixed the zip-fanout key to be config-driven, not hardcoded-exact-match** — the live `search_config.zip` is `92646`, not the `92648` earlier drafts assumed as the gate condition. Step 1 now always prepends `config.zip` and dedupes against the fixed 7-zip table, so it works correctly regardless of which zip is configured.
12. **Corrected the worst-case timing math to the live 4-vehicle config** (Tacoma, 4Runner, Tundra, Mustang), not an assumed 2-vehicle config — worst case is ~42-48 minutes, not ~21. Step 7's threshold sizing was updated accordingly, and changed to prefer a dynamic computation over a fixed constant.
13. **Added Step 5 (DB-level dedup gap for keyless listings)** — 69% of live rows have neither VIN nor `external_id` and always insert fresh on re-scrape; the DB already shows duplicate groups up to 4 copies deep. This is a pre-existing bug that the fan-out would make worse, not better, if left unfixed.
14. **Added Step 6 (missing `status='running'` guard on the success-path update)** — a small, independent fix for a real concurrent-run row-corruption bug found by tracing `runner.ts`'s update logic against the failure-path's existing guard.
15. **Widened the doc sweep** (Step 8) to spot-check `intro.md`, `api.md`, and `installation.md` in addition to the two files already covered, since both review passes found stray Cars.com/index/zip claims beyond `scraping.md`/`database.md`.
16. **Added an informational (non-blocking) cross-reference** between b2o's MCP tool-schema probe and 3r1's Cars.com decision (b2o Step 3 / 3r1 Step 4) — if the schema exposes a `sources` parameter, server-side exclusion would be strictly better than any client-side filter, but this does not gate either task's completion.
