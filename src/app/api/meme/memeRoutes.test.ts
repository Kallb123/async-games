// Integration tests over the meme search route — GET /api/meme/search.
//
// The same setup as gifRoutes.test.ts, which this route shares its proxy
// machinery with (`runProviderSearch`, docs/chat-gifs.md §12): everything
// above the boundary is the real thing, and only Clerk, the connection, the
// rate limiter, the GifCatalogue collection and the upstream `fetch` are
// stubbed. What differs from the GIF route is exactly what this suite
// exercises — its own category, its own provider, its own rate-limit budget
// and a single image format rather than an animated one plus a still frame —
// while the shared mechanics (auth, the ad filter, the tier fallback, the
// catalogue write, the cache headers) are already proven by gifRoutes.test.ts
// and are only spot-checked here.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { consumeRateLimit } from '@/utils/rateLimit';
import { runAfterCallbacks } from '@/utils/testing/afterStub';
import { ANN, get, resetApiRouteStubs, signIn, storedGifCatalogue } from '@/utils/testing/apiRoute';
import { GET as searchMemes } from './search/route';
import type { IMemeSearchResponse } from './search/route';

/** One item in the shape KLIPY's `/memes/` category answers with,
 *  `format_filter`ed down to the one format the route asks for. */
function klipyMeme(slug: string, overrides: Record<string, unknown> = {}) {
    return {
        id: 9001,
        slug,
        title: 'distracted boyfriend',
        type: 'meme',
        file: {
            sm: {
                jpg: { url: `https://static.klipy.com/mm/${slug}/meme.jpg`, width: 300, height: 300, size: 12000 },
            },
            hd: {
                jpg: { url: `https://static.klipy.com/mm/${slug}/meme-hd.jpg`, width: 900, height: 900, size: 210000 },
            },
        },
        tags: ['relatable'],
        ...overrides,
    };
}

function upstreamAnswers(payload: unknown, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
    );
}

function upstreamServes(...items: unknown[]) {
    return upstreamAnswers({ result: true, data: { data: items, current_page: 1, per_page: 24, has_next: false } });
}

function upstreamUrl(fetchSpy: ReturnType<typeof upstreamAnswers>): URL {
    return new URL(String(fetchSpy.mock.calls[0][0]));
}

function searchFor(query?: string) {
    const path = query === undefined ? '/api/meme/search' : `/api/meme/search?q=${encodeURIComponent(query)}`;
    return searchMemes(get(path));
}

async function bodyOf(response: Response): Promise<IMemeSearchResponse> {
    return await response.json();
}

beforeEach(async () => {
    vi.restoreAllMocks();
    await resetApiRouteStubs();
    vi.mocked(consumeRateLimit).mockReset();
    vi.stubEnv('KLIPY_API_KEY', 'test-key');
});

describe('GET /api/meme/search', () => {
    it('maps the provider\'s results down to what we render, with one file standing in for both frames', async () => {
        signIn(ANN);
        upstreamServes(klipyMeme('abc123'));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.unavailable).toBe(false);
        expect(body.results).toEqual([{
            provider: 'klipy-meme',
            mediaId: 'abc123',
            // A meme has no separate still frame — the same image serves both,
            // unlike a GIF's animated file plus its jpg preview.
            url: 'https://static.klipy.com/mm/abc123/meme.jpg',
            stillUrl: 'https://static.klipy.com/mm/abc123/meme.jpg',
            width: 300,
            height: 300,
            alt: 'distracted boyfriend',
        }]);
    });

    it('asks KLIPY\'s memes category, not the gifs one', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor('cat');

        const url = upstreamUrl(fetchSpy);
        expect(url.origin + url.pathname).toBe('https://api.klipy.com/api/v1/test-key/memes/search');
        expect(url.searchParams.get('format_filter')).toBe('jpg');
        expect(url.searchParams.get('content_filter')).toBe('high');
    });

    it('asks for what the provider is featuring when there is no search term', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor();

        const url = upstreamUrl(fetchSpy);
        expect(url.pathname).toBe('/api/v1/test-key/memes/trending');
    });

    it('drops the sponsored slots the provider interleaves into a page', async () => {
        signIn(ANN);
        upstreamServes(klipyMeme('sponsored', { type: 'ad' }), klipyMeme('good'));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.results.map(result => result.mediaId)).toEqual(['good']);
        expect(body.unavailable).toBe(false);
    });

    it('drops an item it could only serve at full size', async () => {
        signIn(ANN);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        upstreamServes(klipyMeme('huge', { file: {
            hd: { jpg: { url: 'https://static.klipy.com/mm/huge/meme-hd.jpg', width: 1280, height: 1280 } },
        } }));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.results).toEqual([]);
    });

    it('writes into the same catalogue collection the GIF route uses, keyed by its own provider', async () => {
        signIn(ANN);
        upstreamServes(klipyMeme('abc123'));

        await searchFor('cat');
        await runAfterCallbacks();

        const catalogue = storedGifCatalogue();
        expect(catalogue.map(row => row.provider)).toEqual(['klipy-meme']);
        expect(catalogue[0].mediaId).toBe('abc123');
    });

    it('limits the searcher with its own budget, separate from the GIF picker\'s', async () => {
        signIn(ANN);
        upstreamServes();

        await searchGetWithForwardedFor('203.0.113.7');

        expect(consumeRateLimit).toHaveBeenCalledWith('memeSearch-user', ANN.id, expect.any(Number), expect.any(Number));
        expect(consumeRateLimit).toHaveBeenCalledWith('memeSearch-ip', '203.0.113.7', expect.any(Number), expect.any(Number));
        expect(consumeRateLimit).not.toHaveBeenCalledWith('gifSearch-user', expect.anything(), expect.anything(), expect.anything());
    });

    function searchGetWithForwardedFor(ip: string) {
        return searchMemes(get('/api/meme/search?q=cat', { 'x-forwarded-for': ip }));
    }

    it('answers 401, not 400, for a request from nobody', async () => {
        const fetchSpy = upstreamServes(klipyMeme('abc123'));

        const response = await searchFor('cat');

        expect(response.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('degrades to "unavailable" rather than a 5xx when the provider errors', async () => {
        signIn(ANN);
        upstreamAnswers({ error: 'nope' }, 500);

        const response = await searchFor('cat');
        const body = await bodyOf(response);

        expect(response.status).toBe(200);
        expect(body).toEqual({ success: true, results: [], unavailable: true });
    });

    it('lets a shared cache hold a real search, and never a failed one', async () => {
        signIn(ANN);
        upstreamServes(klipyMeme('abc123'));

        const cached = await searchFor('cat');
        expect(cached.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/);

        upstreamAnswers({}, 502);
        const failed = await searchFor('cat');
        expect(failed.headers.get('Cache-Control')).toBe('no-store');
    });
});
