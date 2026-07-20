import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Importing the barrel must register every @serializable class as a side
// effect (the decorator runs on module load). This test is the guard promised
// in ARCHITECTURE.md §6/§12: if a new game's logic module is added but never
// wired into the GameLogic barrel — or a command loses its @serializable
// decorator — its commands can't be rehydrated from `commandHistory`, and the
// command route / replay engine would silently fail to reconstruct them. The
// type checker can't catch that (it's a runtime registration), so we assert it.
import { registeredClassNames } from "../Serialisable";
import "../GameLogic";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

// Recursively collect every .ts file under src/, excluding test files.
function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...collectTsFiles(full));
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
            out.push(full);
        }
    }
    return out;
}

// Every class decorated with @serializable, discovered by scanning source so
// the test needs no hand-maintained list and can never drift out of date.
function discoverSerialisableClasses(): { name: string; file: string }[] {
    const pattern = /@serializable\s+export\s+class\s+(\w+)/g;
    const found: { name: string; file: string }[] = [];
    for (const file of collectTsFiles(srcRoot)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(pattern)) {
            found.push({ name: match[1], file: path.relative(srcRoot, file) });
        }
    }
    return found;
}

describe("serialisable registry", () => {
    const declared = discoverSerialisableClasses();

    it("finds the @serializable classes in source", () => {
        // Sanity check the scanner itself: if this ever hits zero the regex has
        // drifted and the rest of the suite would pass vacuously.
        expect(declared.length).toBeGreaterThan(0);
    });

    it("registers every @serializable class when the GameLogic barrel is imported", () => {
        const registered = new Set(registeredClassNames());
        const missing = declared.filter(({ name }) => !registered.has(name));
        expect(
            missing,
            `These @serializable classes are not registered after importing the ` +
                `GameLogic barrel. Add their module to the \`export *\` list in ` +
                `src/utils/apiModels/GameLogic.ts:\n` +
                missing.map((m) => `  - ${m.name} (${m.file})`).join("\n"),
        ).toEqual([]);
    });

    it("declares a unique className per @serializable class", () => {
        // Two classes registering under the same className would silently
        // shadow each other in the registry, so guard against collisions.
        const counts = new Map<string, number>();
        for (const { name } of declared) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
        expect(dupes, `Duplicate @serializable class names: ${dupes.join(", ")}`).toEqual([]);
    });

    it("wires every command/game-type class into the command route's registration array", () => {
        // ARCHITECTURE.md §6: the command route instantiates every command and
        // game-type class once so the registry is populated before an incoming
        // body is deserialised. A new class that isn't added there can't be
        // executed. Scan that file and assert each discovered class appears.
        const routeFile = path.join(srcRoot, "app/api/game/command/route.ts");
        const routeSource = readFileSync(routeFile, "utf8");
        const missing = declared.filter(({ name }) => !new RegExp(`\\b${name}\\b`).test(routeSource));
        expect(
            missing,
            `These @serializable classes are not referenced in ` +
                `src/app/api/game/command/route.ts (add them to the imports and ` +
                `the \`registration\` array):\n` +
                missing.map((m) => `  - ${m.name} (${m.file})`).join("\n"),
        ).toEqual([]);
    });
});
