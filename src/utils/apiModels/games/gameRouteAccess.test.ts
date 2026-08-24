import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../../../app/api");

// Every route that pulls one specific game out of Mongo has to establish that
// the caller is actually in it. GET /api/game/[gameid] — the route that returns
// the whole game — was the one that didn't: it authenticated the caller and
// then handed the game to anyone holding its id, while all five of its siblings
// checked. Game ids are v4 UUIDs, so nothing was enumerable, but they travel in
// push-notification links and shareable URLs.
//
// Discovered by walking the tree rather than listed by hand, so a route added
// tomorrow is covered without anyone remembering to add it here.
function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(full);
        return entry.name === "route.ts" ? [full] : [];
    });
}

// The three ways a route legitimately establishes membership:
//
//  - the explicit check the sibling routes use;
//  - a stronger gate on it being the caller's turn, which can only be true of
//    a player (command and taketurn);
//  - scoping the query itself to the caller's games, so a non-player's fetch
//    comes back empty (the lobby's "what game did we become?" lookup).
const MEMBERSHIP_GATES = [
    /userIdList\.includes\(\s*(?:auth\w*\.)?userId\s*\)/,
    /currentTurn\s*!==?=\s*(?:auth\w*\.)?userId|(?:auth\w*\.)?userId\s*!==?=\s*\w*\.currentTurn/,
    /findOne\(\s*\{[^}]*userIdList:\s*(?:auth\w*\.)?userId/,
];

const singleGameRoutes = routeFiles(apiRoot)
    .filter((file) => readFileSync(file, "utf8").includes("GameDataModel.findOne"))
    .map((file) => path.relative(apiRoot, file));

describe("routes that fetch one game", () => {
    it("finds the routes to check", () => {
        // A sanity check on the walk itself: if this ever drops to nothing the
        // suite below would pass vacuously.
        expect(singleGameRoutes.length).toBeGreaterThanOrEqual(9);
        expect(singleGameRoutes).toContain(path.join("game", "[gameid]", "route.ts"));
    });

    it.each(singleGameRoutes)("%s establishes the caller is in the game", (relativePath) => {
        const source = readFileSync(path.join(apiRoot, relativePath), "utf8");

        const gated = MEMBERSHIP_GATES.some((pattern) => pattern.test(source));
        expect(gated, `${relativePath} fetches a game without establishing membership`).toBe(true);
    });
});
