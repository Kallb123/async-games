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
// `_next/data` URLs, which no App Router page request uses.
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

// What `app/` calls a page-shaped file: the ones Next renders for a document
// request. Route handlers outside api/ (route.ts) are checked too, since they
// would meet the same missing middleware.
const SERVER_ENTRY = /^(page|layout|template|loading|not-found|route|manifest)\.tsx?$/;

// An `import { … } from "@clerk/nextjs/server"` that is not type-only, and the
// names it brings in. `User` and friends are types and cost nothing at runtime.
const CLERK_SERVER_IMPORT = /import\s+(?!type\s)\{([^}]*)\}\s*from\s*['"]@clerk\/nextjs\/server['"]/g;
const REQUEST_AUTH = ["auth", "currentUser"];

function requestAuthImports(file: string): string[] {
    return [...readFileSync(file, "utf8").matchAll(CLERK_SERVER_IMPORT)]
        .flatMap(match => match[1].split(","))
        .map(name => name.trim().split(/\s+as\s+/)[0])
        .filter(name => REQUEST_AUTH.includes(name));
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
                .filter(([file]) => requestAuthImports(file).length > 0)
                .map(([, chain]) => chain.map(file => path.relative(SRC_ROOT, file)).join(" -> ")));
        expect(offenders).toEqual([]);
    });
});
