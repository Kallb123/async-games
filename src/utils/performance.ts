/** Privacy-safe performance telemetry shared by the browser, API routes, and admin report. */

/**
 * The milestones a screen marks on its way to usable. Each is timed from the
 * start of the journey that led to the screen — the tap, the back button, or
 * the document load — never from when the tab opened: this is a single-page
 * app, so `performance.now()` keeps counting across every in-app navigation,
 * and a game opened after a minute on the dashboard would otherwise read as a
 * minute-long load.
 *
 * `auth_ready` is Clerk having loaded; `session_ready` is the page having
 * confirmed its session token once (`useIsAuthorised`), which every request
 * waits for, so the gap between the two is that confirmation.
 * `game_board_painted` is the frame the board reached the screen; `game_usable`
 * is the first idle moment of the main thread after it (see `useGameData`).
 */
export const JOURNEY_MILESTONES = ['auth_ready', 'session_ready', 'first_data', 'dashboard_usable', 'game_board_painted', 'game_usable'] as const;
export type JourneyMilestone = typeof JOURNEY_MILESTONES[number];

/**
 * How the in-memory data cache (`utils/hooks/dataCache.ts`) did, reported by the
 * screen or the prefetch that used it:
 *
 * - `data_cache_hit`: a screen painted its first data from the cache; the value
 *   is the age of that body in ms, so the report can say how stale a cached
 *   paint is.
 * - `data_cache_miss`: a cache-enabled screen had nothing fresh and waited on
 *   the network (value 0). Together with the hits, the hit rate.
 * - `data_prefetch`: a prefetch from a game row that finished; the value is how
 *   long it took, fetch to parsed body.
 *
 * No id, name or body is ever attached: the route is the only context.
 */
export const DATA_CACHE_METRICS = ['data_cache_hit', 'data_cache_miss', 'data_prefetch'] as const;
export type DataCacheMetric = typeof DATA_CACHE_METRICS[number];

/**
 * Where a screen's first data came from, as the journey that opened it records
 * it: painted from the cache, a body a screen fetched earlier (`hit`) or one a
 * prefetch fetched (`prefetch`); not in the cache, but a prefetch for it was
 * still out and the screen joined it (`joined`); or fetched from scratch
 * (`miss`). The cache metrics carry it, and so do the milestones marked after
 * it, so a journey's `first_data` and `game_usable` can be split by it.
 */
export const PERFORMANCE_DATA_SOURCES = ['hit', 'prefetch', 'joined', 'miss'] as const;
export type PerformanceDataSource = typeof PERFORMANCE_DATA_SOURCES[number];

/**
 * How long Clerk took to hand over a session token, each a duration in ms:
 *
 * - `session_confirm`: the page's one confirmation that its token is current,
 *   which every request waits on (`useIsAuthorised`).
 * - `session_resume`: the renewal as the tab comes back to the foreground,
 *   which requests wait on before they are sent (`useAuthGuard`).
 * - `session_renew`: a renewal after a request was refused with a 401
 *   (`fetchWithSessionRetry`), tagged with the request it was for. With the
 *   one on return, these should be rare: a count that stays high says
 *   something other than a hidden tab is letting tokens lapse.
 *
 * Each has a `_timeout` twin, reported instead when Clerk hadn't answered by
 * the deadline and the app went ahead without it: the count of the two says
 * how often the deadline is what the player waited on.
 */
export const SESSION_METRICS = ['session_confirm', 'session_confirm_timeout', 'session_resume', 'session_resume_timeout', 'session_renew', 'session_renew_timeout'] as const;
export type SessionMetric = typeof SESSION_METRICS[number];

/**
 * The warm-up ping: a `HEAD` an inline script sends to the route a page will
 * call next, while Clerk is still loading, so the platform's start of the
 * function instance and its Mongo connection overlap Clerk instead of
 * following it (`utils/warmUp.ts`).
 *
 * - `api_warm`: the ping, from sending it to its headers arriving (tagged
 *   `warm`). Its `server_*` spans carry the same tag: `server_total`,
 *   `server_mongo_connect`, and `server_instance_new` when the ping was the
 *   first request its instance ever served.
 * - `warm_ping_lead`: tagged `entry`, reported once on the screen's first data
 *   fetch when a ping for that same route preceded it on this page load: how
 *   many ms before the fetch the ping was sent. The count against `entry`'s is
 *   the share of loads that were pinged.
 */
