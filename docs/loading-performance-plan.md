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

The [2026-10-09 checkpoint](./performance-checkpoints/2026-10-09.md) added these findings, which the phases below now address:

- `clerkMiddleware()` matched every page, not just the API. Yet only two server components read auth: `/` and `/join`, and both only to guess which screen to paint first. Every other page authorises on the client with `useAuthGuard`. *(Fixed by Phase 1.1c.)*
- `public/sw.js` answered every navigation network-first, without navigation preload. *(Fixed by Phase 1.1b.)*
- Every `/games/<game>/[gameid]` route built as dynamic (`ƒ`), although its page is a pure client component with no server data. *(Fixed by Phase 1.1d.)*
- `buildUserDirectory` / `userIdListToNamesAndMap` call Clerk on every request, uncached. That makes the call the largest server span on both the game and dashboard reads, and every poll pays it again.
- `/api/dashboard` loads every live game as a full document (move history included), and every completed result the player has ever had, to draw summary rows and ten finished games.
- Moment.js ships with all of its locales (310 KB raw / 76 KB gzip) on `/`, `/profile` and the result screen, for `fromNow()` and one `format("D MMM")`.

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

`PerformanceReporter` keeps one **journey** per route arrival, and every milestone a screen marks (`auth_ready`, `first_data`, `dashboard_usable`, `game_board_painted`, `game_usable`, via `window.__agPerformanceMark`) is timed from that journey's start, never from when the tab opened. A document load starts at the time origin and is `cold`. An in-app route change is `warm` and starts at the tap or key press that caused it, or at the back/forward. That includes `router.push` from a button or a post-mutation transition, not just `<Link>`. A route change with no tap or back/forward in the previous thirty seconds is a redirect: it starts a journey but reports no `navigation`. Each milestone counts once per journey. A side panel's data (the chat thread) never marks `first_data`. A journey that goes to the background part-way through reports no more milestones. Web Vitals always belong to the document load (`cold`).

A screen's own data fetch (`useRefreshableData`, not a side panel's) is tagged `entry` when it brings the screen's first data and `refresh` after that: a poll, a push, the tab coming back. Its `Server-Timing` spans carry that tag, and so do the browser's own record of the request, read from its `PerformanceResourceTiming` (not the `Content-Length` the host strips): `api_total` (`fetch()` to last byte), `api_connect` (before the request was sent: queueing, DNS, connection), `api_network` (send to first byte, less `server_total`), `api_download` (first byte to last) and `response_bytes` (the compressed body). A fetch that had to renew the session first also reports `session_retry`: what the refused attempt, the renewal and the wait cost. Its sample count against `server_total`'s, on the same route and tag, is the retry rate. The admin report splits all of these by tag.

The admin report splits journey metrics into cold and warm, and ignores journey samples recorded before this scheme (they carry no `cache`). Those samples counted from when the tab opened, which is why a game opened after a minute on the dashboard looked like a one-minute load.

### Checkpoints

Each baseline taken from the admin report is saved, with its analysis, under
[`docs/performance-checkpoints/`](./performance-checkpoints/), named by date, so
every phase can be compared with the one before it.

- [2026-10-09](./performance-checkpoints/2026-10-09.md): the first seven-day
  baseline, before any Phase 1 work. Every target is missed. Cold loads lose
  1.7–3.4 s before the first byte. Warm game entry is dominated by the API
  fetch, and server time by the Clerk name lookup.

**Exit criterion:** a trace can attribute the median and p75 game-entry time among route/RSC, JavaScript, Clerk readiness, API/server work, JSON transfer, render, and images.

## Phase 1 — remove the game-entry waterfall

### 1. Stop losing the cold load before the first byte

The checkpoint's largest number is the document's TTFB: 3.4 s median on `/` and 1.7 s on a game, before any of our code runs. It is bimodal on every route, static ones included: about 0.25 s, or 4–6 s. The slow cluster is therefore on the path of every document request, not in page rendering. Prove which cause it is, then remove the ones that apply. The three fixes are independent of each other.

