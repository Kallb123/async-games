import { describe, expect, it } from "vitest";

import { PERFORMANCE_METRIC_NAMES, PERFORMANCE_REQUESTS } from "@/utils/performance";
import { SIGNED_IN_PRE_PAINT_SCRIPT, SIGNED_IN_TEST_SOURCE } from "@/utils/users/clientUat";
import { WARM_UP_SCRIPT, warmUpLead, warmUpMetrics, warmUpPath, type WarmUpRecord } from "@/utils/warmUp";

const ID = "2b62c738-58dc-4f2d-9d45-91bc7f1bb790";

// Paths a page can be at, and the route its ping goes to (null: no ping).
const PATHS: [string, string | null][] = [
    ["/", "/api/dashboard"],
    [`/games/dicecities/${ID}`, `/api/game/${ID}`],
    [`/games/realmarena/${ID}/`, `/api/game/${ID}`],
    [`/games/settlementsandcities/${ID}`, `/api/game/${ID}`],
    // Not a board that reads /api/game/<id>.
    [`/games/result/${ID}`, null],
    ["/games/kingdombuilder/65f1c2a4e4b0a1b2c3d4e5f6", null],
    ["/games/completed", null],
    ["/games/dicecities/new", null],
    // Malformed, or not an id: nothing is sent, and nothing odd reaches a url.
    ["/games/dicecities/../../api/admin", null],
    [`/games/dicecities/${ID}/extra`, null],
    [`/games/dicecities/${ID}?x=1`, null],
    [`/games/dicecities/${ID.toUpperCase()}`, null],
    [`/games/dicecities/${ID}%2F..`, null],
    [`/games/dicecities/${ID.slice(1)}`, null],
    ["/games//" + ID, null],
    ["/games/dice cities/" + ID, null],
    ["/profile/user_2abc", null],
    ["/login", null],
    ["", null],
];

describe("warmUpPath", () => {
    it.each(PATHS)("sends %j to %j", (pathname, expected) => {
        expect(warmUpPath(pathname)).toBe(expected);
    });
});

interface FakePage {
    sent: { url: string; init: { method: string } }[];
    window: { __agWarmUp?: WarmUpRecord };
}

/** Runs the warm-up script against a fake page and says what it sent and left on `window`. */
function runScript(cookie: string, pathname: string, answer: () => Promise<{ ok: boolean; headers: { get: (name: string) => string | null } }> = async () => ({ ok: true, headers: { get: () => "total;dur=3.0" } })): FakePage {
    const page: FakePage = { sent: [], window: {} };
    let clock = 100;
    new Function("document", "location", "performance", "fetch", "window", WARM_UP_SCRIPT)(
        { cookie },
        { pathname },
        { now: () => (clock += 5) },
        (url: string, init: { method: string }) => { page.sent.push({ url, init }); return answer(); },
        page.window,
    );
    return page;
}

