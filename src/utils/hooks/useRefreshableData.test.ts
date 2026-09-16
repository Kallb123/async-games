// The retry policy on its own — the one piece of `useRefreshableData` that can
// be asked a question without a browser, a Clerk session and a clock. Clerk is
// stubbed only so importing the module doesn't drag the SDK into a node test.

import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: null, isLoaded: false }) }));

// Below the mock on purpose: vitest hoists `vi.mock` above the imports.
import { retryDelayMs } from "./useRefreshableData";

describe("retryDelayMs", () => {
    it("retries a network error, backing off each time", () => {
        expect(retryDelayMs(null, 0)).toBe(1000);
        expect(retryDelayMs(null, 1)).toBe(3000);
        expect(retryDelayMs(null, 2)).toBe(9000);
    });

    it("gives up once the retries are spent, so a screen stops pretending to load", () => {
        expect(retryDelayMs(null, 3)).toBeNull();
        expect(retryDelayMs(500, 3)).toBeNull();
    });

    it("retries the failures that are a bad moment rather than an answer", () => {
        // A session cookie Clerk hasn't finished refreshing, a request the
        // server asked to have repeated, and a server having a bad minute.
        expect(retryDelayMs(401, 0)).toBe(1000);
        expect(retryDelayMs(408, 0)).toBe(1000);
        expect(retryDelayMs(429, 0)).toBe(1000);
        expect(retryDelayMs(500, 0)).toBe(1000);
        expect(retryDelayMs(503, 0)).toBe(1000);
    });

    it("does not retry an answer", () => {
        // The two the board acts on (see useGameData), plus the rest of the 4xx
        // range: asking again only delays the screen doing something about it.
        expect(retryDelayMs(403, 0)).toBeNull();
        expect(retryDelayMs(404, 0)).toBeNull();
        expect(retryDelayMs(400, 0)).toBeNull();
        expect(retryDelayMs(410, 0)).toBeNull();
    });

    it("does not retry a success, which has nothing to retry", () => {
        expect(retryDelayMs(200, 0)).toBeNull();
    });
});
