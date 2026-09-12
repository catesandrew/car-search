# Quality & CI Foundation — Implementation Plan (v3)

> v3 revision note: v2 folded in an architect review (build breaks due to static
> prerendering of DB-touching API routes; test-DDL drift risk; unnecessary
> `vi.mock` in favor of an injectable DB path; false step-ordering dependency).
> A parallel critic review — requested at the same time as the architect, but
> which took ~71 minutes to return (vs. the architect's ~13) — has now landed
> and empirically verified/extended those findings by actually running
> `pnpm install && pnpm build` in a scratch git worktree. Its most important
> correction: **the build fails on a different, earlier root cause than the
> architect identified** (a TypeScript project-config leak into the separate
> `docs/` Docusaurus workspace, not the API-route prerendering issue — both are
> real and both block the build, but the tsconfig leak fails first). The critic
> also found several live production bugs the test-writing task will otherwise
> silently encode as "correct." v3 addresses all of it. v2's synthesis (from the
> architect alone) was already reported to the team lead before the critic
> returned; this v3 supersedes it.

## Goal

Close two gaps in the car-search repo: (1) zero automated test coverage for the
files with the most branching logic — `src/lib/scoring.ts` and
`src/lib/scrapers/{dedup,normalize}.ts` — and (2) no CI workflow that runs lint,
build, or tests on push/PR. This plan stands up a vitest test suite, fixes the
(now doubly-confirmed) pre-existing bugs that make `pnpm build` fail in CI, and
wires a GitHub Actions workflow that runs `pnpm lint`, `pnpm test`, and
`pnpm build` on push/PR — while explicitly *not* silently fixing unrelated
production logic bugs discovered along the way (see "Bugs discovered" below;
those are flagged for separate follow-up beads, not fixed inside a testing
chore).

## Current-state findings (grounding)

- `package.json` has **no test runner at all** — no `vitest`, no `test` script,
  no vitest config. Must be added, not just used.
- `eslint.config.mjs` exists (flat config). `pnpm lint` runs bare `eslint` with
  **no `--max-warnings` flag** — lint warnings currently exit 0, so a naive
  `pnpm lint` CI step would not actually gate on lint warnings.
- `pnpm-lock.yaml` exists at repo root. `docs/` has its **own separate**
  `pnpm-lock.yaml` and its own dependency set (Docusaurus) — this separation is
  the root cause of the build failure below. No `.nvmrc`/`packageManager`
  field; `deploy-docs.yml` is the only existing CI convention (`ubuntu-latest`,
  `pnpm/action-setup@v4` v10, `actions/setup-node@v4` node 20 `cache: pnpm`,
  `actions/checkout@v4`, a `concurrency` group).
- **`pnpm build` fails on a clean checkout today — verified empirically, not
  theoretically.** Root tsconfig.json's `include: ["**/*.ts", ...]` /
  `exclude: ["node_modules"]` sweeps `docs/**` into the Next.js TypeScript
  program. `docs/` deps (e.g. `prism-react-renderer`) come from `docs/pnpm-lock.yaml`,
  which a root `pnpm install --frozen-lockfile` never installs. Result on a
  fresh worktree: `docs/docusaurus.config.ts:1:37 Type error: Cannot find
  module 'prism-react-renderer'`, `next build` exits 1. **This fails before
  Next even gets to prerendering pages** — it is the first blocker, not a
  secondary one.
- **Second, independent build blocker (still real, still needed):**
  `src/app/api/{stats,config,scrape/status}/route.ts` export undecorated
  `GET()` handlers that query the DB. Once the tsconfig leak above is fixed,
  Next will attempt to statically prerender these routes against a DB that (on
  a clean CI checkout) has no schema yet, and fail with e.g. `no such table:
  listings`. Both fixes are required for `pnpm build` to pass in CI; neither
  alone is sufficient.
- Vitest itself introduces a *third*, related risk: if `vitest.config.ts` sets
  `test: { globals: true }` without adding `"types": ["vitest/globals"]` to
  `tsconfig.json`, new `*.test.ts` files (also swept into the same TS program
  via `**/*.ts`) will fail type-checking during `pnpm build` with `Cannot find
  name 'describe'` etc. Simplest fix: don't use vitest's global mode — use
  explicit `import { describe, it, expect, vi, beforeEach } from 'vitest'` in
  every test file. No tsconfig change needed for this one.
- `src/lib/scoring.ts`: `computeDealScore`/`findComps`/`recomputeAllScores` all
  take `database` as an **injectable parameter already** — pass a real
  `:memory:` instance, no mocking needed.
