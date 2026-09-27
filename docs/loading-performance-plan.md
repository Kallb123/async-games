# Loading and navigation performance plan

## Objective

Make opening a live game feel immediate, and make every in-app navigation show useful content quickly without weakening authentication, leaking hidden game state, or showing stale state as current.

The primary user journey is **dashboard → live game**. The target is that a warm visit normally paints the selected board from recently fetched data while a background request verifies it. Route code and the game's likely art should already be in the browser before the tap. Other routes should benefit from the same measurement, navigation, caching, and bundle work.

This document is an implementation plan, not evidence that one particular layer is currently the bottleneck. Instrument first, then keep only changes that improve production measurements.

## What the repository does today

The plan should preserve several good foundations:

- App Router `<Link>` is used in many places, so Next.js can prefetch route payloads. However, the dashboard's highest-priority “your turn” rows are clickable containers that call `router.push`, so they do not get `<Link>`'s automatic viewport prefetch.
- Every game page is a client component. After its JavaScript loads and Clerk authorisation becomes ready, `useGameData` starts a separate `/api/game/:id` request. This creates a route/code → auth → game-data waterfall on a cold game entry.
- `useRefreshableData` starts with no cached value. It keeps a last good response only for the lifetime of the mounted hook, then refreshes on push, visibility, or polling. Leaving and returning to a page discards that useful response.
- The dashboard already combines its lists into one `/api/dashboard` request and batches player-name resolution. That avoids the previous fan-out, but it still begins client-side after authorisation and deliberately polls while visible.
- A game read authenticates the viewer, checks membership, loads the Mongo document, creates that viewer's response, resolves player names, and attaches reactions. Some game responses contain hidden, viewer-specific state.
- Mongo indexes already cover `gameId`, live games by player, invitation lookups, and timer sweeps. Indexes should be verified with production-like `explain`, not added speculatively.
- The service worker intentionally caches only the offline fallback. It does not cache API responses, Clerk traffic, or navigations. That is a safe default for personalised state.
- Static game art is substantial (about 40 MB in the current tree, with individual board images of several MB), so route speed may be dominated by code and art after the JSON arrives.

## Success criteria and guardrails

Measure separately for cold browser, warm browser, slow mobile network, installed app, and a resumed/backgrounded session.

| Journey | Primary metric | Initial target |
| --- | --- | --- |
| Dashboard row tap → usable live board | p75 interaction-to-next-paint / custom `game_usable` mark | under 1 s warm; under 2.5 s cold on representative mobile |
| Internal link tap → useful route content | p75 custom navigation duration | under 1 s warm |
| Home open → actionable dashboard | p75 `dashboard_usable` | under 1.5 s warm |
| Game revisit | time to cached board paint | under 200 ms, followed by visible/non-blocking validation |
| Correctness | stale actions and cross-user cache leaks | zero |
| Cost | requests and transferred bytes per journey | no uncontrolled increase |

“Usable board” means the real board and status are painted and an eligible player can interact; it does not mean every below-the-fold image or secondary panel has loaded. Record cache hit/miss, navigation source, auth-ready time, route-ready time, API server timing, payload bytes, and art completion alongside the duration. Segment rather than trusting one global percentile.

Security and correctness are non-negotiable:

1. Never place authenticated dashboard or game responses in a public/shared CDN cache.
2. Key any browser cache by authenticated user ID and resource ID. Purge it on sign-out, account switch, lock, and deployment/schema incompatibility.
3. Cache only the already-authorised response, not a raw Mongoose document. Viewer-specific hands and other hidden information must stay viewer-specific.
4. A prefetched/cached board is a provisional paint. Revalidate on entry before accepting a command; retain the existing command validation and conflict handling on the server.
5. Do not persist sensitive game JSON in the service worker, Cache Storage, or `localStorage` in the first implementation. An in-memory cache dies with the tab and has a much smaller leakage/staleness surface.

## Phase 0 — establish where the time goes

Do this before selecting an architectural fix.

1. Add client performance marks for navigation intent/tap, route commit, authorisation ready, first data available, board painted, and board interactive. Use `useReportWebVitals` or the existing analytics path for Core Web Vitals and the custom marks.
2. Add `Server-Timing` spans to `/api/dashboard` and `/api/game/:id`: Clerk auth, Mongo connection, Mongo query, player-directory lookup, response construction, reaction lookup, and serialisation. Include total response bytes in telemetry, but never IDs, names, hands, chat, or command bodies.
3. Inspect production bundle output per route and measure image bytes/decoding. Test a representative light game and each art-heavy game; an aggregate bundle number will hide game-specific regressions.
4. Run Mongo `explain("executionStats")` for the dashboard and game queries against production-shaped data. Record documents/keys examined, execution time, and result count. Check connection reuse and cold-function frequency in hosting telemetry.
5. Capture a repeatable Playwright trace for dashboard → game, game → home, home → profile, home → new game, and push/deep-link → game under cold and warm caches with mobile CPU/network throttling.
6. Create a small performance budget checked in CI: route JavaScript, first-game JSON, and largest required image. Use a scheduled or deployment smoke test for latency percentiles; do not make noisy Internet timings a per-commit gate.

