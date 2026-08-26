// The API route files, for the tests that check something about every route.
//
// Three of them had grown their own copy of this: the api root spelled three
// different ways, the route-file matcher spelled twice as a regex and once as
// an equality check (so one of them silently skipped a `route.tsx` the others
// caught), and "read each route's source and filter by a regex" written twice.
// Which is the same story walkFiles.ts was written for, one level up — so this
// is the one copy.
//
// Test-only. Nothing under src/app imports this.

import { readFileSync } from "node:fs";
import path from "node:path";

import { walkFiles } from "@/utils/testing/walkFiles";

export const API_ROOT = path.join(process.cwd(), "src", "app", "api");

/** Every route handler file under src/app/api. */
export function apiRouteFiles(): string[] {
    return walkFiles(API_ROOT, name => /^route\.tsx?$/.test(name));
}

/**
 * The route files whose source matches `pattern` — for the guards that apply to
 * the routes doing one particular thing (fetching a game, sharing the game-setup
 * prologue) rather than to all of them.
 */
export function apiRoutesMatchingSource(pattern: RegExp): string[] {
    return apiRouteFiles().filter(file => pattern.test(readFileSync(file, "utf8")));
}

/** The request path a route file serves, e.g. …/api/game/end/route.ts → /api/game/end. */
export function pathnameOf(routeFile: string): string {
    return `/api/${path.relative(API_ROOT, routeFile).split(path.sep).slice(0, -1).join("/")}`;
}
