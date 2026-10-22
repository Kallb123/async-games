// The beacon's ingest route takes only allow-listed samples. What is held here
// is that the warm-up ping's two metrics and its `warm` request tag are among
// them, so the samples the reporter sends for the ping are stored rather than
// dropped, and a made-up tag still is.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { POST } from './route';
import { ANN, jsonPost, resetApiRouteStubs, signIn } from '@/utils/testing/apiRoute';
import { PerformanceMetricModel } from '@/utils/mongodb/PerformanceMetricData';

let stored: Record<string, unknown>[];

beforeEach(async () => {
    await resetApiRouteStubs();
    signIn(ANN);
    stored = [];
    vi.spyOn(PerformanceMetricModel, 'insertMany').mockImplementation((async (rows: Record<string, unknown>[]) => { stored.push(...rows); }) as never);
});

const sample = (name: string, value: number, request?: string) => ({ name, value, route: '/', source: 'load', cache: 'cold', request });

describe('POST /api/performance', () => {
    it('stores the warm-up ping’s samples under their own request tag', async () => {
        const response = await POST(jsonPost('/api/performance', [
            sample('api_warm', 1450, 'warm'),
            sample('server_instance_new', 40, 'warm'),
            sample('server_mongo_connect', 310, 'warm'),
            sample('warm_ping_lead', 1500, 'entry'),
        ]));
        expect(response.status).toBe(202);
        expect(stored.map(({ name, request }) => [name, request])).toEqual([
            ['api_warm', 'warm'], ['server_instance_new', 'warm'], ['server_mongo_connect', 'warm'], ['warm_ping_lead', 'entry'],
        ]);
    });

    it('still drops a request tag it does not know', async () => {
        await POST(jsonPost('/api/performance', [sample('api_warm', 10, 'warmup'), sample('api_warm', 10, 'warm')]));
        expect(stored.map(({ request }) => request)).toEqual(['warm']);
    });
});
