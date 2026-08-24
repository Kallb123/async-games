// Recursively list files under a directory, for the source-scan guard tests.
//
// Those tests discover what they check by walking the tree rather than by
// hand-maintained list, so a file added tomorrow is covered without anyone
// remembering to register it — which is the whole point of them. Three of them
// had grown their own copy of this walk; this is the one copy.
//
// Test-only. Nothing under src/app imports this.

import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Every file under `dir`, recursively, that `matches`.
 *
 * @param matches Tested against the file's basename, so callers filter by
 *                extension or exact filename without parsing paths.
 */
export function walkFiles(dir: string, matches: (basename: string) => boolean): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkFiles(full, matches);
        return matches(entry.name) ? [full] : [];
    });
}
