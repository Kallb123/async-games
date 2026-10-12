/**
 * Which samples the admin performance report reads: a time window (`since`) and
 * an optional lowest build (`build`). Pure, so the route's query parameters can
 * be tested without a request, and so the admin screen builds the same URL the
 * route parses.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a sample lives: the TTL on `createdAt` in `PerformanceMetricData.ts`. */
export const PERFORMANCE_RETENTION_MS = 30 * DAY_MS;
/** The window when `since` is not given. */
export const DEFAULT_PERFORMANCE_WINDOW_MS = 7 * DAY_MS;

/**
 * A build time as `next.config.mjs` stamps it (`new Date().toISOString()`):
 * fixed width, UTC, millisecond precision. Because every one has the same shape,
 * comparing two as strings orders them in time, which is what lets the route
 * ask Mongo for `build >= x` without parsing anything. Only this shape is
 * accepted as a `build` filter, and only this shape is offered in the builds
 * list, so a hand-made sample with some other `build` string (the beacon allows
 * a looser one) can neither be asked for nor sort among the real builds.
 */
export const CANONICAL_BUILD = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A date, or a date and time with an explicit zone (`Z` or an offset): never a local time the server would have to guess the zone of. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

export interface PerformanceWindow {
  /** The oldest sample read, never older than the retention. */
  since: Date;
  /** Only samples from this build time or later; null for any build. */
  build: string | null;
}

export type PerformanceWindowResult = ({ ok: true } & PerformanceWindow) | { ok: false; error: string };

/** A well-formed ISO instant as a Date, or null. */
function parseInstant(text: string): Date | null {
  if (!ISO_INSTANT.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The window a request asks for. `since` defaults to seven days ago and is
 * clamped to the retention (an older one is just "30 days ago", since nothing
 * older exists); `build` defaults to none. Anything present but malformed is an
 * error rather than quietly ignored, so a mistyped filter can't pass for the
 * default window. Only a parsed Date and a regex-checked string leave here.
 */
export function parsePerformanceWindow(params: URLSearchParams, now: Date = new Date()): PerformanceWindowResult {
  const oldest = new Date(now.getTime() - PERFORMANCE_RETENTION_MS);
  let since = new Date(now.getTime() - DEFAULT_PERFORMANCE_WINDOW_MS);
  const sinceText = params.get('since');
  if (sinceText !== null) {
    const parsed = parseInstant(sinceText);
    if (!parsed) return { ok: false, error: 'since must be an ISO date, or a date-time with a zone (Z or an offset)' };
    since = parsed < oldest ? oldest : parsed;
  }
  const build = params.get('build');
  if (build !== null && (!CANONICAL_BUILD.test(build) || Number.isNaN(new Date(build).getTime()))) {
    return { ok: false, error: 'build must be a build time such as 2026-10-10T08:30:00.000Z' };
  }
  return { ok: true, since, build };
}

/** The query string for a window, the inverse of `parsePerformanceWindow`: each of `since` (as an instant) and `build` only when set. */
export function performanceWindowQuery(since: Date | null, build: string | null): string {
  const params = new URLSearchParams();
  if (since) params.set('since', since.toISOString());
  if (build) params.set('build', build);
  return params.toString();
}
