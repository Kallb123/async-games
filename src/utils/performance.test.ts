import { describe, expect, it } from 'vitest';
import { apiFetchMetrics, INTENT_WINDOW_MS, loadJourney, nextJourney, PERFORMANCE_METRIC_NAMES, performanceValueLimit, safeRoute, serverTimingMetrics, ttfbPhaseMetrics } from './performance';

describe('safeRoute', () => {
  it.each([
    ['/games/dicecities/2b62c738-58dc-4f2d-9d45-91bc7f1bb790', '/games/dicecities/[gameid]'],
    ['/games/result/secret', '/games/result/[gameId]'],
    ['/profile/user_2secret', '/profile/[userId]'],
    ['/kingdombuilder/world-secret/settlement-secret', '/kingdombuilder/[worldId]/[settlementId]'],
    ['/lobby/invite-secret', '/lobby/[inviteId]'],
  ])('removes identifiers from %s', (input, expected) => expect(safeRoute(input)).toBe(expected));

  it('collapses a route with a newline or space in it, which no real path has', () => {
    expect(safeRoute('/games/x\n| forged |\nrefresh/z')).toBe('other');
    expect(safeRoute('/games/x y/z')).toBe('other');
  });

  it('collapses an unknown identifier-shaped route', () => {
    expect(safeRoute('/unknown/2b62c738-58dc-4f2d-9d45-91bc7f1bb790')).toBe('other');
  });
});

describe('nextJourney', () => {
  it('times a navigation from the tap that caused it', () => {
    expect(nextJourney('/games/x/1', 65_000, 64_200)).toMatchObject({ start: 64_200, source: 'link', cache: 'warm', hasIntent: true });
  });

  it('times a back/forward from the popstate when it came after the last tap', () => {
    expect(nextJourney('/', 65_000, 50_000, 64_900)).toMatchObject({ start: 64_900, source: 'history' });
    expect(nextJourney('/', 65_000, 64_950, 64_900)).toMatchObject({ start: 64_950, source: 'link' });
  });

  it('times a redirect from the route change, and says it had no intent', () => {
    expect(nextJourney('/login', 90_000, 90_000 - INTENT_WINDOW_MS - 1)).toMatchObject({ start: 90_000, hasIntent: false });
  });

  it('starts a document load at the time origin', () => {
    expect(loadJourney('/', false)).toMatchObject({ start: 0, source: 'load', cache: 'cold' });
  });
});

describe('ttfbPhaseMetrics', () => {
  const phases = { waitingDuration: 20, cacheDuration: 35, dnsDuration: 0, connectionDuration: 0, requestDuration: 4200 };
  const valueOf = (metrics: ReturnType<typeof ttfbPhaseMetrics>, name: string) => metrics.find(metric => metric.name === name)?.value;

  it('reports each phase under its own metric name', () => {
    const metrics = ttfbPhaseMetrics(phases);
    expect(metrics.map(metric => metric.name)).toEqual(['TTFB_waiting', 'TTFB_cache', 'TTFB_dns', 'TTFB_connection', 'TTFB_request']);
    expect(valueOf(metrics, 'TTFB_request')).toBe(4200);
    for (const { name } of metrics) expect(PERFORMANCE_METRIC_NAMES).toContain(name);
  });

  it('times the service worker from workerStart to fetchStart', () => {
    const metrics = ttfbPhaseMetrics({ ...phases, navigationEntry: { workerStart: 12, fetchStart: 340 } });
    expect(valueOf(metrics, 'sw_startup')).toBe(328);
    expect(PERFORMANCE_METRIC_NAMES).toContain('sw_startup');
  });

  it('reports no service worker gap when no worker was involved, or the gap is backwards', () => {
    expect(valueOf(ttfbPhaseMetrics({ ...phases, navigationEntry: { workerStart: 0, fetchStart: 340 } }), 'sw_startup')).toBeUndefined();
    expect(valueOf(ttfbPhaseMetrics(phases), 'sw_startup')).toBeUndefined();
    expect(valueOf(ttfbPhaseMetrics({ ...phases, navigationEntry: { workerStart: 50, fetchStart: 40 } }), 'sw_startup')).toBe(0);
  });

  it('leaves out a value that is not a number', () => {
    const metrics = ttfbPhaseMetrics({ ...phases, dnsDuration: NaN, requestDuration: undefined as unknown as number });
    expect(metrics.map(metric => metric.name)).toEqual(['TTFB_waiting', 'TTFB_cache', 'TTFB_connection']);
  });
});

describe('serverTimingMetrics', () => {
  it('reports each timed span it knows, and nothing else', () => {
    const header = 'auth;dur=1.5, mongo_query;dur=37.0, names;dur=12.0, made_up;dur=9.0, total;dur=270.2, names_cache;desc="hit=2 miss=0", serialise;dur=0.1';
    expect(serverTimingMetrics(header)).toEqual([
      { name: 'server_auth', value: 1.5 },
      { name: 'server_mongo_query', value: 37 },
      { name: 'server_names', value: 12 },
      { name: 'server_total', value: 270.2 },
      { name: 'server_serialise', value: 0.1 },
    ]);
  });

  it('reports nothing for a response without the header', () => {
    expect(serverTimingMetrics(null)).toEqual([]);
  });
});

describe('apiFetchMetrics', () => {
  const entry = { startTime: 1000, requestStart: 1040, responseStart: 1400, responseEnd: 1460, encodedBodySize: 18_000 };
  const valueOf = (metrics: ReturnType<typeof apiFetchMetrics>, name: string) => metrics.find(metric => metric.name === name)?.value;

  it('splits the request into connection, network beyond the server, and download', () => {
    const metrics = apiFetchMetrics(entry, 270);
    expect(valueOf(metrics, 'api_total')).toBe(460);
    expect(valueOf(metrics, 'api_connect')).toBe(40);
    expect(valueOf(metrics, 'api_network')).toBe(90);
    expect(valueOf(metrics, 'api_download')).toBe(60);
    expect(valueOf(metrics, 'response_bytes')).toBe(18_000);
    for (const { name } of metrics) expect(PERFORMANCE_METRIC_NAMES).toContain(name);
  });

  it('leaves out the network share without a server total to take away', () => {
    expect(valueOf(apiFetchMetrics(entry), 'api_network')).toBeUndefined();
  });

  it('leaves out phases the browser did not record, and reads a negative share as 0', () => {
    const metrics = apiFetchMetrics({ ...entry, requestStart: 0, responseStart: 0, encodedBodySize: 0 }, 270);
    expect(metrics.map(metric => metric.name)).toEqual(['api_total']);
    expect(valueOf(apiFetchMetrics(entry, 500), 'api_network')).toBe(0);
  });
});

describe('performanceValueLimit', () => {
  it('lets a large body through as bytes but caps a time at two minutes', () => {
    expect(performanceValueLimit('response_bytes')).toBeGreaterThan(1_000_000);
    expect(performanceValueLimit('api_total')).toBe(120_000);
  });
});
