import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ignoresTurnGate } from "../gameCommand";
import type { IGameCommand } from "../gameCommand";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");
const gamesRoot = path.join(srcRoot, "games");

describe("ignoresTurnGate", () => {
    it("is true only for a command declaring the flag", () => {
        expect(ignoresTurnGate({ ignoresTurnGate: true } as unknown as IGameCommand)).toBe(true);
        expect(ignoresTurnGate({} as unknown as IGameCommand)).toBe(false);
        expect(ignoresTurnGate({ ignoresTurnGate: false } as unknown as IGameCommand)).toBe(false);
        // A truthy-but-not-`true` value doesn't count, the same way a real
        // command's own field initialiser (`readonly ignoresTurnGate = true`)
        // never carries anything else.
        expect(ignoresTurnGate({ ignoresTurnGate: "true" } as unknown as IGameCommand)).toBe(false);
    });
});

// A source scan across every `<Game>Logic.ts`, the same trade
// serializableRegistry.test.ts and each game's own undoable guard make: a
// command that starts declaring `ignoresTurnGate` is caught here even if
// nobody remembered to add a test for it, because the list below has to be
// updated by hand to match.
//
// The point isn't the list — it's that /api/game/command's own "is it your
// turn" gate (docs/undo.md, "The second game: Race Cars") is the only
// membership-adjacent check most commands get, so a command opting out of it
// is trusted to run its own equivalent inside Execute. RaceCarsUndo's is the
// anchor-and-ownership check docs/undo.md describes — refuses unless nothing
// has run since the sender's own last undoable move. A reviewer adding a
// second command to this list should be looking for the same shape: a check
// that could not be satisfied by a stranger, or by a participant who isn't
// the one the command is meant to act for, however it phrases it.
const IGNORES_TURN_GATE_COMMANDS = ["RaceCarsUndo"];

function classesDeclaringIgnoresTurnGate(): string[] {
    const found: string[] = [];
    for (const gameDir of readdirSync(gamesRoot, { withFileTypes: true })) {
        if (!gameDir.isDirectory()) continue;
        const logicFile = path.join(gamesRoot, gameDir.name, `${gameDir.name}Logic.ts`);
        let source: string;
        try {
            source = readFileSync(logicFile, "utf8");
        } catch {
            continue;
        }
        for (const match of source.matchAll(/readonly className = '(\w+)';([\s\S]*?)myString\(/g)) {
            if (/readonly ignoresTurnGate = true/.test(match[2])) found.push(match[1]);
        }
    }
    return found;
}

describe("commands that opt out of /api/game/command's turn gate", () => {
    it("are declared on exactly these classes, and no others", () => {
        expect(classesDeclaringIgnoresTurnGate().sort()).toEqual([...IGNORES_TURN_GATE_COMMANDS].sort());
    });
});