export const WARM_UP_METRICS = ['api_warm', 'warm_ping_lead'] as const;
export type WarmUpMetric = typeof WARM_UP_METRICS[number];

/** The metrics reported through `window.__agPerformanceMetric`, rather than from a journey or a fetch. */
export type ClientMetric = DataCacheMetric | SessionMetric;
/** What a `ClientMetric` may say about where it was taken: see `window.__agPerformanceMetric`. */
export interface ClientMetricContext { pathname?: string; dataSource?: PerformanceDataSource }

export const PERFORMANCE_METRIC_NAMES = [
  'navigation', ...JOURNEY_MILESTONES, ...DATA_CACHE_METRICS, ...SESSION_METRICS, ...WARM_UP_METRICS, 'server_total', 'server_auth', 'server_mongo_connect', 'server_mongo_query', 'server_mongo_checkout', 'server_mongo_handshake', 'server_idle', 'server_instance_new', 'server_player_directory', 'server_names', 'server_unread_chat', 'server_kb_worlds', 'server_response_build', 'server_response', 'server_reactions', 'server_achievements', 'server_serialise', 'response_bytes', 'image_load', 'LCP', 'INP', 'CLS', 'FCP', 'TTFB',
  'TTFB_waiting', 'TTFB_cache', 'TTFB_dns', 'TTFB_connection', 'TTFB_request', 'sw_startup',
  'api_total', 'api_connect', 'api_network', 'api_download', 'session_retry',
  'CLS_largest_shift', 'LCP_load_delay', 'LCP_load', 'LCP_render_delay', 'INP_input_delay', 'INP_processing', 'INP_presentation',
] as const;
export type PerformanceMetricName = typeof PERFORMANCE_METRIC_NAMES[number];

/** One reading of one metric. */
export interface MetricValue { name: PerformanceMetricName; value: number }

/** The phases that have a value: anything missing or not a finite number is left out, and a negative one reads 0. */
function finitePhases(phases: { name: PerformanceMetricName; value: number | undefined }[]): MetricValue[] {
  return phases.flatMap(({ name, value }) => value !== undefined && Number.isFinite(value) ? [{ name, value: Math.max(0, value) }] : []);
}

/** A layout-shift score, which has no unit. */
export const isShiftMetric = (name: string) => name.startsWith('CLS');

/** A metric counted in bytes rather than milliseconds. */
export const isByteMetric = (name: string) => name.endsWith('bytes');

/** The largest value the beacon accepts: two minutes for a time, a day for how long an instance sat idle, 50 MB for a size. */
export const performanceValueLimit = (name: string) => isByteMetric(name) ? 50_000_000 : name === 'server_idle' ? 86_400_000 : 120_000;

/**
 * Which of a screen's own data fetches a sample came from: the `entry` fetch
 * that brought its first data, or a later `refresh` (a poll, a push, the tab
 * coming back). Entry is what a player waits on; refreshes are polling load.
 * `warm` is not one of the screen's fetches but the warm-up ping sent ahead of
 * the entry (see `WARM_UP_METRICS`), so its timings are split from it.
 */
export const PERFORMANCE_REQUESTS = ['entry', 'refresh', 'warm'] as const;
export type PerformanceRequest = typeof PERFORMANCE_REQUESTS[number];

/** The spans of a `Server-Timing` header that we report, as `server_<span>` metrics. Spans we don't know are left out. */
export function serverTimingMetrics(header: string | null): MetricValue[] {
  return (header ?? '').split(',').flatMap(span => {
    const match = /^\s*([a-z_]+);dur=([0-9.]+)/.exec(span);
    const name = match && `server_${match[1]}`;
    return name && (PERFORMANCE_METRIC_NAMES as readonly string[]).includes(name)
      ? [{ name: name as PerformanceMetricName, value: Number(match[2]) }] : [];
  });
}

/** The parts of an API request's `PerformanceResourceTiming` the fetch metrics are read from. */
export type ApiResourceTiming = Pick<PerformanceResourceTiming, 'startTime' | 'requestStart' | 'responseStart' | 'responseEnd' | 'encodedBodySize'>;

/**
 * Where a screen's data fetch went, from the browser's own record of it:
 *
 * - `api_total`: the whole request, from `fetch()` to the last byte.
 * - `api_connect`: before the request was sent — queueing, DNS and the
 *   connection, which is a phone waking its radio.
 * - `api_network`: from sending the request to its first byte, less the
 *   server's own `server_total` — the round trip and the host's edge. Left out
 *   without a `server_total` to take away.
 * - `api_download`: from the first byte to the last, the body's transfer.
 * - `response_bytes`: the body as sent, compressed. The host strips
 *   `Content-Length` once it compresses, so the header can't say.
 *
 * A phase whose timestamps the browser didn't record (0) is left out, as is
 * anything that isn't a finite number. A negative difference reads 0.
 */
