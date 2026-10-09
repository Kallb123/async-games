import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isClientModule } from "@/utils/testing/moduleGraph";
import { walkFiles } from "@/utils/testing/walkFiles";

// The bargain in staticShell.ts, both halves of it. Every client game page is
// served as a static shell: nothing breaks if a new game forgets its one-line
// layout — the route just quietly goes back to a function render per visit —
// so this is the only thing that notices. And the shell only ever wraps a
// client page: one rendered on the server could read the viewer or the game,
// and the cached result would be served to everyone.

const gamesRoot = path.dirname(fileURLToPath(import.meta.url));
const SHELL_LAYOUT = `export { default, generateStaticParams } from "../../staticShell";`;

/** Each `games/<game>/[id]` folder, with whether its page is a client component and whether it wears the shell. */
const routes = walkFiles(gamesRoot, name => name === "page.tsx")
    .map(page => path.dirname(page))
    .filter(dir => /^\[.+\]$/.test(path.basename(dir)))
    .map(dir => {
        const layout = path.join(dir, "layout.tsx");
        return {
            route: path.relative(gamesRoot, dir),
            client: isClientModule(path.join(dir, "page.tsx")),
            shell: existsSync(layout) && readFileSync(layout, "utf8").trim() === SHELL_LAYOUT,
        };
    });

describe("game routes are static shells", () => {
    it("finds the client game pages", () => {
        expect(routes.filter(({ client }) => client).length).toBeGreaterThan(10);
    });

    it("gives every client game page the shared static-shell layout", () => {
        expect(routes.filter(({ client, shell }) => client && !shell).map(({ route }) => route),
            `Add a layout.tsx holding exactly\n  ${SHELL_LAYOUT}\nbeside each of these pages`).toEqual([]);
    });

    it("never puts the shell around a page rendered on the server", () => {
        expect(routes.filter(({ client, shell }) => shell && !client).map(({ route }) => route),
            "These pages aren't 'use client', so their cached shell could carry one viewer's data to everyone").toEqual([]);
    });
});
