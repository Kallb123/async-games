// @vitest-environment jsdom
//
// The cache is emptied when the signed-in player goes away or changes: sign-out,
// another account on the same tab, a locked account.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const auth: { userId: string | null; authorised: boolean } = { userId: "user_alice", authorised: true };
vi.mock("./useAuthGuard", () => ({
    useIsAuthorised: () => ({ user: auth.userId ? { id: auth.userId } : null, isLoaded: true, isAuthorised: auth.authorised }),
}));

// Below the mock on purpose: vitest hoists `vi.mock` above the imports.
import { useDataCacheOwner } from "./useDataCacheOwner";
import { readCachedData, setDataCacheOwner, writeCachedData } from "./dataCache";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
    useDataCacheOwner();
    return null;
}

afterEach(() => {
    setDataCacheOwner(null);
});

async function renderOwner() {
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(createElement(Harness)); });
    return {
        rerender: () => act(async () => { root.render(createElement(Harness)); }),
        unmount: () => act(async () => { root.unmount(); }),
    };
}

describe("useDataCacheOwner", () => {
    it("makes the signed-in player the cache's owner", async () => {
        Object.assign(auth, { userId: "user_alice", authorised: true });
        const owner = await renderOwner();
        expect(writeCachedData("user_alice", "/api/dashboard", { n: 1 })).toBe(true);
        await owner.unmount();
    });

    it("empties the cache when the player signs out", async () => {
        Object.assign(auth, { userId: "user_alice", authorised: true });
        const owner = await renderOwner();
        writeCachedData("user_alice", "/api/dashboard", { n: 1 });

        Object.assign(auth, { userId: null, authorised: false });
        await owner.rerender();

        expect(readCachedData("user_alice", "/api/dashboard", 30_000)).toBeNull();
        expect(writeCachedData("user_alice", "/api/dashboard", { n: 2 })).toBe(false);
        await owner.unmount();
    });

    it("empties the cache when the account is locked, though still signed in", async () => {
        Object.assign(auth, { userId: "user_alice", authorised: true });
        const owner = await renderOwner();
        writeCachedData("user_alice", "/api/dashboard", { n: 1 });

        Object.assign(auth, { userId: "user_alice", authorised: false });
        await owner.rerender();

        expect(readCachedData("user_alice", "/api/dashboard", 30_000)).toBeNull();
        await owner.unmount();
    });

    it("hands the cache to a different player empty", async () => {
        Object.assign(auth, { userId: "user_alice", authorised: true });
        const owner = await renderOwner();
        writeCachedData("user_alice", "/api/dashboard", { n: 1 });

        Object.assign(auth, { userId: "user_bob", authorised: true });
        await owner.rerender();

        expect(readCachedData("user_alice", "/api/dashboard", 30_000)).toBeNull();
        expect(readCachedData("user_bob", "/api/dashboard", 30_000)).toBeNull();
        expect(writeCachedData("user_bob", "/api/dashboard", { n: 3 })).toBe(true);
        await owner.unmount();
    });
});
