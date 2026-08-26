// Every route that takes a body, handed one that isn't JSON.
//
// `await request.json()` throws on a body that isn't JSON — an empty POST, a
// truncated upload, a crawler's probe — and an uncaught throw in a route
// handler is a 500 (docs/robustness-review.md finding 21). Nineteen routes were
// parsing bodies unguarded, and each already had the check that gives the right
// answer: its own "missing gameId" / "missing token" 400.
//
// So this walks the routes rather than listing them — a route added tomorrow is
// covered without anyone remembering to add it — and asks each one for an
// answer, not an exception. Nobody is signed in, so most of them answer "not
// signed in" and never reach the body; that is a fine answer too. The one thing
// none of them may do is fail.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { apiRouteFiles, apiRoutesMatchingSource, pathnameOf } from '@/utils/testing/apiRoutes';
import { ANN, rawPost, resetApiRouteStubs, signIn } from '@/utils/testing/apiRoute';

/** The methods with a body, i.e. the ones this is about. */
const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * The dynamic-segment values for a path, e.g. `[gameid]` → `{ gameid: 'not-an-id' }`.
 * Next hands these to the handler as a promise.
 */
function paramsFor(pathname: string) {
    const params = Object.fromEntries([...pathname.matchAll(/\[(\w+)]/g)].map(match => [match[1], 'not-an-id']));
    return { params: Promise.resolve(params) };
}

type Handler = (request: ReturnType<typeof rawPost>, context: ReturnType<typeof paramsFor>) => Promise<Response>;

const routes = apiRouteFiles();

beforeEach(async () => {
    await resetApiRouteStubs();
});

describe('a body that is not JSON', () => {
    it('finds the route handlers to check', () => {
        expect(routes.length).toBeGreaterThan(20);
    });

    it.each(routes.map(routeFile => [pathnameOf(routeFile), routeFile]))('is answered, not thrown on, by %s', async (pathname, routeFile) => {
        const handlers: Record<string, Handler | undefined> = await import(routeFile);

        for (const method of BODY_METHODS.filter(method => handlers[method])) {
            const response = await handlers[method]!(rawPost(pathname, 'not json at all'), paramsFor(pathname));
            expect(response.status, `${method} ${pathname} answered ${response.status}`).toBeLessThan(500);
        }
    });
});

// Signed out, most routes answer "not signed in" before they ever look at the
// body, so the sweep above only asks half the question. Asking the other half
// needs a route whose whole prologue this file can stand up, and the game-setup
// routes are exactly that: they read the body, resolve the host and check the
// invitee list before touching anything else.
//
// Which is the check worth having, because that field is the one that broke —
// `userList` reached Clerk as `undefined` and threw on `.length` (finding 21).
describe('a game-setup body with no player list', () => {
    // The routes that invite people, found by the prologue they share rather
    // than by their paths: a game can be solo without saying so in its URL
    // (Solitaire), and those have no player list to read.
    // Called, rather than merely named: Solitaire's route explains in a comment
    // why it doesn't use the prologue.
    const setupRoutes = apiRoutesMatchingSource(/readGameSetupRequest[<(]/)
        .map(routeFile => [pathnameOf(routeFile), routeFile] as const);

    it('finds the game-setup routes to check', () => {
        expect(setupRoutes.length).toBeGreaterThan(5);
    });

    it.each(setupRoutes)('is refused by %s', async (pathname, routeFile) => {
        const { POST } = await import(routeFile) as { POST: Handler };
        signIn({ ...ANN, publicMetadata: { unlocked: true } });

        const response = await POST(rawPost(pathname, 'not json at all'), paramsFor(pathname));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('Invalid player list');
    });
});
