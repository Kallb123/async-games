import { describe, expect, it } from 'vitest';
import { formatPerformanceValue, performanceMarkdown } from './performance';

describe('performanceMarkdown', () => {
    const generatedAt = new Date('2026-09-26T12:00:00.000Z');
    const since = '2026-09-19T12:00:00.000Z';

    it('writes the header and every row as a table in each metric’s unit', () => {
        const markdown = performanceMarkdown({
            since, totalSamples: 12, summaries: [
                { name: 'LCP', route: '/game/[id]', samples: 10, median: 1200.4, p75: 1800, p95: 3000.6 },
                { name: 'CLS', route: '/', samples: 2, median: 0.01, p75: 0.1, p95: 0.25 },
            ],
        }, generatedAt);
        expect(markdown).toContain('- Samples: 12');
        expect(markdown).toContain(`- Window: ${since} → 2026-09-26T12:00:00.000Z (7 days)`);
        expect(markdown).toContain('| LCP | /game/[id] | 10 | 1200 ms | 1800 ms | 3001 ms |');
        expect(markdown).toContain('| CLS | / | 2 | 0.010 | 0.100 | 0.250 |');
    });

    it('escapes a pipe in a route so the table keeps its columns', () => {
        const markdown = performanceMarkdown({ since, totalSamples: 1, summaries: [{ name: 'api', route: '/a|b', samples: 1, median: 1, p75: 1, p95: 1 }] }, generatedAt);
        expect(markdown).toContain('| api | /a\\|b | 1 |');
    });

    it('says so when there is nothing to report', () => {
        expect(performanceMarkdown({ since, totalSamples: 0, summaries: [] }, generatedAt)).toContain('_No performance samples in this window._');
    });
});

describe('formatPerformanceValue', () => {
    it('reads byte metrics as KB', () => {
        expect(formatPerformanceValue('transfer-bytes', 2048)).toBe('2 KB');
    });
});