### How the client timings are measured

`PerformanceReporter` keeps one **journey** per route arrival, and every milestone a screen marks (`auth_ready`, `first_data`, `dashboard_usable`, `game_board_painted`, `game_usable`, via `window.__agPerformanceMark`) is timed from that journey's start, never from when the tab opened. A document load starts at the time origin and is `cold`. An in-app route change is `warm` and starts at the tap or key press that caused it, or at the back/forward. That includes `router.push` from a clickable row, not just `<Link>`. A route change with no tap or back/forward in the previous thirty seconds is a redirect: it starts a journey but reports no `navigation`. Each milestone counts once per journey. A side panel's data (the chat thread) never marks `first_data`. A journey that goes to the background part-way through reports no more milestones. Web Vitals always belong to the document load (`cold`).

The admin report splits journey metrics into cold and warm, and ignores journey samples recorded before this scheme (they carry no `cache`). Those samples counted from when the tab opened, which is why a game opened after a minute on the dashboard looked like a one-minute load.

**Exit criterion:** a trace can attribute the median and p75 game-entry time among route/RSC, JavaScript, Clerk readiness, API/server work, JSON transfer, render, and images.

## Phase 1 — remove the game-entry waterfall

### 1. Make game rows real links

Render dashboard and rail destinations as shared Next.js `<Link>`-based rows instead of `div`/keyboard handlers plus `router.push`. Keep one semantic, reusable row component for click, keyboard, focus, and analytics behavior.

- **Pros:** automatic viewport prefetch; better accessibility and open-in-new-tab behavior; small, low-risk change.
- **Cons:** Next route prefetch fetches the route/RSC and code, not the client-fetched game API response; a long list can prefetch more routes than useful.
- **Mitigation:** prioritise “your turn” and visible rail games. Disable or defer automatic prefetch for long completed/their-turn lists if traces show network contention.

### 2. Add an authenticated in-memory resource cache

Extend the shared data-fetching layer rather than teaching each game its own cache. Store successful bodies by `{userId, URL, response-schema-version}` with fetched time, invalidation state, and one shared in-flight promise. A remount should synchronously use a fresh cached body and revalidate in the background (stale-while-revalidate). A mutation response should update the same entry; push events should mark or refresh it. Apply a small LRU/TTL bound.

Suggested starting policy, to be tuned from data:

- live game: render a cached value immediately for up to 30 seconds, then always revalidate on entry;
- dashboard: render immediately for up to 15 seconds, then revalidate;
- immutable metadata/guides: cache for the tab or build version;
- errors, 401, 403, and 404: do not cache as data.

- **Pros:** makes back/forward and recent revisits nearly instant; centralises request deduplication; retains the current API contract; does not require a new dependency.
- **Cons:** consumes memory; can briefly paint stale turns; per-tab only; careful mutation and identity invalidation are required.
- **Mitigation:** show “updating” rather than a blocking skeleton, disable actions until entry validation completes when the cached revision may be stale, and use a bounded LRU. Prefer an explicit server revision/`updatedAt` token so commands and refreshes can reason about freshness.

A library such as SWR or TanStack Query could supply deduplication, stale time, mutation, and garbage collection. It also adds bundle weight, migration work, and another abstraction alongside push-driven refresh. First prototype the minimal shared cache around `useRefreshableData`; adopt a library only if offline mutation, broad query composition, or cache inspection justifies it.

### 3. Prefetch the likely game data, not every game

Once the dashboard response is available and the tab is idle, prefetch the full response for the top one or two “your turn” games. Also prefetch on pointer hover, touch/pointer down, and keyboard focus for any game row. Share the exact cache and in-flight promise used by `useGameData`; prefetch must not be a parallel fetch implementation.

Call `router.prefetch(href)` for imperative/intention-driven navigation where a `<Link>` has not already prefetched the route. Use its invalidation facility only after confirming the exact API supported by the pinned Next.js version.

