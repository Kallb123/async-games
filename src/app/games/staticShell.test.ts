import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every client game page should be served as a static shell (see
// staticShell.ts). Nothing breaks if a new game forgets its one-line layout —
// the route just quietly goes back to a function render per visit — so this is
// the only thing that notices.

const gamesRoot = path.dirname(fileURLToPath(import.meta.url));
const SHELL_LAYOUT = `export { default, generateStaticParams } from "../../staticShell";`;

/** Each `games/<game>/[id]/page.tsx` that is a client component. */
function clientGamePages(): string[] {
    return readdirSync(gamesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(game => readdirSync(path.join(gamesRoot, game.name), { withFileTypes: true })
            .filter(entry => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
            .map(segment => path.join(gamesRoot, game.name, segment.name)))
        .filter(dir => existsSync(path.join(dir, "page.tsx"))
            && /^\s*['"]use client['"]/.test(readFileSync(path.join(dir, "page.tsx"), "utf8")));
}

describe("game routes are static shells", () => {
    it("finds the client game pages", () => {
        expect(clientGamePages().length).toBeGreaterThan(10);
    });

    it("gives every client game page the shared static-shell layout", () => {
        const missing = clientGamePages().filter(dir => {
            const layout = path.join(dir, "layout.tsx");
            return !existsSync(layout) || readFileSync(layout, "utf8").trim() !== SHELL_LAYOUT;
        });
        expect(missing.map(dir => path.relative(gamesRoot, dir)),
            `Add a layout.tsx holding exactly\n  ${SHELL_LAYOUT}\nbeside each of these pages`).toEqual([]);
    });
});
