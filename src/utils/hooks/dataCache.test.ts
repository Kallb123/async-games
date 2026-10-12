// The tab's in-memory data cache: what it keeps, for whom, for how long, and the
// requests it shares. Everything here is plain module state and `fetch`, so it
// runs in node with a stubbed `fetch` — the properties the plan's "Required
// tests" name: TTL, LRU eviction, in-flight dedup, user keying and purge, failed
// responses not stored, and a local write beating an older fetch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DATA_CACHE_MAX_ENTRIES,
    confirmData,
    fetchResource,
    forgetCachedData,
    isDataCacheOwner,
    isDataInFlight,
    isDataUnconfirmed,
    loadSharedResource,
    markDataUnconfirmed,
    readCachedData,
    setDataCacheOwner,
    writeCachedData,
} from "./dataCache";

const ALICE = "user_alice";
const BOB = "user_bob";
const URL_A = "/api/game/aaa";
const URL_B = "/api/game/bbb";

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
    setDataCacheOwner(null);
    setDataCacheOwner(ALICE);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setDataCacheOwner(null);
});

/** A `fetch` that answers each call from `answers` in turn; resolves when `release()`d if `held`. */
function stubFetch(answers: Array<{ status?: number; body?: unknown; raw?: string }>, { held = false } = {}) {
    const calls: string[] = [];
    const releases: Array<() => void> = [];
    let next = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
        calls.push(input);
        const answer = answers[Math.min(next++, answers.length - 1)];
        if (held) await new Promise<void>((resolve) => releases.push(resolve));
        const text = answer.raw ?? JSON.stringify(answer.body ?? {});
        return new Response(text, { status: answer.status ?? 200 });
    }));
    return { calls, release: () => releases.splice(0).forEach((resolve) => resolve()) };
}

describe("the cache's owner", () => {
    it("keeps nothing for anyone before an owner is named", () => {
        setDataCacheOwner(null);
        expect(writeCachedData(ALICE, URL_A, { n: 1 })).toBe(false);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });

    it("never hands one player's body to another in the same tab", () => {
        writeCachedData(ALICE, URL_A, { hand: ["secret"] });

        // Bob asks before anything has purged: his id isn't the owner's, and
        // the key names the player besides.
        expect(readCachedData(BOB, URL_A, 30_000)).toBeNull();
        expect(writeCachedData(BOB, URL_A, { hand: ["bob's"] })).toBe(false);

        // Once the cache is his, there is nothing of Alice's left in it.
        setDataCacheOwner(BOB);
        expect(readCachedData(BOB, URL_A, 30_000)).toBeNull();
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
        expect(writeCachedData(BOB, URL_A, { hand: ["bob's"] })).toBe(true);
        expect(readCachedData(BOB, URL_A, 30_000)?.body).toEqual({ hand: ["bob's"] });
    });

    it("empties on sign-out, and does not give the body back when the same player returns", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        markDataUnconfirmed(ALICE, URL_A);

        setDataCacheOwner(null);
        expect(isDataCacheOwner(ALICE)).toBe(false);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();

        setDataCacheOwner(ALICE);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(false);
    });

    it("keeps everything when the owner is named again unchanged", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        setDataCacheOwner(ALICE);
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 1 });
    });

    it("does not keep an answer that was in flight for the previous player", async () => {
        const { release } = stubFetch([{ body: { hand: ["alice's"] } }], { held: true });
        const { result } = loadSharedResource(ALICE, URL_A, { join: false });

        setDataCacheOwner(BOB);
        release();
        await result;

        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
        expect(readCachedData(BOB, URL_A, 30_000)).toBeNull();
        setDataCacheOwner(ALICE);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });
});

describe("a body's age", () => {
    it("is used while younger than the age asked for, with how old it is", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        vi.advanceTimersByTime(29_999);
        const hit = readCachedData<{ n: number }>(ALICE, URL_A, 30_000);
        expect(hit?.body).toEqual({ n: 1 });
        expect(hit?.ageMs).toBe(29_999);
    });

    it("is not used once it is as old as the age asked for", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        vi.advanceTimersByTime(30_000);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
        // ...though a reader that believes it for longer still can.
        expect(readCachedData(ALICE, URL_A, 60_000)?.body).toEqual({ n: 1 });
    });

    it("lets each reader choose its own age", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        vi.advanceTimersByTime(20_000);
        expect(readCachedData(ALICE, URL_A, 15_000)).toBeNull();
        expect(readCachedData(ALICE, URL_A, 30_000)).not.toBeNull();
    });

    it("is not trusted when the clock has moved back", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        vi.setSystemTime(new Date("2026-10-10T11:00:00.000Z"));
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });
});