describe("the warm-up script", () => {
    it("uses the one cookie rule, the same text the pre-paint script is built from", () => {
        expect(WARM_UP_SCRIPT).toContain(SIGNED_IN_TEST_SOURCE);
        expect(SIGNED_IN_PRE_PAINT_SCRIPT).toContain(SIGNED_IN_TEST_SOURCE);
    });

    it.each(PATHS)("agrees with warmUpPath on %j when signed in", (pathname, expected) => {
        const page = runScript("theme=dark; __client_uat=1760000000", pathname);
        expect(page.sent.map(({ url }) => url)).toEqual(expected ? [expected] : []);
        expect(page.window.__agWarmUp?.url).toBe(expected ?? undefined);
    });

    it("sends a HEAD and nothing else", () => {
        const page = runScript("__client_uat_Ab-d_9xZ=1760000000", "/");
        expect(page.sent).toEqual([{ url: "/api/dashboard", init: { method: "HEAD" } }]);
    });

    it.each(["", "__client_uat=0", "__client_uat_Ab-d_9xZ=", "__session=a.jwt.here; __client_uatx=1760000000"])("sends nothing when the cookie says signed out: %j", cookie => {
        const page = runScript(cookie, "/");
        expect(page.sent).toEqual([]);
        expect(page.window.__agWarmUp).toBeUndefined();
    });

    it("records when it started and, once answered, how it went", async () => {
        const page = runScript("__client_uat=1", "/");
        const record = page.window.__agWarmUp!;
        expect(record).toMatchObject({ url: "/api/dashboard", startedAt: 105 });
        await record.done;
        expect(record).toMatchObject({ endedAt: 110, ok: true, serverTiming: "total;dur=3.0" });
        expect(warmUpMetrics(record)).toEqual([
            { name: "api_warm", value: 5 },
            { name: "server_total", value: 3 },
        ]);
    });

    it("never throws, and leaves a settled promise, when the request fails", async () => {
        const page = runScript("__client_uat=1", "/", () => Promise.reject(new Error("offline")));
        await expect(page.window.__agWarmUp!.done).resolves.toBeUndefined();
        expect(warmUpMetrics(page.window.__agWarmUp!)).toEqual([]);
    });

    it("never throws where the page cannot be read or fetch is missing", () => {
        const throwing = { get cookie(): string { throw new Error("blocked"); } };
        expect(() => new Function("document", "location", "performance", "fetch", "window", WARM_UP_SCRIPT)(throwing, { pathname: "/" }, performance, () => { throw new Error("x"); }, {})).not.toThrow();
        expect(() => new Function("document", "location", "performance", "window", WARM_UP_SCRIPT)({ cookie: "__client_uat=1" }, { pathname: "/" }, performance, {})).not.toThrow();
        expect(() => new Function("document", "location", "performance", "fetch", "window", WARM_UP_SCRIPT)({ cookie: "__client_uat=1" }, { pathname: "/" }, performance, () => { throw new Error("sync"); }, {})).not.toThrow();
    });
});

describe("warmUpMetrics", () => {
    it("reports the wait for the headers and the spans the server timed, including a new instance", () => {
        expect(warmUpMetrics({ startedAt: 40, endedAt: 1240, ok: true, serverTiming: "instance_new;dur=80.0, mongo_connect;dur=310.5, mongo_handshake;dur=250.0, total;dur=312.0" })).toEqual([
            { name: "api_warm", value: 1200 },
            { name: "server_instance_new", value: 80 },
            { name: "server_mongo_connect", value: 310.5 },
            { name: "server_mongo_handshake", value: 250 },
            { name: "server_total", value: 312 },
        ]);
    });

    it("reports only the wait when the answer carried no Server-Timing", () => {
        expect(warmUpMetrics({ startedAt: 0, endedAt: 90, ok: true, serverTiming: null })).toEqual([{ name: "api_warm", value: 90 }]);
    });

    it("reports nothing for a ping that failed, was refused, or has not answered", () => {
        expect(warmUpMetrics({ startedAt: 0, ok: false })).toEqual([]);
        expect(warmUpMetrics({ startedAt: 0, endedAt: 50, ok: false, serverTiming: "total;dur=1.0" })).toEqual([]);
        expect(warmUpMetrics({ startedAt: 0, endedAt: undefined, ok: true })).toEqual([]);
    });
});

describe("warmUpLead", () => {
    const record = { url: "/api/dashboard", startedAt: 100 };

    it("is how long before the entry fetch the ping for the same route was sent", () => {
        expect(warmUpLead(record, "/api/dashboard", 1600)).toBe(1500);
        expect(warmUpLead(record, "http://localhost/api/dashboard", 1600)).toBe(1500);
    });

    it("is nothing without a ping, for another route, or for a fetch that began before the ping", () => {
        expect(warmUpLead(undefined, "/api/dashboard", 1600)).toBeUndefined();
        expect(warmUpLead(record, `/api/game/${ID}`, 1600)).toBeUndefined();
        expect(warmUpLead(record, "/api/dashboard", 50)).toBeUndefined();
    });
});

describe("the warm-up metrics", () => {
    it("are allow-listed, so the beacon and the ingest route accept them", () => {
        for (const name of ["api_warm", "warm_ping_lead", "server_instance_new", "server_mongo_connect", "server_total"]) {
            expect(PERFORMANCE_METRIC_NAMES).toContain(name);
        }
        expect(PERFORMANCE_REQUESTS).toContain("warm");
    });
});
