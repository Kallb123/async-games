import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reachableFrom, resolveImport, runtimeImports, SRC_ROOT } from "@/utils/testing/moduleGraph";

// Two guards stand on this walker (serverModuleGraph.test.ts and
// achievements.test.ts), and a walker that quietly stops following something
// turns both into tests that pass because they can no longer see. So it gets a
// small graph of its own to walk: one file of each shape of import, in a
// scratch folder, so nothing here depends on what the real tree looks like
// this month.

const root = mkdtempSync(path.join(tmpdir(), "module-graph-"));
const at = (...parts: string[]) => path.join(root, ...parts);

function write(file: string, source: string) {
    mkdirSync(path.dirname(at(file)), { recursive: true });
    writeFileSync(at(file), source);
}

beforeAll(() => {
    write("game/entry.ts", [
        `import { a } from "./a";`,
        `import type { Erased } from "./typesOnly";`,
        `import {`,
        `    shared,`,
        `    other,`,
        `} from "../shared/util";`,
        `import { barrelled } from "./barrel";`,
        `import mongoose from "mongoose";`,
        `import { auth } from "@clerk/nextjs/server";`,
        `import { walkFiles } from "@/utils/testing/walkFiles";`,
        `import "./sideEffect";`,
        `export { reexported } from "./reexported";`,
        `export * from "./starred";`,
        `export type { Erased as AlsoErased } from "./typesOnly";`,
        ``,
    ].join("\n"));
    // Two hops down, and back up again: the chain has to name both hops, and a
    // cycle has to end.
    write("game/a.ts", `import { c } from "./deeper/c";\nexport const a = c;\n`);
    write("game/deeper/c.ts", `import { a } from "../a";\nexport const c = a;\n`);
    write("game/barrel/index.ts", `export const barrelled = 1;\n`);
    write("game/typesOnly.ts", `export interface Erased {}\n`);
    write("game/sideEffect.ts", `export {};\n`);
    write("game/reexported.ts", `export const reexported = 1;\n`);
    write("game/starred.ts", `export const starred = 1;\n`);
    write("shared/util.ts", `export const shared = 1, other = 2;\n`);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("runtimeImports", () => {
    it("lists every specifier that survives compilation, in source order", () => {
        expect(runtimeImports(at("game/entry.ts"))).toEqual([
            "./a",
            "../shared/util",
            "./barrel",
            "mongoose",
            "@clerk/nextjs/server",
            "@/utils/testing/walkFiles",
            "./sideEffect",
            "./reexported",
            "./starred",
        ]);
    });

    it("skips what the compiler erases", () => {
        const specifiers = runtimeImports(at("game/entry.ts"));
        expect(specifiers).not.toContain("./typesOnly");
    });
});

describe("resolveImport", () => {
    it("resolves a relative specifier against the importing file's folder", () => {
        expect(resolveImport("./a", at("game/entry.ts"))).toBe(at("game/a.ts"));
        expect(resolveImport("../shared/util", at("game/entry.ts"))).toBe(at("shared/util.ts"));
        expect(resolveImport("../a", at("game/deeper/c.ts"))).toBe(at("game/a.ts"));
    });

    it("resolves a folder to its index file", () => {
        expect(resolveImport("./barrel", at("game/entry.ts"))).toBe(at("game/barrel/index.ts"));
    });

    it("resolves @/ against src, whoever is asking", () => {
        expect(resolveImport("@/utils/testing/walkFiles", at("game/entry.ts")))
            .toBe(path.join(SRC_ROOT, "utils/testing/walkFiles.ts"));
    });

    it("leaves a package, and a file that isn't there, unresolved", () => {
        expect(resolveImport("mongoose", at("game/entry.ts"))).toBeUndefined();
        expect(resolveImport("@clerk/nextjs/server", at("game/entry.ts"))).toBeUndefined();
        expect(resolveImport("./nowhere", at("game/entry.ts"))).toBeUndefined();
    });
});

describe("reachableFrom", () => {
    const reached = () => reachableFrom(at("game/entry.ts"));

    it("follows relative, aliased, side-effect and re-exported imports", () => {
        expect([...reached().keys()].sort()).toEqual([
            at("game/a.ts"),
            at("game/barrel/index.ts"),
            at("game/deeper/c.ts"),
            at("game/entry.ts"),
            at("game/reexported.ts"),
            at("game/sideEffect.ts"),
            at("game/starred.ts"),
            at("shared/util.ts"),
            path.join(SRC_ROOT, "utils/testing/walkFiles.ts"),
        ].sort());
    });

    it("never enters a type-only import", () => {
        expect(reached().has(at("game/typesOnly.ts"))).toBe(false);
    });

    it("names the hop each file was reached through, and ends on a cycle", () => {
        expect(reached().get(at("game/deeper/c.ts"))).toEqual([
            at("game/entry.ts"),
            at("game/a.ts"),
            at("game/deeper/c.ts"),
        ]);
    });
});
