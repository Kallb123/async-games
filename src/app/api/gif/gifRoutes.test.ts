// Integration tests over the GIF search route — GET /api/gif/search.
//
// The same setup as chatRoutes.test.ts: everything above the boundary is the
// real thing (the handler, the request/response objects, `normaliseAttachment`,
// the catalogue write), and only Clerk, the connection, the rate limiter, the
// GifCatalogue collection and the upstream `fetch` are stubbed.
//
// What this guards is docs/chat-gifs.md §5. The route is the moderation
// boundary of the whole feature — it is the only writer of the catalogue, and
// the chat POST will attach a GIF only if a row is there — so what matters is
// (a) who may ask, (b) that the filter and the formats are pinned by us rather
// than chosen by the caller, (c) that a wobble at the provider degrades to
// "GIFs unavailable" instead of breaking the composer, and (d) that only what
// we would actually render reaches the catalogue.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { consumeRateLimit } from '@/utils/rateLimit';
import { runAfterCallbacks } from '@/utils/testing/afterStub';
import { ANN, failNextGifCatalogueWrite, get, resetApiRouteStubs, signIn, storedGifCatalogue } from '@/utils/testing/apiRoute';
import { GET as searchGifs } from './search/route';
import type { IGifSearchResponse } from './search/route';

/** One item in the shape KLIPY answers with, `format_filter`ed down to the two
 *  formats the route asks for. */
function klipyItem(slug: string, overrides: Record<string, unknown> = {}) {
    return {
        id: 4242,
        slug,
        title: 'a cat falling off a table',
        type: 'gif',
        file: {
            // `sm` is the tier the route prefers; the others are here because a
            // real answer carries them and the route must not reach past the
            // first one it finds.
            sm: {
                gif: { url: `https://static.klipy.com/ii/${slug}/cat.gif`, width: 220, height: 160, size: 91000 },
                jpg: { url: `https://static.klipy.com/ii/${slug}/cat.jpg`, width: 220, height: 160, size: 8000 },
            },
            hd: {
                gif: { url: `https://static.klipy.com/ii/${slug}/cat-hd.gif`, width: 640, height: 466, size: 900000 },
                jpg: { url: `https://static.klipy.com/ii/${slug}/cat-hd.jpg`, width: 640, height: 466, size: 40000 },
            },
        },
        // Everything else KLIPY sends, which the route must not pass through.
        tags: ['cat'],
        blur_preview: 'data:image/png;base64,iVBOR',
        ...overrides,
    };
}

/** The upstream, answering `payload` with `status`. Returns the spy, so a test
 *  can read back the URL the route actually built. */
function upstreamAnswers(payload: unknown, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
    );
}

/** The upstream, answering with a page of `items` in KLIPY's envelope. */
function upstreamServes(...items: unknown[]) {
    return upstreamAnswers({ result: true, data: { data: items, current_page: 1, per_page: 24, has_next: false } });
}

/** The URL the route asked upstream for, parsed. */
function upstreamUrl(fetchSpy: ReturnType<typeof upstreamAnswers>): URL {
    return new URL(String(fetchSpy.mock.calls[0][0]));
}

function searchFor(query?: string) {
    const path = query === undefined ? '/api/gif/search' : `/api/gif/search?q=${encodeURIComponent(query)}`;
    return searchGifs(get(path));
}

async function bodyOf(response: Response): Promise<IGifSearchResponse> {
    return await response.json();
}

beforeEach(async () => {
    // Before `resetApiRouteStubs`, not after: it arms the collection spies, and
    // restoring afterwards would tear them straight back off and leave the
    // catalogue write buffering against a Mongo that isn't there.
    vi.restoreAllMocks();
    await resetApiRouteStubs();
    // mockReset, not mockClear, for the same reason chatRoutes.test.ts gives:
    // the stub is a `vi.fn(async () => true)`, so reset puts that default back,
    // whereas clear would leave the 429 test's "always refuse" standing for
    // every test after it.
    vi.mocked(consumeRateLimit).mockReset();
    vi.stubEnv('KLIPY_API_KEY', 'test-key');
});

