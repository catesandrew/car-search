# Production Readiness (Auth & Deployment) — Implementation Plan (v2)

**Epic:** car-search-wd8
**Tasks:** car-search-8nv (User authentication), car-search-9yy (Cloud deployment of dashboard + worker)

**Goal:** Make it safe and practical to run car-search somewhere other than a developer's laptop — without over-building for a multi-tenant future this personal tool doesn't need.

---

## Context (from repo)

- Single SQLite file at `data/car-search.db` via `better-sqlite3`, WAL mode + `busy_timeout=5000` (`src/lib/db/index.ts`), `globalThis` singleton for dev hot-reload safety.
- `next.config.ts` sets `serverExternalPackages: ['better-sqlite3']` — a native module, not portable to edge/serverless runtimes.
- Scheduling is a **separate long-running process** (`scripts/worker.ts`), not a Next.js API route or Vercel cron — it does `setTimeout`-based re-scheduling and re-reads `cron_interval` from the DB each tick. Locally it's spawned via `concurrently` alongside `next dev`/`next start`.
- No auth anywhere today: no middleware, no login route, no session concept. `README.md` and the original plan explicitly frame this as a **single-user personal tool** run locally.
- Secrets today live in a gitignored `.env.local` (`CAR_DEALS_MCP_PATH`, FB credentials) — fine for local, not for a shared/cloud environment.

## Key Decisions

1. **Auth scope: single shared-secret gate, not multi-user accounts.** The task title says "multi-user support" but nothing in this repo's design (single SQLite file, `search_config` is a single row with `id=1`, no `user_id` anywhere) suggests multiple people need separate accounts, favorites, or notes. Building real multi-tenancy (per-user data isolation, an accounts table, migrating every table to carry `user_id`) is a much bigger, separate effort with no current driver. **Decision: ship a single shared-password gate first** (one `AUTH_PASSWORD` env var, one session cookie, no user table). If a second person with genuinely separate data needs access later, that's a new epic, not a step here.
2. **Database: keep SQLite, don't migrate to Postgres.** Migrating to Postgres means rewriting `src/lib/db/schema.ts`'s Drizzle dialect, losing the already-tuned WAL/`busy_timeout` behavior, and buys nothing for a single-user tool with low write volume. **Decision: deploy to a platform that supports persistent block storage (Fly.io or Railway) and mount a volume at the existing `data/` path.** This keeps `src/lib/db/index.ts` and `scripts/worker.ts` unchanged.
3. **Worker deployment: keep it a separate long-running process, not a serverless cron.** `scripts/worker.ts` already re-reads `cron_interval` on each tick and self-reschedules — that's incompatible with stateless serverless functions (Vercel Cron, etc.) which don't hold long-lived timers. **Decision: run `next start` and `tsx scripts/worker.ts` as two processes/services on the same host (or two Fly "processes" / Railway services) sharing the same mounted volume.** WAL mode already supports two processes writing to one SQLite file.
4. **Auth and deployment are separable, but exposure gates on auth.** You can containerize, provision a volume, and get the app running on a cloud host entirely without auth. What auth actually protects against is *making the URL public before there's a lock on the door*. So: deployment infra work (steps 1-4 below) has no dependency on auth; the step that flips the deployment from "reachable only by me at a private URL" to "actually shared/public" must come after the auth gate exists.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single shared password leaks or is weak | Unauthorized access to personal browsing/deal data | Env-var only (never committed), `httpOnly`+`secure`+signed session cookie, document rotating it in README |
| SQLite on a shared volume across host restarts/redeploys | Data loss if volume isn't actually persistent | Verify persistence explicitly as an acceptance criterion (step below) before trusting the deploy |
| Worker and web process both writing to the same DB file in the cloud | `SQLITE_BUSY` errors under contention | Already mitigated by existing WAL mode + 5s busy_timeout; re-verify under the cloud host's filesystem (network volumes can behave differently than local disk — flag as an open risk, not assumed-solved) |
| Secrets (`CAR_DEALS_MCP_PATH`, FB creds, `AUTH_PASSWORD`) end up baked into a Docker image layer | Credential leak via image | Use the platform's secret/env store at runtime, never `COPY .env.local` into the image; add a Dockerfile lint check (`.dockerignore` covering `.env.local`) |
| Scope creep into real multi-tenant auth | Wasted effort on unrequested complexity | Decision #1 above — explicitly out of scope until there's a real second user with separate data needs |

## Self-Review

**Architect-lens pass:** The single-shared-password decision is the right call for the stated problem — the task title overstates the need ("multi-user") relative to the actual schema, which has zero notion of a user. Flagging that mismatch explicitly (rather than silently building what the title implies) is the correct move. The SQLite-over-volume decision is consistent with the rest of the codebase's already-stated zero-infra philosophy (see original plan's Tech Stack rationale) — migrating to Postgres here would be an unrequested architecture change. One gap in the first draft: it didn't say what happens to the *existing local* `data/car-search.db` file — does it get uploaded once to seed the cloud DB, or does the cloud instance start empty? Added a step for that below (data migration is a one-time manual copy, not automated — this is a personal tool, not a multi-environment product).

**Critic-lens pass:** Two things underspecified in the first draft: (1) session expiry/logout wasn't in the auth steps — added explicitly. (2) "choose a hosting platform" was left vague; naming Fly.io/Railway specifically (rather than "some PaaS") makes the plan actionable instead of another decision left for later. Also: the plan should not assume the worker and web process can share a volume without checking the specific host's volume-sharing semantics between two services — flagged as an explicit open risk above rather than asserted as solved, since it wasn't verified against a real host.

