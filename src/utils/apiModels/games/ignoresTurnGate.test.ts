import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ignoresTurnGate } from "../GameLogic";
import type { IGameCommand } from "../gameCommand";
import { deserializeJSON, registeredClassNames } from "../Serialisable";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");
const gamesRoot = path.join(srcRoot, "games");

/** A command exactly as /api/game/command receives it: a request body, rehydrated. */
function posted(body: Record<string, unknown>): IGameCommand {
    return deserializeJSON(JSON.stringify({ gameId: "game", senderId: "player", ...body })) as IGameCommand;
}

describe("ignoresTurnGate", () => {
    it("is true for a command whose class declares the flag", () => {
        expect(ignoresTurnGate(posted({ className: "RaceCarsUndo" }))).toBe(true);
    });

    it("is false for a command whose class doesn't", () => {
        expect(ignoresTurnGate(posted({ className: "SACRollDice" }))).toBe(false);
    });

    // The reviver copies every posted property onto the instance it builds, so
    // a flag read off the instance was the request's to set: this body rolled
    // the dice on somebody else's turn.
    it("can't be claimed by a request body", () => {
        expect(ignoresTurnGate(posted({ className: "SACRollDice", ignoresTurnGate: true }))).toBe(false);
        expect(ignoresTurnGate(posted({ className: "OutbreakPlayEvent", ignoresTurnGate: true }))).toBe(false);
    });

    it("can't be switched off by a request body either", () => {
        expect(ignoresTurnGate(posted({ className: "RaceCarsUndo", ignoresTurnGate: false }))).toBe(true);
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

    // The scan above reads one spelling in one set of files. This asks every
    // registered class the way the route does, so a flag that arrives some
    // other way — inherited, a getter, a class outside a Logic file — is
    // caught too.
    it("are exactly these classes when the route asks", () => {
        const exempt = registeredClassNames().filter(className => ignoresTurnGate(posted({ className })));
        expect(exempt.sort()).toEqual([...IGNORES_TURN_GATE_COMMANDS].sort());
    });
});