describe('GET /api/gif/search', () => {
    it('maps the provider\'s results down to what we render, and nothing else', async () => {
        signIn(ANN);
        upstreamServes(klipyItem('abc123'));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.unavailable).toBe(false);
        expect(body.results).toEqual([{
            provider: 'klipy',
            // The *slug*, not the numeric `id`: it is what the provider's own
            // share and report endpoints are keyed by (§5).
            mediaId: 'abc123',
            // The `sm` tier, not the `hd` one the same item also carries.
            url: 'https://static.klipy.com/ii/abc123/cat.gif',
            stillUrl: 'https://static.klipy.com/ii/abc123/cat.jpg',
            width: 220,
            height: 160,
            alt: 'a cat falling off a table',
        }]);
        // Not `id`, `tags` or `blur_preview`: the response is mapped down, so
        // the provider's schema is not our client's problem (§5).
        expect(Object.keys(body.results[0]).sort()).toEqual(
            ['alt', 'height', 'mediaId', 'provider', 'stillUrl', 'url', 'width']);
    });

    it('pins the content filter, the variants and the page size upstream', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor('cat');

        const url = upstreamUrl(fetchSpy);
        // The key is a path segment for this provider, which is the one
        // structural difference from the API this route used to call.
        expect(url.origin + url.pathname).toBe('https://api.klipy.com/api/v1/test-key/gifs/search');
        expect(url.searchParams.get('q')).toBe('cat');
        // The three that make §4c's guarantee real: a filter or a format list
        // the caller could relax is not one.
        expect(url.searchParams.get('content_filter')).toBe('high');
        expect(url.searchParams.get('format_filter')).toBe('gif,jpg');
        expect(url.searchParams.get('per_page')).toBe('24');
    });

    it('never sends the provider anything about who is searching', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor('cat');

        // KLIPY takes an optional `customer_id` to personalise with. Handing a
        // third party a per-player id to go with every search term is the one
        // thing this proxy exists to avoid, so it is never sent — and nothing
        // else in the URL names the searcher either.
        const url = upstreamUrl(fetchSpy);
        expect(url.searchParams.has('customer_id')).toBe(false);
        expect(url.href).not.toContain(ANN.id);
    });

    it('ignores a caller trying to choose the filter, the limit or the variants', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchGifs(get('/api/gif/search?q=cat&content_filter=off&per_page=500&format_filter=mp4&page=9'));

        const url = upstreamUrl(fetchSpy);
        expect(url.searchParams.get('content_filter')).toBe('high');
        expect(url.searchParams.get('per_page')).toBe('24');
        expect(url.searchParams.get('format_filter')).toBe('gif,jpg');
        expect(url.searchParams.get('page')).toBe('1');
        expect(url.pathname).toBe('/api/v1/test-key/gifs/search');
    });

    it('asks for what the provider is featuring when there is no search term', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor();

        const url = upstreamUrl(fetchSpy);
        expect(url.pathname).toBe('/api/v1/test-key/gifs/trending');
        expect(url.searchParams.has('q')).toBe(false);
    });

    it('writes what it served into the catalogue, after the response', async () => {
        signIn(ANN);
        upstreamServes(klipyItem('abc123'), klipyItem('def456'));

        await searchFor('cat');
        // Bookkeeping, so it is deferred: nothing is written until the response
        // has flushed (§5b).
        expect(storedGifCatalogue()).toHaveLength(0);

        await runAfterCallbacks();

        const catalogue = storedGifCatalogue();
        expect(catalogue.map(row => row.mediaId)).toEqual(['abc123', 'def456']);
        expect(catalogue[0].url).toBe('https://static.klipy.com/ii/abc123/cat.gif');
        // A row with no `expiresAt` would never be reaped — the collection's
        // whole contract is that it is a cache (GifCatalogueData).
        expect(catalogue[0].expiresAt).toBeInstanceOf(Date);
        expect(catalogue[0].expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('drops the sponsored slots the provider interleaves into a page', async () => {
        signIn(ANN);
        // KLIPY pays for itself by mixing `type: 'ad'` items into results. An
        // ad is not a GIF a player may send, so it must not reach the picker
        // and — because this route is the only writer — must not reach the
        // catalogue either, or the chat POST would resolve it happily.
        upstreamServes(
            klipyItem('sponsored', { type: 'ad' }),
            klipyItem('good'),
        );

        const body = await bodyOf(await searchFor('cat'));
        await runAfterCallbacks();

        expect(body.results.map(result => result.mediaId)).toEqual(['good']);
        // And an ad is not a *failure* to read a result: a page that was all
        // ads must not read as the schema change the loud branch is for.
        expect(body.unavailable).toBe(false);
        expect(storedGifCatalogue().map(row => row.mediaId)).toEqual(['good']);
    });

    it('answers "no matches" for a page of nothing but sponsored slots', async () => {
        signIn(ANN);
        upstreamServes(klipyItem('ad1', { type: 'ad' }), klipyItem('ad2', { type: 'ad' }));

        const response = await searchFor('cat');
        const body = await bodyOf(response);

        // Every item was dropped, but not because we couldn't read them — so
        // this is a genuine empty page, and cacheable as one.
        expect(body).toEqual({ success: true, results: [], unavailable: false });
        expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/);
    });

    it('still serves a page whose items carry no type at all', async () => {
        signIn(ANN);
        // The discriminator is the provider's, not ours: `trending` is a
        // different endpoint from `search` and may not carry `type`, and the
        // name could be changed or dropped outright. An item that isn't marked
        // as an ad is a result — anything else would have this answer as a
        // cacheable, unlogged "no GIFs match" for every query in the app.
        upstreamServes(klipyItem('untyped', { type: undefined }));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.results.map(result => result.mediaId)).toEqual(['untyped']);
        expect(body.unavailable).toBe(false);
    });

    it('falls back down the size tiers rather than dropping a thin item', async () => {
        signIn(ANN);
        // A real answer doesn't carry every tier for every item. The preferred
        // one is the small animated file, but an item that only has a medium
        // one is still perfectly renderable.
        upstreamServes(klipyItem('medium', { file: {
            md: {
                gif: { url: 'https://static.klipy.com/ii/medium/cat-md.gif', width: 400, height: 291 },
                jpg: { url: 'https://static.klipy.com/ii/medium/cat-md.jpg', width: 400, height: 291 },
            },
        } }));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.results[0].url).toBe('https://static.klipy.com/ii/medium/cat-md.gif');
        expect(body.results[0].width).toBe(400);
    });

    it('walks past a tier that is present but carries no usable file', async () => {
        signIn(ANN);
        // A placeholder at the preferred tier must not stop the walk — an item
        // with a good file one tier down is a result, not a drop.
        upstreamServes(klipyItem('placeholder', { file: {
            sm: { gif: {}, jpg: { url: '' } },
            md: {
                gif: { url: 'https://static.klipy.com/ii/placeholder/cat-md.gif', width: 400, height: 291 },
                jpg: { url: 'https://static.klipy.com/ii/placeholder/cat-md.jpg', width: 400, height: 291 },
            },
        } }));

        const body = await bodyOf(await searchFor('cat'));

        expect(body.results[0].url).toBe('https://static.klipy.com/ii/placeholder/cat-md.gif');
    });

    it('drops an item it could only serve at full size', async () => {
        signIn(ANN);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // `hd` is a cap, not a last resort: a URL that reaches the catalogue is
        // one every player in the thread downloads on every open, forever, and
        // an hd animated GIF runs to tens of megabytes. One dropped result is
        // the cheaper answer.
        upstreamServes(klipyItem('huge', { file: {
            hd: {
                gif: { url: 'https://static.klipy.com/ii/huge/cat-hd.gif', width: 1280, height: 932 },
                jpg: { url: 'https://static.klipy.com/ii/huge/cat-hd.jpg', width: 1280, height: 932 },
            },
        } }));

        const body = await bodyOf(await searchFor('cat'));
        await runAfterCallbacks();

        expect(body.results).toEqual([]);
        expect(storedGifCatalogue()).toHaveLength(0);
    });

    it('re-searching an id it already knows refreshes the row rather than adding a second', async () => {
        signIn(ANN);
        upstreamServes(klipyItem('abc123'));
        await searchFor('cat');
        await runAfterCallbacks();

        upstreamServes(klipyItem('abc123', { title: 'a renamed cat' }));
        await searchFor('cat');
        await runAfterCallbacks();

        const catalogue = storedGifCatalogue();
        expect(catalogue).toHaveLength(1);
        expect(catalogue[0].alt).toBe('a renamed cat');
    });

    it('lets a shared cache hold a real search, and never a failed one', async () => {
        signIn(ANN);
        upstreamServes(klipyItem('abc123'));

        // The one endpoint in the app a shared cache is correct for, because the
        // body is the same for every viewer (§5).
        const cached = await searchFor('cat');
        expect(cached.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/);

        upstreamAnswers({}, 502);
        const failed = await searchFor('cat');
        // The one thing worse than a wobble is a wobble cached for an hour.
        expect(failed.headers.get('Cache-Control')).toBe('no-store');
    });

    describe('who may ask', () => {
        it('answers 401, not 400, for a request from nobody', async () => {
            const fetchSpy = upstreamServes(klipyItem('abc123'));

            const response = await searchFor('cat');

            expect(response.status).toBe(401);
            // Nothing of ours is spent on a stranger: not the upstream call, and
            // not the quota behind it.
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(consumeRateLimit).not.toHaveBeenCalled();
        });

        it('refuses once the rate limit is spent, without calling the provider', async () => {
            signIn(ANN);
            vi.mocked(consumeRateLimit).mockResolvedValue(false);
            const fetchSpy = upstreamServes(klipyItem('abc123'));

            const response = await searchFor('cat');

            expect(response.status).toBe(429);
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(storedGifCatalogue()).toHaveLength(0);
        });

        it('limits the searcher and the machine — there is no game to key it on', async () => {
            signIn(ANN);
            upstreamServes();

            await searchGifs(get('/api/gif/search?q=cat', { 'x-forwarded-for': '203.0.113.7' }));

            // Per player, because games are free to create so anything keyed by
            // game multiplies without bound, and membership isn't a gate here.
            expect(consumeRateLimit).toHaveBeenCalledWith('gifSearch-user', ANN.id, expect.any(Number), expect.any(Number));
            // And per machine, because a per-account budget alone is defeated by
            // a pile of signups — the same pair /api/unlock uses.
            expect(consumeRateLimit).toHaveBeenCalledWith('gifSearch-ip', '203.0.113.7', expect.any(Number), expect.any(Number));
        });

        it('refuses when the IP has had enough, even on a fresh account', async () => {
            signIn(ANN);
            vi.mocked(consumeRateLimit).mockImplementation(async (scope: string) => scope !== 'gifSearch-ip');
            const fetchSpy = upstreamServes(klipyItem('abc123'));

            const response = await searchGifs(get('/api/gif/search?q=cat', { 'x-forwarded-for': '203.0.113.7' }));

            expect(response.status).toBe(429);
            expect(fetchSpy).not.toHaveBeenCalled();
            // The one refusal ordinary use reaches, so it carries the same body
            // every other no-pictures answer does — a picker reading `results`
            // off it must not find `undefined` there.
            expect(await bodyOf(response)).toEqual({ success: false, results: [], unavailable: true });
        });
    });

    describe('when the catalogue write goes wrong', () => {
        /** A `bulkWrite` failure in the driver's own shape: the top-level `code`
         *  is a *copy of the first write error's*, never a summary of them. */
        function bulkWriteError(...codes: number[]) {
            return { name: 'MongoBulkWriteError', code: codes[0], writeErrors: codes.map((code, index) => ({ err: { code, index } })) };
        }

        it('says nothing when a concurrent search won the race for a row', async () => {
            signIn(ANN);
            upstreamServes(klipyItem('abc123'));
            const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            failNextGifCatalogueWrite(bulkWriteError(11000));

            await searchFor('cat');
            // Never reaches the caller either way — this is deferred bookkeeping
            // behind a catch, so the assertion is that it stays quiet.
            await expect(runAfterCallbacks()).resolves.toBe(1);

            expect(logged).not.toHaveBeenCalled();
        });

        it('speaks up for a real write failure hiding behind a duplicate', async () => {
            signIn(ANN);
            upstreamServes(klipyItem('abc123'), klipyItem('def456'));
            const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            // 112 is a WriteConflict — a row that genuinely didn't get written.
            // The error's own `code` reads 11000 because the *first* failure was
            // a duplicate, which is why the batch has to be walked.
            failNextGifCatalogueWrite(bulkWriteError(11000, 112));

            await searchFor('cat');
            await runAfterCallbacks();

            expect(logged).toHaveBeenCalled();
        });
    });

    describe('when the provider is having a bad day', () => {
        it('answers an empty list and a flag when the upstream errors', async () => {
            signIn(ANN);
            upstreamAnswers({ error: 'nope' }, 500);

            const response = await searchFor('cat');
            const body = await bodyOf(response);

            // Not a 5xx of our own: the picker says "GIFs unavailable" and the
            // composer carries on (§5).
            expect(response.status).toBe(200);
            expect(body).toEqual({ success: true, results: [], unavailable: true });
        });

        it('answers the same way when the upstream fetch throws', async () => {
            signIn(ANN);
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timed out'));

            const body = await bodyOf(await searchFor('cat'));

            expect(body).toEqual({ success: true, results: [], unavailable: true });
        });

        it('answers the same way when the provider refuses inside a 200', async () => {
            signIn(ANN);
            // KLIPY reports a bad app key or a spent quota in the envelope —
            // `result: false`, sometimes with an ordinary status on it — so the
            // status code alone is not what decides whether this worked.
            upstreamAnswers({ result: false, errors: { message: ['Invalid app key'] } });
            vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const response = await searchFor('cat');

            expect((await bodyOf(response)).unavailable).toBe(true);
            expect(response.headers.get('Cache-Control')).toBe('no-store');
        });

        it('answers the same way for a body that is not a result list', async () => {
            signIn(ANN);
            upstreamAnswers({ result: true, data: { data: 'not a list' } });

            const body = await bodyOf(await searchFor('cat'));

            expect(body.unavailable).toBe(true);
        });

        it('writes nothing to the catalogue when the search failed', async () => {
            signIn(ANN);
            upstreamAnswers({}, 503);

            await searchFor('cat');
            await runAfterCallbacks();

            expect(storedGifCatalogue()).toHaveLength(0);
        });

        it('reports unavailable, rather than calling out, with no API key configured', async () => {
            signIn(ANN);
            vi.stubEnv('KLIPY_API_KEY', '');
            const fetchSpy = upstreamServes(klipyItem('abc123'));

            const body = await bodyOf(await searchFor('cat'));

            expect(body.unavailable).toBe(true);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('reports unavailable when it can read none of the results, rather than "no matches"', async () => {
            signIn(ANN);
            // The provider answered, with results — we just can't read any of
            // them any more. A renamed size tier, a `file` that stopped being
            // nested that way.
            upstreamServes(
                { slug: 'abc123', title: 'a cat', type: 'gif', file: { small: { gif: { url: 'https://static.klipy.com/ii/abc123/cat.gif', width: 220, height: 160 } } } },
                { slug: 'def456', title: 'a dog', type: 'gif', file: { small: { gif: { url: 'https://static.klipy.com/ii/def456/dog.gif', width: 220, height: 160 } } } },
            );
            vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const response = await searchFor('cat');
            const body = await bodyOf(response);

            // Not `{ results: [], unavailable: false }`: that reads as "no GIFs
            // match", and — being the cacheable answer — would be held at the
            // edge for a day, outliving the fix.
            expect(body.unavailable).toBe(true);
            expect(response.headers.get('Cache-Control')).toBe('no-store');
            expect(console.error).toHaveBeenCalled();
        });

        it('still answers "no matches" for a search that genuinely found none', async () => {
            signIn(ANN);
            upstreamServes();

            const response = await searchFor('nothing at all');
            const body = await bodyOf(response);

            expect(body).toEqual({ success: true, results: [], unavailable: false });
            expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/);
        });

        it('degrades rather than 500ing when the rate limiter itself fails', async () => {
            signIn(ANN);
            // Its first act is dbConnect, which on a cold instance or a failover
            // can sit for thirty seconds and then throw.
            vi.mocked(consumeRateLimit).mockRejectedValue(new Error('buffering timed out'));
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const fetchSpy = upstreamServes(klipyItem('abc123'));

            const response = await searchFor('cat');

            expect(response.status).toBe(200);
            expect((await bodyOf(response)).unavailable).toBe(true);
            // The gate couldn't be checked, so it stays shut: no quota spent.
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(response.headers.get('Cache-Control')).toBe('no-store');
        });

        it('drops one odd result rather than failing the whole search', async () => {
            signIn(ANN);
            upstreamServes(
                // A URL off the allow-listed hosts is the §4d assertion firing:
                // a spoofed or misconfigured upstream, and the one thing that
                // must never reach an opponent's <img src>.
                klipyItem('evil', { file: {
                    sm: {
                        gif: { url: 'https://static.klipy.com.example.com/evil.gif', width: 220, height: 160 },
                        jpg: { url: 'https://static.klipy.com.example.com/evil.jpg', width: 220, height: 160 },
                    },
                } }),
                // No dimensions: the thread reserves the row's box from them, so
                // an item without them is one we can't draw (§7).
                klipyItem('nodims', { file: {
                    sm: {
                        gif: { url: 'https://static.klipy.com/ii/nodims/cat.gif' },
                        jpg: { url: 'https://static.klipy.com/ii/nodims/cat.jpg' },
                    },
                } }),
                klipyItem('good'),
            );

            vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            const body = await bodyOf(await searchFor('cat'));
            await runAfterCallbacks();

            expect(body.results.map(result => result.mediaId)).toEqual(['good']);
            expect(body.unavailable).toBe(false);
            // And what we refused to render is not what we remembered either.
            expect(storedGifCatalogue().map(row => row.mediaId)).toEqual(['good']);
        });
    });

    it('keeps a page a page, however many results the provider sends', async () => {
        signIn(ANN);
        // An upstream that ignores our `limit` — a different endpoint paging
        // differently, or a future API change. The page size is ours to enforce,
        // not merely to ask for: it is also how many rows one search writes.
        upstreamServes(...Array.from({ length: 500 }, (item, index) => klipyItem(`id${index}`)));

        const body = await bodyOf(await searchFor('cat'));
        await runAfterCallbacks();

        expect(body.results).toHaveLength(24);
        expect(storedGifCatalogue()).toHaveLength(24);
    });

    it('caps the search term rather than passing a novel upstream', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor('c'.repeat(5000));

        expect(upstreamUrl(fetchSpy).searchParams.get('q')!.length).toBeLessThanOrEqual(100);
    });

    it('passes a search term as a parameter, never as part of the URL', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        await searchFor('cat&content_filter=off&per_page=500');

        const url = upstreamUrl(fetchSpy);
        expect(url.searchParams.get('q')).toBe('cat&content_filter=off&per_page=500');
        expect(url.searchParams.get('content_filter')).toBe('high');
        expect(url.searchParams.get('per_page')).toBe('24');
    });

    it('keeps a search term out of the path, which is where the key lives', async () => {
        signIn(ANN);
        const fetchSpy = upstreamServes();

        // This provider takes its app key as a *path segment*, so a term that
        // could walk the path is the way this route would hand the key to the
        // wrong endpoint — or, with a leading `//`, to the wrong host.
        await searchFor('../../../elsewhere');

        const url = upstreamUrl(fetchSpy);
        expect(url.origin).toBe('https://api.klipy.com');
        expect(url.pathname).toBe('/api/v1/test-key/gifs/search');
    });
});