- `src/lib/scrapers/dedup.ts`'s `upsertListings()` imports the `db` singleton
  from `src/lib/db/index.ts` directly. Both independent reviewers converged on
  the same fix: make `DB_PATH` env-overridable
  (`process.env.CAR_SEARCH_DB_PATH ?? path.join(...)`) so tests point the real
  singleton at `:memory:` — no `vi.mock` (which the critic additionally flagged
  as written-wrong in v1: mock paths resolve relative to the *test file*, the
  mock factory needs `vi.hoisted()`, and one shared mocked module means
  ~9 dedup test cases would share state and become order-dependent).
- `upsertListings`'s own doc comment ("Uses synchronous better-sqlite3
  transactions") is **inaccurate** — the function is `async` with zero
  `await` and never calls a drizzle/better-sqlite3 transaction wrapper. The
  batch is not atomic. Not something to fix as part of a testing task, but
  tests should document the actual (non-atomic, loop-continues-on-error)
  behavior rather than the behavior the comment implies.
- `src/lib/db/schema.ts`'s partial unique indexes and default `search_config`
  seed live only in `src/lib/db/migrate.ts::runCustomMigrations()`, hardcoded
  to open its own file-path connection. No committed `drizzle/migrations`
  folder exists (schema is applied via `drizzle-kit push`). Refactoring
  `runCustomMigrations()` to accept an optional already-open `Database` avoids
  both hand-copying its SQL into a test fixture (drift risk) and needing a
  second migration path.
- `src/lib/scrapers/normalize.ts` is pure functions, no DB dependency. Only
  `normalizeMcpListing` is exported.

## Bugs discovered during planning (out of scope to fix here — flag as separate follow-up beads)

These are real production-logic bugs the critic found while stress-testing the
plan. **This task is "add tests," not "fix scoring/dedup logic"** — silently
changing behavior here would be undisclosed scope creep. The recommended
approach: tests pin the *actual current* behavior (with a comment referencing
the bug), and each item below becomes a candidate for its own follow-up bead
that the team lead/user can prioritize deliberately.

1. **Dead branch in `computeDealScore`**: the miles-per-year `else if` chain
   checks `> 15000` (-0.25) before `> 20000` (-0.75). Any `milesPerYear > 20000`
   satisfies `> 15000` first, so the `-0.75` branch is **unreachable**. Likely
   the two checks were meant to be ordered the other way around.
2. **`findComps` doesn't exclude the listing itself** from its own comp set.
   `recomputeAllScores` calls `computeDealScore` (and thus `findComps`) for
   every row against the *same table it's a member of*, so a listing always
   counts itself as one of its own market comps.
3. **Silent data loss in `upsertListings`**: a payload with a *new* VIN that
   happens to match an *existing* row's `(source, externalId)` takes the
   VIN-not-found branch and attempts an insert, which then violates the
   `idx_listings_source_extid` partial unique index. The violation is caught by
   the generic `try/catch` and pushed into `errors[]` — the listing update is
   silently dropped with no update to the existing row.
4. **Stale `dealScore` after price change**: both update branches (VIN and
   `source`+`externalId`) write the new `price` and a `price_history` row but
   never recompute `dealScore`. A listing's score is stale until the next full
   `recomputeAllScores()` run.
