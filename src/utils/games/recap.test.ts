import { describe, expect, it } from "vitest";
import { buildAllEvents, buildEventFeed, registerRecapAdapter } from "./recap";
import { registerReplayAdapter } from "./replay";
import { serializable } from "../apiModels/Serialisable";
import type { ICommandOutcome, IGameCommand, IGameType } from "../apiModels/gameCommand";
import type { IGameData } from "../mongodb/GameData";
import type { uuidString } from "../apiModels/GameDataApi";

// The engine half of the "since you were last here" feed, against a synthetic
// two-seat game whose only rules are the ones under test: a move that passes
// the turn, and a card that may be played on somebody else's
// (docs/out-of-turn-actions.md §5.6).

interface ITestState {
    moves: number;
}

@serializable
class TestRecapGameType implements IGameType {
    gameType = "TestRecapGame";
    friendlyName = "Test Recap Game";
    icon = "";
    url = "testrecapgame";
    readonly className = "TestRecapGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome) {
        if (commandOutcome.turnOver) {
            gameData.currentTurn = gameData.currentTurn === "u1" ? "u2" : "u1";
        }
    }

    CheckGameOver() {
        return false;
    }
}

@serializable
class TestRecapMove implements IGameCommand {
    id = "move" as uuidString;
    timestamp = "2026-07-21T09:00:00.000Z";
    gameId = "g1" as uuidString;
    senderId = "Unknown";
    senderUsername = "Unknown";
    readonly className: string = "TestRecapMove";
    passes = true;

    myString() {
        return this.className;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        (gameData as unknown as { specificGameState: ITestState }).specificGameState.moves++;
        return { validMove: true, turnOver: this.passes };
    }
}

@serializable
class TestRecapInterrupt extends TestRecapMove {
    readonly className: string = "TestRecapInterrupt";
    readonly playableOutOfTurn = true;
    passes = false;
}

@serializable
class TestRecapUndo extends TestRecapMove {
    readonly className: string = "TestRecapUndo";
    passes = false;

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        (gameData as unknown as { specificGameState: ITestState }).specificGameState.moves--;
        return { validMove: true, turnOver: false };
    }
}

registerReplayAdapter({
    className: "TestRecapGameType",
    buildInitialSpecificGameState: () => ({ moves: 0 }),
    toResponseState: (specificGameState) => ({ ...(specificGameState as ITestState) }),
    plannableCommands: [],
});

registerRecapAdapter({
    className: "TestRecapGameType",
    toEvents: (_prev, _next, command) => [{
        id: `${command.id}-event`,
        timestamp: command.timestamp,
        commandId: command.id,
        actorId: command.senderId,
        actorUsername: command.senderUsername,
        type: command.className,
        title: `${command.senderId} ${command.className}`,
    }],
    // Marks the rows it was handed for the feed, so a test can see which path ran.
    postProcess: (events, { forFeed }) => forFeed ? events.map(event => ({ ...event, title: `${event.title} (feed)` })) : events,
    summarize: (events) => ({ headline: `${events.length}`, subline: "" }),
});

function move(id: string, senderId: string): TestRecapMove {
    const command = new TestRecapMove();
    command.id = id as uuidString;
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

/** `senderId`'s card, as the live route records one played on `onTurnOf`'s turn. */
function interrupt(id: string, senderId: string, onTurnOf: string): TestRecapInterrupt {
    const command = new TestRecapInterrupt();
    command.id = id as uuidString;
    command.senderId = senderId;
    command.senderUsername = senderId;
    (command as unknown as Record<string, unknown>).recordedOnTurnOf = onTurnOf;
    return command;
}

function undo(id: string, senderId: string): TestRecapUndo {
    const command = new TestRecapUndo();
    command.id = id as uuidString;
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

function game(commandHistory: IGameCommand[], currentTurn: string): IGameData {
    return {
        gameId: "g1",
        gameType: new TestRecapGameType(),
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn,
        lastTurnTimestamp: "2026-07-21T09:00:00.000Z",
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory },
        complete: false,
        winner: "",
    } as unknown as IGameData;
}

const names = { u1: "u1", u2: "u2" };

describe("buildEventFeed", () => {
    it("windows on the viewer's own last move", async () => {
        const feed = await buildEventFeed(game([move("a", "u1"), move("b", "u2")], "u1"), names, "u1");

        expect(feed.events.map(event => event.commandId)).toEqual(["b"]);
    });

    it("doesn't treat a card the viewer played on a teammate's turn as having been here", async () => {
        // u1 ends their turn, plays a card on u2's, then u2 moves. u1's feed
        // runs from the end of their own turn, not from the card — and the
        // card is in it, as the event by them it is.
        const history = [move("a", "u1"), interrupt("b", "u1", "u2"), move("c", "u2")];

        const feed = await buildEventFeed(game(history, "u1"), names, "u1");

        expect(feed.events.map(event => event.commandId)).toEqual(["b", "c"]);
    });

    it("still windows past everything a teammate played on the viewer's own turn", async () => {
        // u2 interrupts during u1's turn, then u1 carries on and ends it:
        // u1's own last move comes after the interrupt, so the next feed
        // starts after both.
        const history = [move("a", "u1"), move("b", "u2"), interrupt("c", "u2", "u1"), move("d", "u1"), move("e", "u2")];

        const feed = await buildEventFeed(game(history, "u1"), names, "u1");

        expect(feed.events.map(event => event.commandId)).toEqual(["e"]);
    });

    it("tells postProcess the feed is for the feed, and buildAllEvents that it isn't", async () => {
        const history = [move("a", "u1"), move("b", "u2")];

        const feed = await buildEventFeed(game(history, "u1"), names, "u1");
        const all = await buildAllEvents(game(history, "u1"), names, null);

        expect(feed.events.map(event => event.title)).toEqual(["u2 TestRecapMove (feed)"]);
        expect(all.map(event => event.title)).toEqual(["u1 TestRecapMove", "u2 TestRecapMove"]);
    });

    it("excludes both an undo and the command it reversed", async () => {
        const events = await buildAllEvents(
            game([move("a", "u1"), move("b", "u2"), undo("c", "u2")], "u2"),
            names,
            null,
        );

        expect(events.map(event => event.commandId)).toEqual(["a"]);
    });

    it("excludes every command reversed by undos in a row", async () => {
        const events = await buildAllEvents(
            game([move("a", "u1"), move("b", "u2"), move("c", "u1"), undo("d", "u1"), undo("e", "u1")], "u2"),
            names,
            null,
        );

        expect(events.map(event => event.commandId)).toEqual(["a"]);
    });

    it("pairs an undo with the newest command still standing after a fresh move", async () => {
        const events = await buildAllEvents(
            game([move("a", "u1"), move("b", "u2"), move("c", "u2"), undo("d", "u2"), move("e", "u2"), undo("f", "u2"), undo("g", "u2")], "u2"),
            names,
            null,
        );

        expect(events.map(event => event.commandId)).toEqual(["a"]);
    });
});