- **Pros:** overlaps game API, route chunk, and think time; directly targets the most valuable journey; an intent prefetch wastes little bandwidth.
- **Cons:** idle prefetch can waste database work and cellular data, and prefetched state can become stale before the tap.
- **Mitigation:** cap concurrency at one, skip idle prefetch under data-saver/poor-network signals, pause when hidden, prioritise only likely games, cancel superseded work, and revalidate on entry. Track prefetched-hit and wasted-prefetch rates.

Do **not** include every full game response in `/api/dashboard`. It would slow the dashboard, multiply hidden data in memory, and penalise users with many games. A narrowly bounded optional “next game snapshot” could be tested later, but only if separate prefetch latency is demonstrably the remaining bottleneck.

### 4. Consider server-seeded first data as a measured alternative

A deeper option is to make each game route a server component that authenticates and loads the initial authorised response, then passes it to a client board/cache provider. This collapses route and API work into the navigation request and can stream a game shell immediately.

- **Pros:** eliminates a browser API round trip; server starts database work earlier; deep links and cold entries benefit, not just dashboard taps.
- **Cons:** substantial migration across every game page; dynamic personalised RSC payloads must never be publicly cached; client code can still wait on hydration; auth/session edge cases and duplicated server/API loaders become risks.
- **Mitigation:** extract one server-only `loadGameForViewer(gameId, userId)` used by both the route and API, pilot one representative game, and compare against API prefetch. Roll out only if it wins materially after implementation complexity and server cost.

Do not run a server page load and `/api/game` load in parallel for the same entry. Pick one source for initial data and hydrate the shared client cache from it.

## Phase 2 — make server reads cheaper and safely cache stable work

### Cache the stable pieces, not live game state

| Candidate | Recommended scope | Pros | Cons / risks |
| --- | --- | --- | --- |
| Static game metadata, guides, themes | build/module or long public cache | immutable per deploy; safe; removes repeated requests | requires versioned invalidation on deploy |
| Public art and generated icons | CDN, immutable versioned URLs where possible | large bandwidth and latency win | stale assets if URLs are not content/versioned |
| Clerk user display-name/avatar directory | short server cache by user ID | removes external calls shared by dashboard/game reads | rename/avatar staleness; personal data retention; invalidation complexity |
| Authorised game response | short per-user browser memory only initially | instant revisit/prefetch reuse | hidden-state and stale-action risk |
| Dashboard response | short per-user browser memory only initially | fast home/back | invite/turn lists age rapidly |
| Raw game document or API response in shared CDN | **do not cache** | apparent hit-rate benefit | cross-user leaks, hidden-state exposure, stale turns |
| Service-worker/API persistent cache | defer | could help unreliable networks | logout/account-switch leakage, unbounded stale state, hard invalidation |

If server-side response caching is later required, use a private, user-scoped key and explicit invalidation on every game command, reaction, chat/read event, invite transition, game end, user rename, and player drop. Because horizontally scaled/serverless instances do not share process memory reliably, an in-process cache is only an opportunistic optimisation; a shared cache adds operational cost and sensitive-data handling. Prefer database/query improvements and client reuse first.

### Optimise the measured server spans

- Reuse the Mongo connection and verify cold connection time. Do not add a second connection path for prefetch.
- Project only fields needed by dashboard summaries. Consider `.lean()` only where document/discriminator methods are not required, or replace those methods with pure response builders first.
- Keep independent dashboard reads concurrent. Paginate completed games in the dashboard query rather than loading an unbounded history and then rendering ten, if measurement confirms that is occurring.
- Batch reaction data and player-directory reads. Add a short, bounded Clerk-directory cache if that span is material, with a documented rename freshness target.
- Validate all proposed Mongo indexes with `explain`; every index costs memory and write time. Add only an index that changes the observed plan or examined-document count.
- Add response compression/hosting checks and avoid serialising replay/private fields. Smaller payloads improve parse and render time as well as transfer.
- Return a revision/ETag for games. A conditional validation can answer `304` or a compact “unchanged” response, but only after auth and membership checks. This saves bytes/serialisation, not necessarily database/auth time.

## Phase 3 — reduce code, render, and art delay

