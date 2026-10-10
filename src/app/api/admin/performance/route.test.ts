// The admin performance report's window (docs/loading-performance-plan.md):
// who may read it, how `since` and `build` reach the Mongo filter, and that a
// bad parameter is refused before the database is touched.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { GET, type AdminPerformanceResponse } from './route';
import { ANN, get, resetApiRouteStubs, signIn } from '@/utils/testing/apiRoute';
import { consumeRateLimit } from '@/utils/rateLimit';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';
import { PERFORMANCE_RETENTION_MS } from '@/utils/performanceWindow';

const ADMIN = { id: 'user_admin', username: 'admin', publicMetadata: { unlocked: true, admin: true } };
const NOW = new Date('2026-10-10T12:00:00.000Z');
const BUILD = '2026-10-10T08:30:00.000Z';

type Filter = { createdAt: { $gte: Date }, build?: { $gte: string }, request?: unknown };
let finds: Filter[];
let pipelines: object[][];
let builds: { _id: string, firstSeen: Date, samples: number }[];
let buildsError: Error | null;
let sampleRows: object[];

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await resetApiRouteStubs();
    finds = [];
    pipelines = [];
    builds = [];
    buildsError = null;
    sampleRows = [];
    // The query builder the route chains: select, sort, limit, lean.
    vi.spyOn(PerformanceMetricModel, 'find').mockImplementation(((filter: Filter) => {
        finds.push(filter);
        const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => sampleRows };
        return query;
    }) as never);
    vi.spyOn(PerformanceMetricModel, 'aggregate').mockImplementation(((pipeline: object[]) => {
        pipelines.push(pipeline);
        return { option: async () => { if (buildsError) throw buildsError; return builds; } };
    }) as never);
});

afterEach(() => {
    vi.useRealTimers();
});

const report = async (query = '') => {
    const response = await GET(get(`/api/admin/performance${query}`));
    return { status: response.status, body: await response.json() as AdminPerformanceResponse & { error?: string } };
};

describe('GET /api/admin/performance', () => {
    it('refuses a caller who is not signed in, before reading anything', async () => {
        expect((await report()).status).toBe(403);
        expect(finds).toEqual([]);
        expect(pipelines).toEqual([]);
    });

    it('refuses a signed-in player who is not an admin', async () => {
        signIn({ ...ANN, publicMetadata: { unlocked: true } });
        expect((await report()).status).toBe(403);
        expect(finds).toEqual([]);
    });

    describe('as an admin', () => {
        beforeEach(() => signIn(ADMIN));

        it('answers 429 without reading once the admin is over the limit', async () => {
            vi.mocked(consumeRateLimit).mockResolvedValueOnce(false);
            expect((await report()).status).toBe(429);
            expect(finds).toEqual([]);
            expect(pipelines).toEqual([]);
        });

        it('reads the last seven days from any build by default', async () => {
            const { status, body } = await report();
            expect(status).toBe(200);
            expect(body.since).toBe('2026-10-03T12:00:00.000Z');
            expect(body.build).toBeNull();
            expect(finds).toHaveLength(2);
            for (const filter of finds) {
                expect(filter.createdAt.$gte).toEqual(new Date('2026-10-03T12:00:00.000Z'));
                expect(filter).not.toHaveProperty('build');
            }
        });

        it('keeps the two reads apart: page loads and journeys, then a screen’s own requests', async () => {
            await report();
            expect(finds[0].request).toEqual({ $exists: false });
            expect(finds[1].request).toEqual({ $exists: true });
        });

        it('reads from the since asked for, and says so', async () => {
            const { body } = await report('?since=2026-10-09T18:00:00.000Z');
            expect(body.since).toBe('2026-10-09T18:00:00.000Z');
            for (const filter of finds) expect(filter.createdAt.$gte).toEqual(new Date('2026-10-09T18:00:00.000Z'));
        });

        it('clamps a since older than the 30-day retention', async () => {
            const { body } = await report('?since=2020-01-01');
            expect(body.since).toBe(new Date(NOW.getTime() - PERFORMANCE_RETENTION_MS).toISOString());
        });

        it('asks only for samples from the build or later, on both reads', async () => {
            const { body } = await report(`?build=${BUILD}`);
            expect(body.build).toBe(BUILD);
            expect(finds).toHaveLength(2);
            for (const filter of finds) expect(filter.build).toEqual({ $gte: BUILD });
        });

        it('combines since and build', async () => {
            await report(`?since=2026-10-10T00:00:00.000Z&build=${BUILD}`);
            for (const filter of finds) {
                expect(filter.createdAt.$gte).toEqual(new Date('2026-10-10T00:00:00.000Z'));
                expect(filter.build).toEqual({ $gte: BUILD });
            }
        });

        it.each(['?since=yesterday', '?since=', '?build=latest', '?build=', '?build=2026-10-10T08:30:00.000Zx'])(
            'refuses %s with a 400 and reads nothing', async query => {
                const { status, body } = await report(query);
                expect(status).toBe(400);
                expect(body.error).toBeTruthy();
                expect(finds).toEqual([]);
                expect(pipelines).toEqual([]);
            });

        it('lists the newest builds with when each was first seen, whatever window is asked for', async () => {
            builds = [
                { _id: BUILD, firstSeen: new Date('2026-10-10T09:00:00.000Z'), samples: 120 },
                { _id: '2026-10-09T10:00:00.000Z', firstSeen: new Date('2026-10-09T10:20:00.000Z'), samples: 3400 },
            ];
            const { body } = await report(`?since=2026-10-10&build=${BUILD}`);
            expect(body.builds).toEqual([
                { build: BUILD, firstSeen: '2026-10-10T09:00:00.000Z', samples: 120 },
                { build: '2026-10-09T10:00:00.000Z', firstSeen: '2026-10-09T10:20:00.000Z', samples: 3400 },
            ]);
            // Bounded by the retention rather than the window: the picker lists deploys the window has cut off.
            const [match, sort, limit, group, order, top] = pipelines[0] as [{ $match: { createdAt: { $gte: Date } } }, object, { $limit: number }, object, object, { $limit: number }];
            expect(match.$match.createdAt.$gte).toEqual(new Date(NOW.getTime() - PERFORMANCE_RETENTION_MS));
            expect(sort).toEqual({ $sort: { createdAt: -1 } });
            expect(limit.$limit).toBeGreaterThan(0);
            expect(group).toHaveProperty('$group');
            expect(order).toEqual({ $sort: { _id: -1 } });
            expect(top.$limit).toBe(10);
        });

        it('still answers the report, with no builds to offer, when the builds aggregate fails', async () => {
            buildsError = new Error('exceeded time limit');
            const { status, body } = await report();
            expect(status).toBe(200);
            expect(body.builds).toEqual([]);
        });

        it('summarises an empty window as no samples rather than failing', async () => {
            const { status, body } = await report(`?build=${BUILD}`);
            expect(status).toBe(200);
            expect(body).toMatchObject({ totalSamples: 0, summaries: [], builds: [] });
        });

        it('summarises the samples that matched', async () => {
            sampleRows = [{ name: 'LCP', route: '/', value: 1000 }, { name: 'LCP', route: '/', value: 2000 }];
            const { body } = await report();
            // Both reads return the same rows in this stub; what matters is they reach the summary.
            expect(body.totalSamples).toBe(4);
            expect(body.summaries).toHaveLength(1);
            expect(body.summaries[0]).toMatchObject({ name: 'LCP', route: '/' });
        });
    });
});
