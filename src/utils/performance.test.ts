import { describe, expect, it } from 'vitest';
import { INTENT_WINDOW_MS, loadJourney, nextJourney, PERFORMANCE_METRIC_NAMES, safeRoute, ttfbPhaseMetrics } from './performance';

describe('safeRoute', () => {
  it.each([
    ['/games/dicecities/2b62c738-58dc-4f2d-9d45-91bc7f1bb790', '/games/dicecities/[gameid]'],
    ['/games/result/secret', '/games/result/[gameId]'],
    ['/profile/user_2secret', '/profile/[userId]'],
    ['/kingdombuilder/world-secret/settlement-secret', '/kingdombuilder/[worldId]/[settlementId]'],
    ['/lobby/invite-secret', '/lobby/[inviteId]'],
  ])('removes identifiers from %s', (input, expected) => expect(safeRoute(input)).toBe(expected));

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
