import { describe, expect, it } from "vitest";
import { buildTimeline, computePerTurnEvents, computePerTurnStat, getReplayAdapter, keepSnapshots, registerReplayAdapter, type ITurnSnapshot } from "./replay";
import { countTurns } from "./turnCount";
import { serializable } from "../apiModels/Serialisable";
import type { ICommandOutcome, IGameCommand, IGameType } from "../apiModels/gameCommand";
import { commandVersion, UNVERSIONED_COMMAND } from "../apiModels/gameCommand";
import { FIRST_COMMAND_VERSION } from "../ui/games";
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
    readonly className: string = "TestBonusTurnGameType";

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
    readonly className: string = "TestBonusAction";

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
}

// A card played on somebody else's turn (docs/out-of-turn-actions.md): it
// scores for its sender and never ends a turn — the pipeline refuses one that
// tries. `executedOutOfTurn` is what Execute saw, by the test §5.3 gives it.
@serializable
class TestInterruptAction implements IGameCommand {
    id = "interrupt" as uuidString;
    timestamp = "2026-07-21T09:00:00.000Z";
    gameId = "g1" as uuidString;
    senderId = "Unknown";
    senderUsername = "Unknown";
    readonly className = "TestInterruptAction";
    readonly playableOutOfTurn = true;
    executedOutOfTurn?: boolean;

    myString() {
        return "TestInterruptAction";
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        this.executedOutOfTurn = gameData.currentTurn !== this.senderId;
        const state = (gameData as unknown as { specificGameState: ITestGameState }).specificGameState;
        state.scores[this.senderId] = (state.scores[this.senderId] ?? 0) + 10;
        return { validMove: true, turnOver: false };
    }
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

/** `senderId`'s card, recorded as the live route stamps one played on `onTurnOf`'s turn. */
function interrupt(senderId: string, onTurnOf: string): TestInterruptAction {
    const command = new TestInterruptAction();
    command.senderId = senderId;
    command.senderUsername = senderId;
    (command as unknown as Record<string, unknown>).recordedOnTurnOf = onTurnOf;
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
            (step.command as TestBonusAction).triggerBonus ? [{ icon: "landmark" }] : undefined,
        );

        expect(events).toEqual([{ turnIndex: 0, icon: "landmark" }]);
    });

    it("records more than one event for the same turn", async () => {
        // u1's bonus keeps both commands on turn 0; u2's is turn 1. Every
        // command reports an event here, so turn 0 should carry two.
        const commandHistory = [
            action("u1", true),
            action("u1", false),
            action("u2", false),
        ];

        const events = await computePerTurnEvents(game(commandHistory), () => [{ icon: "landmark" }]);

        expect(events).toEqual([
            { turnIndex: 0, icon: "landmark" },
            { turnIndex: 0, icon: "landmark" },
            { turnIndex: 1, icon: "landmark" },
        ]);
    });

    it("records nothing when detect finds nothing", async () => {
        const events = await computePerTurnEvents(game([action("u1", false)]), () => undefined);
        expect(events).toEqual([]);
    });
});

