import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildTimeline, getReplayAdapter, plannableCommands } from "@/utils/games/replay";
import {
    SmartthinkGameType,
    SmartthinkSetSecretCode,
    SmartthinkSubmitGuess,
    SnakesAndLaddersGameType,
    SnakesAndLaddersRequestDiceRoll,
} from "../GameLogic";
import { buildInitialSnakesAndLaddersState } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");

const SECRET = [0, 1, 2, 3];

// A two-player Smartthink game whose secret code was set by a real command, so
// replay restores it exactly the way the live game does.
function makeSmartthinkGame(): IGameData {
    const setCode = new SmartthinkSetSecretCode();
    setCode.senderId = "codemaker";
    setCode.senderUsername = "Codemaker";
    setCode.secretCode = SECRET;

    return {
        gameId: "game-1",
        gameType: new SmartthinkGameType(),
        userIdList: ["codemaker", "codebreaker"],
        currentTurn: "codebreaker",
        gameState: {
            turnOrder: ["codemaker", "codebreaker"],
            history: [],
            commandHistory: [setCode],
        },
        complete: false,
        winner: "",
        specificGameState: {
            secretCode: SECRET,
            guessRows: [],
            secretCodeSet: true,
            codeSetterId: "codemaker",
            codeSetterUsername: "Codemaker",
            codeBreakerId: "codebreaker",
            codeBreakerUsername: "Codebreaker",
            maxGuesses: 10,
        },
        markModified: () => {},
    } as unknown as IGameData;
}

const NAMES = { codemaker: "Codemaker", codebreaker: "Codebreaker" };

function makeSnakesAndLaddersGame(): IGameData {
    return {
        gameId: "game-2",
        gameType: new SnakesAndLaddersGameType(),
        userIdList: ["player-1"],
        currentTurn: "player-1",
        gameState: { turnOrder: ["player-1"], history: [], commandHistory: [] },
        complete: false,
        winner: "",
        specificGameState: buildInitialSnakesAndLaddersState(["player-1"], false),
        markModified: () => {},
    } as unknown as IGameData;
}

describe("plannableCommands", () => {
    it("lets Snakes & Ladders plan its dice roll", () => {
        expect(plannableCommands("SnakesAndLaddersGameType")).toEqual([
            "SnakesAndLaddersRequestDiceRoll",
        ]);
    });

    // Default deny: a game only plans what it has explicitly opted into, so the
    // failure mode of adding a game is "planning doesn't work yet", never
    // "planning quietly resolves against hidden state".
    it.each([
        "DiceCitiesGameType",
        "SettlementsAndCitiesGameType",
        "SmartthinkGameType",
        "TrainTimeGameType",
        "WorldDominationGameType",
    ])("plans nothing in %s until its planning UI opts in", (className) => {
        expect(getReplayAdapter(className)).toBeDefined();
        expect(plannableCommands(className)).toEqual([]);
    });

    it("plans nothing for a game with no replay adapter at all", () => {
        expect(getReplayAdapter("SolitaireGameType")).toBeUndefined();
        expect(plannableCommands("SolitaireGameType")).toEqual([]);
    });
});

// The reason the allowlist exists. Planning replays hypothetical commands
// against the real reconstructed state, so a command left off the list would
// answer a question the live game is keeping from the planner. This pins that
// behaviour on the sharpest case rather than trusting the prose: Smartthink's
// guess is scored against the real secret code, so an unfiltered plan is an
// oracle that solves the game.
describe("the replay engine, unfiltered", () => {
    it("scores a planned Smartthink guess against the real secret code", async () => {
        const guess = new SmartthinkSubmitGuess();
        guess.senderId = "codebreaker";
        guess.senderUsername = "Codebreaker";
        guess.guess = [...SECRET];

        const timeline = await buildTimeline(makeSmartthinkGame(), NAMES, [guess], undefined, "codebreaker");

        const planned = timeline.snapshots.filter((snapshot) => snapshot.planned);
        expect(planned).toHaveLength(1);
        const state = planned[0].specificGameState as ISmartthinkGameStateResponse;
        // Four black pegs: the engine happily confirms an exact match on a move
        // that was never played. Hence Smartthink's empty allowlist.
        expect(state.guessRows.at(-1)).toMatchObject({ black: 4, white: 0 });
    });

    it("is not reached for a command the game doesn't allow, because the route filters first", () => {
        const guess = new SmartthinkSubmitGuess();

        expect(plannableCommands("SmartthinkGameType")).not.toContain(guess.className);
    });

    // The other side of the guard: the one game that does ship planning still
    // plans. An allowlist that quietly turned Snakes & Ladders off would pass
    // every test above.
    it("still plans a Snakes & Ladders roll, the one game that allows one", async () => {
        const roll = new SnakesAndLaddersRequestDiceRoll();
        roll.senderId = "player-1";
        roll.senderUsername = "Player One";

        expect(plannableCommands("SnakesAndLaddersGameType")).toContain(roll.className);

        const timeline = await buildTimeline(
            makeSnakesAndLaddersGame(),
            { "player-1": "Player One" },
            [roll],
            undefined,
            "player-1",
        );

        const planned = timeline.snapshots.filter((snapshot) => snapshot.planned);
        expect(planned).toHaveLength(1);
        expect(timeline.resolvedPlannedCommands).toHaveLength(1);
    });
});

// A source scan for the same reason as the recorded-randomness guard: the route
// is the only place planned commands are filtered, and dropping the check
// re-opens every game's hidden state at once without breaking a single
// per-game test.
describe("the timeline route", () => {
    const routeSource = readFileSync(
        path.join(srcRoot, "app/api/game/[gameid]/timeline/route.ts"),
        "utf8",
    );

    it("rejects planned commands the game doesn't allow, before replaying them", () => {
        // Anchored to the start of a line so a commented-out check can't satisfy
        // the guard.
        const check = /^[ \t]*const plannable = plannableCommands\(/m.exec(routeSource);
        const build = /^[ \t]*(?:const .*= )?await buildTimeline\(/m.exec(routeSource);

        expect(check).not.toBeNull();
        expect(build).not.toBeNull();
        expect(check!.index).toBeLessThan(build!.index);
        expect(routeSource).toMatch(/status:\s*400/);
    });
});
