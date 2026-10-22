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
   - *Built, and run once against production (2026-10-10):* `npm run perf:explain` (`scripts/explain-queries.ts`). It runs the real reads (`buildDashboard`, and `readGameForViewer`, which is the game route's) with the driver's command monitoring on, and explains each command exactly as it was sent, so no query is written twice. It also reports live game document sizes and command counts by game. The report carries index names, stages and counts, never ids or filter values. With no `--user` it takes the player in the most live games; with no `--game`, the largest live game. It refuses to start as a database user that can write, never builds an index or collection on connecting, and fails if anything it ran wrote all the same. It needs no Clerk key: both reads look names up on the way, so it gives every player they could name a stand-in first. The **Production query explain** workflow (`.github/workflows/perf-production.yml`) runs it against production weekly and on demand, and puts the report in the run's summary and its artifact. Save that report with the next checkpoint. The workflow's one secret, `PRODUCTION_READONLY_MONGODB_URI`, belongs to a `production-explain` GitHub environment whose deployment branches are `main` only, for a database user with the built-in `read` role and nothing else. CI also runs the script against the e2e database after the journey traces, with `--writable`, which proves it works but isn't production-shaped.
5. Capture a repeatable Playwright trace for dashboard → game, game → home, home → profile, home → new game, and push/deep-link → game under cold and warm caches with mobile CPU/network throttling.
   - *Built:* `npm run perf:journeys` (`e2e/perf/journeys.perf.ts`, its own `playwright.perf.config.ts` so `npx playwright test` doesn't run it). It plays those journeys, plus profile → home by the back button, `PERF_RUNS` times (default 3) on a Pixel 7 profile with 4× CPU slowdown and Lighthouse's slow-4G network. A link opened from a push is timed as a document load of the game. It times nothing itself: it reads the batches the app's own `PerformanceReporter` sends, so each number is the one production reports. It writes medians per step to `perf-report/journeys.md`, and a Playwright trace per browser context plus a Chrome performance trace of the first run to `test-results/perf/`. It asserts no timings, and signs the test account out at the end, since the traces record its session cookie. The E2E workflow runs it and then the explain after the smoke tests, weekly, on a manual run, or on a pull request labelled `perf-traces`. It uploads both as the `performance-traces` artifact and puts the two reports in the run's summary.
6. Create a small performance budget checked in CI: route JavaScript, first-game JSON, and largest required image. Use a scheduled or deployment smoke test for latency percentiles; do not make noisy Internet timings a per-commit gate.

### How the client timings are measured

`PerformanceReporter` keeps one **journey** per route arrival, and every milestone a screen marks (`auth_ready`, `session_ready`, `first_data`, `dashboard_usable`, `game_board_painted`, `game_usable`, via `window.__agPerformanceMark`) is timed from that journey's start, never from when the tab opened. A document load starts at the time origin and is `cold`. An in-app route change is `warm` and starts at the tap or key press that caused it, or at the back/forward. That includes `router.push` from a button or a post-mutation transition, not just `<Link>`. A route change with no tap or back/forward in the previous thirty seconds is a redirect: it starts a journey but reports no `navigation`. Each milestone counts once per journey. `game_board_painted` is the frame the board first reached the screen; `game_usable` is the first idle moment of the main thread after that (`requestIdleCallback`, capped at three seconds, or a queued task where there is none), so it is the paint plus whatever hydration, layout and effects the board still had to run before a tap would be answered at once. Both are marked once, in `useGameData`, for every game. A first-match guide or tour over the board is not waited for, and a cached paint counts, as it accepts a command. A side panel's data (the chat thread) never marks `first_data`. A journey that goes to the background part-way through reports no more milestones. Web Vitals always belong to the document load (`cold`).

`auth_ready` is Clerk having loaded, and `session_ready` is the page having confirmed its session token once, which `useIsAuthorised` holds every request back for. So the gap between them is that confirmation, which also reports its own duration: `session_confirm`, or `session_confirm_timeout` when Clerk hadn't answered within the five-second bound and the app went ahead without it. Their counts give the timeout rate. An ask that failed outright (offline, Clerk erroring) is not reported, as it says nothing about how long Clerk takes, and nor is one the page was hidden for part of, since a throttled timer makes its time meaningless.

A cache-enabled screen says where its first data came from, and tags the rest of its journey with it (the admin report's **Data** column): `hit` (painted from a body a screen fetched earlier), `prefetch` (painted from a body a prefetch fetched), `joined` (not in the cache, but a prefetch for it was still out, and the screen's entry fetch joined it) or `miss` (fetched from scratch). The `data_cache_hit` and `data_cache_miss` samples carry it too, so `first_data`, `game_usable` and `dashboard_usable` can be split by it, and the prefetch-used rate is the `prefetch` and `joined` samples against `data_prefetch`'s.

A screen's own data fetch (`useRefreshableData`, not a side panel's) is tagged `entry` when it brings the screen's first data and `refresh` after that: a poll, a push, the tab coming back. Its `Server-Timing` spans carry that tag, and so do the browser's own record of the request, read from its `PerformanceResourceTiming` (not the `Content-Length` the host strips): `api_total` (`fetch()` to last byte), `api_connect` (before the request was sent: queueing, DNS, connection), `api_network` (send to first byte, less `server_total`), `api_download` (first byte to last) and `response_bytes` (the compressed body). A fetch that had to renew the session first also reports `session_retry`: what the refused attempt, the renewal and the wait cost. Its sample count against `server_total`'s, on the same route and tag, is the retry rate. The renewal is also reported on its own, as `session_renew`, or `session_renew_timeout` when it ran to its five-second bound, so the retry splits into Clerk's share and the fixed one-second wait.

Two spans split the server's `mongo_query`: `mongo_checkout`, the time the request's commands waited for a connection out of the pool, and `mongo_handshake`, the time to open each new one, both summed over the request from the driver's pool events. Each signed-in response also says how long its instance sat unused before it (`idle`, since the instance last served a signed-in request, rounded down to whole minutes: the instance's clock times other players' requests too, so it is kept coarse), or that the request is the instance's first (`instance_new`). So a slow first query after a quiet spell can be told apart from a slow query, and the cold-start rate is `instance_new`'s count against `server_total`'s. The admin report splits all of these by tag.

CLS, LCP and INP are reported whole, as before, and then in parts (`web-vitals/attribution`): `CLS_largest_shift` (the score of the single largest shift), `LCP_load_delay`, `LCP_load` and `LCP_render_delay` (the three phases after its TTFB), and `INP_input_delay`, `INP_processing` and `INP_presentation`. Each part carries the **region** of the element it names — the element that shifted most, the largest paint, the element tapped. The region is the path of the element's marked ancestors, outside in, such as `board/hand` or `dashboard/section/list-row/avatar`. The route already names the screen, so a screen itself is marked only where two share a route (`dashboard` and `landing` on `/`). Shared components wear the markers as `data-perf-region`, from the allow-list `PERFORMANCE_REGIONS` in `src/utils/performance.ts`; a guard test fails on a marker that isn't on it. An element inside none of them is `unmarked`. No element text, id, selector or URL is ever sent. A screen with a lot of `unmarked` needs a marker on the component its shifts or taps land in. `BoardZoom` marks a board drawn by a camera (Realm Arena's 3D board) as `board/camera`, so the 3D and SVG boards' vitals are split. Because those three are reported as the page is hidden, which can be the last moment it runs (a closing tab, a phone app frozen in the background), the reporter sends its queue then, and again on `pagehide`, as well as on its five-second timer.

The admin report splits journey metrics into cold and warm, and ignores journey samples recorded before this scheme (they carry no `cache`). Those samples counted from when the tab opened, which is why a game opened after a minute on the dashboard looked like a one-minute load.

### Checkpoints

Each baseline taken from the admin report is saved, with its analysis, under
[`docs/performance-checkpoints/`](./performance-checkpoints/), named by date, so
every phase can be compared with the one before it.

- [2026-10-09](./performance-checkpoints/2026-10-09.md): the first seven-day
  baseline, before any Phase 1 work. Every target is missed. Cold loads lose
  1.7–3.4 s before the first byte. Warm game entry is dominated by the API
  fetch, and server time by the Clerk name lookup.
- [2026-10-10](./performance-checkpoints/2026-10-10.md): **partial.** The
  report's window is seven days and the Phase 1.1, 1.2 and 2 changes merged
  only on 2026-10-09, so most of it is still the old app and the aggregates
  barely move. The few post-change rows say that warm server reads are fixed
  (game API about 40 ms, dashboard refresh 58 ms) and that the production
  explain is clean: every read is indexed and takes at most 1 ms. What remains
  is cold function instances, which cost seconds on both the API and the
  document, and `/`, which is still rendered on a function. That adds Phase
  1.1e and the "Cold instances" work, and reorders the delivery sequence.
- [2026-10-19](./performance-checkpoints/2026-10-19.md): the first window with
  every Phase 1 and 2 change in it (filtered by `since`, not `build`; see its
  header). The cold document is fixed: TTFB p75 is 549 ms on `/` and 258 ms on
  a game. So is the warm dashboard: `dashboard_usable` p75 is 822 ms. The cold
  dashboard hasn't moved (6.2 s median): about 4.3 s between Clerk loading and
  the data arriving is untimed, and tightly grouped, which points at the 5 s
  session-confirmation bound. The board's tail is now its `entry` call on an
  idle instance. Inside it, the name cache misses on almost every `entry`
  (about 245 ms). About one board poll in seven pays a 3.4 s session retry. CLS
  and INP are unchanged pending Phase 3.9 and 3.10.
- [2026-10-22](./performance-checkpoints/2026-10-22.md): the first checkpoint
  filtered by build (#936 on), about three days of it. It disproves the
  2026-10-19 inference: the session confirmation takes 4 ms. The cold home
  wait is the dashboard's `entry` call on a brand-new function instance (5.0 s:
  2.55 s for the platform to start it, then 1.6 s of reads that take 20 ms
  warm, likely queued behind Mongoose's start-up index work). Session retries
  are gone, the dashboard's cached paint is 125 ms, intent prefetches are all
  used, and board INP meets its target on the 3D board. It adds "Cold
  instances" items 4 and 5.

The admin report reads seven days by default, and a deploy leaves the old app in most of that. A checkpoint is therefore taken with **from build** set to the first build after the changes being measured (the report's build list shows each deploy's first-seen time), and the checkpoint records that build and the window in its header. The report's Markdown copy carries both. Every sample is stamped with its page's `NEXT_PUBLIC_BUILD_TIME`, and a server span is reported by the same page, so one `build` filter cleans every metric. A sample with no build (from before the stamp, or a very old cached client) is left out once `build` is set.

**Exit criterion:** a trace can attribute the median and p75 game-entry time among route/RSC, JavaScript, Clerk readiness, API/server work, JSON transfer, render, and images.

## Phase 1 — remove the game-entry waterfall

### 1. Stop losing the cold load before the first byte

The checkpoint's largest number is the document's TTFB: 3.4 s median on `/` and 1.7 s on a game, before any of our code runs. It is bimodal on every route, static ones included: about 0.25 s, or 4–6 s. The slow cluster is therefore on the path of every document request, not in page rendering. Prove which cause it is, then remove the ones that apply. The three fixes are independent of each other.

**Status: shipped — all four parts (a–d) together.** What is still owed is the evidence, at the next checkpoint: the TTFB distribution before and after, with the 4–6 s cluster gone, and the new phase metrics saying where any remaining wait goes. With no handshake, a cold load's session cookie can still be the expired one until Clerk's script renews it. So `useIsAuthorised` holds every request back until the page has confirmed its token once (`getToken()`, bounded at five seconds), and setup screens keep their action disabled until then. The performance beacon is held until Clerk has loaded, for the same reason. Watch the time from `auth_ready` to `first_data` at the next checkpoint, for what that confirmation costs.

**Evidence so far (2026-10-10 checkpoint, partial; n=4 on `/`).** The phases say the handshake and the service worker are off the path. `TTFB_waiting` is 37 ms (no redirects), `TTFB_cache` / `sw_startup` is 77 ms, and DNS and connection are 0 ms. What remains is `TTFB_request`, 2,826 ms at the median, which is the dynamic render of `/`: the page still reads the signed-in hint with `cookies()`, so it builds as `ƒ`. That is Phase 1.1e. The TTFB distribution before and after is still owed from a window with no pre-change samples, which the admin report can now give with its `build` filter (see "Checkpoints").

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

**e. Serve `/` as a static page.** The 2026-10-10 checkpoint shows what (c) left behind. `src/app/page.tsx` still calls `cookies()` for the signed-in hint, so `/` builds as `ƒ (Dynamic)` and every document request renders on a function. `TTFB_request` is 2,826 ms at the median (n=4). A cold home open therefore pays two cold functions in series: the page render, then `/api/dashboard`. Every warm navigation home also waits on a server render (`navigation` p75 1,357 ms, p95 3,565 ms).

**Status: shipped (#898).** One deviation from the plan below: the root `loading.tsx` was removed. As a Suspense boundary round the whole app it made the static HTML send the dashboard skeleton first, in front of every landing-page visitor. The skeleton now lives in `components/HomeLoading.tsx`, which the per-request routes (`lobby/`, `kingdombuilder/`, `games/kingdombuilder/`, `profile/[userId]/`) re-export as their own `loading.tsx`. What is still owed is the evidence, at the next checkpoint: the `/` TTFB p75 under 1 s, and `CLS` on `/`.

1. `page.tsx` stops calling `cookies()`, so `/` builds as `○ (Static)`.
2. A tiny inline script in the document reads `__client_uat` from `document.cookie` and sets a data attribute on the root element before first paint. Clerk's script sets that cookie, so it is readable in the browser.
3. The static HTML carries both screens, the landing page and the dashboard. CSS shows the one the attribute picks, and the landing page by default.
4. `HomeScreen` reads the cookie on the client after hydration. Clerk decides once it has loaded. The `router.refresh()` on disagreement is no longer needed, because the server no longer guesses.
5. `/join` and `/login/[[...rest]]` are candidates for the same treatment later. They are also `ƒ`.

- **Pros:** removes one cold function from every cold home open, and the server render from every warm navigation home. The document comes from the CDN, as the other static routes do (`/settings` TTFB is 240 ms at the median).
- **Cons:** both screens are in the static HTML, and both mount during hydration. The server no longer sees the hint.
- **Mitigation:** the hidden screen is `display: none`. Neither screen fetches anything before Clerk is ready. A test keeps the inline script's cookie rule identical to `signedInHintFrom`, so the pre-paint choice and the client's hint cannot drift apart. Phase 3.9's rule still applies: the first paint must match the screen Clerk confirms, so watch `CLS` on `/` at the next checkpoint.
- **Exit:** `/` builds as `○`, and the `/` TTFB p75 is under 1 s.

**Exit:** the TTFB p75 for `/` and the game route is under 1 s, and the 4–6 s cluster is gone from the TTFB distribution.

**Met (2026-10-19 checkpoint).** TTFB is 371 ms median and 549 ms p75 on `/`, and 154 and 258 ms on the Realm Arena route. The 4–6 s cluster is gone. A game route's remaining p95 (2.4 s) is likely its static shell rendering again for each game after each deploy.

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

**Status: shipped — the game board and the dashboard.** `src/utils/hooks/dataCache.ts` is the cache and `useRefreshableData` takes an opt-in `cacheFor` (ms). `useGameData` uses 30 s and `useDashboard` 15 s, the plan's starting figures; nothing else opts in, so every other screen (profile, chat, lobby, admin) behaves as before.

- **What it keeps.** Parsed bodies of successful responses, in a module-level `Map` (memory only: no `localStorage`, Cache Storage or service worker), keyed by signed-in user id and url, 20 at most, least recently used out first. A body is used only while younger than the `cacheFor` of the screen asking. A failed response, a 401 or a body that doesn't parse is never stored, and a 403, 404 or 410 drops what was held for that url.
- **Whose it is.** One owner at a time. `useDataCacheOwner`, mounted once in `Providers`, names the owner as the authorised viewer and empties everything when that is a different player, none (sign-out, a profile still loading) or a locked account. Every read and write also names its player and is refused for anyone but the owner, so a body can't cross users even in the render before that effect runs; an answer still in flight for the previous player is not kept.
- **What a revisit does.** A remount within `cacheFor` starts with the cached body: `data` set, `isLoading` false, `isRefreshing` true, and the entry fetch runs at once beneath it. Every successful fetch writes the cache and so does `setData` (a command's own response, an optimistic patch). A fetch that began before a write can't overwrite it: each write carries a counter, and an answer from a request that started earlier than the entry's last write is dropped. A request only joins one already in flight if that began after the last write.
- **Stale actions (guardrail 4).** The server's `expectedCommandCount` check (`/api/game/command`, 409) is generic, but the client sent it only from games with out-of-turn plays. So while a board is a cached paint that no request has answered, `useSubmitCommand` sends it in every game; a move built on a board that has since moved is refused and resynced like any other 409. Controls are not disabled: a revalidation that finds the board unchanged costs the player nothing. It stops being sent once the entry fetch lands.
- **Measurement.** `data_cache_hit` (value: the body's age in ms) and `data_cache_miss` (0), each on the screen's route, when a cache-enabled screen starts. `first_data`, `game_board_painted`, `game_usable` and `dashboard_usable` are marked at the cached paint, since that is what the player sees; a hit sample says which journeys they belong to. The cached screen's revalidation is tagged `refresh`, not `entry` (its first data came from the cache), so `entry` timings now describe only the fetches a player really waited on, and an entry fetch that joined a prefetch reports no `api_*` or `server_*` spans of its own: they are the prefetch's.
- **Also fixed on the way.** `useRefreshableData` re-ran the old url when the url changed while a fetch was out, so the new url was never fetched and the old body was shown (the rail's switch between two boards). A fetch for something other than the current url or viewer is now superseded and its body dropped, and the cache is never written under a url the screen isn't showing the body of.
- **Deviations.** The key has no response-schema version: the cache dies with the tab, and a page reload after a deploy loads the new bundle, so nothing outlives a schema change except in a tab that stays open across one, which is already exposed to the same mismatch on every fetch. Push events refresh a *mounted* screen (and so the cache) as before; a push arriving while the player is on another screen doesn't touch an entry, which the 15/30 s age bounds. No entry is held for immutable metadata or guides (they are in the bundle already).
- **Owed at the next checkpoint:** the hit rate per route and the age distribution of hits; warm `game_usable` and `dashboard_usable` split by hit and miss (the target for a revisit is a cached paint under 200 ms); the rate of 409s on commands sent from an unconfirmed board; and whether `isRefreshing` flashes are noticeable on a hit. The TTLs are starting points.

### 4. Prefetch the likely game data, not every game

Once the dashboard response is available and the tab is idle, prefetch the full response for the top one or two “your turn” games. Also prefetch on pointer hover, touch/pointer down, and keyboard focus for any game row. Share the exact cache and in-flight promise used by `useGameData`; prefetch must not be a parallel fetch implementation.

Call `router.prefetch(href)` for imperative/intention-driven navigation where a `<Link>` has not already prefetched the route. The Phase 1.2 audit found no such navigation today (every destination is either a `<Link>` already or unknown until the push), so there is no route prefetch in the tree yet. Use its invalidation facility only after confirming the exact API supported by the pinned Next.js version.

- **Pros:** overlaps game API, route chunk, and think time; directly targets the most valuable journey; an intent prefetch wastes little bandwidth.
- **Cons:** idle prefetch can waste database work and cellular data, and prefetched state can become stale before the tap.
- **Mitigation:** cap concurrency at one, skip idle prefetch under data-saver/poor-network signals, pause when hidden, prioritise only likely games, cancel superseded work, and revalidate on entry. Track prefetched-hit and wasted-prefetch rates.

Do **not** include every full game response in `/api/dashboard`. It would slow the dashboard, multiply hidden data in memory, and penalise users with many games. A narrowly bounded optional “next game snapshot” could be tested later, but only if separate prefetch latency is demonstrably the remaining bottleneck.

**Status: shipped — the intent half only.** `prefetchGameData` (`src/utils/hooks/prefetchGameData.ts`) fills the Phase 1.3 cache for one game, through the same request (`loadSharedResource`, so `fetchWithSessionRetry` and the same headers) the board's `useGameData` makes. `GameLink` (`src/components/ui/GameLink.tsx`) is a `<Link>` that calls it on pointer-down, on pointer-enter for a mouse only, and on focus; the dashboard's your-turn cards, the waiting-on-others rows and the rail's game rows are `GameLink`s, so it is wired once.

- **When it does nothing.** The viewer isn't authorised (or isn't the cache's owner); `navigator.connection.saveData` is on; the cache already holds a board younger than 30 s; a request for that board is already out; or any other prefetch is in flight (one at a time, not queued). Never on page load or idle, and nothing was added to `/api/dashboard`.
- **Sharing.** The board's entry fetch joins a prefetch still in flight rather than asking again, and a tap after a finished prefetch paints from it and revalidates (Phase 1.3). A prefetch also warms the API instance before the tap.
- **Measurement.** `data_prefetch` (value: how long the prefetch took, fetch to parsed body), on the route the player was on when they showed intent (the dashboard).
- **Deviations.** The idle prefetch of the top one or two your-turn games is left out, as a later flagged experiment. No `router.prefetch` was added (Phase 1.2: nothing needed one). Cancelling a superseded prefetch isn't done: only one runs at a time and a started one is left to finish, which also fills the cache.
- **Owed at the next checkpoint:** how often a `data_prefetch` is followed by a `data_cache_hit` on the board (the prefetch-used rate) and how many prefetches nobody opened (waste), the `data_prefetch` duration distribution against the time between intent and tap (a prefetch that is still out at the tap saves only the remainder), and the cold-instance cost it moves off the board's entry.

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

**Status: shipped.** `src/utils/users/directoryCache.ts` holds `{ id, name, handle, imageUrl }` records only, for 5 minutes (and, since the 2026-10-19 checkpoint, serves them for up to 15 while it refreshes them: see "Session renewal on return, and stale names"), LRU-capped at 2,000. An id Clerk doesn't know (a deleted account) is remembered as a miss for 30 seconds, so finished games with a deleted player don't send every lookup back to Clerk. `buildUserDirectory`, the list resolvers and `userIdListToImageMap` read through it. `userIdListToUntaggedNameList` stays uncached, because it decides whether a name is already taken. If Clerk fails, or hasn't answered within 1.5 s, missed ids are answered from stale entries when every one of them has one. Otherwise the read waits on Clerk and fails as before, so the deadline never turns a slow answer into an error, and a lookup given up on still fills the cache when it answers. Display-name, claim, account-delete and guest-delete paths drop the user's entry. `ServerTiming` now runs each span inside an `AsyncLocalStorage` store, so the resolvers report a `names` span (nested inside `response` / `player_directory`, not subtracted from it, so those stay comparable with the baseline) and a `names_cache;desc="hit=… miss=…"` entry, without any game model changing. The 2026-10-10 checkpoint shows it working on a warm instance (`server_names` 0 ms on hits, game `server_total` 38–40 ms), but it cannot help the first request on a new instance (`server_names` 314 ms on a dashboard `entry`). What is still owed is the evidence from a clean window: `server_names` and the game route's `server_response` medians against the 2026-10-09 baseline.

### Make the dashboard read only what it shows

`buildDashboard` reads every live game as a full Mongoose document, each Realm Arena move history included, to build rows that use a dozen top-level fields. It also reads every completed result the player has ever had, of which it shows ten. Its `mongo_query` span is 238 ms median, against 37 ms for a single game.

- **Live games:** add an inclusion projection exported beside `CreateResponse`, so the field list lives next to the code that reads it: `gameId`, `gameType`, `userIdList`, `turnTimer`, `currentTurn`, `lastTurnTimestamp`, `complete`, `winner`, `endReason`, `forfeitedBy`, the discriminator key, and Smartthink's `specificGameState.codeSetterId`, plus whatever `unreadChatCounts` and the filters read. Add a guard test that `CreateResponse` on a projected fixture equals `CreateResponse` on the full document, for every game type. A summary field added later then fails the test instead of rendering blank.
- **Completed results:** the dashboard draws ten and a "See all" when there are more, so ask for eleven (`limit + 1`) through a `limit` argument on `completedGameResults`, projected to the fields `toCompletedGames` reads. `/api/game/mycompletelist` keeps the full list. The existing `{ playerIds: 1, endedAt: -1 }` index already serves the sorted, limited read; confirm with `explain`.
- **Untimed work:** time `unreadChatCounts` and `kingdomBuilderWorlds` as their own spans. They account for about 70 ms of the median that no span covers today.
- **Pros:** less data read, hydrated and garbage-collected per dashboard load. The cost stops growing with a player's history.
- **Cons:** a projection can silently drop a field a summary later starts reading.
- **Mitigation:** the equivalence test above.
- **Exit:** dashboard `mongo_query` median under 80 ms, and flat as completed games accumulate.

**Status: shipped.** `GAME_SUMMARY_PROJECTION` sits beside `CreateResponse` in `GameData.ts`: the plan's fields plus the discriminator key `kind`, and `gameType` whole. `endDetail` isn't read by a summary, so it stays out. `GameSummaryProjection.test.ts` builds a fully populated fixture for every engine game type found under `src/games/*/meta.ts` (plus Smartthink's computer-sets-the-code branch). It checks that the summary from a document hydrated through the projection equals the one from the full document. Completed results are projected to the seven fields their readers use. The dashboard asks for `DASHBOARD_COMPLETED_LIMIT + 1` (shared with `Dashboard.tsx`), and `/api/game/mycompletelist` keeps the full list. The `{ playerIds: 1, endedAt: -1 }` index is declared. `unread_chat` and `kb_worlds` are now spans of their own. What is still owed is a check of the projected read on a Smartthink game in a preview, and a clean-window dashboard `mongo_query` and `total` (see the next section for what the 2026-10-10 checkpoint already shows).

**Evidence so far (2026-10-10 checkpoint, partial).** The production explain is clean. Every dashboard and game read uses an index and examines at most 11 keys and documents, at 0–1 ms each. The completed-results read is `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN playerIds_1_endedAt_-1`, 11 examined and returned. Live game documents are 13–32 KB, and production has only three live games. So **no index or projection work is needed**, and the idea of projecting Realm Arena's `commandHistory` is dropped. On a warm instance the reads are cheap: dashboard `refresh` `server_total` is 58 ms (n=3) against 598 ms, with `mongo_query` at 23 ms against 238 ms, which meets the 80 ms exit above. Game `server_total` is 40 ms (`entry`, n=2) and 38 ms (`refresh`, n=6) against 271 ms, with `server_names` at 0 ms on a cache hit. The same dashboard read on a fresh instance (`entry`, n=4) takes 2,319 ms, of which `mongo_query` is 1,301 ms. That is not the query. See "Cold instances" below.

### Cold instances

After the warm reads were fixed, the 2026-10-10 checkpoint found that a new function instance costs far more than any query. A dashboard `entry` (n=4, all on fresh instances) takes 6,044 ms: `api_network` 3,616 ms, which is time outside our handler (the platform starting the function, module initialisation, routing), and `server_total` 2,319 ms. Inside it, `mongo_connect` is 296 ms, `mongo_query` 1,301 ms for three reads the explain times at 1 ms or less, and `names` 314 ms, because the name cache is empty on a new instance. A game `refresh` p75 shows the same shape: `api_network` 2,562 ms, `server_total` 1,177 ms, `mongo_connect` 377 ms. The server bundle is not an obvious cause: `/api/dashboard` and `/api/game/[gameid]` each trace to about 6 MB, about 1 MB of it our own chunks (mongoose 1.6 MB, next 1.4 MB, mongodb 1.1 MB).

Three things to do, in order. The first is settings, not code.

1. **Platform settings.** *Fluid compute: done.* It was enabled in the Vercel project settings after the 2026-10-10 checkpoint (a project setting, so `vercel.json` still doesn't mention it), to cut how often a request lands on a cold instance. Its effect is owed at the next checkpoint: `entry` `api_network` and `server_mongo_connect`, and how often `server_names` misses, filtering the report by `build` to the first build deployed after it was switched on, since the setting applies to new deployments. *Function region: done.* Functions ran in London (`lhr1`) against an Atlas cluster in Ireland (AWS `eu-west-1`): warm reads that take 1 ms or less in the explain took 14–40 ms as `mongo_query`, and warm API calls spent about 104–145 ms in `api_network` beyond server time for a 2 KB body, which is what a region mismatch looks like. They now run in Dublin (`dub1`), pinned in `vercel.json` so the project setting can't drift from the cluster. Its effect is owed at the next checkpoint alongside Fluid compute's, filtered by `build` the same way.
2. **The Mongo pool.** *Done.* The driver opens pool connections on demand, with `maxConnecting` defaulting to 2, so three parallel reads on a new instance waited on handshakes two at a time; `dbConnect` now passes `maxConnecting: 3`. Not `minPoolSize`: `connect()` doesn't wait for it, a warm instance keeps the connections its first request opened anyway, and the driver fills it against every replica-set member, so it would only hold idle sockets open on the secondaries. The dashboard now starts `kb_worlds` at once and `unread_chat` as soon as `games` lands, alongside `player_directory`. Measure with `server_mongo_query` on `entry`.
3. **Expect per-instance caches to miss on a new instance.** The player-directory cache is opportunistic by design (see above). Do not count on it for the first request of any instance, and do not add a cache that does.
4. **Build indexes at deploy time, not on every new instance (after the 2026-10-22 checkpoint).** On a new instance one indexed `findOne` took 1,688 ms that takes 14 ms warm, and the dashboard's three reads 1,639 ms. Mongoose's `autoCreate` and `autoIndex` were on, so every model sent a `createCollection` and a `createIndex` per index the moment the connection opened, which grew the pool three handshakes at a time with the request's reads queued behind. The driver credits those waits to whichever context frees a connection, which during start-up is no request, so `mongo_checkout` under-reported them.
   - *Shipped.* `dbConnect` connects with `autoIndex: false, autoCreate: false` (`src/utils/mongodb/connectionOptions.ts`). Connection options are enough: `Model.init()` reads both only after the connection opens, and `connectionOptions.test.ts` holds Mongoose to that. `npm run db:indexes` (`scripts/sync-indexes.ts`) creates every model's collection and declared indexes, and never drops or changes one. `src/utils/mongodb/models.ts` imports every model, and `models.test.ts` fails on a model file it doesn't. Vercel runs it ahead of `next build` through the `vercel-build` script, so a deploy's indexes exist before its code serves, and a deploy fails if they can't be built. The E2E workflow runs it against the e2e database before starting the app. Removing or changing an index is now a manual step in each database. Its first run against the e2e database found `ratelimits` with neither of its indexes. Duplicate counters from a race had made the unique `key` index unbuildable, and with no TTL index nothing reaped them, so autoIndex had been failing silently on every instance. Counters are disposable, so the sync now clears expired and duplicated ones before it builds that collection's indexes (`clearRateLimitsForIndexing`).
   - *Measure:* on `entry`, `server_mongo_query` should fall from about 1.6 s to tens of milliseconds, with `server_kb_worlds` alongside it and `server_mongo_checkout`'s p75. If `mongo_query` stays above about 500 ms on requests that report `server_instance_new`, the cause lies elsewhere (cold JavaScript, server selection). Next, count the pool events that fire outside any request (`connectionCreated`, `connectionCheckedOut`) and report them on the instance's first request.
5. **Wake the function while Clerk loads (after the 2026-10-22 checkpoint).** A cold open waits about 1.5 s for Clerk and then sends its first request to an instance the platform has yet to start: `api_network` 2.55 s at the median on the dashboard's `entry`, with 13 of 16 on an instance booted under half a second before.
   - *Shipped.* An inline script (`WARM_UP_SCRIPT`, `src/utils/warmUp.ts`, rendered by `WarmUpScript`) on `/` and in the game routes' static shell sends a `HEAD` to the route the page will call next (`/api/dashboard`, or `/api/game/<id>` for a UUID game path), only when the visitor looks signed in, by the same cookie rule as the pre-paint script. Both routes export `HEAD = warmUpResponse` (`src/utils/api/warmUp.ts`): no auth, no read and no body, just the boot connection awaited for up to 4 s, and a 204. It goes to those routes, not a route of its own, so it wakes the function that will answer. The shell stays the same bytes for everyone, and `/` stays static.
   - *Measure:* the ping reports `api_warm` (sent to headers, a 2xx only) and its own server spans under the `warm` request tag. Its `server_instance_new` appears only when the ping was the instance's first request of any kind, and the ping never uses up the flag the signed-in request after it reports. The first `entry` fetch for the pinged route reports `warm_ping_lead`, how long after the ping it started. Compare `entry` across builds (the tag isn't split by whether a ping preceded it; `warm_ping_lead`'s count against `entry`'s gives the pinged share). `server_instance_new` on `entry` should become rarer, and `api_network` on `entry` should fall towards the warm 150–250 ms. When an `entry` still reports `server_instance_new`, set its age against `warm_ping_lead`: about the lead or more means the ping started that instance; much less means the request went to another new instance, and the platform isn't routing to the warmed one.

- **Pros:** no new state, and the first is a setting. Each is small and reversible.
- **Cons:** `minPoolSize` holds idle connections open per instance, which counts against the Atlas connection limit. The connection cache and the name cache are per-process by design, so a platform setting that changes instance reuse changes their hit rates too.
- **Mitigation:** set the pool options conservatively and watch the Atlas connection count. Compare `entry` `server_mongo_query` and `api_network` before and after, from a window the admin report's `build` filter keeps clean.
- **Exit (a starting target, to be tuned from data):** the dashboard `entry` `mongo_query` is under 80 ms at p75 (the same bar as a warm read), and `api_network` on `entry` is under 500 ms at the median.
- **Evidence (2026-10-19 checkpoint).** `api_network` on `entry` is 271–277 ms at the median (met), and `mongo_connect` is 0 at the median, so most entries now find a warm instance. The `mongo_query` p75 is 1,569 ms (missed). On `entry` the read takes 362 ms at the median on an instance that already holds a connection, against 24 ms on `refresh`, which looks like the first command after a freeze. The span can't separate the pool checkout from the command yet. `names` misses on almost every `entry` (243 ms), because the 5-minute expiry has lapsed, not because the instance is new.

### Session renewal on return, and stale names (after the 2026-10-19 checkpoint)

The 2026-10-19 checkpoint found two costs that sit outside the cold instance itself.

1. **Renew the session before a foreground refetch, not after its 401.** About one board poll in seven paid a 3.4 s `session_retry` (median): the tab came back with a token that had expired while the phone froze Clerk's renewal timer, the refetch was refused, and it waited for a renewal and a fixed second before going again. A command sent then wasn't retried at all, so the move was lost to a resync.
   - *Shipped.* `useAuthGuard` asks Clerk for the token as the tab returns (`getToken()`, which hands back a token that is still good at once), from a `window` capture listener so it runs before any screen's own `visibilitychange` refetch. Until Clerk answers, or the usual five seconds pass, `fetchWithSessionRetry`, `useSubmitCommand` and `useJsonMutation` hold their requests (`holdRequestsUntil`, `untilSessionRenewed`). The 401 retry stays, for a token that lapses some other way.
   - *Measure:* `session_resume` (with its `_timeout` twin) is what the hold costs. `session_renew` and `session_retry` should fall to a few per cent of `refresh` fetches. A count that stays high means something other than a hidden tab is letting tokens lapse.
2. **Serve stale names, and refresh them after the response.** `names` missed on nearly every `entry` (about 245 ms), because a player coming back after more than five minutes found every name expired.
   - *Shipped.* A directory entry is believed for five minutes (`DIRECTORY_TTL_MS`). For up to fifteen (`DIRECTORY_MAX_AGE_MS`) it is then served at once and refreshed by `after()` once the response has gone, once per id however many requests ask meanwhile. A lookup that has to wait on Clerk for some other id takes the stale ones along in the same call. Past fifteen minutes an entry is only the fallback for a Clerk that fails or is slow, as before.
   - *Cost:* a rename or new picture reaches the other players on their second request after the five minutes, rather than their first. The `names_cache` entry now counts `stale` beside `hit` and `miss`.
   - *Measure:* `server_names` on `entry` should drop to near 0 at the median. What is left is players away for more than fifteen minutes, and new instances.

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
   - **Attribute it first.** Report CLS (and LCP) through `web-vitals/attribution`, sending the largest shift's target as a coarse region name from an allow-listed `data-perf-region` attribute on the shared components, never element text or ids. *Shipped* (see "How the client timings are measured"): `CLS_largest_shift` and the LCP phases, by region.
   - **Fix it in the shared pieces,** so every screen benefits:
     - `ListSection` skeletons match the real rows' height and the last-known row count.
     - `BoardZoom` and `GameShell` reserve the board's box from its viewBox `aspect-ratio` before data arrives.
     - `GameThumb` and `Avatar` carry fixed dimensions.
     - Late banners (install, notifications, "What's new") open below the content or into reserved space, never above it.
     - Home's signed-in guess (item 1c in Phase 1, moving to a pre-paint script in 1.1e) must paint the same skeleton height as the screen Clerk confirms.
   - **Exit:** p75 CLS at or under 0.1 on `/`, the game route, `/profile` and the result screen.
10. **Make the Realm Arena board answer taps within 200 ms.** Its INP is 224 / 416 / 560 ms (median / p75 / p95). Taps on home sit at 72 ms median.
    - **Attribute it first:** report the INP target region (same allow-list as item 9) with its `inputDelay`, `processingDuration` and `presentationDelay`. *Shipped* as `INP_input_delay`, `INP_processing` and `INP_presentation`, by region; the profile below is still owed. Record a Performance-panel profile of selecting a fighter, tapping a square and choosing a turn-sheet action under 4× CPU throttling.
    - **Act only on what the profile shows.** Likely candidates:
      - Keep the tap's immediate feedback urgent, and move reach, path and line-of-sight recomputation into `startTransition` or into memoised derivations keyed on the selected unit.
      - Stop a selection re-rendering every tile, by making the selection overlay its own layer over a tile layer whose props don't change.
      - Compute the map's isometric geometry once per battlefield and turn of the view, not per render.
      - Leave anything that moves frame by frame on the `usePlayback` frame loop.
    - **Exit:** p75 INP at or under 200 ms on the board.
    - **Likely met (2026-10-22 checkpoint, n=16):** 96 ms median and 136 ms p75, on the 3D board (`board/camera` presentation 44 ms). The SVG board whose paint cost drove the earlier figures is no longer what players see. Confirm on a larger sample before closing it.

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

Reordered again after the [2026-10-10 checkpoint](./performance-checkpoints/2026-10-10.md): warm server reads are fixed, and cold function instances (the API's and the dynamic `/`) now cost more than the client waterfall. Steps 5 and 6 are new, and they come ahead of the shared memory cache and prefetch. A dashboard prefetch (step 8) also warms the API instance before the tap, which raises its value once the cold-instance work is measured.

1. **Observability:** custom marks, `Server-Timing`, bundle/image report, database explains, and repeatable traces. Then close the checkpoint's gaps: TTFB, CLS, LCP and INP attribution; response bytes and network time from resource timing; entry vs refresh tagging; the dashboard's untimed spans; and the session-retry count. — *custom marks, `Server-Timing`, the bundle/image budget, TTFB attribution, resource-timing bytes and network time, entry vs refresh tagging, the dashboard's spans and the session-retry count shipped*. CLS, LCP and INP attribution shipped too, as the attribution steps of Phase 3.9 and 3.10, and so did the explain script and the journey traces (Phase 0 items 4 and 5). The explain against production has now run (2026-10-10) and is clean. The admin report now filters its window, so a checkpoint can compare a window that holds only post-change samples: `since` (a date-time, 30 days at most, 7 days by default) limits it by when the sample arrived, and `build` limits it to samples from that build or a later one, which also drops clients still running an older cached version. The page offers both, with a list of the newest builds to pick "from build" from (see "Checkpoints").
2. **Cold document** (Phase 1.1) — *shipped*: TTFB attribution, service-worker navigation preload, the Clerk matcher with the cookie hint, and static game shells, in one change. The next checkpoint compares the TTFB distribution with this one.
3. **Server reads** (Phase 2) — *player-directory cache, dashboard projection and bounded completed results shipped*, and the production explain says no index or projection work is needed. Warm reads are now 38–58 ms. The next span to dominate is the cold instance (step 6), not the query.
4. **Navigation semantics** (Phase 1.2) — *shipped*: your-turn cards and finished rows are `<Link>`s, as the rail and waiting rows already were, and so are Kingdom Builder's settlement buttons. The remaining `router.push` calls are post-mutation or redirect transitions and stay. No imperative route prefetch was needed: the destinations are either already `<Link>`-prefetched or unknown until the push.
5. **Serve `/` as a static page** (Phase 1.1e) — *shipped (#898)*, without a root `loading.tsx` (see its status). It removes one cold function from every cold home open and the server render from every warm navigation home.
6. **Cold instances** (Phase 2, "Cold instances"): platform settings first (Fluid compute — *enabled*; function region against Atlas region — still to check), then the Mongo pool options, then the small dashboard concurrency change. Measure `entry` `server_mongo_query` and `api_network` once the admin report's `build` filter (step 1) gives a clean window.
7. **Shared memory cache:** request deduplication, identity/schema keys, TTL/LRU, mutation updates, push invalidation, and logout purge.
8. **Targeted prefetch:** intent first, then a one-game idle experiment behind a flag. Monitor hit rate, waste, API load, and mobile bytes.
9. **Bundle and art:** replace Moment.js first (Phase 3.8). Then audit the shared floor, split secondary features, and optimise/preload only critical assets.
10. **Layout shift and responsiveness:** Phase 3.9 and 3.10. They can run beside steps 4–9, since they touch different code.
10a. **New instances** (after the 2026-10-22 checkpoint): indexes built at deploy time instead of by every new instance, and a warm-up ping while Clerk loads ("Cold instances" items 4 and 5) — *shipped*. Next, if the checkpoint after them bears it out, a player directory shared between instances (about 250 ms of `names` on every cold `entry`, which no per-instance cache can save).
11. **Server-seeded pilot:** try one game only if cold deep links still miss the target; compare it with the prefetched-API design before wider migration.
12. **Broader routes:** reuse the proven link/cache/prefetch primitives throughout the app.

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

1. Is game entry mostly route/code, auth, API/server, payload/render, or art? *(2026-10-10, partial: on a warm instance the server is 38–58 ms and no longer the issue. On a cold open it is the function instances — the document's render and the API's start-up and Mongo connections — at seconds each. See the checkpoint.)*
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