// docs/out-of-turn-actions.md §5.4: a command played out of turn is recorded
// with whose turn it was, and replay must neither hand that player's turn to
// the interrupter nor count the interrupt as a turn of its own.
describe("a command played out of turn", () => {
    it("replays on the turn it was played on, and leaves the live snapshot naming that player", async () => {
        // u1 ends their turn; u1 then plays a card on u2's. It is the last
        // command, so it is the live state the review opens on.
        const history = [action("u1"), interrupt("u1", "u2")];
        const seen: boolean[] = [];

        const timeline = await buildTimeline(game(history), { u1: "u1", u2: "u2" }, [], (step) => {
            if (step.command instanceof TestInterruptAction) seen.push(step.command.executedOutOfTurn!);
        });

        const live = timeline.snapshots[timeline.currentIndex];
        expect(live.currentTurn).toBe("u2");
        expect((live.specificGameState as ITestGameState).scores).toEqual({ u1: 11, u2: 0 });
        // Execute could tell on replay, as it could live.
        expect(seen).toEqual([true]);
    });

    it("ignores the stamp on a planned command", async () => {
        // A planned command is whatever the planner's client sent, so a stamp
        // on one is theirs to forge; planning is always the planner's own turn.
        const history = [action("u1"), action("u2")];
        const planned = interrupt("u1", "u2");
        const seen: boolean[] = [];

        const timeline = await buildTimeline(game(history), { u1: "u1", u2: "u2" }, [planned], (step) => {
            if (step.planned) seen.push((step.command as TestInterruptAction).executedOutOfTurn!);
        });

        expect(seen).toEqual([false]);
        expect(timeline.snapshots[timeline.snapshots.length - 1].currentTurn).toBe("u1");
    });

    it("charts one turn, not three, when an interrupt lands mid-turn", async () => {
        // u1 acts, u2 interrupts, u1 acts again and ends the turn, then u2
        // takes theirs: two turns, not u1 / u2 / u1 / u2.
        const history = [
            action("u1", true),
            interrupt("u2", "u1"),
            action("u1"),
            action("u2"),
        ];

        const perTurn = await computePerTurnStat<ITestGameState>(game(history), (state, userId) => state.scores[userId]);

        expect(countTurns(history)).toBe(2);
        expect(perTurn).toHaveLength(2);
        // The interrupt's effect is sampled at the end of the turn it happened in.
        expect([...perTurn[0].entries()]).toEqual([["u1", 2], ["u2", 10]]);
        expect([...perTurn[1].entries()]).toEqual([["u1", 2], ["u2", 11]]);
    });

    it("counts an interrupt at the very start of a turn as part of that turn", async () => {
        // u1 ends their turn, then plays a card on u2's before u2 has moved.
        // Grouping by sender would leave it in u1's turn; it happened in u2's.
        const history = [action("u1"), interrupt("u1", "u2"), action("u2")];

        const events = await computePerTurnEvents(game(history), (step) =>
            step.command instanceof TestInterruptAction ? [{ icon: "landmark" }] : undefined,
        );
        const perTurn = await computePerTurnStat<ITestGameState>(game(history), (state, userId) => state.scores[userId]);

        expect(events).toEqual([{ turnIndex: 1, icon: "landmark" }]);
        expect(countTurns(history)).toBe(2);
        expect([...perTurn[0].entries()]).toEqual([["u1", 1], ["u2", 0]]);
        expect([...perTurn[1].entries()]).toEqual([["u1", 11], ["u2", 1]]);
    });
});

describe("a recorded command's rules version", () => {
    /** `action`, recorded as the route accepted it under rules `version`. */
    function versioned(senderId: string, version: number | undefined): TestBonusAction {
        const command = action(senderId);
        (command as IGameCommand).version = version;
        return command;
    }

    it("replays one recorded before commands carried a version, and one at the current version", async () => {
        const timeline = await buildTimeline(game([versioned("u1", undefined), versioned("u2", FIRST_COMMAND_VERSION)]), { u1: "u1", u2: "u2" });

        expect(timeline.snapshots).toHaveLength(3);
    });

    it("hands Execute the version it was recorded at", async () => {
        const seen: number[] = [];
        await buildTimeline(game([versioned("u1", undefined), versioned("u2", FIRST_COMMAND_VERSION)]), { u1: "u1", u2: "u2" }, [], (step) => {
            seen.push(commandVersion(step.command));
        });

        expect(seen).toEqual([UNVERSIONED_COMMAND, FIRST_COMMAND_VERSION]);
    });

    it("refuses a game holding one recorded under rules this server doesn't have", async () => {
        // A release newer than this one recorded it: replaying it under older
        // rules would show a game that never happened.
        await expect(buildTimeline(game([versioned("u1", FIRST_COMMAND_VERSION + 1)]), { u1: "u1", u2: "u2" }))
            .rejects.toThrow(/command version 2/);
    });
});

// IReplayAdapter.omitUndoneSteps: a game with undo, whose review has no step for
// an action taken back or for the undo that took it back.
@serializable
class TestUndoGameType extends TestBonusTurnGameType {
    readonly className: string = "TestUndoGameType";
}

