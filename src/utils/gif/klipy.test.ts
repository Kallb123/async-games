// Unit tests over the one function that builds a URL carrying our API key.
//
// This is a smaller surface than the route tests in
// `src/app/api/gif/gifRoutes.test.ts`, and it is here for what those can't
// reach: they prove the *shape* of a well-configured request, whereas the thing
// worth pinning is what happens when an argument or an environment variable is
// not what the happy path assumed. KLIPY takes its app key as a **path
// segment** (docs/chat-gifs.md §5a), so a path this function can be talked into
// changing is a key handed somewhere it shouldn't go — and none of that has a
// symptom a route test would show.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { klipyRequest } from './klipy';

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('KLIPY_API_KEY', 'test-key');
});

describe('klipyRequest', () => {
    it('puts the key in the path and the parameters in the query', () => {
        const url = klipyRequest('search', { q: 'cat', per_page: '24' });

        expect(url?.href).toBe('https://api.klipy.com/api/v1/test-key/gifs/search?q=cat&per_page=24');
    });

    it('names an item with a path segment of its own', () => {
        expect(klipyRequest('share', {}, 'a-cat-gif-9RtN2v')?.href)
            .toBe('https://api.klipy.com/api/v1/test-key/gifs/share/a-cat-gif-9RtN2v');
    });

    it('answers null with no key configured, rather than calling out with none', () => {
        // A deployment that never set the variable, and one that set it to
        // whitespace — the same misconfiguration, and neither should produce a
        // request to `/api/v1/undefined/gifs/search`.
        vi.stubEnv('KLIPY_API_KEY', '');
        expect(klipyRequest('search', { q: 'cat' })).toBeNull();
        vi.stubEnv('KLIPY_API_KEY', '   ');
        expect(klipyRequest('search', { q: 'cat' })).toBeNull();
    });

    it('keeps a mis-pasted key to one path segment', () => {
        // A value with a slash in it — a whole URL pasted where the key went,
        // say — would otherwise re-point the path it is a segment of.
        vi.stubEnv('KLIPY_API_KEY', 'oops/../../v9/other');

        const url = klipyRequest('search', { q: 'cat' });

        expect(url?.origin).toBe('https://api.klipy.com');
        expect(url?.pathname).toBe('/api/v1/oops%2F..%2F..%2Fv9%2Fother/gifs/search');
    });

    it('refuses an item id that is not inert in a path', () => {
        // `encodeURIComponent` does **not** escape a dot, so `..` survives it
        // and `new URL` then normalises the segment away — a POST carrying our
        // key to whatever endpoint sits one level up. The charset gate is what
        // stops that, and it runs in here rather than at the caller.
        expect(klipyRequest('share', {}, '..')).toBeNull();
        expect(klipyRequest('share', {}, '../../../elsewhere')).toBeNull();
        expect(klipyRequest('share', {}, 'a/b')).toBeNull();
        expect(klipyRequest('share', {}, 'a?key=theirs')).toBeNull();
        expect(klipyRequest('share', {}, '')).toBeNull();
        expect(klipyRequest('share', {}, 'a'.repeat(129))).toBeNull();
    });

    it('lets a parameter carry anything, because a parameter is escaped', () => {
        // The one caller-chosen value in this feature is a player's search
        // term, and it goes through `searchParams` — so an `&`, a `#` or a
        // slash in it is data rather than structure.
        const url = klipyRequest('search', { q: 'cat&content_filter=off#/../x' });

        expect(url?.pathname).toBe('/api/v1/test-key/gifs/search');
        expect(url?.searchParams.get('q')).toBe('cat&content_filter=off#/../x');
        expect(url?.searchParams.get('content_filter')).toBeNull();
    });
});