**Status: shipped — all four parts (a–d) together.** What is still owed is the evidence, at the next checkpoint: the TTFB distribution before and after, with the 4–6 s cluster gone, and the new phase metrics saying where any remaining wait goes. With no handshake, a cold load's session cookie can still be the expired one until Clerk's script renews it. So `useIsAuthorised` holds every request back until the page has confirmed its token once (`getToken()`, bounded at five seconds), and setup screens keep their action disabled until then. The performance beacon is held until Clerk has loaded, for the same reason. Watch the time from `auth_ready` to `first_data` at the next checkpoint, for what that confirmation costs.

**a. Attribute it first.** Report the TTFB phases from `web-vitals/attribution` (`waitingDuration`, `cacheDuration`, `dnsDuration`, `connectionDuration`, `requestDuration`). `web-vitals` is already in the tree through Next; make it a direct dependency rather than relying on `useReportWebVitals`, which carries no attribution. Also report the service worker's startup gap from the navigation entry, as `sw_startup`. A long worker gap points at the service worker. A long `waitingDuration` with no worker gap points at redirects — the Clerk handshake among them.

The client can't flag a handshake directly. Clerk strips `__clerk_handshake` with one more redirect before the page is served, and a cross-origin redirect chain zeroes the navigation entry's redirect timings. Once (c) is in, no page request can handshake at all. The evidence is therefore the TTFB distribution before and after this ships: the 4–6 s cluster should go.

**b. Service-worker navigation preload.** In `public/sw.js`, call `self.registration.navigationPreload?.enable()` in `activate`. In the navigate handler, answer with `(await event.preloadResponse) ?? fetch(event.request)`, keeping the network-first order and the offline fallback exactly as they are. The browser then sends the navigation request while the worker boots, instead of after.

- **Pros:** takes worker startup off every document request; one file; caches nothing, so no personal-state risk.
- **Cons:** needs feature detection on older browsers. A preload the handler never awaits is a wasted request.
- **Mitigation:** always consume `preloadResponse` when it exists. Test the offline page still appears with the network off.

**c. Keep Clerk off page requests that don't read auth on the server.** On a document request whose session JWT has expired — as it has after a minute idle — `clerkMiddleware` redirects through Clerk's Frontend API and back before serving the page. Pages that authorise on the client gain nothing from that trip.

1. Replace the server `auth()` in `src/app/page.tsx` and `src/app/join/page.tsx` with a signed-in *hint*: whether Clerk's own `__client_uat` cookie (or its suffixed form) is present and non-zero, read with `cookies()`. Both pages already treat the server's answer as a guess that Clerk overrules on load (`HomeScreen`'s refresh, `JoinForm`'s correction), so nothing is decided on the hint.
2. Narrow the middleware `matcher` to the API (`/(api|trpc)(.*)`) and to any page that still calls `auth()`/`currentUser()` on the server.
3. API requests are not document requests, so they never handshake. An expired token there gets the 401 that `fetchWithSessionRetry` already refreshes and retries.