export function apiFetchMetrics(entry: ApiResourceTiming, serverTotal?: number): MetricValue[] {
  const { startTime, requestStart, responseStart, responseEnd, encodedBodySize } = entry;
  return finitePhases([
    { name: 'api_total', value: responseEnd > 0 ? responseEnd - startTime : undefined },
    { name: 'api_connect', value: requestStart > 0 ? requestStart - startTime : undefined },
    { name: 'api_network', value: requestStart > 0 && responseStart > 0 && serverTotal !== undefined ? responseStart - requestStart - serverTotal : undefined },
    { name: 'api_download', value: responseStart > 0 && responseEnd > 0 ? responseEnd - responseStart : undefined },
    { name: 'response_bytes', value: encodedBodySize > 0 ? encodedBodySize : undefined },
  ]);
}

/** The parts of a `web-vitals` TTFB attribution the phase metrics are read from. */
export interface TtfbAttributionInput {
  waitingDuration: number;
  cacheDuration: number;
  dnsDuration: number;
  connectionDuration: number;
  requestDuration: number;
  navigationEntry?: Pick<PerformanceNavigationTiming, 'workerStart' | 'fetchStart'>;
}

/**
 * Where a document's TTFB went, as separate metrics beside the `TTFB` total:
 * the wait before the browser began, which holds any redirects (`waiting`),
 * the cache check — which with a service worker also holds its boot and fetch
 * handler (`cache`) — then DNS, the connection, and the request itself, which
 * is the network plus the server's own time (`request`). A long `waiting` is a
 * redirect chain such as Clerk's handshake; a long `cache` or `sw_startup` is
 * the service worker; a long `request` is the server.
 *
 * `sw_startup` is `fetchStart - workerStart`. Per Navigation Timing,
 * `workerStart` is taken just before the worker thread is started (or, when it
 * is already running, just before the fetch event is dispatched), and
 * `fetchStart` when the browser begins fetching — after the worker's handler
 * has run and called `fetch()`, or without it for a request it never
 * answered. So that gap is exactly how long the navigation waited on the
 * worker, boot included, which is what a worker that is slow to start makes
 * the user pay. It sits inside `TTFB_cache`, and is absent when no worker was
 * involved (`workerStart` is 0). Anything that isn't a finite number is left
 * out, and a negative gap (some browsers order the two the other way) reads 0.
 */
export function ttfbPhaseMetrics(attribution: TtfbAttributionInput): MetricValue[] {
  const { navigationEntry } = attribution;
  return finitePhases([
    { name: 'TTFB_waiting', value: attribution.waitingDuration },
    { name: 'TTFB_cache', value: attribution.cacheDuration },
    { name: 'TTFB_dns', value: attribution.dnsDuration },
    { name: 'TTFB_connection', value: attribution.connectionDuration },
    { name: 'TTFB_request', value: attribution.requestDuration },
    { name: 'sw_startup', value: navigationEntry && navigationEntry.workerStart > 0
      ? Math.max(0, navigationEntry.fetchStart - navigationEntry.workerStart) : undefined },
  ]);
}

/**
 * The coarse names a Core Web Vital's attribution may give the part of the page
 * involved: the element that shifted most, the largest paint, the element
 * tapped. Shared components wear one as `data-perf-region`, and a sample
 * carries the path of the marked ancestors from the outside in, such as
 * `board/hand` or `dashboard/section/list-row/avatar`. The sample's route
 * already says which screen it is, so a screen is marked only where two share
 * a route (`/` is the dashboard or the landing page). Never an element's text,
 * id, selector or URL: an id or an avatar's address would identify a player.
 * `unmarked` is an element inside none of them. `camera` is a board drawn by a
 * camera rather than laid out as an SVG (`BoardZoom`'s camera mode: Realm
 * Arena's 3D board), so `board/camera` and `board` tell the two renderers apart.
 */
export const PERFORMANCE_REGIONS = [
  'rail', 'topbar', 'board', 'camera', 'hand', 'build-row', 'log', 'chat', 'dashboard', 'landing',
  'section', 'list-row', 'skeleton', 'avatar', 'thumb', 'banner', 'offer', 'disclosure',
] as const;
export type PerformanceRegion = typeof PERFORMANCE_REGIONS[number];
const regionNames = new Set<string>(PERFORMANCE_REGIONS);
/** The deepest a region path goes: the innermost few are the ones that say where. */
const REGION_DEPTH = 4;