5. **3VL edge case in `recomputeAllScores`**: `not(eq(listings.isDismissed,
   true))` uses SQL three-valued logic — a row where `isDismissed IS NULL`
   (only reachable by bypassing the schema's `false` default via raw SQL)
   would be silently excluded from recomputation forever.
6. **Surprising numeric coercion** in `normalize.ts`: `parseIntOrNull("120k")`
   → `120` (parseInt stops at the first non-digit); a title-like string passed
   to `parsePriceToCents` (e.g. `"2018 Toyota Tacoma"`) would parse the leading
   digits as a dollar amount. Narrow real-world exposure, but worth a
   documenting test rather than silent surprise later.

## Task 656: Add unit tests for scoring and dedup/normalize logic

### Step 1: Add vitest and wire the `test` script — depends on: none
Add `vitest` devDep, `"test": "vitest run --passWithNoTests"` +
`"test:watch": "vitest"` scripts, `vitest.config.ts` with `@/*` → `./src/*`
alias matching `tsconfig.json`. **Do not** set `test.globals: true` — every
test file uses explicit `import { describe, it, expect, vi, beforeEach } from
'vitest'` instead, so new test files don't need a `tsconfig.json` change to
type-check cleanly under `pnpm build`'s TS program.
- Acceptance criteria:
  - `pnpm test` exits 0 with zero test files present.
  - `vitest.config.ts` resolves the `@/` alias.
  - `pnpm-lock.yaml` is regenerated and committed alongside the `package.json`
    change (a `pnpm install --frozen-lockfile` CI step will otherwise fail).
  - `pnpm build` still succeeds after this step (no vitest-globals/tsc
    conflict) — verify once Step 3 has also landed, since `pnpm build` is
    currently broken independent of this step.

### Step 2: Make the DB layer test-injectable — depends on: none (parallel to Step 1)
`src/lib/db/index.ts`: `DB_PATH = process.env.CAR_SEARCH_DB_PATH ??
path.join(process.cwd(), 'data', 'car-search.db')`. `src/lib/db/migrate.ts`:
`runCustomMigrations(sqlite?: Database)`, defaulting to opening the file-path
connection itself when omitted (today's CLI behavior unchanged).
- Acceptance criteria:
  - `pnpm db:migrate` behaves identically to before.
  - `runCustomMigrations(sqlite)` works against an already-open `Database` and
    creates both partial unique indexes + the default `search_config` row.
  - Zero `vi.mock` calls anywhere in the resulting test suite.

### Step 3: Fix the two independent bugs blocking `pnpm build` in CI — depends on: none
Two fixes, both required:
1. **tsconfig leak (primary/first blocker, verified empirically)**: exclude
   `docs/**` (and any other independently-`pnpm install`'d subtree, e.g.
   `.omc/**` if it ever contains TS) from root `tsconfig.json`'s `include`/
   `exclude` so the Next.js TS program never tries to type-check the separate
   Docusaurus workspace.
2. **Static prerendering (second blocker)**: add `export const dynamic =
   'force-dynamic';` to `src/app/api/stats/route.ts`,
   `src/app/api/config/route.ts`, `src/app/api/scrape/status/route.ts`; audit
   `src/app/api/**` for any other DB-touching GET handlers missing this.
- Acceptance criteria:
  - Verify with the same method the critic used: `git worktree add` a scratch
    checkout, run `pnpm install --frozen-lockfile`, `pnpm db:push && pnpm
    db:migrate`, then `pnpm build` — confirm exit code 0 end-to-end, not just
    "looks right by inspection."
  - No unintended change to routes that are legitimately static.
  - Note observed build time (critic measured ~12 minutes cold) so CI step
    timeouts (Step 1 of c4y) are set realistically rather than left at
    GitHub's default.

### Step 4: Unit tests for `normalize.ts` — depends on: "Add vitest and wire the test script"
Create `src/lib/scrapers/normalize.test.ts` testing `normalizeMcpListing()`.
- Concrete test cases: price parsing ($-string/plain/numeric/unparseable/null),
  `price`/`listing_price`/`sale_price` precedence, deal-rating normalization
  (Great Deal→Great, overpriced→High, unrecognized passthrough), title
  extraction (year/make/model incl. Chevy→Chevrolet, no-known-make, no-year),
  `parseIntOrNull`/`parseBool`/`parseString` edge cases, alias fallback chains
  for vin/externalId/source/oneOwner-family fields, **plus the two documented
  coercion quirks from "Bugs discovered" #6** (`parseIntOrNull("120k")` → `120`;
  a title-like string through `parsePriceToCents` producing a nonsensical
  dollar amount) — asserted as current behavior with a comment flagging it as
  a known quirk, not silently treated as correct without comment.
- Acceptance criteria: explicit `expect()` per case, no DB/FS dependency,
  fast (<50ms total).

### Step 5: Unit tests for `scoring.ts` — depends on: "Add vitest..." (Layer 1); Layer 2/`recomputeAllScores` additionally depend on: "Make the DB layer test-injectable"
Create `src/lib/scoring.test.ts`.
- Concrete test cases (superset of v2, with corrections):
  - Baseline 5.0 score for a neutral listing.
  - Price-ratio boundaries straddled at 0.59/0.60/0.61 etc.; **exact-boundary
    semantics**: because comparisons are strict `>`/`<`, a value exactly at a
    threshold (e.g. `priceRatio === 0.6`) falls into the *next, less-favorable*
    bucket — assert this explicitly, don't guess.
  - Miles-per-year: `<10000` (+0.5), `10000–12000` (+0.25), `12000–15000` (0),
    `>15000` (-0.25). **Corrected from v2**: assert that `>20000` ALSO produces
    `-0.25` (not `-0.75`), pinning "Bugs discovered" #1 as current behavior,
    with a comment cross-referencing the finding — do not assert the
    presumably-intended `-0.75`.
  - `age = Math.max(currentYear - year, 1)` floor, using `vi.useFakeTimers()` +
    `vi.setSystemTime(...)` to freeze "now" for the test rather than deriving
    expectations from a live `new Date()` call (more deterministic than v2's
    approach) — restore real timers in `afterEach`.
  - History bonuses stack additively; deal-rating bonus branches, reading the
    actual source for `'Fair'`/`'High'` at test-writing time rather than
    assuming no-op.
  - Clamping to [0, 10]; rounding to 1 decimal.
  - Layer 2 gating on `<3` comps.
  - Layer 2 price-delta/mileage-delta buckets seeded comfortably inside each
    bucket (not on the float boundary).
  - **New**: `findComps`'s `count` gate uses the raw `allComps.length`, but the
    median is computed from `prices`/`mileages` arrays that filter out
    non-positive values — seed comps that pass the `count >= 3` gate but have
    fewer than 3 positive prices, and document the resulting (possibly
    surprising) median behavior.
  - **New**: pin "Bugs discovered" #2 (`findComps` self-inclusion) — seed a
    small comp set including the target listing's own row in the table, assert
    it's counted among its own comps, with a comment flagging the bug.
  - `findComps` model-key grouping and +/-3yr window (unchanged from v2).
  - `recomputeAllScores`: dismissed-exclusion, updated-count accuracy, actual
    row updates. **New**: seed one row with `isDismissed` set to raw SQL
    `NULL` (bypassing the schema default) and document whether it's included
    or excluded (pinning "Bugs discovered" #5).
- Acceptance criteria: paired boundary values; frozen system time via
  `vi.setSystemTime`, not live-derived expectations; every pinned-bug case has
  an inline comment referencing the corresponding "Bugs discovered" item.

### Step 6: Unit tests for `dedup.ts` — depends on: "Make the DB layer test-injectable"
Create `src/lib/scrapers/dedup.test.ts`. Set
`process.env.CAR_SEARCH_DB_PATH = ':memory:'` before importing `../db`; call
`runCustomMigrations(sqlite)` against that connection; reset/re-seed between
tests (no `vi.mock`).
- Concrete test cases (superset of v2, with additions):
  - VIN-present update w/ price change (+ `price_history` row) and w/o change
    (no new row).
  - VIN-null, `source`+`externalId` path.
  - No-dedup-key always-inserts (documented limitation, not fixed here).
  - Cross-source collision not deduped.
  - Partial-field backfill per field, and non-overwrite of existing values.
  - Batch aggregate counts across a mixed batch.
  - Error path: loop continues processing the rest of the batch after one
    listing errors.
  - **New**: pin "Bugs discovered" #3 — a payload with a new VIN that collides
    with an existing row's `(source, externalId)` — assert the update is
    silently dropped into `errors[]` and the existing row is left unchanged,
    with a comment flagging this as a data-loss bug for follow-up.
  - **New**: pin "Bugs discovered" #4 — after a VIN/`externalId` price update,
    assert `dealScore` on the updated row is unchanged (stale) rather than
    recomputed, with a comment flagging it.
  - `buildInsertRow` invokes `computeDealScore`, defaults booleans to `false`.
  - `getConfigForScoring()` fallback when `search_config` is empty.
- Acceptance criteria:
  - Test run never touches the real file at the default `data/car-search.db`
    path (assert explicitly, e.g. via mtime or non-existence in a clean
    sandbox).
  - State reset between cases — no cross-test bleed.
  - At least one test asserts on `price_history` table contents directly.
  - Every pinned-bug case has an inline comment referencing the "Bugs
    discovered" item.

## Task c4y: Add CI workflow for lint/build/test

### Step 1: Add `.github/workflows/ci.yml` — depends on: "Add vitest and wire the test script" (656 Step 1) AND "Fix the two independent bugs blocking `pnpm build` in CI" (656 Step 3)
Mirror `deploy-docs.yml`'s tool versions (`actions/checkout@v4`,
`pnpm/action-setup@v4` v10, `actions/setup-node@v4` node 20, `cache: pnpm`
with **`cache-dependency-path: pnpm-lock.yaml`** pinned explicitly so the cache
key doesn't ambiguously glob `docs/pnpm-lock.yaml` too) plus a `concurrency`
group (`${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`).
Trigger on `push: branches: [main]` and `pull_request` (not unscoped `push`,
which double-runs every PR push). Steps in order: `pnpm install
--frozen-lockfile` → `pnpm exec eslint . --max-warnings 0` (bare `pnpm lint`
exits 0 on warnings — don't use it as-is for a gating CI check) → `pnpm test`
→ `pnpm db:push && pnpm db:migrate` → `pnpm build`. Set a realistic
`timeout-minutes` on the job (the critic measured ~12 min for a cold `pnpm
build`; budget accordingly, e.g. 20-25 min, rather than leaving GitHub's
default).
- Acceptance criteria:
  - Triggers correctly scoped; `cancel-in-progress` concurrency group present.
  - `pnpm install --frozen-lockfile` succeeds (requires 656 Step 1's lockfile
    commit).
  - Lint step actually fails on warnings (verify with a deliberately
    introduced warning in a scratch branch, then revert).
  - `pnpm build` succeeds in the actual CI environment — this is the real
    proof that 656 Step 3's two fixes work end-to-end, not just locally.
  - Job completes within the configured timeout under normal conditions.

### Step 2: Add a status badge / branch protection note (optional, doc-only) — depends on: "Add ci.yml"
Add a CI status badge to `README.md` if one exists; document that branch
protection requiring the `ci` check can be turned on later once the workflow
has a few green runs.

## Cross-task dependency

`car-search-c4y` Step 1 depends on **two** `car-search-656` steps:
- **656 Step 1** ("Add vitest and wire the test script") — via
  `--passWithNoTests`, `pnpm test` is a meaningful, non-flaky CI step from day
  one, so CI can land *before* the test suites rather than waiting for them.
- **656 Step 3** ("Fix the two independent bugs blocking `pnpm build` in CI")
  — a hard blocker verified empirically: `pnpm build` cannot succeed in CI
  today, for reasons entirely unrelated to test coverage (a tsconfig leak into
  the `docs/` workspace, and static prerendering of DB-touching routes). This
  dependency would exist even if 656's testing scope didn't exist at all.

656 Steps 2, 4, 5, 6 (DB injectability, and the scoring/dedup/normalize test
suites) can all land as follow-up PRs *after* CI already exists and guards
them.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `pnpm build` fails in CI (confirmed via real build run: tsconfig leak into `docs/`, plus static prerendering of DB-backed routes) | CI red from run #1, blocks everything | Both root causes fixed explicitly in 656 Step 3, verified via a scratch `git worktree` build before c4y Step 1 is considered done — not just code review. |
| Vitest `globals: true` mode silently breaks `pnpm build`'s type-check pass on new test files | Adding tests regresses the build, discovered late | 656 Step 1 mandates explicit `import ... from 'vitest'` in all test files instead of relying on globals. |
| Bare `pnpm lint` in CI doesn't actually gate on warnings | CI stays green despite real lint issues accumulating | c4y Step 1 uses `--max-warnings 0` explicitly. |
| Tests unintentionally encode live production bugs as "correct" (dead mileage branch, `findComps` self-inclusion, silent dedup data loss, stale `dealScore`) | Bugs get frozen in place by a green test suite, harder to fix later without "breaking a test" | Every such case is pinned with an explicit comment referencing "Bugs discovered," and those items are called out as candidate follow-up beads rather than fixed silently inside this testing task. |
| Dedup tests accidentally touch the real file DB if `CAR_SEARCH_DB_PATH` isn't set before `../db` import | Test pollutes local dev data or writes an unwanted CI artifact | Set the env var at the very top of the test file, before any other import; assert the real file's mtime/non-existence explicitly. |
| Flaky Layer-2 scoring tests from boundary floating-point comparisons, or from live `new Date()` | Intermittent CI failures | Seed values comfortably inside buckets; use `vi.useFakeTimers()`/`vi.setSystemTime()` for date-dependent tests rather than deriving expectations from a live clock. |
| No committed `drizzle/migrations` folder — schema applied via `push`, not `generate`+`migrate` | Test DB setup and prod schema can still drift if `schema.ts` changes without re-running `db:push` | Step 2's `runCustomMigrations(sqlite?)` refactor removes the *duplicated*-SQL drift risk; a future follow-up could adopt committed migrations for a single source of truth. |
| Cold `pnpm build` takes ~12 minutes in CI (measured) | CI feels slow; risk of hitting a too-tight default timeout | Explicit, realistic `timeout-minutes` on the CI job; run `test` before `build` so failures surface faster on average. |
| CI minutes/cost creep | Non-issue at personal-repo scale | Single combined job, not a matrix; concurrency cancel-in-progress avoids redundant runs. |
