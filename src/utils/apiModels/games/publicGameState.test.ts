import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { publicGameState } from "@/utils/mongodb/GameData";
import type { IGameState } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "../GameLogic";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

// Every file that implements a CreateDataResponse: the generic one plus one
// discriminator per game. Games are listed explicitly rather than globbed so
// that adding a game without adding it here is a failure, not a silent pass.
const RESPONSE_BUILDERS = [
    "utils/mongodb/GameData.ts",
    "games/DiceCities/DiceCitiesModels.ts",
    "games/Outbreak/OutbreakModels.ts",
    "games/SettlementsAndCities/SettlementsAndCitiesModels.ts",
    "games/Smartthink/SmartthinkModels.ts",
    "games/SnakesAndLadders/SnakesAndLaddersModels.ts",
    "games/Solitaire/SolitaireModels.ts",
    "games/TrainTime/TrainTimeModels.ts",
    "games/WorldDomination/WorldDominationModels.ts",
];

function makeGameState(): IGameState {
    return {
        turnOrder: ["user-1", "user-2"],
        history: [{ text: "{{user-1}} rolled a 6", actorId: "user-1" }],
        // Stands in for the real thing: a command carrying a field its game
        // means to keep private (Smartthink's secret code, Train Time's kept
        // ticket ids, SAC's robber RNG).
        commandHistory: [{ className: "SecretBearingCommand", secretCode: [3, 1, 4, 1] } as unknown as IGameCommand],
    };
}

const NAMES = { "user-1": "Alice", "user-2": "Bob" };

describe("publicGameState", () => {
    it("drops commandHistory and keeps the public fields", () => {
        const state = makeGameState();

        const result = publicGameState(state, NAMES);

        expect(result.turnOrder).toEqual(["user-1", "user-2"]);
        expect("commandHistory" in result).toBe(false);
        // The whole point is what a client can read off the wire, so assert on
        // the serialised form too — an own-property check alone would miss a
        // regression that reintroduced the field via a spread.
        expect(JSON.stringify(result)).not.toContain("secretCode");
    });

    it("resolves the player tokens in the history it sends", () => {
        const state = makeGameState();

        const result = publicGameState(state, NAMES);

        expect(result.history).toEqual([{ text: "Alice rolled a 6", actorId: "user-1" }]);
    });

    it("names a player it cannot resolve rather than shipping their id", () => {
        const state = makeGameState();
        state.history = [{ text: "{{user-gone}} rolled a 6" }];

        const result = publicGameState(state, NAMES);

        expect(result.history).toEqual([{ text: "Unknown player rolled a 6" }]);
    });
});

// A source scan rather than a per-game assertion, for the same reason as the
// recorded-randomness guard: `gameState: doc.gameState` type-checks against
// IGameDataResponse (excess-property checks don't apply to a whole-object
// assignment, nor to spread properties), so a game that skips publicGameState
// ships its entire commandHistory to every player and nothing else notices.
describe("every CreateDataResponse", () => {
    it.each(RESPONSE_BUILDERS)("builds %s's gameState through publicGameState", (relativePath) => {
        const source = readFileSync(path.join(srcRoot, relativePath), "utf8");

        const body = /CreateDataResponse\s*=\s*async function[\s\S]*?\n};/.exec(source);
        expect(body, `no CreateDataResponse found in ${relativePath}`).not.toBeNull();

        // Anchored to the start of a line so a commented-out assignment can't
        // satisfy the guard.
        const assignment = /^[ \t]*gameState:[ \t]*(.*)$/m.exec(body![0]);
        expect(assignment, `no gameState assignment found in ${relativePath}`).not.toBeNull();
        expect(assignment![1]).toMatch(/^publicGameState\(/);
    });

    // The other half of the same hole. IGameDataDocument declares
    // CreateDataResponse as taking a viewerId, but a function with fewer
    // parameters is assignable to one with more — so an implementation that
    // just writes `async function()` type-checks and silently builds the
    // everybody-sees-everything view. Hands, tickets and dev cards depend on
    // this argument arriving, so require it in the signature: a game that
    // genuinely ignores its viewer names the parameter `_viewerId` and says so.
    it.each(RESPONSE_BUILDERS)("declares %s's CreateDataResponse with a viewer", (relativePath) => {
        const source = readFileSync(path.join(srcRoot, relativePath), "utf8");

        const signature = /CreateDataResponse\s*=\s*async function\s*\(([^)]*)\)/.exec(source);
        expect(signature, `no CreateDataResponse found in ${relativePath}`).not.toBeNull();
        expect(signature![1]).toMatch(/^_?viewerId:/);
    });
});
