import { describe, expect, it } from "vitest";
import { computePerTurnEvents, computePerTurnStat, registerReplayAdapter } from "./replay";
import { countTurns } from "./turnCount";
import { serializable } from "../apiModels/Serialisable";
import type { ICommandOutcome, IGameCommand, IGameType } from "../apiModels/gameCommand";
import type { IGameData } from "../mongodb/GameData";
import type { uuidString } from "../apiModels/GameDataApi";

// A minimal synthetic game whose only rule is the one this suite is testing:
// a command can report `turnOver: true` without the turn actually passing to
// another player - Dice Cities' Amusement Park (roll doubles, go again) does
// exactly this, holding the seat instead of advancing it. Kept game-agnostic
// so the fix is proven at the engine level rather than tangled up in Dice
// Cities' currency and card costs.
interface ITestGameState {
    scores: Record<string, number>;
    // Mirrors Dice Cities' `awaitingDoubleReroll`: set by a command that grants
    // the same player another go, cleared the moment that bonus is spent.
    bonusPending: boolean;
}

@serializable
class TestBonusTurnGameType implements IGameType {
    gameType = "TestBonusTurnGame";
    friendlyName = "Test Bonus Turn Game";
    icon = "";
    url = "testbonusturngame";
    readonly className = "TestBonusTurnGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome) {
        const state = (gameData as unknown as { specificGameState: ITestGameState }).specificGameState;
        if (state.bonusPending && commandOutcome.turnOver) {
            state.bonusPending = false;
            return;
        }
        if (commandOutcome.turnOver) {
            const order = gameData.gameState.turnOrder;
            const currentIndex = order.findIndex(id => id === gameData.currentTurn);
            gameData.currentTurn = order[(currentIndex + 1) % order.length];
        }
    }

    CheckGameOver() {
        return false;
    }
}

@serializable
class TestBonusAction implements IGameCommand {
    id = "id" as uuidString;
    timestamp = "2026-07-21T09:00:00.000Z";
    gameId = "g1" as uuidString;
    senderId = "Unknown";
    senderUsername = "Unknown";
    // Grants the sender another go instead of ending their turn - Amusement
    // Park's doubles bonus, stripped to its essence.
    triggerBonus = false;
    readonly className = "TestBonusAction";

    myString() {
        return "TestBonusAction";
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const state = (gameData as unknown as { specificGameState: ITestGameState }).specificGameState;
        state.scores[this.senderId] = (state.scores[this.senderId] ?? 0) + 1;
        if (this.triggerBonus) {
            state.bonusPending = true;
        }
        return { validMove: true, turnOver: true };
    }

    Undo() {}
}

registerReplayAdapter({
    className: "TestBonusTurnGameType",
    buildInitialSpecificGameState: (gameData) => ({
        scores: Object.fromEntries(gameData.userIdList.map(id => [id, 0])),
        bonusPending: false,
    }),
    // A fresh object per snapshot, not the live mutable state - same as every
    // real game's toResponseState (e.g. diceCitiesStateToModel), and needed
    // here so an earlier snapshot isn't silently rewritten by a later command
    // mutating the one shared object.
    toResponseState: (specificGameState) => {
        const state = specificGameState as ITestGameState;
        return { scores: { ...state.scores }, bonusPending: state.bonusPending };
    },
    plannableCommands: [],
});

function action(senderId: string, triggerBonus = false): TestBonusAction {
    const command = new TestBonusAction();
    command.senderId = senderId;
    command.senderUsername = senderId;
    command.triggerBonus = triggerBonus;
    return command;
}

function game(commandHistory: IGameCommand[]): IGameData {
    return {
        gameId: "g1",
        gameType: new TestBonusTurnGameType(),
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u1",
        lastTurnTimestamp: "2026-07-21T09:00:00.000Z",
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory },
        complete: false,
        winner: "",
    } as unknown as IGameData;
}

describe("computePerTurnStat", () => {
    it("charts one point per real turn, not one per turnOver command", async () => {
        // u1's roll-doubles bonus keeps the seat for a second action before the
        // turn actually passes: four commands, but only three real turns (u1's
        // two actions are one turn, then u2, then u1 again).
        const commandHistory = [
            action("u1", true),  // bonus: turn stays with u1
            action("u1", false), // ends u1's (first) turn for real
            action("u2", false), // ends u2's turn
            action("u1", false), // u1's next turn
        ];

        const perTurn = await computePerTurnStat<ITestGameState>(
            game(commandHistory),
            (state, userId) => state.scores[userId],
        );

        expect(perTurn).toHaveLength(countTurns(commandHistory));
        expect(perTurn).toHaveLength(3);
        expect([...perTurn[0].entries()]).toEqual([["u1", 2], ["u2", 0]]);
        expect([...perTurn[1].entries()]).toEqual([["u1", 2], ["u2", 1]]);
        expect([...perTurn[2].entries()]).toEqual([["u1", 3], ["u2", 1]]);
    });

    it("plots one point for a single command", async () => {
        const commandHistory = [action("u1", false)];

        const perTurn = await computePerTurnStat<ITestGameState>(
            game(commandHistory),
            (state, userId) => state.scores[userId],
        );

        expect(perTurn).toHaveLength(1);
        expect([...perTurn[0].entries()]).toEqual([["u1", 1], ["u2", 0]]);
    });

    it("plots nothing for a game with no history", async () => {
        const perTurn = await computePerTurnStat<ITestGameState>(
            game([]),
            (state, userId) => state.scores[userId],
        );

        expect(perTurn).toEqual([]);
    });
});

describe("computePerTurnEvents", () => {
    it("tags an event with the turn it happened in, not the command", async () => {
        // Same four-command history as computePerTurnStat's test above: only
        // the first command triggers the bonus, and it's part of u1's first
        // turn (turn 0) even though that turn spans two commands.
        const commandHistory = [
            action("u1", true),  // bonus: turn stays with u1
            action("u1", false), // ends u1's (first) turn for real
            action("u2", false), // ends u2's turn
            action("u1", false), // u1's next turn
        ];

        const events = await computePerTurnEvents(game(commandHistory), (step) =>
            (step.command as TestBonusAction).triggerBonus ? [{ glyph: "🎁" }] : undefined,
        );

        expect(events).toEqual([{ turnIndex: 0, glyph: "🎁" }]);
    });

    it("records more than one event for the same turn", async () => {
        // u1's bonus keeps both commands on turn 0; u2's is turn 1. Every
        // command reports an event here, so turn 0 should carry two.
        const commandHistory = [
            action("u1", true),
            action("u1", false),
            action("u2", false),
        ];

        const events = await computePerTurnEvents(game(commandHistory), () => [{ glyph: "*" }]);

        expect(events).toEqual([
            { turnIndex: 0, glyph: "*" },
            { turnIndex: 0, glyph: "*" },
            { turnIndex: 1, glyph: "*" },
        ]);
    });

    it("records nothing when detect finds nothing", async () => {
        const events = await computePerTurnEvents(game([action("u1", false)]), () => undefined);
        expect(events).toEqual([]);
    });
});