describe("the bound on what is kept", () => {
    it("evicts the least recently used body past the limit", () => {
        for (let i = 0; i < DATA_CACHE_MAX_ENTRIES; i++) writeCachedData(ALICE, `/api/game/${i}`, { i });
        // Using the oldest makes it the newest.
        expect(readCachedData(ALICE, "/api/game/0", 30_000)).not.toBeNull();

        writeCachedData(ALICE, "/api/game/extra", { i: "extra" });

        expect(readCachedData(ALICE, "/api/game/0", 30_000)).not.toBeNull();
        expect(readCachedData(ALICE, "/api/game/1", 30_000)).toBeNull();
        expect(readCachedData(ALICE, "/api/game/2", 30_000)).not.toBeNull();
        expect(readCachedData(ALICE, "/api/game/extra", 30_000)).not.toBeNull();
    });

    it("stays at the limit however many are written", () => {
        for (let i = 0; i < DATA_CACHE_MAX_ENTRIES * 3; i++) writeCachedData(ALICE, `/api/game/${i}`, { i });
        let held = 0;
        for (let i = 0; i < DATA_CACHE_MAX_ENTRIES * 3; i++) {
            if (readCachedData(ALICE, `/api/game/${i}`, 30_000)) held++;
        }
        expect(held).toBe(DATA_CACHE_MAX_ENTRIES);
    });

    it("replaces a body rather than adding a second for the same url", () => {
        writeCachedData(ALICE, URL_A, { v: 1 });
        writeCachedData(ALICE, URL_A, { v: 2 });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: 2 });
    });

    it("forgets a body on request", () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        forgetCachedData(ALICE, URL_A);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });
});

describe("a cached paint that no request has answered", () => {
    it("is unconfirmed until a request confirms it", () => {
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(false);
        writeCachedData(ALICE, URL_A, { n: 1 });
        markDataUnconfirmed(ALICE, URL_A);
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(true);
        expect(isDataUnconfirmed(BOB, URL_A)).toBe(false);

        confirmData(ALICE, URL_A);
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(false);
    });

    it("cannot be marked for anyone but the owner", () => {
        markDataUnconfirmed(BOB, URL_A);
        expect(isDataUnconfirmed(BOB, URL_A)).toBe(false);
    });
});

describe("fetchResource", () => {
    it("parses a success", async () => {
        stubFetch([{ body: { gameData: { n: 1 } } }]);
        const result = await fetchResource(URL_A, () => false);
        expect(result.parsed).toBe(true);
        expect(result.body).toEqual({ gameData: { n: 1 } });
    });

    it("reports a response that is not JSON rather than throwing", async () => {
        stubFetch([{ raw: "<html>bad gateway</html>" }]);
        const result = await fetchResource(URL_A, () => false);
        expect(result.parsed).toBe(false);
        expect(result.response?.status).toBe(200);
        expect(result.parseError).toBeDefined();
    });

    it("never rejects, so a shared request can't leave its key in flight for ever", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        stubFetch([{ status: 401 }]);
        const load = loadSharedResource(ALICE, URL_A, { join: false, refreshSession: async () => { throw new Error("clerk"); } });
        const result = await load.result;
        expect(result.response).toBeNull();
        expect(result.parsed).toBe(false);
        expect(isDataInFlight(ALICE, URL_A)).toBe(false);
    });

    it("reports a network error as no response", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await fetchResource(URL_A, () => false);
        expect(result.response).toBeNull();
        expect(result.parsed).toBe(false);
    });
});