- **Pros:** removes a cross-origin redirect pair from every cold open. Static pages come straight from the CDN.
- **Cons:** security-relevant. A server component added later that calls `auth()` on an unmatched route fails (Clerk throws when its middleware hasn't run).
- **Mitigation:** a guard test, `src/middleware.test.ts`, pins the matcher to the API. It also walks the module graph from every page-shaped file under `src/app` (outside `api/`) and fails if any of them can reach `auth()`, `currentUser()` or `getAuth()` — a namespace import, re-export or dynamic import of `@clerk/nextjs/server` counts. Get a `locksmith` pass on the change, and confirm that no route relied on the middleware for protection (it protected none: `clerkMiddleware()` was called without `protect`).

**d. Serve game routes as static shells.** Each game page is a client component that fetches its own data, yet it builds as dynamic. A warm navigation therefore waits on a function render (277 ms median, 530 ms p75, against about 120 ms for static routes), and a cold load can't come from the CDN. Give each game route a server wrapper that exports `generateStaticParams` returning `[]`, so the shell renders once per id and is cached. Put that one export in a single shared module and re-export it from each game's route. Don't hand-write it per game. Confirm in the build output that the routes stop being `ƒ`.

- **Pros:** route commit at static-route speed; `<Link>` prefetch fetches the whole shell; cold loads hit the CDN once (c) is in.
- **Cons:** one cached shell per game id. A shell that ever read viewer data on the server would be cached and served to everyone.
- **Mitigation:** the shell stays a data-free client component, which a `croupier` pass checks. A guard test (`src/app/games/staticShell.test.ts`) fails if a client game page lacks the shell, or if the shell ever wraps a page that isn't `'use client'`. Anything personal arrives through the authorised API, as today.
- **Accepted:** any id gets a shell, so requests for made-up ids add cache entries. Each costs one render, which every request used to.

**Exit:** the TTFB p75 for `/` and the game route is under 1 s, and the 4–6 s cluster is gone from the TTFB distribution.

### 2. Make game rows real links

Render dashboard and rail destinations as shared Next.js `<Link>`-based rows instead of `div`/keyboard handlers plus `router.push`. Keep one semantic, reusable row component for click, keyboard, focus, and analytics behavior.

- **Pros:** automatic viewport prefetch; better accessibility and open-in-new-tab behavior; small, low-risk change.
- **Cons:** Next route prefetch fetches the route/RSC and code, not the client-fetched game API response; a long list can prefetch more routes than useful.
- **Mitigation:** prioritise “your turn” and visible rail games. Disable or defer automatic prefetch for long completed/their-turn lists if traces show network contention.

**Status: shipped.** The “your turn” cards and the finished-game rows are now real `<Link>`s, so they can be opened in a new tab or long-pressed, take focus as links and get viewport prefetch; the rail's game rows and the waiting-on-others rows already were links and are unchanged. Next's default viewport prefetch is kept everywhere, with no `prefetch={false}`: there is no trace evidence of contention yet. What is still owed is the evidence, at the next checkpoint: warm `navigation` and `game_usable` from the dashboard to a game, and the route-commit time of those taps, compared with the 2026-10-09 baseline. If the finished list's prefetches show up as contention, defer them for that list only.

**Status: shipped — navigation semantics, the rest of it.** Every `router.push` and `router.replace` in `src/` was audited. The one genuine link left was Kingdom Builder's “Open settlement N” buttons on the world page, which are now `<Link>`s with the same `ag-btn` look. Everything else stays imperative on purpose: post-mutation transitions (create, join, start, end, delete account, leave a world, duplicate a game), auth and session redirects, the push, deep-link and Capacitor back-button handlers, `useGameData`'s ejections, and the tap on a map node, which is an SVG hit target with no anchor to be. No imperative `router.prefetch` was added, because none had a destination known noticeably before the tap. Every game's back arrow and the lobby's “Back home” are already `<Link>`s to `/`, so the redirects home are prefetched by the page the player is on. A finished board's “View result” is a `<Link>` too. `useGameData`'s `replace` to the result page fires on a 404, and nothing knows a game will 404 until it does, so prefetching on mount would fetch a route most boards never use. Every started game's id arrives in the response that sends the player there (create, join, start, the lobby poll), so a prefetch would be followed straight away by the push and gain nothing. Kingdom Builder's world and settlement routes are still `ƒ (Dynamic)`, with no loading boundary, so a prefetch of them would fetch almost nothing. If those routes get a static shell, prefetching the player's own settlements from the world page is the first candidate. What is still owed is the evidence, at the next checkpoint: that nothing regressed in the settlement taps' route-commit time, and whether any imperative navigation still shows a long `navigation` metric once the cache work has landed.

### 3. Add an authenticated in-memory resource cache

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

### 4. Prefetch the likely game data, not every game

Once the dashboard response is available and the tab is idle, prefetch the full response for the top one or two “your turn” games. Also prefetch on pointer hover, touch/pointer down, and keyboard focus for any game row. Share the exact cache and in-flight promise used by `useGameData`; prefetch must not be a parallel fetch implementation.

Call `router.prefetch(href)` for imperative/intention-driven navigation where a `<Link>` has not already prefetched the route. The Phase 1.2 audit found no such navigation today (every destination is either a `<Link>` already or unknown until the push), so there is no route prefetch in the tree yet. Use its invalidation facility only after confirming the exact API supported by the pinned Next.js version.

- **Pros:** overlaps game API, route chunk, and think time; directly targets the most valuable journey; an intent prefetch wastes little bandwidth.
- **Cons:** idle prefetch can waste database work and cellular data, and prefetched state can become stale before the tap.
- **Mitigation:** cap concurrency at one, skip idle prefetch under data-saver/poor-network signals, pause when hidden, prioritise only likely games, cancel superseded work, and revalidate on entry. Track prefetched-hit and wasted-prefetch rates.

Do **not** include every full game response in `/api/dashboard`. It would slow the dashboard, multiply hidden data in memory, and penalise users with many games. A narrowly bounded optional “next game snapshot” could be tested later, but only if separate prefetch latency is demonstrably the remaining bottleneck.

### 5. Consider server-seeded first data as a measured alternative

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
- Project only fields needed by dashboard summaries, and paginate its completed games — confirmed necessary; see "Make the dashboard read only what it shows" below. Consider `.lean()` only where document/discriminator methods are not required, or replace those methods with pure response builders first.
- Keep independent dashboard reads concurrent.
- Batch reaction data and player-directory reads. The Clerk directory is confirmed material; see "Cache the player directory on the server" below.
- Validate all proposed Mongo indexes with `explain`; every index costs memory and write time. Add only an index that changes the observed plan or examined-document count.
- Add response compression/hosting checks and avoid serialising replay/private fields. Smaller payloads improve parse and render time as well as transfer.
- Return a revision/ETag for games. A conditional validation can answer `304` or a compact “unchanged” response, but only after auth and membership checks. This saves bytes/serialisation, not necessarily database/auth time.

### Cache the player directory on the server

The Clerk name lookup is the largest server span on both reads: about 210 ms of the game API's 270 ms median (inside the `response` span), and 277 ms of the dashboard's 591 ms (`player_directory`). Polls and push refreshes repeat it on every request, and each call also counts against Clerk's Backend API rate limit.

- **Where:** inside `src/utils/users/clerk.ts`, behind the directory-shaped resolvers only: `buildUserDirectory`, `userIdListToUsernameList`, `userIdListToNamesAndMap`. Each looks up the ids it holds and fetches only the misses, in the one `getUserList` call it makes today. The collision tags ("Dave (2)") are still computed per request over the whole set by `namesFor`, so caching changes nothing about who is told apart.
- **What:** only the display fields `nameOf`, `publicHandle` and `profileImageUrl` read, never the Clerk `User`. `usersById` itself stays uncached: its other callers read private metadata — device tokens, preferences, unlock flags — which must be fresh.
- **Bounds:** a 5-minute TTL, which is the documented rename freshness target. An LRU capped at about 2,000 entries per instance. Per process, so it is opportunistic: it depends on a warm instance, which a game being polled usually has. If Clerk fails, serve any stale entries held rather than fail the read; with none held, behave as today.
- **Invalidation:** `/api/user/displayname` and `/api/user/claim` drop the user's entry on the instance that served them. Profile pictures change through Clerk on the client, so the TTL bounds them.
- **Measure:** split the game route's `response` span into `names` and `response`, so the Clerk share is measured rather than inferred. Add a hit/miss count to `Server-Timing`.
- **Pros:** about 200 ms off most game reads (270 → under 100 ms median) and about 270 ms off the dashboard (591 → about 320 ms). Far fewer Clerk calls.
- **Cons:** a rename or new picture can take up to five minutes to reach other players. Names and image URLs are held in server memory.
- **Mitigation:** hold display fields only, under a stated TTL, and invalidate on our own write paths. A unit test proves that no metadata field is ever stored.

**Status: shipped.** `src/utils/users/directoryCache.ts` holds `{ id, name, handle, imageUrl }` records only, for 5 minutes, LRU-capped at 2,000. An id Clerk doesn't know (a deleted account) is remembered as a miss for 30 seconds, so finished games with a deleted player don't send every lookup back to Clerk. `buildUserDirectory`, the list resolvers and `userIdListToImageMap` read through it. `userIdListToUntaggedNameList` stays uncached, because it decides whether a name is already taken. If Clerk fails, or hasn't answered within 1.5 s, missed ids are answered from stale entries when every one of them has one. Otherwise the read waits on Clerk and fails as before, so the deadline never turns a slow answer into an error, and a lookup given up on still fills the cache when it answers. Display-name, claim, account-delete and guest-delete paths drop the user's entry. `ServerTiming` now runs each span inside an `AsyncLocalStorage` store, so the resolvers report a `names` span (nested inside `response` / `player_directory`, not subtracted from it, so those stay comparable with the baseline) and a `names_cache;desc="hit=… miss=…"` entry, without any game model changing. What is still owed is the evidence, at the next checkpoint: `server_names` and the game route's `server_response` medians against the 2026-10-09 baseline.

### Make the dashboard read only what it shows

`buildDashboard` reads every live game as a full Mongoose document, each Realm Arena move history included, to build rows that use a dozen top-level fields. It also reads every completed result the player has ever had, of which it shows ten. Its `mongo_query` span is 238 ms median, against 37 ms for a single game.

- **Live games:** add an inclusion projection exported beside `CreateResponse`, so the field list lives next to the code that reads it: `gameId`, `gameType`, `userIdList`, `turnTimer`, `currentTurn`, `lastTurnTimestamp`, `complete`, `winner`, `endReason`, `forfeitedBy`, the discriminator key, and Smartthink's `specificGameState.codeSetterId`, plus whatever `unreadChatCounts` and the filters read. Add a guard test that `CreateResponse` on a projected fixture equals `CreateResponse` on the full document, for every game type. A summary field added later then fails the test instead of rendering blank.
- **Completed results:** the dashboard draws ten and a "See all" when there are more, so ask for eleven (`limit + 1`) through a `limit` argument on `completedGameResults`, projected to the fields `toCompletedGames` reads. `/api/game/mycompletelist` keeps the full list. The existing `{ playerIds: 1, endedAt: -1 }` index already serves the sorted, limited read; confirm with `explain`.
- **Untimed work:** time `unreadChatCounts` and `kingdomBuilderWorlds` as their own spans. They account for about 70 ms of the median that no span covers today.
- **Pros:** less data read, hydrated and garbage-collected per dashboard load. The cost stops growing with a player's history.
- **Cons:** a projection can silently drop a field a summary later starts reading.
- **Mitigation:** the equivalence test above.
- **Exit:** dashboard `mongo_query` median under 80 ms, and flat as completed games accumulate.

**Status: shipped.** `GAME_SUMMARY_PROJECTION` sits beside `CreateResponse` in `GameData.ts`: the plan's fields plus the discriminator key `kind`, and `gameType` whole. `endDetail` isn't read by a summary, so it stays out. `GameSummaryProjection.test.ts` builds a fully populated fixture for every engine game type found under `src/games/*/meta.ts` (plus Smartthink's computer-sets-the-code branch). It checks that the summary from a document hydrated through the projection equals the one from the full document. Completed results are projected to the seven fields their readers use. The dashboard asks for `DASHBOARD_COMPLETED_LIMIT + 1` (shared with `Dashboard.tsx`), and `/api/game/mycompletelist` keeps the full list. The `{ playerIds: 1, endedAt: -1 }` index is declared; its `explain` against production data is still owed. `unread_chat` and `kb_worlds` are now spans of their own. What is still owed is the evidence: dashboard `mongo_query` and `total` medians at the next checkpoint, and a check of the projected read on a Smartthink game in a preview.

## Phase 3 — reduce code, render, and art delay

1. Use the bundle report to find shared code accidentally imported into every route. Keep game engines and game-specific UI in their game route rather than shared client barrels.
2. Dynamically load non-critical game features such as chat/GIF picker, history, guides/tutorial content, result charts, and developer controls. Keep the board and immediate turn controls eager.
3. Ensure a navigation-level skeleton appears promptly, but retain prior content during refresh. A skeleton improves perceived responsiveness; it does not count as the performance fix.
4. Convert oversized board/card art to appropriately compressed modern formats and responsive dimensions while preserving masters and the existing art workflow. Prioritise images required above the fold.
5. Preload only the selected game's critical board image. Do not preload the entire library or both theme art sets. Lazy-load below-the-fold cards/panels and reserve their dimensions to avoid layout shift.
6. Measure decode/render cost for map-heavy boards. Memoise expensive derived geometry only when profiles show repeated computation; avoid blanket memoisation.
7. Audit root client providers and Bootstrap/global CSS. Moving stable shells to server components or narrowing providers can reduce hydration, but only do so where bundle traces show a useful saving. The checkpoint measured about 610 KB raw (186 KB gzip) on a route as light as `/newgame`, so this floor is the next audit after item 8.
8. **Replace Moment.js.** It ships with every locale, 310 KB raw / 76 KB gzip, on `/`, `/profile` and the result screen. That is about a third of what home carries above the floor. Its seven call sites use only `fromNow()` and `format("D MMM")`.
   - Add `src/utils/ui/time.ts` with `timeAgo(date)`, over `Intl.RelativeTimeFormat('en', { numeric: 'auto' })` with the largest whole unit, and `shortDate(date)`, over `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })`.
   - Switch all seven call sites to it, remove `moment` from `package.json`, and lower `routeJavaScript` in `scripts/check-performance-budget.mjs` by the saving so it can't creep back in.
   - Wording shifts slightly ("a day ago" becomes "yesterday"). Unit-test the unit boundaries.
9. **Fix layout shift where it starts.** CLS is above 0.25 at p75 on every product screen except Settings: board 0.45, home 0.62, profile 1.03, result 0.86. "Good" is 0.1.
   - **Attribute it first.** Report CLS (and LCP) through `web-vitals/attribution`, sending the largest shift's target as a coarse region name from an allow-listed `data-perf-region` attribute on the shared components, never element text or ids.
   - **Fix it in the shared pieces,** so every screen benefits:
     - `ListSection` skeletons match the real rows' height and the last-known row count.
     - `BoardZoom` and `GameShell` reserve the board's box from its viewBox `aspect-ratio` before data arrives.
     - `GameThumb` and `Avatar` carry fixed dimensions.
     - Late banners (install, notifications, "What's new") open below the content or into reserved space, never above it.
     - Home's server signed-in guess (item 1c in Phase 1) must paint the same skeleton height as the screen Clerk confirms.
   - **Exit:** p75 CLS at or under 0.1 on `/`, the game route, `/profile` and the result screen.
10. **Make the Realm Arena board answer taps within 200 ms.** Its INP is 224 / 416 / 560 ms (median / p75 / p95). Taps on home sit at 72 ms median.
    - **Attribute it first:** report the INP target region (same allow-list as item 9) with its `inputDelay`, `processingDuration` and `presentationDelay`. Record a Performance-panel profile of selecting a fighter, tapping a square and choosing a turn-sheet action under 4× CPU throttling.
    - **Act only on what the profile shows.** Likely candidates:
      - Keep the tap's immediate feedback urgent, and move reach, path and line-of-sight recomputation into `startTransition` or into memoised derivations keyed on the selected unit.
      - Stop a selection re-rendering every tile, by making the selection overlay its own layer over a tile layer whose props don't change.
      - Compute the map's isometric geometry once per battlefield and turn of the view, not per render.
      - Leave anything that moves frame by frame on the `usePlayback` frame loop.
    - **Exit:** p75 INP at or under 200 ms on the board.

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

Reordered after the [2026-10-09 checkpoint](./performance-checkpoints/2026-10-09.md): the cold document and the server's Clerk lookup cost more than the client waterfall Phase 1's later items target, and they are cheaper to fix.

1. **Observability:** custom marks, `Server-Timing`, bundle/image report, database explains, and repeatable traces. Then close the checkpoint's gaps: TTFB, CLS, LCP and INP attribution; response bytes and network time from resource timing; entry vs refresh tagging; the dashboard's untimed spans; and the session-retry count. — *custom marks, `Server-Timing`, the bundle/image budget, TTFB attribution, resource-timing bytes and network time, entry vs refresh tagging, the dashboard's spans and the session-retry count shipped*. Still owed: the database explains, repeatable traces, and CLS, LCP and INP attribution (Phase 3.9 carries the CLS/LCP design).
2. **Cold document** (Phase 1.1) — *shipped*: TTFB attribution, service-worker navigation preload, the Clerk matcher with the cookie hint, and static game shells, in one change. The next checkpoint compares the TTFB distribution with this one.
3. **Server reads** (Phase 2) — *player-directory cache, dashboard projection and bounded completed results shipped*. Next is any other span still shown to dominate (query/index, conditional validation).
4. **Navigation semantics** (Phase 1.2) — *shipped*: your-turn cards and finished rows are `<Link>`s, as the rail and waiting rows already were, and so are Kingdom Builder's settlement buttons. The remaining `router.push` calls are post-mutation or redirect transitions and stay. No imperative route prefetch was needed: the destinations are either already `<Link>`-prefetched or unknown until the push.
5. **Shared memory cache:** request deduplication, identity/schema keys, TTL/LRU, mutation updates, push invalidation, and logout purge.
6. **Targeted prefetch:** intent first, then a one-game idle experiment behind a flag. Monitor hit rate, waste, API load, and mobile bytes.
7. **Bundle and art:** replace Moment.js first (Phase 3.8). Then audit the shared floor, split secondary features, and optimise/preload only critical assets.
8. **Layout shift and responsiveness:** Phase 3.9 and 3.10. They can run beside steps 4–7, since they touch different code.
9. **Server-seeded pilot:** try one game only if cold deep links still miss the target; compare it with the prefetched-API design before wider migration.
10. **Broader routes:** reuse the proven link/cache/prefetch primitives throughout the app.

For each rollout, use a feature flag or staged percentage, watch p50/p75/p95, errors, server duration, database reads, transfer bytes, cache correctness, and command-conflict rate, then remove the losing implementation rather than carrying two permanent paths.

## Required tests

- Unit tests for cache TTL, LRU eviction, in-flight deduplication, schema/user keying, push invalidation, mutation replacement, and failed-response behavior.
- Security tests proving two users in one browser profile cannot receive each other's cached dashboard/game response and that logout/lock clears private entries.
- Hidden-information tests for every response seeding or cache path.
- Integration tests that a prefetched response is reused, then revalidated, and that a turn advancing between prefetch and tap cannot enable an invalid action.
- Navigation tests for mouse, touch, keyboard, browser back/forward, direct URL, push link, expired session, account switch, and offline/online recovery.
- Performance tests/traces under cold/warm cache and throttled mobile profiles, with budgets for JavaScript, JSON, critical art, and requests.
- Guard tests that no page-shaped file under `src/app` can reach Clerk's request auth, that the middleware matcher stays on the API (`src/middleware.test.ts`), and that the static shell wraps exactly the client game pages (`src/app/games/staticShell.test.ts`). Also a manual check that the offline page still appears with navigation preload on.
- Unit tests for the player-directory cache: TTL expiry, LRU bound, fetching only misses, no metadata field ever stored, and invalidation on rename.
- A projection-equivalence test: `CreateResponse` on a projected live game equals `CreateResponse` on the full document, for every game type. Also a test that the dashboard's completed list still shows "See all" when there are more than ten.
- Unit tests for `timeAgo` / `shortDate` at each unit boundary.
- Existing build, typecheck, lint, and API/game test suites after implementation changes.

## Decisions to make from evidence

After Phase 0, record these decisions in the implementation PR:

1. Is game entry mostly route/code, auth, API/server, payload/render, or art?
2. Does `<Link>` route prefetch plus game-data intent prefetch meet the warm target?
3. What TTL produces a useful hit rate without a visible stale-board rate?
4. Is idle prefetch worth its wasted request and mobile-byte rate?
5. Does Clerk directory lookup justify a server cache and its rename-staleness trade-off? *(2026-10-09: yes — see Phase 2, "Cache the player directory on the server".)*
6. Does server-seeded data beat client API prefetch enough to justify migrating all game pages?
7. Which secondary features and assets dominate each heavy game, and what should remain eager?

The likely first implementation is therefore deliberately modest. It has three parts:

1. **Measure**, closing the attribution gaps.
2. **Take the cold document and the server's Clerk lookup off the critical path:** navigation preload, a narrower Clerk matcher, and a short display-only directory cache.
3. **Then the client work:** make game rows links, add one user-scoped in-memory stale-while-revalidate cache, and prefetch the top likely game with strict limits.

It attacks the waits the checkpoint measured without introducing persistent private-state caching or rewriting every game route. It also leaves a measured path to server seeding if cold entries remain slow.
