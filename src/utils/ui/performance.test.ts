import { describe, expect, it } from 'vitest';
import { formatPerformanceValue, performanceMarkdown } from './performance';

describe('performanceMarkdown', () => {
    const generatedAt = new Date('2026-09-26T12:00:00.000Z');
    const since = '2026-09-19T12:00:00.000Z';

    it('writes the header and every row as a table in each metric’s unit', () => {
        const markdown = performanceMarkdown({
            since, totalSamples: 15, summaries: [
                { name: 'LCP', route: '/game/[id]', samples: 10, median: 1200.4, p75: 1800, p95: 3000.6 },
                { name: 'CLS', route: '/', samples: 2, median: 0.01, p75: 0.1, p95: 0.25 },
                { name: 'game_usable', route: '/game/[id]', cache: 'warm', samples: 3, median: 400, p75: 600, p95: 900 },
                { name: 'server_total', route: '/game/[id]', request: 'entry', samples: 4, median: 270, p75: 440, p95: 2100 },
                { name: 'CLS_largest_shift', route: '/', region: 'dashboard/section/list-row', samples: 5, median: 0.2, p75: 0.31, p95: 0.4 },
            ],
        }, generatedAt);
        expect(markdown).toContain('- Samples: 15');
        expect(markdown).toContain(`- Window: ${since} → 2026-09-26T12:00:00.000Z (7 days)`);
        expect(markdown).toContain('| LCP | /game/[id] |  |  |  | 10 | 1200 ms | 1800 ms | 3001 ms |');
        expect(markdown).toContain('| CLS | / |  |  |  | 2 | 0.010 | 0.100 | 0.250 |');
        expect(formatPerformanceValue('TTFB_request', 4200.4)).toBe('4200 ms');
        expect(formatPerformanceValue('sw_startup', 328)).toBe('328 ms');
        expect(markdown).toContain('| game_usable | /game/[id] | warm |  |  | 3 | 400 ms | 600 ms | 900 ms |');
        expect(markdown).toContain('| server_total | /game/[id] |  | entry |  | 4 | 270 ms | 440 ms | 2100 ms |');
        expect(markdown).toContain('| CLS_largest_shift | / |  |  | dashboard/section/list-row | 5 | 0.200 | 0.310 | 0.400 |');
    });

    it('escapes a pipe in a route so the table keeps its columns', () => {
        const markdown = performanceMarkdown({ since, totalSamples: 1, summaries: [{ name: 'api', route: '/a|b', samples: 1, median: 1, p75: 1, p95: 1 }] }, generatedAt);
        expect(markdown).toContain('| api | /a\\|b |  |  |  | 1 |');
    });

    it('says so when there is nothing to report', () => {
        expect(performanceMarkdown({ since, totalSamples: 0, summaries: [] }, generatedAt)).toContain('_No performance samples in this window._');
    });
});

describe('formatPerformanceValue', () => {
    it('reads byte metrics as KB', () => {
        expect(formatPerformanceValue('transfer-bytes', 2048)).toBe('2 KB');
        expect(formatPerformanceValue('response_bytes', 18_432)).toBe('18 KB');
    });
});
