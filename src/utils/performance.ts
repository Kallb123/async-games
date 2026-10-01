/** Privacy-safe performance telemetry shared by the browser, API routes, and admin report. */

/**
 * The milestones a screen marks on its way to usable. Each is timed from the
 * start of the journey that led to the screen — the tap, the back button, or
 * the document load — never from when the tab opened: this is a single-page
 * app, so `performance.now()` keeps counting across every in-app navigation,
 * and a game opened after a minute on the dashboard would otherwise read as a
 * minute-long load.
 */
export const JOURNEY_MILESTONES = ['auth_ready', 'first_data', 'dashboard_usable', 'game_board_painted', 'game_usable'] as const;
export type JourneyMilestone = typeof JOURNEY_MILESTONES[number];

export const PERFORMANCE_METRIC_NAMES = [
  'navigation', ...JOURNEY_MILESTONES, 'server_total', 'server_auth', 'server_mongo_connect', 'server_mongo_query', 'server_player_directory', 'server_response_build', 'server_response', 'server_reactions', 'server_achievements', 'server_serialise', 'response_bytes', 'image_load', 'LCP', 'INP', 'CLS', 'FCP', 'TTFB',
] as const;
export type PerformanceMetricName = typeof PERFORMANCE_METRIC_NAMES[number];

/** `cold` is a document load (code, auth and data from scratch); `warm` an in-app navigation. */
export const PERFORMANCE_CACHES = ['cold', 'warm'] as const;
export type PerformanceCache = typeof PERFORMANCE_CACHES[number];

export interface PerformanceMetricInput {
  name: PerformanceMetricName;
  value: number;
  route: string;
  source?: 'link' | 'history' | 'load' | 'deep-link';
  cache?: PerformanceCache;
  connection?: string;
  build?: string;
}

export function safeRoute(pathname: string): string {
  const route = pathname.split('?')[0];
  if (/^\/games\/result\/[^/]+$/.test(route)) return '/games/result/[gameId]';
  if (/^\/games\/[^/]+\/[^/]+$/.test(route)) return route.replace(/\/[^/]+$/, '/[gameid]');
  if (/^\/kingdombuilder\/[^/]+\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]/[settlementId]';
  if (/^\/kingdombuilder\/[^/]+$/.test(route)) return '/kingdombuilder/[worldId]';
  if (/^\/lobby\/[^/]+$/.test(route)) return '/lobby/[inviteId]';
  if (/^\/profile\/[^/]+$/.test(route)) return '/profile/[userId]';
  if (/^[a-z0-9_\-/]{1,120}$/i.test(route) && !/[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(route)) return route;
  return 'other';
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
