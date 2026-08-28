import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stripRecordedRandomness } from "../gameCommand";
import { SnakesAndLaddersRequestDiceRoll } from "../GameLogic";
import { buildInitialSnakesAndLaddersState } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import type { IGameData } from "@/utils/mongodb/GameData";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

// A minimal IGameData-shaped object, in the style of the per-game logic tests:
// no Mongo, no Clerk, just enough state for one Execute.
function makeSnakesAndLaddersGame(userId: string): IGameData {
    return {
        currentTurn: userId,
        userIdList: [userId],
        gameState: { turnOrder: [userId], history: [], commandHistory: [] },
        specificGameState: buildInitialSnakesAndLaddersState([userId], false),
        markModified: () => {},
    } as unknown as IGameData;
}

describe("stripRecordedRandomness", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("removes recorded RNG fields and leaves the rest of the command intact", () => {
        const command = new SnakesAndLaddersRequestDiceRoll();
        command.senderId = "user-1";
        command.gameId = "game-1" as typeof command.gameId;
        command.recordedRoll = 6;

        stripRecordedRandomness(command);

        expect(command.recordedRoll).toBeUndefined();
        expect("recordedRoll" in command).toBe(false);
        expect(command.senderId).toBe("user-1");
        expect(command.gameId).toBe("game-1");
        expect(command.className).toBe("SnakesAndLaddersRequestDiceRoll");
    });

    // The reason the strip exists: Execute deliberately prefers a recorded
    // value so replay is deterministic. That is correct for replay and unsafe
    // for a live request, so this pins the behaviour the strip is protecting.
    it("Execute honours a recorded roll when one is present", async () => {
        const command = new SnakesAndLaddersRequestDiceRoll();
        command.senderId = "user-1";
        command.recordedRoll = 6;

        const gameData = makeSnakesAndLaddersGame("user-1");
        await command.Execute(gameData);

        expect(command.recordedRoll).toBe(6);
    });

    it("Execute rolls fresh once the recorded value has been stripped", async () => {
        const command = new SnakesAndLaddersRequestDiceRoll();
        command.senderId = "user-1";
        command.recordedRoll = 6;

        stripRecordedRandomness(command);
        // 0.0 -> 1 + floor(0 * 6) = 1, so a fresh roll is distinguishable from
        // the 6 the caller tried to supply.
        vi.spyOn(Math, "random").mockReturnValue(0);
        const gameData = makeSnakesAndLaddersGame("user-1");
        await command.Execute(gameData);

        expect(command.recordedRoll).toBe(1);
    });
});

// A source-scan guard rather than an assertion about one game: the command
// route is the only client-facing entry to runCommand (src/utils/games/
// commandPipeline.ts), which is what actually calls Execute — shared with
// buildTimeline() and the turn-timer cron's resolveStalledTurn, neither of
// which is client-facing and so neither of which strips. So if a refactor
// drops the strip before that call, every game's recorded RNG becomes
// client-suppliable at once and no per-game test would notice.
describe("the command route", () => {
    const routeSource = readFileSync(
        path.join(srcRoot, "app/api/game/command/route.ts"),
        "utf8",
    );

    it("strips recorded randomness before running the command", () => {
        // Anchored to the start of a line so a commented-out call doesn't
        // satisfy the guard.
        const strip = /^[ \t]*stripRecordedRandomness\(commandRequest\);/m.exec(routeSource);
        const run = /^[ \t]*(?:const .*= )?await runCommand\(/m.exec(routeSource);

        expect(strip).not.toBeNull();
        expect(run).not.toBeNull();
        expect(strip!.index).toBeLessThan(run!.index);
    });
});