**Changes from v1 → v2:** added explicit data-migration step for the existing local DB file; added session logout/expiry to the auth steps; named specific hosting candidates instead of "a cloud platform"; added the volume-sharing-between-two-processes risk instead of assuming WAL mode alone solves it in a cloud filesystem.

---

## Implementation Steps — car-search-8nv (User authentication)

1. **Decide and document the auth model**
   Write a short decision note (in this plan or as issue notes) confirming: single shared password, one session, no per-user data model. Explicitly states multi-tenant auth is out of scope unless a real second user with separate data emerges.
   - AC: Decision documented; scope explicitly excludes per-user accounts/data isolation.
   - Depends on: none.

2. **Add password-gate middleware**
   `middleware.ts` at repo root checks a signed, `httpOnly`, `secure` session cookie on every request; unauthenticated requests to any page or `/api/*` route are redirected to `/login` (pages) or return 401 (API).
   - AC: Unauthenticated request to `/` redirects to `/login`; unauthenticated request to `/api/listings` returns 401 with `{ error: "Unauthorized" }`.
   - Depends on: "Decide and document the auth model".

3. **Add login route and page**
   `/login` page with a password form; a `POST /api/auth/login` route validates the submitted password against `process.env.AUTH_PASSWORD` and, on success, sets the signed session cookie (with an expiry, e.g. 30 days).
   - AC: Correct password grants a session and redirects to `/`; incorrect password shows an inline error and does not set a cookie; cookie has an expiry set.
   - Depends on: "Add password-gate middleware".

4. **Add logout**
   `POST /api/auth/logout` (or a button wired to it) clears the session cookie.
   - AC: After logout, the next request to any page redirects back to `/login`.
   - Depends on: "Add login route and page".

5. **Document `AUTH_PASSWORD` and secrets handling**
   Add `AUTH_PASSWORD` to `.env.local.example`; add a short "Deploying" note to `README.md`/docs describing that this must be set before exposing the app beyond localhost.
   - AC: `.env.local.example` includes the new var with a placeholder; README/docs mention it.
   - Depends on: "Add login route and page".

## Implementation Steps — car-search-9yy (Cloud deployment)

1. **Choose hosting platform and persistence strategy (decision doc)**
   Recommend Fly.io or Railway specifically, with a persistent volume mounted at the existing `data/` path — keep `better-sqlite3` and Drizzle's SQLite dialect unchanged.
   - AC: Decision documented with rationale (avoids ORM/dialect rewrite, matches existing WAL/busy_timeout tuning).
   - Depends on: none.

2. **Containerize the app and worker**
   `Dockerfile` building the Next.js standalone output; deploy config (`fly.toml` or Railway service definitions) running two processes — `next start` (web) and `tsx scripts/worker.ts` (worker) — both mounting the same persistent volume at `data/`. `.dockerignore` excludes `.env.local` and `data/*.db`.
   - AC: `docker build` succeeds locally; the built image does not contain `.env.local` or any `*.db` file.
   - Depends on: "Choose hosting platform and persistence strategy".

3. **Configure the persistent volume**
   Provision and mount the volume per the chosen platform; verify both the web and worker processes read/write the same `data/car-search.db`.
   - AC: After a redeploy/restart, `SELECT count(*) FROM listings` returns the same count as before the redeploy (data survives).
   - Depends on: "Containerize the app and worker".

4. **One-time data migration from local**
   Manually copy the existing local `data/car-search.db` (or just `search_config` + any listings worth keeping) to the cloud volume as a one-time step — not an automated migration pipeline.
   - AC: Cloud instance starts with the same `search_config` row (zip, price_max, etc.) as the local instance, not defaults.
   - Depends on: "Configure the persistent volume".

5. **Configure cloud secrets**
   Set `CAR_DEALS_MCP_PATH`, FB credentials (if FB scraping enabled), `AUTH_PASSWORD`, and any notification provider keys via the platform's secret store — never baked into the image.
   - AC: App boots and scrapes successfully using only platform-injected env vars; no secret values appear in the Docker image or git history.
   - Depends on: "Containerize the app and worker".

6. **Gate public exposure behind auth** *(cross-task dependency)*
   Do not point a public/shared URL at the deployment until car-search-8nv's password gate (its step "Add password-gate middleware") is live and verified.
   - AC: `curl` against the deployed URL without a valid session cookie returns a redirect/401, not the dashboard.
   - Depends on: "Configure cloud secrets" (this task) **and** "Add password-gate middleware" (car-search-8nv, cross-task).

7. **Manual end-to-end verification**
   Confirm: dashboard loads over the internet, login gate blocks unauthenticated access, the worker process runs a scrape on schedule in the cloud (check `scrape_runs` table), and data survives a redeploy.
   - AC: All four checks observed and pass.
   - Depends on: "Gate public exposure behind auth".

## Cross-task dependency summary

- Deployment steps 1-5 are **independent** of the auth task and can proceed in parallel.
- Deployment step 6 ("Gate public exposure behind auth") is **blocked by** auth task step 2 ("Add password-gate middleware") — you can finish provisioning the cloud infrastructure before auth is done, but you must not make it reachable by anyone else until the gate exists.
