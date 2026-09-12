# Mobile App — Lightweight Plan (v3)

**Epic:** car-search-y7a · **Status:** speculative backlog, P4 — **blocked**. Do not start any
build step until the trigger conditions below are met. This plan is evaluation-first, not a
build-out: for a P4 speculative item the goal is to spend the least effort needed to either kill
the epic or scope it correctly, not to design a finished feature.

This is v3. v2 was self-reviewed only (the authoring fork's execution environment disallowed
spawning subagents). v3 incorporates genuine independent review from a fresh `architect` agent and
a fresh `critic` agent, both given the v2 draft cold. Their findings converged strongly on one
point neither prior version caught: **the epic has an unstated hard blocker.** See below.

---

## Current state

The app is already responsive: `src/components/nav-sidebar.tsx` renders a `hidden md:flex`
desktop rail and a separate `md:hidden` fixed bottom tab bar for mobile widths. Next.js 16.2.5 /
React 19. There is no manifest, service worker, or push infrastructure today. The app runs
local-only — `pnpm dev` → `http://localhost:3000` — with a SQLite file on disk and a standalone
`node-cron` worker process (`scripts/worker.ts`) sharing that file.

---

## Hard blocker: no reachable HTTPS origin (both reviewers, independently)

Installing a PWA to a phone's home screen, and the Push API entirely, both require the app be
served over HTTPS (or `localhost`, which a phone can never reach). This project has neither: no
deployment exists, and `car-search-9yy` (cloud deployment) is still open at P3. A phone hitting the
dev server over LAN at `http://192.168.x.x:3000` gets neither installability nor push — every step
in this plan is unexecutable until this is resolved.

Two ways to satisfy it:
- **Wait on `car-search-9yy`** (cloud deployment ships a real HTTPS origin), or
- **Cheaper stopgap:** a private tunnel (Tailscale Funnel or Cloudflare Tunnel) that fronts the
  existing local dev/prod server with a real TLS hostname, kept off the public internet.

The stopgap matters because of a second, related fact: `POST /api/scrape` and `PUT /api/config`
are unauthenticated and mutate state / spawn scraper subprocesses. A tunnel that stays private
(not indexed, not shared) avoids needing `car-search-8nv` (auth) first. Choosing a *public* origin
instead would pull auth in as a prerequisite too — call that out explicitly if it's the path taken.

**This epic (`car-search-t41`) should carry an explicit dependency on `car-search-9yy`**, or on
"stand up a private tunnel" as a lighter-weight equivalent (Step 4 below).

---

## Trigger conditions — do not start build steps until ALL hold

The v2 draft's header promised a trigger condition and never stated one (both reviewers flagged
this as a self-contained defect — the whole point of a P4 doc is the gate that stops it being
picked up on a whim). Stated explicitly now, mirroring the existing `car-search-f4j.1`
"re-evaluate trigger conditions" pattern used on the other P4 backlog item:

1. An HTTPS-reachable origin exists (either `car-search-9yy` shipped, or the tunnel stopgap from
   Step 4 is stood up).
2. Email alerts from `car-search-e4b`/`car-search-3xy` have shipped and been used for real, and
   have proven too slow or too easy to miss in practice (checked on a phone, not just desktop).
3. You've caught yourself opening this dashboard from a phone browser tab more than a couple times
   a week.

Add a `car-search-t41.0` "Re-evaluate mobile app trigger conditions" gate task, matching
`car-search-f4j.1`'s role on the sibling epic.

---

## Key decision: PWA, not native/React Native

Recommendation stands, and is stronger than the v2 draft argued: **React Native does not avoid the
hard blocker above.** An RN app would still need the same SQLite-backed API exposed over a network
the phone can reach — identical prerequisite, plus a second codebase to maintain for one user. PWA
gives the same two things a "mobile app" actually buys — a home-screen icon and push notifications
— for zero additional codebase, reusing the existing responsive UI (its default grid views; the
opt-in table view and Recharts price chart currently have no responsive classes, low priority to
fix).

Fact-check that strengthens the case: Chrome's install criteria are **HTTPS + a manifest with
name/icons(192+512)/start_url/display — no service worker required.** So the manifest work (Step 2
below) is independently valuable and shippable without ever touching push or a service worker.

**Old "revisit native" trigger removed — it was circular.** "If push reliability on iOS Safari PWA
proves unacceptable" can't be observed until the entire epic (deploy + push backend + SW +
subscriptions) is already built. Replaced with an honest statement: revisit native only if a
concrete platform capability the web genuinely can't serve shows up (background location, CarPlay,
a home-screen widget) — none apply to this tool today. Treat the PWA choice as effectively
permanent for a single-user tool.

---

## Push notification backend — ownership unresolved, must be decided before Step 5