/** Whether `value` is a region path `performanceRegion` could have produced. */
export function isPerformanceRegion(value: unknown): value is string {
  if (value === 'unmarked') return true;
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  return parts.length <= REGION_DEPTH && parts.every(part => regionNames.has(part));
}

/** The part of a DOM element `performanceRegion` reads. */
export interface RegionElement {
  parentElement: RegionElement | null;
  getAttribute(name: string): string | null;
}

/**
 * The region path of `node` (see `PERFORMANCE_REGIONS`), or undefined when
 * there is no element to place: the browser didn't say which, or it is text
 * whose parent is gone. A marker not on the allow-list is skipped, never sent.
 */
export function performanceRegion(node: { nodeType: number; parentElement: RegionElement | null } | null | undefined): string | undefined {
  if (!node) return undefined;
  const element = node.nodeType === 1 ? node as unknown as RegionElement : node.parentElement;
  if (!element) return undefined;
  const path: string[] = [];
  for (let at: RegionElement | null = element; at; at = at.parentElement) {
    const region = at.getAttribute('data-perf-region');
    // A component inside another of its kind (a skeleton bar in a skeleton
    // row) is the one place, not two.
    if (region && regionNames.has(region) && path[0] !== region) path.unshift(region);
  }
  return path.length ? path.slice(-REGION_DEPTH).join('/') : 'unmarked';
}

/** The parts of a `web-vitals` CLS, LCP or INP report the phase metrics are read from. */
export type VitalAttributionInput =
  | { name: 'TTFB'; attribution: TtfbAttributionInput }
  | { name: 'CLS'; attribution: { largestShiftValue?: number } }
  | { name: 'LCP'; attribution: { resourceLoadDelay: number; resourceLoadDuration: number; elementRenderDelay: number } }
  | { name: 'INP'; attribution: { inputDelay: number; processingDuration: number; presentationDelay: number } };

/**
 * Where a Core Web Vital went, as metrics beside its total.
 *
 * - TTFB: see `ttfbPhaseMetrics`.
 * - CLS: the score of the largest single shift — what fixing that one element
 *   would take off.
 * - LCP, after its TTFB (already reported): the wait before the largest
 *   element's image began loading, its load, and the render after it. Text has
 *   no image, so all of it is render delay — on a game, waiting for the data.
 * - INP: the wait for the main thread before the tap's handlers ran, the
 *   handlers, and the render and paint after them.
 */
export function vitalPhaseMetrics(metric: VitalAttributionInput): MetricValue[] {
  switch (metric.name) {
    case 'TTFB': return ttfbPhaseMetrics(metric.attribution);
    case 'CLS': return finitePhases([{ name: 'CLS_largest_shift', value: metric.attribution.largestShiftValue }]);
    case 'LCP': return finitePhases([
      { name: 'LCP_load_delay', value: metric.attribution.resourceLoadDelay },
      { name: 'LCP_load', value: metric.attribution.resourceLoadDuration },
      { name: 'LCP_render_delay', value: metric.attribution.elementRenderDelay },
    ]);
    case 'INP': return finitePhases([
      { name: 'INP_input_delay', value: metric.attribution.inputDelay },
      { name: 'INP_processing', value: metric.attribution.processingDuration },
      { name: 'INP_presentation', value: metric.attribution.presentationDelay },
    ]);
  }
}

/** `cold` is a document load (code, auth and data from scratch); `warm` an in-app navigation. */
export const PERFORMANCE_CACHES = ['cold', 'warm'] as const;
export type PerformanceCache = typeof PERFORMANCE_CACHES[number];

export interface PerformanceMetricInput {
  name: PerformanceMetricName;
  value: number;
  route: string;
  source?: 'link' | 'history' | 'load' | 'deep-link';
  cache?: PerformanceCache;
  /** API metrics only: see `PERFORMANCE_REQUESTS`. */
  request?: PerformanceRequest;
  /** Vital attribution metrics only: see `PERFORMANCE_REGIONS`. */
  region?: string;
  /** Journey milestones and the cache metrics only: see `PERFORMANCE_DATA_SOURCES`. */
  dataSource?: PerformanceDataSource;
  connection?: string;
  build?: string;
}

