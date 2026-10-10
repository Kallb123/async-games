// @vitest-environment jsdom
//
// `useRefreshableData` with the data cache — the mounted behaviour the plan's
// "Required tests" ask for: a remount within `cacheFor` paints the cached body
// and revalidates beneath it, `setData` writes through, a prefetch is joined,
// two players in one tab never see each other's body — and the url changing
// under a fetch that is still out. The hook is rendered for real (React's
// `act`, a jsdom document); Clerk, the push listener and `fetch` are stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const auth = { userId: "user_alice" as string | null };
const refreshSession = async () => {};
vi.mock("./useAuthGuard", () => ({
    useIsAuthorised: () => ({ user: auth.userId ? { id: auth.userId } : null, isLoaded: true, isAuthorised: auth.userId !== null }),
    useSessionRefresh: () => refreshSession,
}));
vi.mock("./usePushEvents", () => ({ usePushEvents: () => ({ restartPoll: () => {} }) }));

// Below the mocks on purpose: vitest hoists `vi.mock` above the imports.
import { useRefreshableData, type RefreshableData } from "./useRefreshableData";
import { isDataUnconfirmed, readCachedData, setDataCacheOwner, writeCachedData } from "./dataCache";
import { GAME_DATA_CACHE_MS, prefetchGameData } from "./prefetchGameData";

type Body = { n?: number; v?: string };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALICE = "user_alice";
const BOB = "user_bob";
const URL_A = "/api/game/aaa";
const URL_B = "/api/game/bbb";

/** Every request the stubbed `fetch` has been asked for, each waiting to be answered. */
let requests: Array<{ url: string; answer: (body: unknown, status?: number) => void }>;
let mounted: Root[];
const mark = vi.fn();
const metric = vi.fn();

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
    auth.userId = ALICE;
    setDataCacheOwner(null);
    setDataCacheOwner(ALICE);
    requests = [];
    mounted = [];
    mark.mockClear();
    metric.mockClear();
    Object.assign(window, { __agPerformanceMark: mark, __agPerformanceMetric: metric });
    vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => {
        requests.push({ url, answer: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status })) });
    })));
});

afterEach(() => {
    for (const root of mounted) act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as { __agPerformanceMark?: unknown }).__agPerformanceMark;
    delete (window as { __agPerformanceMetric?: unknown }).__agPerformanceMetric;
    setDataCacheOwner(null);
});

/** Renders the hook the way a screen does. `current` is always its latest result. */
function mount(props: { url: string; cacheFor?: number }) {
    const result: { current: RefreshableData<Body> | null } = { current: null };
    function Harness(p: { url: string; cacheFor?: number }) {
        result.current = useRefreshableData<Body>(p.url, [], p.cacheFor === undefined ? {} : { cacheFor: p.cacheFor });
        return null;
    }
    const root = createRoot(document.createElement("div"));
    mounted.push(root);
    return {
        get current() { return result.current!; },
        render: (next: { url: string; cacheFor?: number } = props) => act(async () => { root.render(createElement(Harness, next)); }),
        unmount: () => act(async () => { root.unmount(); mounted.splice(mounted.indexOf(root), 1); }),
    };
}

/** Answers the oldest unanswered request for `url`, then lets the hook settle. */
async function answer(url: string, body: unknown, status = 200) {
    const index = requests.findIndex((request) => request.url === url);
    const [request] = requests.splice(index, 1);
    await act(async () => { request.answer(body, status); });
}

const requested = (url: string) => (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => u === url).length;