`car-search-e4b`/`car-search-3xy` (Notifications epic) is currently scoped as **email only**
(Resend) — no VAPID keys, no subscription table, no `web-push` dependency, no send path. The v2
draft said this epic would only add "the client-side prompt, wired to e4b's push backend" — but no
such backend is planned anywhere. That leaves push, one of the two stated reasons for this epic to
exist, with no owner.

**Decide one of:**
- **(a, recommended)** Amend `car-search-e4b`'s scope to add a web-push transport alongside email
  (VAPID keypair + env vars, a `push_subscriptions` table via a new Drizzle migration, a send path
  callable from `scripts/worker.ts` — note the sender must live in a shared lib, not a Next Server
  Action, since the cron worker is a separate process from the Next server), or
- **(b)** Build the push backend inside this epic instead, and drop the "e4b owns it" framing.

Either way, encode the real dependency (`t41.4`/Step 5 → whichever epic ends up owning push) as a
bd dependency once beads are seeded — don't leave it as prose only, or `bd ready` will surface the
blocked step as available work.

---

## Offline caching — descope explicitly, don't build now

The v2 draft's rationale ("stale offline data has limited value — this is a live-scrape tool") was
asserted, not reasoned, and it's arguably backwards: the highest-value offline use case is standing
in front of a truck with bad signal wanting the price history and comps you already scraped — that
is exactly where stale-but-present data helps most. At the same time, building real offline support
(a versioned service worker, RSC-payload-aware caching, cache invalidation) is real ongoing
maintenance for a single dev, and it's not one of the two things a "mobile app" was meant to buy
here (icon + push).

**Decision for this pass: explicitly descope, don't silently drop.** Record against the epic: "
offline caching descoped from `car-search-y7a` v3 — revisit only if in-field lookups (driveway,
bad signal) become a recurring frustration in practice." If ever revisited, the narrow, actually
useful version is: cache `GET /api/listings/:id` + comps for **favorited listings only**, with a
visible "last updated" timestamp — not a blanket app-shell cache. Also worth a look before building
any service worker at all: Next.js 16 ships an experimental `useOffline` hook / `experimental.useOffline`
config that gives connectivity-aware UI and automatic retry of blocked navigations/prefetches
without a service worker — flagged experimental, but that's an acceptable risk for a P4 personal
tool and may cover the complaint more cheaply than a SW ever would.

---

## Service worker strategy — only relevant once Step 5 (push) actually proceeds

A service worker is **not needed for installability** (see install criteria above) — decouple it
entirely from the manifest step. If/when push work proceeds:

- **Manifest via `app/manifest.ts`**, not `public/manifest.json` — it's Next's typed App Router
  convention and auto-injects the `<link rel="manifest">`; the hand-rolled file works but forgoes
  both.
- **Do not attempt an "app-shell" precache.** Next's client chunks are content-hashed under
  `/_next/static/...` and change every build; a hand-rolled precache list in `public/sw.js` will
  reference 404s after the next deploy. Caching HTML documents is actively harmful under App
  Router — cached HTML references one build's chunks and RSC flight data, producing chunk 404s /
  broken hydration after a rebuild. Client navigations also fetch distinct `?_rsc=` payloads that a
  naive static-asset cache would need to explicitly exclude to keep listing data fresh.
- **Correct minimal strategy:** cache-first for `/_next/static/*` only (safe — those URLs are
  immutable/content-hashed); network-only for navigations, RSC requests, and `/api/*`; one
  precached `/offline` fallback route.
- Version the cache name to the build ID, call `skipWaiting`/`clients.claim` on activate, and
  document a kill-switch: ship an empty SW that calls `self.registration.unregister()` and clears
  caches, as the recovery path if something breaks in the field with no one watching.
- Prefer `@serwist/next` over hand-rolling `sw.js` if this is actually built — it injects a
  build-time precache manifest with revisioning, avoiding the stale-precache failure above.
- `next.config.ts` needs a `headers()` rule serving `/sw.js` with
  `Cache-Control: no-cache, no-store, must-revalidate` — otherwise a cached service worker means a
  shipped fix silently never reaches the device.

---

## Mobile UI pass — the actual "mobile-specific UI pass" this epic anticipates

Not a new UI; a standalone-mode compatibility pass on the existing responsive one:

- `nav-sidebar.tsx`'s mobile bottom tab bar (`fixed bottom-0 ... md:hidden`, no
  `env(safe-area-inset-bottom)`) will sit under the iPhone home indicator once launched in
  `display: standalone` — today the browser's own chrome reserves that space; standalone mode
  removes it.
- `layout.tsx`'s fixed `pb-16` offset needs to become safe-area-aware to match.
- Requires `viewport-fit: cover` in a `viewport` export before `env(safe-area-inset-*)` resolves to
  anything nonzero; pair it with a `themeColor` light/dark media pair to match `next-themes`.
