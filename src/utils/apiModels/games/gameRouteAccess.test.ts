import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { API_ROOT, apiRoutesMatchingSource } from "@/utils/testing/apiRoutes";

// Every route that pulls one specific game out of Mongo has to establish that
// the caller is actually in it. GET /api/game/[gameid] — the route that returns
// the whole game — was the one that didn't: it authenticated the caller and
// then handed the game to anyone holding its id, while all five of its siblings
// checked. Game ids are v4 UUIDs, so nothing was enumerable, but they travel in
// push-notification links and shareable URLs.
//
// Discovered by walking the tree rather than listed by hand, so a route added
// tomorrow is covered without anyone remembering to add it here.

// The four ways a route legitimately establishes it may touch the game it
// fetched:
//
//  - the explicit membership check the sibling routes use;
//  - a stronger gate on it being the caller's turn, which can only be true of
//    a player (command and taketurn);
//  - scoping the query itself to the caller's games, so a non-player's fetch
//    comes back empty (the lobby's "what game did we become?" lookup);
//  - proving the caller is the scheduler rather than a player at all, which is
//    the turn-timer cron: it acts on games nobody asked it about, on behalf of
//    no user, and isAuthorisedCron is the only thing that may let it (see
//    finding 11 in docs/robustness-review.md — that check used to fail open).
const MEMBERSHIP_GATES = [
    /userIdList\.includes\(\s*(?:auth\w*\.)?userId\s*\)/,
    /currentTurn\s*!==?=\s*(?:auth\w*\.)?userId|(?:auth\w*\.)?userId\s*!==?=\s*\w*\.currentTurn/,
    /findOne\(\s*\{[^}]*userIdList:\s*(?:auth\w*\.)?userId/,
    /isAuthorisedCron\(/,
];

// Both ways a route gets hold of one game: its own query, or the shared
// requireLiveGame() guard (which does the same findOne, plus "does it exist"
// and "is it still being played"). A route using the helper still has to
// establish membership itself — the helper knows nothing about the caller.
const singleGameRoutes = apiRoutesMatchingSource(/GameDataModel\.findOne|requireLiveGame\(/)
    .map((file) => path.relative(API_ROOT, file));

describe("routes that fetch one game", () => {
    it("finds the routes to check", () => {
        // A sanity check on the walk itself: if this ever drops to nothing the
        // suite below would pass vacuously.
        expect(singleGameRoutes.length).toBeGreaterThanOrEqual(9);
        expect(singleGameRoutes).toContain(path.join("game", "[gameid]", "route.ts"));
    });

    it.each(singleGameRoutes)("%s establishes the caller is in the game", (relativePath) => {
        const source = readFileSync(path.join(API_ROOT, relativePath), "utf8");

        const gated = MEMBERSHIP_GATES.some((pattern) => pattern.test(source));
        expect(gated, `${relativePath} fetches a game without establishing membership`).toBe(true);
    });
});