describe("a screen that opted in to the cache", () => {
    it("paints a remount from the cache at once, then revalidates beneath it", async () => {
        const first = mount({ url: URL_A, cacheFor: 30_000 });
        await first.render();
        expect(first.current.isLoading).toBe(true);
        await answer(URL_A, { n: 1 });
        expect(first.current.data).toEqual({ n: 1 });
        await first.unmount();

        vi.advanceTimersByTime(4_000);
        const second = mount({ url: URL_A, cacheFor: 30_000 });
        await second.render();

        // Painted from the cache with the fetch still out...
        expect(second.current.data).toEqual({ n: 1 });
        expect(second.current.isLoading).toBe(false);
        expect(second.current.isRefreshing).toBe(true);
        expect(requested(URL_A)).toBe(2);
        expect(metric).toHaveBeenCalledWith("data_cache_hit", 4_000);
        expect(mark).toHaveBeenCalledWith("first_data");
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(true);

        // ...and corrected when it lands.
        await answer(URL_A, { n: 2 });
        expect(second.current.data).toEqual({ n: 2 });
        expect(second.current.isRefreshing).toBe(false);
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(false);
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 2 });
    });

    it("reports a miss, and waits on the network, when nothing is cached", async () => {
        const screen = mount({ url: URL_A, cacheFor: 30_000 });
        await screen.render();
        expect(screen.current.data).toBeNull();
        expect(screen.current.isLoading).toBe(true);
        expect(metric).toHaveBeenCalledWith("data_cache_miss", 0);
        expect(metric).not.toHaveBeenCalledWith("data_cache_hit", expect.anything());
        expect(isDataUnconfirmed(ALICE, URL_A)).toBe(false);
    });

    it("does not paint a body older than cacheFor", async () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        vi.advanceTimersByTime(15_000);
        const screen = mount({ url: URL_A, cacheFor: 15_000 });
        await screen.render();
        expect(screen.current.data).toBeNull();
        expect(screen.current.isLoading).toBe(true);
    });

    it("never paints another player's body in the same tab", async () => {
        writeCachedData(ALICE, URL_A, { v: "alice's hand" });

        // Bob signs in on this tab; the cache is emptied for him.
        auth.userId = BOB;
        setDataCacheOwner(BOB);
        const screen = mount({ url: URL_A, cacheFor: 30_000 });
        await screen.render();
        expect(screen.current.data).toBeNull();
        expect(screen.current.isLoading).toBe(true);

        // Even before that happens, Alice's body isn't his to read.
        setDataCacheOwner(ALICE);
        writeCachedData(ALICE, URL_B, { v: "alice's hand" });
        auth.userId = BOB;
        const early = mount({ url: URL_B, cacheFor: 30_000 });
        await early.render();
        expect(early.current.data).toBeNull();
    });

    it("writes through setData, so a return shows the latest local state", async () => {
        const first = mount({ url: URL_A, cacheFor: 30_000 });
        await first.render();
        await answer(URL_A, { n: 1 });
        await act(async () => { first.current.setData({ n: 2 }); });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 2 });
        await act(async () => { first.current.setData((previous) => ({ ...previous, v: "patched" })); });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 2, v: "patched" });
        await first.unmount();

        const second = mount({ url: URL_A, cacheFor: 30_000 });
        await second.render();
        expect(second.current.data).toEqual({ n: 2, v: "patched" });
    });

    it("is not put back by a fetch that was out before a local write", async () => {
        const screen = mount({ url: URL_A, cacheFor: 30_000 });
        await screen.render();
        await answer(URL_A, { n: 1 });
        // A refresh is out; the player moves; the refresh answers with the board as it was.
        await act(async () => { void screen.current.refresh(); });
        await act(async () => { screen.current.setData({ n: 2 }); });
        await answer(URL_A, { n: 1 });
        expect(screen.current.data).toEqual({ n: 2 });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 2 });
    });

    it("joins a prefetch that is still out instead of asking again", async () => {
        const url = "/api/game/g1";
        prefetchGameData(ALICE, "g1");
        expect(requested(url)).toBe(1);

        const screen = mount({ url, cacheFor: 30_000 });
        await screen.render();
        expect(requested(url)).toBe(1);
        expect(screen.current.isLoading).toBe(true);

        await answer(url, { n: 7 });
        expect(screen.current.data).toEqual({ n: 7 });
        expect(screen.current.isLoading).toBe(false);
    });

    it("paints a prefetch that has landed at once, and still revalidates it beneath", async () => {
        const url = "/api/game/g2";
        prefetchGameData(ALICE, "g2");
        await answer(url, { n: 7 });
        expect(readCachedData(ALICE, url, GAME_DATA_CACHE_MS)?.body).toEqual({ n: 7 });

        // The board opens on the prefetched body, with the top bar's loading bar
        // (`isRefreshing`) up, and asks again rather than trusting it...
        const screen = mount({ url, cacheFor: GAME_DATA_CACHE_MS });
        await screen.render();
        expect(screen.current.data).toEqual({ n: 7 });
        expect(screen.current.isLoading).toBe(false);
        expect(screen.current.isRefreshing).toBe(true);
        expect(requested(url)).toBe(2);
        expect(isDataUnconfirmed(ALICE, url)).toBe(true);

        // ...and the bar comes down when the second answer lands.
        await answer(url, { n: 8 });
        expect(screen.current.data).toEqual({ n: 8 });
        expect(screen.current.isRefreshing).toBe(false);
        expect(isDataUnconfirmed(ALICE, url)).toBe(false);
    });

    it("drops a cached body the server says is no longer the player's to see", async () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        const screen = mount({ url: URL_A, cacheFor: 30_000 });
        await screen.render();
        vi.spyOn(console, "error").mockImplementation(() => {});
        await answer(URL_A, {}, 404);
        expect(screen.current.status).toBe(404);
        expect(readCachedData(ALICE, URL_A, 30_000)).toBeNull();
    });
});

