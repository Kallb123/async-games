// @vitest-environment jsdom
//
// The session renewal on returning to the foreground (`useAuthGuard`): the
// token is asked for before any screen's own refetch on return has gone, and
// requests wait for it, rather than being refused with the token that expired
// while the app was in the background.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getToken = vi.fn<() => Promise<string>>();
vi.mock("@clerk/nextjs", () => ({
    useUser: () => ({ user: { id: "user_alice", publicMetadata: { unlocked: true } }, isLoaded: true }),
    useAuth: () => ({ getToken }),
}));

let visibility: DocumentVisibilityState = "visible";
let root: Root;

beforeEach(() => {
    vi.resetModules();
    getToken.mockReset();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
});

/** Mounts a signed-in screen and waits for its session to be confirmed, as a page load does. */
async function signedIn() {
    getToken.mockResolvedValue("token-1");
    const { useIsAuthorised } = await import("./useAuthGuard");
    const fetchModule = await import("./fetchWithSessionRetry");
    function Screen() {
        useIsAuthorised();
        return null;
    }
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(Screen)));
    await act(async () => {});
    expect(getToken).toHaveBeenCalledTimes(1);
    return fetchModule;
}

/** The tab going to the background and coming back. */
function hideAndReturn() {
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

describe("renewing the session on return", () => {
    it("asks Clerk for the token as the tab comes back, before a screen's refetch on return is sent", async () => {
        const { fetchWithSessionRetry } = await signedIn();
        const fetch = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetch);
        let answer!: (token: string) => void;
        getToken.mockImplementation(() => new Promise(resolve => { answer = resolve; }));

        // A screen's own listener, as useTurnRecap's is: on `document`, so it
        // runs after the renewal's, which is on `window` in the capture phase.
        let refetch: Promise<Response | null> | undefined;
        const onReturn = () => { if (document.visibilityState === "visible") refetch = fetchWithSessionRetry("/api/x", () => false); };
        document.addEventListener("visibilitychange", onReturn);
        try {
            hideAndReturn();
            expect(getToken).toHaveBeenCalledTimes(2);
            await Promise.resolve();
            expect(fetch).not.toHaveBeenCalled();

            answer("token-2");
            expect((await refetch)?.status).toBe(200);
            expect(fetch).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener("visibilitychange", onReturn);
        }
    });

    it("does nothing as the tab goes into the background", async () => {
        await signedIn();
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
        expect(getToken).toHaveBeenCalledTimes(1);
    });
});
