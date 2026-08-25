import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { walkFiles } from "@/utils/testing/walkFiles";

// Importing the barrel must register every @serializable class as a side
// effect (the decorator runs on module load). This test is the guard promised
// in ARCHITECTURE.md §6/§12: if a new game's logic module is added but never
// wired into the GameLogic barrel — or a command loses its @serializable
// decorator — its commands can't be rehydrated from `commandHistory`, and the
// command route / replay engine would silently fail to reconstruct them. The
// type checker can't catch that (it's a runtime registration), so we assert it.
import { registeredClassNames } from "../Serialisable";
import { allRegisteredCommandClassNames, registeredGameTypeClassNames } from "@/utils/games/gameCommands";
import "../GameLogic";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

// Every class decorated with @serializable, discovered by scanning source so
// the test needs no hand-maintained list and can never drift out of date.
function discoverSerialisableClasses(): { name: string; file: string }[] {
    const pattern = /@serializable\s+export\s+class\s+(\w+)/g;
    const found: { name: string; file: string }[] = [];
    for (const file of walkFiles(srcRoot, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
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

    it("assigns every command and game type to a game in the command registry", () => {
        // Replaces the old "is it named in the command route's registration
        // array?" check. That array listed every class without saying which
        // game each belonged to; COMMANDS_BY_GAME_TYPE says exactly that, and
        // the command route refuses a command a game doesn't claim. A class
        // missing here is a command nobody can run.
        const gameTypes = new Set(registeredGameTypeClassNames());
        const commands = allRegisteredCommandClassNames();
        const commandSet = new Set(commands);

        const missing = declared.filter(({ name }) => !gameTypes.has(name) && !commandSet.has(name));
        expect(
            missing,
            `These @serializable classes are in no game's entry in ` +
                `src/utils/games/gameCommands.ts. A game type belongs as a key, ` +
                `a command in its game's list:\n` +
                missing.map((m) => `  - ${m.name} (${m.file})`).join("\n"),
        ).toEqual([]);

        // A command listed under two games would let either game run it.
        const dupes = commands.filter((name, i) => commands.indexOf(name) !== i);
        expect(dupes, `Commands listed under more than one game: ${dupes.join(", ")}`).toEqual([]);

        // And nothing listed that no longer exists.
        const declaredNames = new Set(declared.map(({ name }) => name));
        const unknown = [...gameTypes, ...commands].filter((name) => !declaredNames.has(name));
        expect(unknown, `Listed in gameCommands.ts but not a @serializable class: ${unknown.join(", ")}`).toEqual([]);
    });
});
