// @vitest-environment jsdom
//
// Prefetching a board on intent: when it starts a request, when it is a no-op,
// and that it fills the same cache (and shares the same request) as the screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDataUrl, GAME_DATA_CACHE_MS, prefetchGameData } from "./prefetchGameData";
import { loadSharedResource, readCachedData, setDataCacheOwner, writeCachedData } from "./dataCache";

const ALICE = "user_alice";

let calls: string[];
let answers: Array<(body: unknown) => void>;
const metric = vi.fn();

function setSaveData(saveData: boolean | undefined) {
    Object.defineProperty(navigator, "connection", { value: saveData === undefined ? undefined : { saveData }, configurable: true });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
    setDataCacheOwner(null);
    setDataCacheOwner(ALICE);
    calls = [];
    answers = [];
    metric.mockClear();
    setSaveData(undefined);
    Object.assign(window, { __agPerformanceMetric: metric });
    vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => {
        calls.push(url);
        answers.push((body) => resolve(new Response(JSON.stringify(body))));
    })));
});

afterEach(async () => {
    // Let any request a test left out finish, so the one-at-a-time flag is clear for the next.
    answers.splice(0).forEach((answer) => answer({}));
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as { __agPerformanceMetric?: unknown }).__agPerformanceMetric;
    setDataCacheOwner(null);
});

describe("prefetchGameData", () => {
    it("fetches the board into the cache the screen reads from, and reports how long it took", async () => {
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual(["/api/game/g1"]);

        vi.setSystemTime(new Date("2026-10-10T12:00:00.500Z"));
        answers[0]({ gameData: { n: 1 } });
        await vi.advanceTimersByTimeAsync(0);

        expect(readCachedData(ALICE, gameDataUrl("g1"), GAME_DATA_CACHE_MS)?.body).toEqual({ gameData: { n: 1 } });
        expect(metric).toHaveBeenCalledWith("data_prefetch", expect.any(Number), { pathname: "/" });
    });

    it("does nothing until the viewer is authorised", () => {
        prefetchGameData(null, "g1");
        prefetchGameData(undefined, "g1");
        expect(calls).toEqual([]);
    });

    it("does nothing for a player the cache does not belong to", () => {
        prefetchGameData("user_bob", "g1");
        expect(calls).toEqual([]);
    });

    it("does nothing when the browser asks for less data", () => {
        setSaveData(true);
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual([]);

        setSaveData(false);
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual(["/api/game/g1"]);
    });

    it("does nothing when the board in the cache is still fresh", () => {
        writeCachedData(ALICE, gameDataUrl("g1"), { gameData: {} });
        vi.advanceTimersByTime(GAME_DATA_CACHE_MS - 1);
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual([]);
    });

    it("asks again once the cached board is stale", () => {
        writeCachedData(ALICE, gameDataUrl("g1"), { gameData: {} });
        vi.advanceTimersByTime(GAME_DATA_CACHE_MS);
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual(["/api/game/g1"]);
    });

    it("does nothing when a request for the board is already out", () => {
        loadSharedResource(ALICE, gameDataUrl("g1"), { join: false });
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual(["/api/game/g1"]);
    });

    it("keeps at most one prefetch in flight, and goes again once it is done", async () => {
        prefetchGameData(ALICE, "g1");
        prefetchGameData(ALICE, "g2");
        prefetchGameData(ALICE, "g1");
        expect(calls).toEqual(["/api/game/g1"]);

        answers[0]({ gameData: {} });
        await vi.advanceTimersByTimeAsync(0);

        prefetchGameData(ALICE, "g2");
        expect(calls).toEqual(["/api/game/g1", "/api/game/g2"]);
    });

    it("reports nothing for a request that failed", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
        vi.spyOn(console, "error").mockImplementation(() => {});
        prefetchGameData(ALICE, "g1");
        await vi.advanceTimersByTimeAsync(0);
        expect(metric).not.toHaveBeenCalled();
        expect(readCachedData(ALICE, gameDataUrl("g1"), GAME_DATA_CACHE_MS)).toBeNull();
    });
});