- Check the listing detail page for an in-app back affordance — standalone mode has no browser
  back button.
- Low-priority stretch, not blocking: `listing-table.tsx` and the Recharts price chart have no
  responsive classes today; mitigated by the default view being the (already responsive) grid.

---

## Implementation steps (car-search-t41 → child tasks)

1. **Spike: validate standalone home-screen UX before building anything** (depends on: none)
2. **Add PWA manifest, icon set, and iOS install metadata** (depends on: step 1)
3. **Mobile UI pass — safe-area insets for standalone mode** (depends on: step 2)
4. **Stand up an HTTPS origin (tunnel stopgap, or confirm `car-search-9yy`)** (depends on: none —
   can run in parallel with steps 2–3, but blocks real-device verification of both and hard-blocks
   step 5)
5. **Add web push: client prompt + service worker** (depends on: step 2, step 4; blocked on
   `car-search-e4b` adopting a web-push transport, or building one here per the ownership decision
   above)

Full step detail is in the report sent to the team lead for bead creation.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| No HTTPS origin exists yet | Every step is unexecutable, discovered only on first phone test | Explicit epic-level dependency on `car-search-9yy` or tunnel stopgap (Step 4), sequenced before push work |
| Push backend has no owner (e4b is email-only today) | Epic ships an icon and nothing else — the stated value prop is half-delivered | Explicit ownership decision required before Step 5 starts; encode as a real bd dependency, not prose |
| Hand-rolled service worker precaches build-hashed chunks or HTML | Bricked home-screen app after next deploy, no in-app recovery | Cache only `/_next/static/*`; network-only for navigation/RSC/api; documented unregister kill-switch; prefer `@serwist/next` |
| iOS push requires home-screen install first, no delivery receipts, dies silently if app is deleted | Push "just doesn't arrive" with no diagnostic signal | Detect non-standalone mode on iOS and show an install hint instead of a broken permission prompt; treat as a known platform limit, not a bug to chase |
| Epic gets picked up without re-confirming triggers | Sunk effort on a personal-tool nice-to-have while higher-priority work waits | `car-search-t41.0` gate task, explicit falsifiable trigger conditions above |
| Bottom tab bar clipped by home indicator in standalone mode | App looks broken/unpolished on first real device use | Safe-area inset pass (Step 3) before shipping the manifest publicly as "done" |

---

## Revision Changelog (v2 → v3)

v2 was self-reviewed only. v3 incorporates independent findings from a fresh `architect` agent and
a fresh `critic` agent, both reviewing the v2 draft cold. Both independently surfaced the same
top-priority gap (#1), which neither v1 nor v2 had caught:

1. **Added the HTTPS-origin blocker** and its dependency on `car-search-9yy` (or a tunnel stopgap)
   — both reviewers flagged this as render-everything-unexecutable; the single most important
   finding of this pass.
2. **Wrote an actual trigger condition** and added a `car-search-t41.0` gate task mirroring
   `car-search-f4j.1` — v2's header promised a trigger and never stated one.
3. **Called out the orphaned push backend** — `car-search-e4b`/`3xy` is email-only today; push has
   no owner until that's explicitly decided, not assumed.
4. **Rewrote the service worker section** — "app-shell caching" was wrong for Next.js App Router
   (breaks on every rebuild due to content-hashed chunks); replaced with a
   static-assets-only/network-only-for-navigation strategy, cache versioning, and a kill-switch.
5. **Decoupled the service worker from installability** — install only needs HTTPS + manifest;
   SW is now scoped strictly to the push step, not a prerequisite of the manifest step.
6. **Switched to `app/manifest.ts`** (typed Next.js convention) instead of hand-rolled
   `public/manifest.json`; folded the separate "iOS meta tags" step into the manifest step via
   `metadata.appleWebApp` + `app/apple-icon.png`.
7. **Added a spike step (Step 1)** ahead of all build work, with an explicit "close the epic" exit
   path if plain Add-to-Home-Screen already proves sufficient — inverts the prior "build first,
   evaluate never" ordering.
8. **Descoped offline caching explicitly** rather than silently dropping it against the epic's own
   stated deliverables, with a narrower fallback scope (favorited listings only) recorded if ever
   revisited, and a lower-cost alternative (`useOffline`) named.
9. **Added the safe-area/standalone-mode UI pass** — the bottom tab bar clipping under the home
   indicator was previously unaddressed; this is now the concrete content of the "mobile-specific
   UI pass" the epic's own description names.
10. **Removed the circular "revisit native" trigger** — it required the entire epic to already be
    built before it could fire; replaced with an honest one-way-door statement.
