import { dbConnect } from '@/utils/mongodb/mongodb';
import { ServerTiming } from '@/utils/api/serverTiming';

/**
 * How long the ping waits for the database before answering without it. A
 * cold instance's handshake is a few hundred milliseconds; this only bounds a
 * database that is down or slow, so the ping never holds a connection open
 * for the 30 seconds the driver would try.
 */
const CONNECT_BOUND_MS = 4000;

/** Resolves when the database is connected or `ms` have passed, whichever is first; rejects only if the connection fails before then. */
async function connectWithin(ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            dbConnect().then(() => undefined),
            new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The answer to the warm-up ping: the `HEAD` export of the routes a page is
 * about to call (`/api/dashboard`, `/api/game/[gameid]`).
 *
 * The page's inline script sends it while Clerk is still loading (see
 * `utils/warmUp.ts`), so the platform starts a function instance, and the
 * instance opens its Mongo connection, during the second or so a signed-in
 * page spends waiting on Clerk rather than after it. It has to be those very
 * routes and not a route of its own: a function that serves `/api/warm` is not
 * necessarily the one that serves `/api/dashboard`.
 *
 * It answers nothing about anyone, and so asks nothing of anyone:
 *
 * - No `auth()`. The ping goes out before the player has a session token to
 *   send, and it has no use for one.
 * - No read, no write, no body and no look at the url. In particular it never
 *   checks that the game id in the path exists, or belongs to the caller: a
 *   `204` for every id is the same answer for every id.
 * - Its `Server-Timing` is `total`, the wait for the connection
 *   (`mongo_connect`, and the pool's own spans inside it) and, to the one ping
 *   that is the instance's first request, `instance_new`. Nothing in it comes
 *   from a player's request.
 *
 * It costs what an anonymous `401` from the same route costs, plus a no-op
 * `dbConnect()` on an instance that has one. A database that is down is not
 * the ping's problem: the wait is bounded, a failure is swallowed (every real
 * request awaits `dbConnect` itself and reports its own), and the answer is
 * the same `204`. The connection attempt `dbConnect` makes is shared, so a run
 * of pings against a down database is still one attempt at a time.
 */
export async function warmUpResponse(): Promise<Response> {
    const timing = new ServerTiming();
    timing.noteWarmUp();
    try {
        await timing.time('mongo_connect', () => connectWithin(CONNECT_BOUND_MS));
    } catch {
        // See above: the player's own request will meet the same failure and handle it.
    }
    return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store', 'Server-Timing': timing.header() },
    });
}
