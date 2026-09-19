// `returnPath`'s guard, which decides where someone lands after the native
// shell's Google button signs them in. The value comes off the URL bar, so
// "is this a path on our own site?" is the whole question — get it wrong and
// the sign-in screen forwards people to somebody else's.

import { afterEach, describe, expect, it, vi } from "vitest";

/** Reads `returnPath` against a browser sitting on `/login?<search>`. */
async function pathFrom(search: string) {
    vi.resetModules();
    vi.stubGlobal('window', { location: { search } });
    const { returnPath } = await import("./returnPath");
    return returnPath();
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("returnPath", () => {
    it("follows a path on this site, query string and all", async () => {
        // What `useAuthGuard` actually puts there: a join link still carrying
        // its code, so someone who followed one comes back to it.
        expect(await pathFrom('?redirect_url=%2Fjoin%3Fcode%3DPLUM')).toBe('/join?code=PLUM');
    });

    it("goes home when there is nothing to go back to", async () => {
        expect(await pathFrom('')).toBe('/');
        expect(await pathFrom('?redirect_url=')).toBe('/');
    });

    it("refuses an absolute URL to somewhere else", async () => {
        expect(await pathFrom('?redirect_url=https%3A%2F%2Fevil.example')).toBe('/');
    });

    it("refuses a protocol-relative URL, which reads like a path but isn't", async () => {
        // `//evil.example` inherits the current scheme and leaves the site —
        // the one that slips past a bare "starts with a slash" check.
        expect(await pathFrom('?redirect_url=%2F%2Fevil.example')).toBe('/');
        expect(await pathFrom('?redirect_url=%2F%2Fevil.example%2Fpath')).toBe('/');
    });

    it("refuses a backslash-prefixed URL, which some parsers read as a slash", async () => {
        expect(await pathFrom('?redirect_url=%2F%5Cevil.example')).toBe('/');
        expect(await pathFrom('?redirect_url=%5C%5Cevil.example')).toBe('/');
    });
});
