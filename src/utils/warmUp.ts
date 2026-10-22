import { SIGNED_IN_TEST_SOURCE } from '@/utils/users/clientUat';
import { serverTimingMetrics, type MetricValue } from '@/utils/performance';

// Waking the function instance a page is about to call, while Clerk is still
// loading. A signed-in page can't ask for its data until Clerk has loaded and
// confirmed the session (a second or more on a phone), and on a cold open that
// is when the platform could have been starting the instance that will answer:
// the data request otherwise pays for the start, and the Mongo connection
// after it, in series. So an inline script sends a `HEAD` to the route the
// page will call next, which answers `204` with no auth and no read
// (`api/warmUp.ts`). Browser-safe, as `clientUat.ts` is: the page's inline
// script, the reporter and the tests all read the one rule below.

/** The home page, which calls `DASHBOARD_API`. */
const DASHBOARD_PATH = '/';
const DASHBOARD_API = '/api/dashboard';

/**
 * A client game's board: `/games/<game>/<id>`, where the id is the UUID a game
 * is made with. The id is captured whole and nothing else is, so what reaches
 * the url is hex and hyphens however odd the path. Left out on purpose: the
 * result page (`/games/result/<id>`, a finished game, which reads
 * `/api/gameresult`), the Kingdom Builder world (its ids are Mongo ObjectIds,
 * which are not UUIDs, and it reads its own routes) and `/games/completed`.
 */
const GAME_PATH = /^\/games\/(?!result\/)[a-z]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/;
const GAME_API = '/api/game/';

/** The API route a page at `pathname` will call first, or null for a page that has none worth waking (or a path that isn't one). */
export function warmUpPath(pathname: string): string | null {
    if (pathname === DASHBOARD_PATH) return DASHBOARD_API;
    const id = GAME_PATH.exec(pathname)?.[1];
    return id ? `${GAME_API}${id}` : null;
}

/** Where the script leaves its record, for the reporter to find once it has started. */
const WINDOW_KEY = '__agWarmUp';

/**
 * What the inline script records about its ping. `startedAt` and `endedAt` are
 * `performance.now()`, the same clock the reporter times a data fetch on;
 * `done` settles (it never rejects) once the ping has answered or failed. A
 * ping that failed outright has no `endedAt`.
 */
export interface WarmUpRecord {
    url: string;
    startedAt: number;
    endedAt?: number;
    /** Whether the answer was a 2xx: anything else, such as a deploy that doesn't know the ping yet, is not a timing of it. */
    ok?: boolean;
    serverTiming?: string | null;
    done: Promise<void>;
}

declare global {
    interface Window {
        /** The page's warm-up ping, if its inline script sent one: see `WARM_UP_SCRIPT`. */
        __agWarmUp?: WarmUpRecord;
    }
}

/**
 * The inline script that sends the ping: the same text for every page that
 * carries it, which is what lets a cached static shell carry it. It checks
 * that someone looks signed in by the one cookie rule (`SIGNED_IN_TEST_SOURCE`),
 * reads the path from `location` and picks the route from it exactly as
 * `warmUpPath` does (a test runs the two against the same paths), and sends a
 * `HEAD` with the browser's usual credentials: that is the connection the real
 * request will want, and Chrome keeps credentialed and uncredentialed requests
 * on separate ones. Plain ES5, fire and forget, and wrapped in a try/catch: it
 * runs before anything else on the page and must never be the thing that
 * breaks it.
 */
export const WARM_UP_SCRIPT = `try{if(${SIGNED_IN_TEST_SOURCE}){var p=location.pathname,m=new RegExp(${JSON.stringify(GAME_PATH.source)}).exec(p),u=p===${JSON.stringify(DASHBOARD_PATH)}?${JSON.stringify(DASHBOARD_API)}:m?${JSON.stringify(GAME_API)}+m[1]:"";if(u){var w=window.${WINDOW_KEY}={url:u,startedAt:performance.now()};w.done=fetch(u,{method:"HEAD"}).then(function(r){w.endedAt=performance.now();w.ok=r.ok;w.serverTiming=r.headers.get("server-timing")}).catch(function(){})}}}catch(e){}`;

/**
 * What the ping's answer says, for the reporter: `api_warm`, the time from
 * sending it to its headers arriving (there is no body), and the spans its
 * `Server-Timing` carries. A ping that failed, or was answered with anything
 * but a 2xx, reports nothing.
 */
export function warmUpMetrics(record: Pick<WarmUpRecord, 'startedAt' | 'endedAt' | 'ok' | 'serverTiming'>): MetricValue[] {
    const { startedAt, endedAt } = record;
    if (!record.ok || endedAt === undefined) return [];
    return [{ name: 'api_warm', value: Math.max(0, endedAt - startedAt) }, ...serverTimingMetrics(record.serverTiming ?? null)];
}

/**
 * How long before a screen's `entry` fetch for `apiUrl` the ping for that same
 * route was sent (`warm_ping_lead`), or undefined when there was no ping for
 * it. The lead is the head start the ping had; set against the entry's
 * `server_instance_new` it says whether the ping got to the instance first.
 */
export function warmUpLead(record: Pick<WarmUpRecord, 'url' | 'startedAt'> | undefined, apiUrl: string, entryStartedAt: number): number | undefined {
    if (!record || new URL(apiUrl, 'http://localhost').pathname !== record.url || entryStartedAt < record.startedAt) return undefined;
    return entryStartedAt - record.startedAt;
}