export function safeRoute(pathname: string): string {
  const route = pathname.split('?')[0];
  // A route is a path: anything with whitespace or a control character in it
  // is forged, and a newline would split a row of the admin report.
  if (/[\s\x00-\x1f]/.test(route)) return 'other';
  if (/^\/games\/result\/[^/]+$/.test(route)) return '/games/result/[gameId]';
  if (/^\/games\/[^/]+\/[^/]+$/.test(route)) return route.replace(/\/[^/]+$/, '/[gameid]');
  if (/^\/kingdombuilder\/[^/]+\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]/[settlementId]';
  if (/^\/kingdombuilder\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]';
  if (/^\/lobby\/[^/]+$/.test(route)) return '/lobby/[inviteId]';
  if (/^\/profile\/[^/]+$/.test(route)) return '/profile/[userId]';
  if (/^[a-z0-9_\-/]{1,120}$/i.test(route) && !/[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(route)) return route;
  return 'other';
}

/** The count, median, p75 and p95 of one group of samples. */
export interface PerformanceStats { samples: number; median: number; p75: number; p95: number }

/** The value at `fraction` of the way up already-sorted `values` (nearest rank): the one way every percentile and median the app reports is taken. */
export const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;

/**
 * Samples grouped on whatever `keyOf` returns, each group's stats beside the
 * first sample in it (which carries the fields the key was made of). The admin
 * report and the journey traces both summarise this way, so a median means the
 * same thing in both.
 */
export function summarisePerformance<Row extends { value: number }>(rows: Row[], keyOf: (row: Row) => unknown[]): { sample: Row; stats: PerformanceStats }[] {
  const groups = new Map<string, { sample: Row; values: number[] }>();
  for (const row of rows) {
    const key = JSON.stringify(keyOf(row));
    const group = groups.get(key) ?? { sample: row, values: [] };
    group.values.push(row.value);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ sample, values }) => {
    values.sort((a, b) => a - b);
    return { sample, stats: { samples: values.length, median: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95) } };
  });
}

/** Metrics whose value only means something within one journey, so the report splits them cold/warm. */
export const JOURNEY_METRICS = new Set<string>([...JOURNEY_MILESTONES, 'navigation']);

/** One route arrival: where it started, what caused it, and whether the app's code was already running. */
export interface Journey {
  path: string;
  /** `performance.now()` at the moment the journey began. */
  start: number;
  source: 'load' | 'link' | 'history';
  cache: PerformanceCache;
  /** False for a route change nobody asked for (a redirect): there is no tap to time a `navigation` from. */
  hasIntent: boolean;
  /** Set once the tab is hidden mid-journey: time spent in the background is not load time. */
  hidden: boolean;
  /** Milestones already reported: each counts once per journey, whichever screen part reaches it first. */
  marked: Set<JourneyMilestone>;
  /** Where the screen's first data came from, once its cache-enabled screen has said. */
  dataSource?: PerformanceDataSource;
}

/**
 * How long after a tap, key press or back button a route change still counts
 * as caused by it. Generous, so a slow navigation on a poor connection keeps
 * its tail rather than being mistaken for a redirect; bounded, so a redirect
 * the app makes on its own isn't timed from some unrelated tap long before.
 */
export const INTENT_WINDOW_MS = 30_000;

/** The journey a document load begins, timed from the tab's time origin. */
export function loadJourney(path: string, hidden: boolean): Journey {
  return { path, start: 0, source: 'load', cache: 'cold', hasIntent: true, hidden, marked: new Set() };
}

/**
 * The journey an in-app route change begins. It starts at whichever came last
 * of the user's latest tap/key press and latest back/forward, if that was
 * recent enough to have caused it — which covers `router.push` from a clickable
 * row as well as a real `<Link>`. Without either it is a redirect, timed from
 * when the route changed.
 */
export function nextJourney(path: string, now: number, lastIntent?: number, lastPopstate?: number): Journey {
  const recent = (at?: number): at is number => at !== undefined && now - at <= INTENT_WINDOW_MS;
  const base = { path, cache: 'warm' as const, hidden: false, marked: new Set<JourneyMilestone>() };
  if (recent(lastPopstate) && (!recent(lastIntent) || lastPopstate >= lastIntent)) {
    return { ...base, start: lastPopstate, source: 'history', hasIntent: true };
  }
  if (recent(lastIntent)) return { ...base, start: lastIntent, source: 'link', hasIntent: true };
  return { ...base, start: now, source: 'link', hasIntent: false };
}