// Takes the sender's last point back — what stands in for a snapshot restore.
@serializable
class TestBonusUndo extends TestBonusAction {
    readonly className: string = "TestBonusUndo";

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const state = (gameData as unknown as { specificGameState: ITestGameState }).specificGameState;
        state.scores[this.senderId] -= 1;
        return { validMove: true, turnOver: false };
    }
}

registerReplayAdapter({
    ...getReplayAdapter("TestBonusTurnGameType")!,
    className: "TestUndoGameType",
    omitUndoneSteps: true,
    plannableCommands: ["TestBonusAction"],
});

let nextId = 0;
/** A command with an id of its own, which the pairing of an undo needs. */
function withId<T extends IGameCommand>(command: T): T {
    command.id = `c${nextId++}` as uuidString;
    return command;
}
function undoGame(commandHistory: IGameCommand[]): IGameData {
    return { ...game(commandHistory), gameType: new TestUndoGameType() } as IGameData;
}
const scoresOf = (timeline: { snapshots: ITurnSnapshot[] }) =>
    timeline.snapshots.map(s => (s.specificGameState as ITestGameState).scores.u1);
const NAMES = { u1: "u1", u2: "u2" };

describe("a game that omits undone steps", () => {
    it("has no step for an action taken back, nor for the undo", async () => {
        const undo = withId(new TestBonusUndo());
        undo.senderId = "u1";
        const history = [withId(action("u1")), withId(action("u1")), undo, withId(action("u1"))];

        const timeline = await buildTimeline(undoGame(history), NAMES);

        // Opening state, then the first and the last action: the second and the undo are gone.
        expect(scoresOf(timeline)).toEqual([0, 1, 2]);
        expect(timeline.snapshots.map(s => s.index)).toEqual([0, 1, 2]);
        expect(timeline.currentIndex).toBe(2);
    });

    it("still shows an observer every step, the undo included", async () => {
        const undo = withId(new TestBonusUndo());
        undo.senderId = "u1";
        const seen: string[] = [];

        await buildTimeline(undoGame([withId(action("u1")), undo]), NAMES, [], step => seen.push(step.command.className));

        expect(seen).toEqual(["TestBonusAction", "TestBonusUndo"]);
    });

    it("ends on the opening state when everything played was taken back", async () => {
        const first = withId(action("u1"));
        const undo = withId(new TestBonusUndo());
        undo.senderId = "u1";

        const timeline = await buildTimeline(undoGame([first, undo]), NAMES);

        expect(timeline.snapshots).toHaveLength(1);
        expect(timeline.currentIndex).toBe(0);
    });

    it("keeps a planned move after the live state, counted on", async () => {
        const undo = withId(new TestBonusUndo());
        undo.senderId = "u1";
        const history = [withId(action("u1")), withId(action("u1")), undo];

        const timeline = await buildTimeline(undoGame(history), NAMES, [withId(action("u1"))]);

        expect(timeline.snapshots.map(s => [s.index, s.planned])).toEqual([[0, false], [1, false], [2, true]]);
        expect(timeline.currentIndex).toBe(1);
    });

    it("leaves a game that doesn't opt in alone", async () => {
        const undo = withId(new TestBonusUndo());
        undo.senderId = "u1";
        const history = [withId(action("u1")), undo];

        const timeline = await buildTimeline(game(history), NAMES);

        expect(timeline.snapshots).toHaveLength(3);
        expect(timeline.currentIndex).toBe(2);
    });
});

describe("keepSnapshots", () => {
    const snap = (index: number, planned = false) => ({ index, planned }) as ITurnSnapshot;

    it("counts what is kept from 0 and points currentIndex at the last real one", () => {
        const kept = keepSnapshots([snap(0), snap(1), snap(2), snap(3), snap(4, true), snap(5, true)], (_, i) => i === 3);
        expect(kept.snapshots.map(s => s.index)).toEqual([0, 1, 2, 3]);
        expect(kept.snapshots.map(s => s.planned)).toEqual([false, false, true, true]);
        expect(kept.currentIndex).toBe(1);
    });

    it("always keeps the opening state and every planned snapshot", () => {
        const kept = keepSnapshots([snap(0), snap(1), snap(2, true)], () => false);
        expect(kept.snapshots).toHaveLength(2);
        expect(kept.currentIndex).toBe(0);
    });
});
