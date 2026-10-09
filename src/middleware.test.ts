import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";

import { config } from "@/middleware";
import { reachableFrom, SRC_ROOT } from "@/utils/testing/moduleGraph";
import { walkFiles } from "@/utils/testing/walkFiles";

// Clerk's middleware is kept off page requests, because on a document request
// with an expired session token it answers with a handshake — a redirect out to
// Clerk and back — before the page is served (see the note in middleware.ts).
// `auth()` and `currentUser()` read the request the middleware hands them, so on
// a route the middleware skips they throw. Both halves of that bargain are
// pinned here: the matcher stays on the API, and nothing a page renders asks
// Clerk who is signed in. A page that needs to must be added to the matcher,
// and this test updated to say so.

// Each matcher turned into a regex by Next's own parser (the `path-to-regexp`
// dialect the matcher is written in), rather than a regex of ours that could
// disagree with it. `next build` wraps the pattern in a prefix and suffix for
// `_next/data` URLs, which no App Router page request uses. `tryToParsePath` is
// Next-internal (`next/dist/lib/…`), so a Next upgrade can move it: if this
// import breaks after one, find where the matcher parser went.
const patterns = config.matcher.map(source => new RegExp(tryToParsePath(source).regexStr!));
const runsMiddleware = (pathname: string) => patterns.some(pattern => pattern.test(pathname));

describe("middleware matcher", () => {
    it.each(["/api/game/abc", "/api/dashboard", "/api"])("runs on %s", (pathname) => {
        expect(runsMiddleware(pathname)).toBe(true);
    });

    it.each(["/", "/join", "/games/realmarena/abc", "/settings", "/login", "/newgame"])(
        "stays off the page %s",
        (pathname) => {
            expect(runsMiddleware(pathname)).toBe(false);
        },
    );
});

// What `app/` calls a page-shaped file: the ones Next renders for a document or
// crawler request. Route handlers outside api/ (route.ts) are checked too, since
// they would meet the same missing middleware.
const SERVER_ENTRY = /^(page|layout|template|default|loading|error|global-error|not-found|forbidden|unauthorized|route|manifest|sitemap|robots|icon|apple-icon|opengraph-image|twitter-image)\.tsx?$/;

// Every statement that names Clerk's server package at runtime: an import, a
// re-export, or a dynamic `import()` (which `reachableFrom` doesn't follow, so
// it is caught where it is written).
const CLERK_SERVER_STATEMENT = /(import|export)\s+(?!type\s)([^;'"]*?)\s*from\s*['"]@clerk\/nextjs\/server['"]|import\(\s*['"]@clerk\/nextjs\/server['"]\s*\)/g;
// The functions that read the request the middleware hands them.
const REQUEST_AUTH = /\b(auth|currentUser|getAuth)\b/;

/**
 * Whether a file can bring Clerk's request auth into whatever imports it. A
 * named import is judged by its names (`clerkClient` and the `User` type are
 * fine), but anything that hides them is counted against it: a namespace
 * import carries `auth` along, a re-export hands the names to an importer this
 * can't see, and a dynamic import can take whatever it likes.
 */
function reachesRequestAuth(file: string): boolean {
    return [...readFileSync(file, "utf8").matchAll(CLERK_SERVER_STATEMENT)].some(([, keyword, clause]) =>
        clause === undefined
        || keyword === "export"
        || clause.includes("*")
        || REQUEST_AUTH.test(clause.replace(/\btype\s+\w+/g, "")));
}

describe("pages and the Clerk middleware", () => {
    const appDir = path.join(SRC_ROOT, "app");
    const apiDir = path.join(appDir, "api");
    const entries = walkFiles(appDir, name => SERVER_ENTRY.test(name))
        .filter(file => !file.startsWith(apiDir + path.sep));

    it("finds the pages to check", () => {
        expect(entries.length).toBeGreaterThan(10);
    });

    it("never reaches Clerk's request auth from a page, layout or template", () => {
        const offenders = entries.flatMap(entry =>
            [...reachableFrom(entry)]
                .filter(([file]) => reachesRequestAuth(file))
                .map(([, chain]) => chain.map(file => path.relative(SRC_ROOT, file)).join(" -> ")));
        expect(offenders).toEqual([]);
    });
});