1. Use the bundle report to find shared code accidentally imported into every route. Keep game engines and game-specific UI in their game route rather than shared client barrels.
2. Dynamically load non-critical game features such as chat/GIF picker, history, guides/tutorial content, result charts, and developer controls. Keep the board and immediate turn controls eager.
3. Ensure a navigation-level skeleton appears promptly, but retain prior content during refresh. A skeleton improves perceived responsiveness; it does not count as the performance fix.
4. Convert oversized board/card art to appropriately compressed modern formats and responsive dimensions while preserving masters and the existing art workflow. Prioritise images required above the fold.
5. Preload only the selected game's critical board image. Do not preload the entire library or both theme art sets. Lazy-load below-the-fold cards/panels and reserve their dimensions to avoid layout shift.
6. Measure decode/render cost for map-heavy boards. Memoise expensive derived geometry only when profiles show repeated computation; avoid blanket memoisation.
7. Audit root client providers and Bootstrap/global CSS. Moving stable shells to server components or narrowing providers can reduce hydration, but only do so where bundle traces show a useful saving.

**Pros of code splitting:** smaller initial route chunks and less parse/hydration work. **Cons:** opening a deferred panel gains a delay and too many chunks add request overhead. Intent-prefetch deferred panels on hover/focus if needed.

**Pros of stronger image caching/compression:** large repeat and cellular wins with little state risk. **Cons:** format conversion can affect visual quality, and immutable caching requires versioned URLs or disciplined invalidation.

## Phase 4 — improve the rest of the app

Apply the shared primitives in priority order:

1. home/dashboard ↔ game;
2. push/deep link → game;
3. home ↔ new-game library/setup;
4. lobby → started game (begin route and data prefetch as soon as the started game ID is known, before navigation);
5. home ↔ profile/settings and completed results;
6. admin pages last.

For static/public pages, favour server rendering and normal Next route prefetch. For personalised pages, seed or reuse private client data and refresh unobtrusively. Replace imperative navigation with `<Link>` whenever it is genuinely a link; keep `router.push` for post-mutation transitions. On post-mutation transitions (create, join, start, command), put the response into the destination cache before navigating whenever that response already contains the authoritative destination state.

## Delivery sequence

Ship in small, reversible changes and compare each stage with the Phase 0 baseline.

1. **Observability:** custom marks, `Server-Timing`, bundle/image report, database explains, and repeatable traces.
2. **Navigation semantics:** shared linked game row; route prefetch for the likely destinations.
3. **Shared memory cache:** request deduplication, identity/schema keys, TTL/LRU, mutation updates, push invalidation, and logout purge.
4. **Targeted prefetch:** intent first, then a one-game idle experiment behind a flag. Monitor hit rate, waste, API load, and mobile bytes.
5. **Backend fixes:** address only spans shown to dominate (directory cache, projection/pagination, query/index, conditional validation).
6. **Bundle and art:** split secondary features and optimise/preload only critical assets.
7. **Server-seeded pilot:** try one game only if cold deep links still miss the target; compare it with the prefetched-API design before wider migration.
8. **Broader routes:** reuse the proven link/cache/prefetch primitives throughout the app.

For each rollout, use a feature flag or staged percentage, watch p50/p75/p95, errors, server duration, database reads, transfer bytes, cache correctness, and command-conflict rate, then remove the losing implementation rather than carrying two permanent paths.

## Required tests

- Unit tests for cache TTL, LRU eviction, in-flight deduplication, schema/user keying, push invalidation, mutation replacement, and failed-response behavior.
- Security tests proving two users in one browser profile cannot receive each other's cached dashboard/game response and that logout/lock clears private entries.
- Hidden-information tests for every response seeding or cache path.
- Integration tests that a prefetched response is reused, then revalidated, and that a turn advancing between prefetch and tap cannot enable an invalid action.
- Navigation tests for mouse, touch, keyboard, browser back/forward, direct URL, push link, expired session, account switch, and offline/online recovery.
- Performance tests/traces under cold/warm cache and throttled mobile profiles, with budgets for JavaScript, JSON, critical art, and requests.
- Existing build, typecheck, lint, and API/game test suites after implementation changes.

## Decisions to make from evidence

After Phase 0, record these decisions in the implementation PR:

1. Is game entry mostly route/code, auth, API/server, payload/render, or art?
2. Does `<Link>` route prefetch plus game-data intent prefetch meet the warm target?
3. What TTL produces a useful hit rate without a visible stale-board rate?
4. Is idle prefetch worth its wasted request and mobile-byte rate?
5. Does Clerk directory lookup justify a server cache and its rename-staleness trade-off?
6. Does server-seeded data beat client API prefetch enough to justify migrating all game pages?
7. Which secondary features and assets dominate each heavy game, and what should remain eager?

The likely first implementation is therefore deliberately modest: **measure, make game rows links, add one user-scoped in-memory stale-while-revalidate cache, and prefetch the top likely game with strict limits**. It attacks the known client waterfall without introducing persistent private-state caching or rewriting every game route, and it leaves a measured path to server seeding if cold entries remain slow.
