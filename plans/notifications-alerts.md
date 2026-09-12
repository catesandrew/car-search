# Notifications & Alerts — Implementation Plan (v2)

`car-search-3xy` under epic `car-search-e4b`. Explicitly out of scope for the original
v1 dashboard build (see `.omc/plans/truck-search-dashboard.md` → "Out of Scope
(Future)"). This v2 incorporates Architect + Critic findings from a review of the v1
draft, including a **live-DB-verified blocker**: running the v1 predicate against the
current `data/car-search.db` matched 308 of 330 existing rows — enabling the feature
as originally drafted would have sent one 308-vehicle digest on first use.

## Goal

Deliver opt-in email alerts for the single user of this personal car-deal-tracking
dashboard for two distinct, independently-triggered conditions:

- **(a) New listing found** — a listing genuinely inserted during a scrape cycle.
- **(b) Existing listing's score crosses the threshold** — a listing's `deal_score`
  moves from below to at/above a user-set threshold as a result of a settings change
  (the only point at which an existing listing's score actually changes post-insert;
  see Decision 2).

Non-goals for v1: SMS delivery, multi-user/multi-recipient support, per-listing
(non-digest) emails, push notifications, true continuous "crossing" detection across
scrape cycles (scores don't change during a scrape cycle — see Decision 2).

## Key Decisions

### 1. Channel: email only, SMS deferred
Email via a transactional provider (Resend) is the cheapest, simplest, lowest-risk
option — no carrier/A2P registration, no per-message cost at this volume, generous
free tier (3,000/month, 100/day) comfortably covering a single-user app polling every
5–60 minutes. SMS (Twilio) is deferred: A2P 10DLC registration overhead is
disproportionate to a single-user tool. **Unlike the v1 draft, no `sms_enabled`/
`recipient_phone` columns are reserved up front** — `ALTER TABLE` via the existing
migration mechanism (`src/lib/db/migrate.ts`) is free, so add those columns when SMS
is actually built rather than speculatively now.

### 2. Two triggers, two mechanisms — "new" and "threshold" are not the same code path
**Finding from review:** the v1 draft assumed scoring happens during every scrape
cycle ("after dedup/scoring" in the original Decision 3). It doesn't:
`dedup.ts` calls `computeDealScore()` with only 2 of its args (omitting the optional
`database` param used for market-relative comps), and `recomputeAllScores()` is
called **only** from `PUT /api/config` when search criteria change
(`src/app/api/config/route.ts`). An existing listing's `deal_score` cannot change
during `runScrape()`. Therefore:

- **Trigger (a) "new listing"** fires from `runScrape()` in `runner.ts`, driven by
  exactly which listing ids were *inserted* this cycle (see Decision 3 — not
  `view_status`).
- **Trigger (b) "threshold crossing"** fires from `PUT /api/config`'s existing
  `recomputeAllScores()` call, extended to report which listing ids moved from below
  to at/above threshold in that recompute pass. This is the only place a "crossing"
  (a directional before/after comparison) is actually well-defined, because
  `recomputeAllScores()` already has both the old and new score in hand.

v1 does **not** attempt to detect "crossing" during ordinary scrape cycles — that
would require rescoring the whole table every cycle for a feature only meaningful
when criteria change. This is a deliberate, documented scope cut.

### 3. "New listing" identity: exact inserted ids, not `view_status`
**Finding from review:** `view_status='new'` is the *user's unread-state*, not an
"inserted this cycle" flag — it only flips to `'seen'` when the listings page renders
the row client-side (`src/app/listings/page.tsx`). A row inserted months ago that the
user never scrolled past is still `view_status='new'` today; a predicate built on it
would re-surface arbitrarily old backlog. Instead, `upsertListings()` in
`src/lib/scrapers/dedup.ts` is extended to return `insertedIds: number[]` — the ids of
rows it genuinely `INSERT`ed this call (not the `ON CONFLICT DO UPDATE` path). This
makes "new this cycle" exact, with no dependency on user read-state.

### 4. Preference storage: new `notification_prefs` singleton table
`search_config` already follows a single-row-config pattern (`id=1`). Add
`notification_prefs` as a second singleton table rather than extending
`search_config`, keeping scrape-criteria config and notification config
independently editable without touching `search_config` consumers. Enforce the
singleton invariant with `CHECK (id = 1)` via raw SQL in `migrate.ts` (cheap, and the
existing `search_config` table relies on convention only).

### 5. Notification dedup: per-reason claim, not a permanent tombstone
**Finding from review:** a single permanent `notified_at` tombstone (v1 draft) means a
listing notified once for being "new" can never later fire for crossing a score
threshold, and there is no way to re-notify if a listing's score drops below and later
rises above threshold again. v2 uses **two independent columns**:

- `listings.notified_at` — stamped when a listing is included in a "new listing"
  digest. Permanent for this reason only (a listing is only ever "new" once).
- `listings.notified_score` — stamped with the score at the time it was last included
  in a "threshold" digest. Re-eligible for a threshold digest whenever
  `deal_score >= score_threshold AND (notified_score IS NULL OR notified_score <
  score_threshold)` — i.e. it must have been below threshold (or never notified)
  last time to fire again, giving a real "crossing" semantic for this trigger.

**Claim-before-send, not send-then-stamp.** better-sqlite3 transactions are
synchronous; they cannot `await` the Resend HTTP call, so "send then stamp
atomically" (the v1 draft's stated model) isn't implementable. v2 instead **claims**
candidate rows synchronously first — `UPDATE listings SET notified_at = ? WHERE id IN
(...) AND notified_at IS NULL` (or the `notified_score` equivalent) — using the
`WHERE ... IS NULL` guard as a compare-and-swap so a concurrent `PUT /api/config`
recompute can't double-claim the same row. Only the rows the `UPDATE` actually
affected are included in the digest. If the send fails, the claim is reverted
(`SET notified_at = NULL WHERE id IN (claimedIds)`) so the same rows retry next cycle.
This trades "might occasionally lose one alert on a crash between claim and send" for
"never double-sends the same listing" — the right default for a personal inbox.

### 6. Migration must actually run, and must backfill on first enable
**Two blockers found during review, both confirmed against the live DB:**

- `runCustomMigrations()` in `migrate.ts` only executes under `require.main ===
  module` — nothing in `src/` or `scripts/worker.ts` calls it, and `db:push` /
  `db:migrate` are independent `package.json` scripts with no enforced ordering. A
  deploy that runs `db:push` without also running `db:migrate` starts `runScrape()`
  against a DB with no `notification_prefs` table, failing every cycle. **Fix:**
  chain the scripts — `"db:push": "drizzle-kit push && tsx src/lib/db/migrate.ts"` —
  so migrations always run after schema push, and make the notifier fail soft (catch
  "no such table", log a pointer to `npm run db:push`, no-op) as defense in depth.
- Querying the live `data/car-search.db` against the "new listing" predicate as
  drafted in v1 matched **308 of 330 existing rows** (327 have `view_status='new'`;
  Decision 3 already fixes the identity problem, but the *migration itself* must also
  explicitly backfill `notified_at` on all pre-existing rows to a non-null timestamp
  the moment the column is added — otherwise the first `insertedIds`-based scrape
  after this feature ships would still, separately, need this backfill guard for
  `notified_score` parity, and for defense against any future predicate change). This
  is done as part of the migration in Step 1, not left implicit.

### 7. No auth on this app — keep the notification routes narrow
The app has no authentication layer. `POST /api/notifications/test` must ignore any
caller-supplied recipient and always send to the stored `recipient_email`, and should
be rate-limited (one attempt per 60s) so it can't be used as a blind open relay if the
app is ever exposed beyond localhost. This plan assumes continued local-only
operation; if a future "deploy to cloud" epic exposes this app publicly, these routes
need real auth before that happens — noted as a cross-epic dependency, not solved
here.

## Schema Changes

`src/lib/db/schema.ts`:
```ts
export const notificationPrefs = sqliteTable('notification_prefs', {
  id: integer('id').primaryKey().default(1),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).default(false),
  recipientEmail: text('recipient_email'),
  notifyOnNew: integer('notify_on_new', { mode: 'boolean' }).default(true),
  notifyOnThreshold: integer('notify_on_threshold', { mode: 'boolean' }).default(false),
  scoreThreshold: real('score_threshold').default(8.0),
  lastSentAt: text('last_sent_at'),
  lastAttemptAt: text('last_attempt_at'),
  lastError: text('last_error'), // sanitized: status code + truncated message, PII stripped
});
```
`listings`: add `notifiedAt: text('notified_at')` and `notifiedScore: real('notified_score')`
(both nullable), plus an index on `notified_at`. Add via the same idempotent
`PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` pattern already used in
`migrate.ts` for `fb_location`, but targeting `listings` — and immediately follow the
`ALTER TABLE` with the backfill `UPDATE` from Decision 6.

## Implementation Steps

**Step 1 — Schema, migration wiring, and backfill**
Add `notification_prefs` to `schema.ts` with `CHECK (id = 1)`; add `notified_at` /
`notified_score` columns and an index to `listings`. Extend `migrate.ts`: guard the
`notification_prefs` seed with a `sqlite_master` existence check (not a bare `SELECT
COUNT` — the existing `search_config` seed has this latent bug too, masked only
because that table always exists); add the `listings` column guards via `PRAGMA
table_info(listings)`; immediately backfill `UPDATE listings SET notified_at = <now>
WHERE notified_at IS NULL` so no pre-existing row can ever appear in a "new listing"
digest. Chain `package.json`'s `db:push` script to also run `db:migrate` so this (and
future) migrations can't be silently skipped.

**Step 2 — Exact "inserted this cycle" tracking**
Modify `upsertListings()` in `src/lib/scrapers/dedup.ts` to return `insertedIds:
number[]` (ids on the genuine-INSERT path only, never the `ON CONFLICT DO UPDATE`
path) alongside existing counts; extend `ScrapeResult` in `src/lib/types.ts`; update
`mergeScrapeResults()` in `runner.ts` to concatenate `insertedIds` across the MCP and
optional FB calls.

**Step 3 — Email provider wrapper**
Create `src/lib/notifications/email.ts`: thin `fetch`-based wrapper around Resend's
HTTP API (no new SDK dependency, matching the project's lean-dependency style). Reads
`RESEND_API_KEY` / `RESEND_FROM_EMAIL` from env. Exposes `sendEmail({to, subject,
html, text}) => Promise<{ok: boolean; statusCode?: number; error?: string}>` that
never throws. Any non-2xx response is sanitized before being returned or persisted:
truncate to ~200 chars and strip anything resembling an email address, since Resend
error bodies can echo the recipient.

**Step 4 — Digest builder**
Create `src/lib/notifications/digest.ts`: `buildDigest({ newListings, thresholdListings
})` producing `{subject, html, text}` with two clearly labeled sections. Inline-styled
HTML (email clients don't load stylesheets — don't reuse `deal-score-badge.tsx`'s
Tailwind classes directly; extract just the numeric bands — green ≥7, yellow 4–6.9,
red <4 — as a shared constant). Cap rendered listings (e.g. first 50 per section, "+N
more — view dashboard" footer) to stay well under typical email size limits.

**Step 5 — Notifier: new-listing path**
Create `src/lib/notifications/notifier.ts` with `notifyNewListings(insertedIds:
number[])`: no-op (log only) if the `notification_prefs` table doesn't exist yet, or
if `email_enabled`/`notify_on_new` is false, or `recipient_email` is empty/invalid.
Otherwise claim via `UPDATE listings SET notified_at = ? WHERE id IN (insertedIds) AND
notified_at IS NULL AND is_dismissed = false`, taking only the actually-claimed subset
(check `.changes`, re-select the claimed ids). If claimed set is empty, return. Build
and send the digest; on success update `notification_prefs.last_sent_at` and clear
`last_error`; on failure, revert the claim (`notified_at = NULL` on the claimed ids)
and set `last_attempt_at` / sanitized `last_error`.

**Step 6 — Notifier: threshold-crossing path**
Extend `recomputeAllScores()` in `src/lib/scoring.ts` to also return the ids whose
score moved from below to at/above `notification_prefs.score_threshold` in that pass
(it already computes old vs. new score per listing for the `price_max`-change case).
Add `notifyThresholdCrossings(crossedIds: number[])` to `notifier.ts` with the same
guard/claim/send/revert shape as Step 5, but claiming via `notified_score`: `UPDATE
listings SET notified_score = <new score> WHERE id IN (crossedIds) AND is_dismissed =
false AND (notified_score IS NULL OR notified_score < score_threshold)`. Wire the call
into `PUT /api/config`'s handler immediately after `recomputeAllScores()` returns,
gated on `notify_on_threshold`.

**Step 7 — Wire the new-listing notifier into the scrape pipeline**
In `runner.ts`, call `notifyNewListings(finalResult.insertedIds)` after `finalResult`
is fully assembled (post MCP + optional FB `upsertListings` calls), inside its own
`try/catch` that only `console.error`s. It must never write into `finalResult.errors`
or mutate the `scrape_runs` row's `status`/`error` — a notification failure is
observability data for `notification_prefs.last_error`, not a scrape-health signal.

**Step 8 — Settings API**
Add `src/app/api/notifications/route.ts`: `GET` returns the `notification_prefs` row;
`PUT` validates with Zod — `recipientEmail: z.string().email().optional()`,
`scoreThreshold: z.number().min(0).max(10)`, `emailEnabled`/`notifyOnNew`/
`notifyOnThreshold: z.boolean()` — and strips any client-supplied `lastSentAt`/
`lastAttemptAt`/`lastError` (server-computed only). Add `POST
/api/notifications/test`: always sends to the stored `recipient_email` (ignores any
`to` in the request body — see Decision 7), rate-limited to one attempt per 60s
(429 on violation).

**Step 9 — Settings UI**
Extend `src/app/settings/page.tsx` with a "Notifications" section: enable toggle,
recipient email input, "notify on new listings" / "notify on threshold" checkboxes, a
score-threshold slider (reusing the existing filter slider component), a status line
showing `last_sent_at`/`last_error` (rendered without ever displaying a raw recipient
email inside an error string), and a "Send test email" button wired to Step 8's test
route with a toast on success/failure.

**Step 10 — Env/secrets documentation**
Populate `.env.local.example` (currently empty/untracked) with `RESEND_API_KEY` and
`RESEND_FROM_EMAIL`, following the existing `CAR_DEALS_MCP_PATH`/`FB_EMAIL`/
`FB_PASSWORD` pattern. Document that the sender domain must be verified in Resend
before mail delivers, and that `npm run db:push` (now chained to `db:migrate` per Step
1) must be re-run after pulling this feature.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| First-enable backlog flood | One digest containing hundreds of historical listings | Step 1 backfills `notified_at` on all pre-existing rows at migration time; Step 3 identity uses exact `insertedIds`, not `view_status` |
| Migration silently never runs | `notification_prefs` missing → notifier throws every cycle | `db:push` chained to `db:migrate`; notifier fails soft on missing table with a log pointer |
| Duplicate digest on crash between send and stamp | Same listings re-sent | Claim-before-send (Decision 5): rows are marked claimed before the send attempt, so a crash after a successful send (before the "success" branch runs) is the only loss window, not a duplicate-send window |
| Provider outage / API failure | No notifications sent | `last_error`/`last_attempt_at` surfaced in Settings; failed claims are reverted so the same rows retry next cycle |
| Undefined/PII-leaking error messages | Resend error bodies can contain the recipient address | Step 3 sanitizes and truncates before persisting or displaying |
| Open relay via unauth'd test route | App has no auth layer | Step 8's test route ignores caller-supplied recipients and rate-limits |
| No test framework in this repo (0 `*.test.ts`, no vitest/jest configured) | Can't unit-test claim/CAS logic automatically | Verification is manual (mirrors the existing dashboard plan's "Manual E2E walkthrough" pattern) — see Verification Steps below; flagged as a pre-existing repo gap, not solved by this epic |
| Silent Facebook-scraper gaps | `searchFacebook()` resolves `[]` on internal errors with no explicit flag, so a digest could omit an entire source without saying so | Documented known limitation; out of scope for this epic (belongs to scraper-coverage work) |
| Cost at scale | N/A | Single-user, low volume, well under Resend free tier |

## Verification Steps (manual — no test framework in repo)

1. Run `npm run db:push`; confirm `notification_prefs` has exactly 1 row (all
   disabled) and every existing `listings` row has non-null `notified_at`.
2. Enable notifications in Settings with a real recipient email; click "Send test
   email"; confirm delivery and that a second click within 60s returns 429.
3. Trigger a scan that finds at least one genuinely new listing (e.g. lower
   `price_max` temporarily then restore it, or seed a new row via `scripts/seed.ts`);
   confirm exactly one digest arrives listing only the new row(s), and that
   `notified_at` is now stamped on them.
4. Re-run the same scan with no new listings; confirm no email is sent.
5. Lower `price_max` in Settings such that an existing listing's recomputed score
   rises to/above the configured threshold; confirm a threshold digest fires
   containing exactly that listing, and that a listing already above threshold before
   the change is not included.
6. Temporarily break `RESEND_API_KEY`; trigger a scan with a new listing; confirm the
   send fails, `notified_at` is reverted to NULL on that listing, and
   `notification_prefs.last_error` shows a sanitized (no raw email) message. Restore
   the key and confirm the same listing is picked up and sent on the next cycle.

## Dependencies on Other Epics

**Mostly independent.** This epic depends on one small, non-breaking signature change
to the already-shipped scraper module (`upsertListings()` returning `insertedIds` —
Step 2), but does not require the scraper-coverage epic to reach any particular
milestone first; `dedup.ts`/`runner.ts`/`scoring.ts` are stable as shipped in the v1
dashboard build. It has a **soft dependency on the "deploy to cloud" epic**: the
notification routes are intentionally left unauthenticated (Decision 7) under the
assumption of continued local-only operation, so if/when the app is deployed publicly,
this epic's API routes will need real auth added before that exposure — that work
belongs to the deploy epic, not this one.

## Out of Scope (v1)

- SMS delivery (add columns/logic later — not reserved speculatively, see Decision 1)
- Per-listing (non-digest) emails
- Multiple recipients / multi-user
- Daily-summary digest mode (only per-scrape-cycle / per-config-save digest in v1)
- Continuous threshold-crossing detection during ordinary scrape cycles (see Decision 2)
- Authentication on the notification API routes (deferred to the deploy epic)

## Revision Changelog (v1 → v2)

Incorporated Architect + Critic findings:
1. Split the single trigger into two mechanisms — new-listing (scrape cycle) vs.
   threshold-crossing (config save) — because scores don't change mid-scrape-cycle
   (Architect #1/#2).
2. Replaced `view_status='new'` identity with exact `insertedIds` from `dedup.ts`
   (Architect #5, Critic #3).
3. Replaced single permanent `notified_at` tombstone with `notified_at` +
   `notified_score`, giving threshold-crossing a real re-fire condition (Architect #3).
4. Replaced "send then stamp in one transaction" (unimplementable — sync transactions
   can't await) with claim-before-send + revert-on-failure (Architect #6).
5. Added explicit migration backfill for pre-existing rows after live-DB verification
   that 308/330 rows would otherwise flood the first digest (Critic #1).
6. Fixed migration wiring — `db:push` now chains `db:migrate`; migrations were
   previously never invoked outside manual CLI use (Critic #2).
7. Dropped speculative `sms_enabled`/`recipient_phone` columns — `ALTER TABLE` is free
   via the existing mechanism, add when SMS actually ships (Architect #10).
8. Dropped the dead 5-minute backoff — `cron_interval` is already floor-clamped to 5
   minutes (Architect #12).
9. Added `CHECK (id = 1)` for true singleton enforcement (Architect #11).
10. Specified concrete Zod schema per field instead of "mirrors /api/config" hand-wave
    (Critic #7).
11. Added sanitization of provider error messages before persisting/displaying
    (Critic #8).
12. Hardened the unauthenticated test route against spoofed recipients + added rate
    limiting, given the app has no auth layer (Critic #6, Architect context).
13. Removed the `[notify]`-prefixed write into `scrape_runs.error` — kept entirely on
    `notification_prefs.last_error` to avoid corrupting scrape-health reporting
    (Architect #14).
14. Documented the missing-test-framework and silent-FB-gap risks explicitly rather
    than silently assuming coverage (Critic minor findings).
