// The one-shot reload's guard — the part that must never be able to spin a tab.
// It is all `window`, so the browser bits it touches are stood in for and the
// module is re-imported per test: the "has this tab already used its reload?"
// answer is partly module state, and a test that inherited the last one's would
// be proving nothing.

import { afterEach, describe, expect, it, vi } from "vitest";

/** A stand-in browser. `blocked` is private mode, where storage throws. */
function fakeWindow({ blocked = false } = {}) {
    const stored = new Map<string, string>();
    const reload = vi.fn();
    const refuse = () => { throw new Error('site data blocked'); };
    return {
        reload,
        stored,
        window: {
            sessionStorage: {
                getItem: (key: string) => (blocked ? refuse() : stored.get(key) ?? null),
                setItem: (key: string, value: string) => { if (blocked) refuse(); stored.set(key, value); },
                removeItem: (key: string) => { if (blocked) refuse(); stored.delete(key); },
            },
            location: { reload },
        },
    };
}

/** A fresh copy of the module against `browser`, module state and all. */
async function loadAgainst(browser: ReturnType<typeof fakeWindow>) {
    vi.resetModules();
    vi.stubGlobal('window', browser.window);
    return import("./fetchWithSessionRetry");
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("reloadForStaleSession", () => {
    it("reloads the first time and refuses every time after", async () => {
        const browser = fakeWindow();
        const { reloadForStaleSession } = await loadAgainst(browser);

        expect(reloadForStaleSession()).toBe(true);
        expect(browser.reload).toHaveBeenCalledTimes(1);

        // The session is still dead: the caller must be told to handle it
        // itself rather than the tab reloading into the same wall for ever.
        expect(reloadForStaleSession()).toBe(false);
        expect(reloadForStaleSession()).toBe(false);
        expect(browser.reload).toHaveBeenCalledTimes(1);
    });

    it("stays refused across the reload itself", async () => {
        // The marker is in sessionStorage, which survives a reload — so the page
        // that comes back is a fresh copy of the module reading the same store.
        const browser = fakeWindow();
        const first = await loadAgainst(browser);
        expect(first.reloadForStaleSession()).toBe(true);

        const afterReload = await loadAgainst(browser);
        expect(afterReload.reloadForStaleSession()).toBe(false);
        expect(browser.reload).toHaveBeenCalledTimes(1);
    });

    it("gets its reload back on a later page, once something has loaded", async () => {
        const browser = fakeWindow();
        const first = await loadAgainst(browser);
        expect(first.reloadForStaleSession()).toBe(true);

        // The page that came back loaded something, so the marker goes — and a
        // session that expires all over again later is a new problem with a
        // shot of its own. (Never twice from one document: by the time one has
        // fired, it is the page being replaced.)
        const afterReload = await loadAgainst(browser);
        afterReload.clearStaleSessionReload();
        expect(afterReload.reloadForStaleSession()).toBe(true);
        expect(browser.reload).toHaveBeenCalledTimes(2);
    });

    it("keeps its answer once the reload is fired, whatever lands in the meantime", async () => {
        // The page keeps running while the new document is fetched: the chat
        // poll on the same board can succeed in that window, and its success
        // path clears the marker. That must not re-arm the reload the tab is
        // already taking — nor let the page that comes back take another.
        const browser = fakeWindow();
        const { reloadForStaleSession, clearStaleSessionReload } = await loadAgainst(browser);

        expect(reloadForStaleSession()).toBe(true);
        clearStaleSessionReload();
        expect(reloadForStaleSession()).toBe(false);
        expect(browser.reload).toHaveBeenCalledTimes(1);
        // And the marker the reloaded page will read is still there.
        expect(browser.stored.size).toBe(1);
    });

    it("does not reload at all when there is nowhere to remember it", async () => {
        // Private mode: with no way to stop a second reload, don't take a first.
        const browser = fakeWindow({ blocked: true });
        const { reloadForStaleSession } = await loadAgainst(browser);

        expect(reloadForStaleSession()).toBe(false);
        expect(browser.reload).not.toHaveBeenCalled();
    });

    it("survives a blocked store when giving the reload back", async () => {
        const browser = fakeWindow({ blocked: true });
        const { clearStaleSessionReload } = await loadAgainst(browser);

        expect(() => clearStaleSessionReload()).not.toThrow();
    });
});
