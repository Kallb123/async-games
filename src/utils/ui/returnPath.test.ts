// `returnPath`'s guard, which decides where someone lands after the native
// shell's Google button signs them in. The value comes off the URL bar, so
// "is this a path on our own site?" is the whole question — get it wrong and
// the sign-in screen forwards people to somebody else's.

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGIN = 'https://asyncgames.com';

/** Reads `returnPath` against a browser sitting on `/login?<search>`. */
async function pathFrom(search: string) {
    vi.resetModules();
    vi.stubGlobal('window', { location: { search, origin: ORIGIN } });
    const { returnPath } = await import("./returnPath");
    return returnPath();
}

/** As a link would carry it: `?redirect_url=` with the value encoded. */
function asked(redirectUrl: string) {
    return `?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("returnPath", () => {
    it("follows a path on this site, query string and all", async () => {
        // What `useAuthGuard` actually puts there: a join link still carrying
        // its code, so someone who followed one comes back to it.
        expect(await pathFrom(asked('/join?code=PLUM'))).toBe('/join?code=PLUM');
        expect(await pathFrom(asked('/games/abc#turn'))).toBe('/games/abc#turn');
    });

    it("goes home when there is nothing to go back to", async () => {
        expect(await pathFrom('')).toBe('/');
        expect(await pathFrom('?redirect_url=')).toBe('/');
    });

    it("keeps an absolute URL to this site, as a path", async () => {
        expect(await pathFrom(asked(`${ORIGIN}/join?code=PLUM`))).toBe('/join?code=PLUM');
    });

    it("refuses an absolute URL to somewhere else", async () => {
        expect(await pathFrom(asked('https://evil.example'))).toBe('/');
        expect(await pathFrom(asked('https://asyncgames.com.evil.example/'))).toBe('/');
    });

    it("refuses a protocol-relative URL, which reads like a path but isn't", async () => {
        // `//evil.example` inherits the current scheme and leaves the site —
        // the one that slips past a bare "starts with a slash" check.
        expect(await pathFrom(asked('//evil.example'))).toBe('/');
        expect(await pathFrom(asked('//evil.example/path'))).toBe('/');
    });

    it("refuses a backslash-prefixed URL, which the parser folds into a slash", async () => {
        expect(await pathFrom(asked('/\\evil.example'))).toBe('/');
        expect(await pathFrom(asked('\\\\evil.example'))).toBe('/');
    });

    it("refuses a URL hiding behind a stripped control character", async () => {
        // The one that got past the first version of this guard: the URL
        // parser removes tab, CR and LF from anywhere in the input *before*
        // parsing, so `/\t/evil.example` looks like a path right up until the
        // tab vanishes and it resolves to https://evil.example/.
        expect(await pathFrom(asked('/\t/evil.example'))).toBe('/');
        expect(await pathFrom(asked('/\n/evil.example'))).toBe('/');
        expect(await pathFrom(asked('/\r/evil.example'))).toBe('/');
        expect(await pathFrom(asked('/\t\\evil.example'))).toBe('/');
    });

    it("refuses a scheme that isn't a page at all", async () => {
        expect(await pathFrom(asked('javascript:alert(1)'))).toBe('/');
        expect(await pathFrom(asked('data:text/html,<script>alert(1)</script>'))).toBe('/');
    });
});
