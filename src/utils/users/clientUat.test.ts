import { describe, expect, it } from "vitest";

import {
    SIGNED_IN_ATTRIBUTE,
    SIGNED_IN_PRE_PAINT_SCRIPT,
    parseCookieString,
    signedInHintFrom,
    signedInHintFromCookieString,
} from "@/utils/users/clientUat";

describe("signedInHintFrom", () => {
    it("is true for a client_uat stamp, suffixed or not", () => {
        expect(signedInHintFrom([{ name: "__client_uat", value: "1760000000" }])).toBe(true);
        expect(signedInHintFrom([{ name: "__client_uat_Ab-d_9xZ", value: "1760000000" }])).toBe(true);
    });

    it("is false once Clerk has zeroed or emptied the stamp", () => {
        expect(signedInHintFrom([{ name: "__client_uat", value: "0" }])).toBe(false);
        expect(signedInHintFrom([{ name: "__client_uat_Ab-d_9xZ", value: "" }])).toBe(false);
    });

    it("is false with no stamp, and ignores cookies that only look similar", () => {
        expect(signedInHintFrom([])).toBe(false);
        expect(signedInHintFrom([
            { name: "__session", value: "a.jwt.here" },
            { name: "__client_uatx", value: "1760000000" },
            { name: "client_uat", value: "1760000000" },
        ])).toBe(false);
    });

    it("is true when any one instance's stamp is live", () => {
        expect(signedInHintFrom([
            { name: "__client_uat", value: "0" },
            { name: "__client_uat_Ab-d_9xZ", value: "1760000000" },
        ])).toBe(true);
    });
});

describe("parseCookieString", () => {
    it("reads document.cookie's name=value pairs, spaces and all", () => {
        expect(parseCookieString("a=1; __client_uat=1760000000;b=x=y")).toEqual([
            { name: "a", value: "1" },
            { name: "__client_uat", value: "1760000000" },
            { name: "b", value: "x=y" },
        ]);
    });

    it("reads an empty jar and drops a piece with no equals sign", () => {
        expect(parseCookieString("")).toEqual([]);
        expect(parseCookieString("__client_uat_x; a=1")).toEqual([{ name: "a", value: "1" }]);
    });
});

// Every jar here is written the way `document.cookie` hands it back, and the
// same answer is wanted from the string reader and from the script the browser
// runs before first paint.
const COOKIE_STRINGS: [string, boolean][] = [
    ["__client_uat=1760000000", true],
    ["__client_uat_Ab-d_9xZ=1760000000", true],
    ["__client_uat=0", false],
    ["__client_uat_Ab-d_9xZ=", false],
    ["", false],
    ["__session=a.jwt.here; __client_uatx=1760000000; client_uat=1760000000", false],
    ["__client_uat=0; __client_uat_Ab-d_9xZ=1760000000", true],
    ["theme=dark; __session=a.jwt.here; __client_uat=1760000000; other=1", true],
    ["  spaced=1;   __client_uat_Ab-d_9xZ=1760000000  ; last=2", true],
    ["__client_uat_Ab-d_9xZ", false],
    ["__client_uat=; __client_uat_x=0", false],
];

/** Runs the pre-paint script against a fake document and returns what it set on <html>. */
function runPrePaintScript(cookie: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const fakeDocument = {
        cookie,
        documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } },
    };
    new Function("document", SIGNED_IN_PRE_PAINT_SCRIPT)(fakeDocument);
    return attributes;
}

describe("signedInHintFromCookieString and the pre-paint script", () => {
    it.each(COOKIE_STRINGS)("agree on %j", (cookie, expected) => {
        expect(signedInHintFromCookieString(cookie)).toBe(expected);
        expect(runPrePaintScript(cookie)).toEqual(expected ? { [SIGNED_IN_ATTRIBUTE]: "1" } : {});
    });

    it("never throws, even where document.cookie cannot be read", () => {
        const throwing = { get cookie(): string { throw new Error("blocked"); }, documentElement: {} };
        expect(() => new Function("document", SIGNED_IN_PRE_PAINT_SCRIPT)(throwing)).not.toThrow();
    });
});
