import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { serializeOutcomeMaps } from "../gameCommand";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

describe("serializeOutcomeMaps", () => {
    it("turns a Map field into a plain object that actually survives JSON", () => {
        const outcome = {
            validMove: true,
            turnOver: false,
            moneyChanges: new Map([["u1", 3], ["u2", -3]]),
        };

        // Unconverted, this is exactly the bug: a native Map has no own
        // enumerable properties, so JSON.stringify sends it over as "{}".
        expect(JSON.parse(JSON.stringify(outcome)).moneyChanges).toEqual({});

        const serialized = serializeOutcomeMaps(outcome);

        expect(JSON.parse(JSON.stringify(serialized)).moneyChanges).toEqual({ u1: 3, u2: -3 });
    });

    it("leaves non-Map fields alone", () => {
        const outcome = { validMove: true, turnOver: true, roll1: 4, roll2: null };

        expect(serializeOutcomeMaps(outcome)).toEqual(outcome);
    });
});

// A source-scan guard, in the style of recordedRandomness.test.ts's route
// check: the command route is the one place an ICommandOutcome (Dice Cities'
// Map-carrying roll outcomes included) reaches the client, so this pins that
// both response-construction sites convert it before it's ever handed to
// NextResponse.json - a refactor that drops one would silently ship "{}"
// again for that response shape (the game-over branch and the ordinary one
// take different code paths after runCommand, so both need their own call).
describe("the command route", () => {
    const routeSource = readFileSync(
        path.join(srcRoot, "app/api/game/command/route.ts"),
        "utf8",
    );

    it("serializes the command outcome's Maps in every response it builds", () => {
        const calls = routeSource.match(/serializeOutcomeMaps\(commandOutcome\)/g) ?? [];
        expect(calls.length).toBe(2);
    });
});