describe("loadSharedResource", () => {
    it("keeps a success", async () => {
        stubFetch([{ body: { gameData: { n: 1 } } }]);
        await loadSharedResource(ALICE, URL_A, { join: false }).result;
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ gameData: { n: 1 } });
    });

    it.each([500, 503, 401, 403, 404])("never keeps a %i as data", async (status) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        stubFetch([{ status, body: { error: "no" } }, { status, body: { error: "no" } }]);
        const load = loadSharedResource(ALICE, URL_A, { join: false, refreshSession: async () => {} }).result;
        // A 401 renews the session and waits a moment before its one retry.
        await vi.advanceTimersByTimeAsync(2_000);
        await load;
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });

    it("keeps nothing for a 200 that is not JSON", async () => {
        stubFetch([{ raw: "oops" }]);
        await loadSharedResource(ALICE, URL_A, { join: false }).result;
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });

    it("leaves a body it already holds when the next request fails", async () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        stubFetch([{ status: 500 }]);
        await loadSharedResource(ALICE, URL_A, { join: false }).result;
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 1 });
    });

    it.each([403, 404])("drops a body it holds when the answer is a %i: it is not the player's to see", async (status) => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        stubFetch([{ status }]);
        await loadSharedResource(ALICE, URL_A, { join: false }).result;
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });

    it("shares one request between a screen's entry fetch and a prefetch", async () => {
        const { calls, release } = stubFetch([{ body: { gameData: { n: 1 } } }], { held: true });

        const prefetch = loadSharedResource(ALICE, URL_A, { join: false });
        expect(isDataInFlight(ALICE, URL_A)).toBe(true);
        const entry = loadSharedResource(ALICE, URL_A, { join: true });
        expect(entry.joined).toBe(true);
        expect(prefetch.joined).toBe(false);

        release();
        const [fromPrefetch, fromEntry] = await Promise.all([prefetch.result, entry.result]);

        expect(calls).toEqual([URL_A]);
        expect(fromEntry).toBe(fromPrefetch);
        expect(isDataInFlight(ALICE, URL_A)).toBe(false);
    });

    it("does not let a refresh join a request that was already out", async () => {
        const { calls, release } = stubFetch([{ body: { v: 1 } }, { body: { v: 2 } }], { held: true });

        loadSharedResource(ALICE, URL_A, { join: false });
        const refresh = loadSharedResource(ALICE, URL_A, { join: false });
        expect(refresh.joined).toBe(false);

        release();
        await refresh.result;
        expect(calls).toHaveLength(2);
    });

    it("does not share a request between two urls, or two players", async () => {
        const { calls, release } = stubFetch([{ body: { v: 1 } }], { held: true });
        loadSharedResource(ALICE, URL_A, { join: false });
        expect(loadSharedResource(ALICE, URL_B, { join: true }).joined).toBe(false);
        setDataCacheOwner(BOB);
        expect(loadSharedResource(BOB, URL_A, { join: true }).joined).toBe(false);
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toHaveLength(3);
    });

    it("starts a new request after the last one finished", async () => {
        const { calls } = stubFetch([{ body: { v: 1 } }, { body: { v: 2 } }]);
        await loadSharedResource(ALICE, URL_A, { join: true }).result;
        const second = loadSharedResource(ALICE, URL_A, { join: true });
        expect(second.joined).toBe(false);
        await second.result;
        expect(calls).toHaveLength(2);
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: 2 });
    });
});

describe("a local write against a fetch already out", () => {
    it("is not put back by the older answer", async () => {
        const { release } = stubFetch([{ body: { v: "from the server, before the move" } }], { held: true });
        const load = loadSharedResource(ALICE, URL_A, { join: false });

        // The player's move lands while the poll is still out.
        writeCachedData(ALICE, URL_A, { v: "after the move" });
        release();
        await load.result;

        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: "after the move" });
    });

    it("is not joined by an entry fetch that began before it", async () => {
        const { calls, release } = stubFetch([{ body: { v: 1 } }, { body: { v: 2 } }], { held: true });
        loadSharedResource(ALICE, URL_A, { join: false });
        writeCachedData(ALICE, URL_A, { v: "after the move" });

        const entry = loadSharedResource(ALICE, URL_A, { join: true });
        expect(entry.joined).toBe(false);

        release();
        await entry.result;
        expect(calls).toHaveLength(2);
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: 2 });
    });

    it("lets a request that began afterwards replace it", async () => {
        stubFetch([{ body: { v: "fresh" } }]);
        writeCachedData(ALICE, URL_A, { v: "local" });
        await loadSharedResource(ALICE, URL_A, { join: false }).result;
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: "fresh" });
    });

    it("keeps the newer of two overlapping fetches whichever answers last", async () => {
        const answers: Array<(response: Response) => void> = [];
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve))));
        const older = loadSharedResource(ALICE, URL_A, { join: false });
        const newer = loadSharedResource(ALICE, URL_A, { join: false });

        // The newer one answers first; the older one's answer must not replace it.
        answers[1](new Response(JSON.stringify({ v: "newer" })));
        await newer.result;
        answers[0](new Response(JSON.stringify({ v: "older" })));
        await older.result;

        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ v: "newer" });
    });
});