describe("a screen that did not opt in", () => {
    it("neither reads the cache nor writes it", async () => {
        writeCachedData(ALICE, URL_A, { n: 1 });
        const screen = mount({ url: URL_A });
        await screen.render();
        expect(screen.current.data).toBeNull();
        expect(screen.current.isLoading).toBe(true);
        expect(metric).not.toHaveBeenCalled();

        await answer(URL_A, { n: 5 });
        expect(screen.current.data).toEqual({ n: 5 });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 1 });

        await act(async () => { screen.current.setData({ n: 6 }); });
        expect(readCachedData(ALICE, URL_A, 30_000)?.body).toEqual({ n: 1 });
    });
});

// A pre-existing bug the cache would have made worse: the new url's `refresh`
// saw a fetch in flight, asked for a re-run and returned, and the OLD closure
// re-ran with the OLD url and put its body on screen.
describe.each([
    ["without the cache", undefined],
    ["with the cache", 30_000],
])("the url changing while a fetch is out (%s)", (_name, cacheFor) => {
    it("fetches the new url and never shows the old url's body", async () => {
        const screen = mount({ url: URL_A, cacheFor });
        await screen.render();
        expect(requested(URL_A)).toBe(1);

        await screen.render({ url: URL_B, cacheFor });
        expect(requested(URL_B)).toBe(1);

        // The first board's answer lands late.
        await answer(URL_A, { v: "board A" });
        expect(screen.current.data).toBeNull();
        expect(screen.current.isLoading).toBe(true);
        expect(requested(URL_A)).toBe(1);

        await answer(URL_B, { v: "board B" });
        expect(screen.current.data).toEqual({ v: "board B" });
        expect(screen.current.isLoading).toBe(false);
        expect(requested(URL_A)).toBe(1);
    });

    it("never keeps the old url's body under the new url's key", async () => {
        const screen = mount({ url: URL_A, cacheFor });
        await screen.render();
        await screen.render({ url: URL_B, cacheFor });
        await answer(URL_A, { v: "board A" });
        await answer(URL_B, { v: "board B" });

        // Each body is under its own url's key, or (no cache) under none.
        const keptForB = readCachedData<Body>(ALICE, URL_B, 30_000)?.body;
        const keptForA = readCachedData<Body>(ALICE, URL_A, 30_000)?.body;
        expect(keptForB).toEqual(cacheFor === undefined ? undefined : { v: "board B" });
        expect(keptForA).toEqual(cacheFor === undefined ? undefined : { v: "board A" });
    });

    it("lets the new url's own later refreshes through", async () => {
        const screen = mount({ url: URL_A, cacheFor });
        await screen.render();
        await answer(URL_A, { v: "A" });
        await screen.render({ url: URL_B, cacheFor });
        await answer(URL_B, { v: "B1" });

        await act(async () => { void screen.current.refresh(); });
        await answer(URL_B, { v: "B2" });
        expect(screen.current.data).toEqual({ v: "B2" });
    });
});
