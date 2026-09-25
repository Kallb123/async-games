import { describe, expect, it } from "vitest";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import {
    DiceCitiesGameType,
    DiceCitiesRequestUnlockRadioTower,
    DiceCitiesRequestUnlockTrainStation,
    DiceCitiesUndo,
    cloneDiceCitiesState,
} from "./DiceCitiesLogic";
import { buildInitialDiceCitiesState, detectLandmarkEvent, gameStateToModel } from "./DiceCitiesModels";
import type { IDiceCitiesGameData } from "./DiceCitiesModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "./cards";
import { buyCommand, endTurnCommand, passCommand, replayableGame, rollCommand, saveUpTo, sentBy } from "./testHarness";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter, nextActivePlayer } from "@/utils/games/playerDropout";
import { buildTimeline, computePerTurnEvents } from "@/utils/games/replay";
import { buildEventFeed } from "@/utils/games/recap";
import { undoEntryFor } from "@/utils/games/undo";

// docs/undo.md's sixth game. What a Dice Cities player can take back is a
// purchase — an establishment or a landmark — and never a roll or anything a
// roll set off. A purchase is the last thing a turn does, so it holds the turn
// open for ten seconds (§5) rather than handing off, and DiceCitiesEndTurn
// closes the hold.

const PLAYERS = ["u1", "u2"];
const NAMES = { u1: "Alice", u2: "Bob" };
const TURN_STARTED = "2026-09-25T08:00:00.000Z";
const CAFE = DiceCitiesCardIds.CAFE;

/** u1 on turn, already rolled, with 30 coins to spend. */
function makeGame(userIds: string[] = PLAYERS): IDiceCitiesGameData {
    const state = buildInitialDiceCitiesState(userIds);
    state.hasRolled = true;
    state.playerStates.get("u1")!.money = 30;
    return {
        gameId: "g",
        gameType: new DiceCitiesGameType(),
        currentTurn: userIds[0],
        userIdList: userIds,
        lastTurnTimestamp: TURN_STARTED,
        gameState: { turnOrder: [...userIds], history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IDiceCitiesGameData;
}

const undo = (senderId = "u1") => sentBy(new DiceCitiesUndo(), senderId);
const endTurn = (senderId = "u1") => endTurnCommand(senderId);
const trainStation = (senderId = "u1") => sentBy(new DiceCitiesRequestUnlockTrainStation(), senderId);

function run(game: IDiceCitiesGameData, command: IGameCommand) {
    return runCommand(game, new DiceCitiesGameType(), command);
}

function seat(game: IDiceCitiesGameData, userId = "u1") {
    return game.specificGameState.playerStates.get(userId)!;
}

function owned(game: IDiceCitiesGameData, cardId: string, userId = "u1"): number {
    return seat(game, userId).cards.find(cc => cc.card === cardId)?.amount ?? 0;
}

/** What CreateDataResponse sends `viewerId` — the same `undoEntryFor` test it runs. */
function wireFor(game: IDiceCitiesGameData, viewerId: string | null) {
    const canUndo = undoEntryFor(game, viewerId) !== null;
    return gameStateToModel(game.specificGameState, NAMES, canUndo);
}

describe("Dice Cities — taking a purchase back", () => {
    it("puts the coins, the card and the market back, and the turn is still theirs", async () => {
        const game = makeGame();
        const before = cloneDiceCitiesState(game.specificGameState);

        await run(game, buyCommand(CAFE));
        expect(owned(game, CAFE)).toBe(1);

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        const gs = game.specificGameState;
        expect(owned(game, CAFE)).toBe(0);
        expect(seat(game).money).toBe(30);
        expect(gs.bankMoney).toBe(before.bankMoney);
        expect(gs.bankCards).toEqual(before.bankCards);
        expect(gs.hasRolled).toBe(true);
        expect(gs.autoEndTurnAt).toBeNull();
        expect(game.currentTurn).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");

        // …and the market is open again: any purchase, including another one.
        expect((await run(game, buyCommand(DiceCitiesCardIds.WHEAT_FIELD))).outcome.validMove).toBe(true);
    });

    it("takes a landmark back", async () => {
        const game = makeGame();
        await run(game, trainStation());
        expect(seat(game).doubleUnlocked).toBe(true);

        await run(game, undo());
        expect(seat(game).doubleUnlocked).toBe(false);
        expect(seat(game).money).toBe(30);
    });

    it("restores from a copy, not a view — a later change to the live state can't reach the snapshot", async () => {
        const game = makeGame();
        await run(game, buyCommand(CAFE));
        seat(game).cards.push({ card: DiceCitiesCardIds.MINE, amount: 3 });
        seat(game, "u2").money = 99;

        await run(game, undo());
        expect(owned(game, DiceCitiesCardIds.MINE)).toBe(0);
        expect(seat(game, "u2").money).not.toBe(99);
    });
});

describe("Dice Cities — the ten-second hold", () => {
    it("holds the turn open after a purchase instead of handing it off", async () => {
        const game = makeGame();
        const { outcome } = await run(game, buyCommand(CAFE));

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(game.currentTurn).toBe("u1");
        const deadline = new Date(game.specificGameState.autoEndTurnAt!).getTime();
        expect(deadline).toBeGreaterThan(Date.now());
    });

    it("refuses a second roll, or anything else, while it is open — the purchase was the turn", async () => {
        const game = makeGame();
        await run(game, buyCommand(CAFE));

        for (const command of [rollCommand(3), buyCommand(DiceCitiesCardIds.WHEAT_FIELD), trainStation(), passCommand()]) {
            expect((await run(game, command)).outcome.validMove).toBe(false);
        }
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
    });

    it("hands off on DiceCitiesEndTurn, and nothing can be taken back after it", async () => {
        const game = makeGame();
        await run(game, buyCommand(CAFE));

        expect((await run(game, endTurn())).outcome).toEqual({ validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u2");
        const gs = game.specificGameState;
        expect(gs.autoEndTurnAt).toBeNull();
        expect(gs.undoStack).toEqual([]);
        expect(gs.undoAnchorId).toBeNull();
        expect(owned(game, CAFE)).toBe(1);

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        // The next player's roll isn't held up by the purchase before it.
        expect((await run(game, rollCommand(3, "u2"))).outcome.validMove).toBe(true);
    });

    it("refuses DiceCitiesEndTurn with no hold open, so it can't skip a turn", async () => {
        const game = makeGame();
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);

        await run(game, buyCommand(CAFE));
        await run(game, undo());
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);
        expect(game.currentTurn).toBe("u1");
    });

    it("refuses a player the hold doesn't belong to", async () => {
        const game = makeGame();
        await run(game, buyCommand(CAFE));
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        expect((await run(game, endTurn("u2"))).outcome.validMove).toBe(false);
        expect(owned(game, CAFE)).toBe(1);
    });

    it("goes stale when the turn timer passes the turn on without a command", async () => {
        // Dice Cities has no turn-timeout adapter: an expired turn is the cron
        // stepping currentTurn on and restarting the clock. In a two-seat game
        // that timed out twice the turn comes straight back round with the
        // purchase still the last command — it must not be undoable then, nor
        // lock its player out of the roll they are now owed.
        const game = makeGame();
        await run(game, buyCommand(CAFE));

        game.currentTurn = nextActivePlayer(game, "u1");
        game.lastTurnTimestamp = "2026-09-26T08:00:00.000Z";
        game.currentTurn = nextActivePlayer(game, "u2");
        game.lastTurnTimestamp = "2026-09-27T08:00:00.000Z";
        expect(game.currentTurn).toBe("u1");

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);
        expect(wireFor(game, "u1").canUndo).toBe(false);
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
        expect((await run(game, rollCommand(3))).outcome.validMove).toBe(true);
    });
});

describe("Dice Cities — a purchase on a doubles turn", () => {
    function doublesGame(): IDiceCitiesGameData {
        const game = makeGame();
        seat(game).rerollDoubles = true;
        game.specificGameState.awaitingDoubleReroll = true;
        return game;
    }

    it("holds nothing — the dice come straight back — but stays undoable until they're rolled", async () => {
        const game = doublesGame();
        const { outcome } = await run(game, buyCommand(CAFE));

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        const gs = game.specificGameState;
        expect(gs.autoEndTurnAt).toBeNull();
        expect(gs.awaitingDoubleReroll).toBe(false);
        expect(gs.hasRolled).toBe(false);
        expect(wireFor(game, "u1").canUndo).toBe(true);

        await run(game, undo());
        expect(gs.awaitingDoubleReroll).toBe(true);
        expect(gs.hasRolled).toBe(true);
        expect(owned(game, CAFE)).toBe(0);
    });

    it("lets the bonus roll through, and nothing can be taken back after it", async () => {
        const game = doublesGame();
        await run(game, buyCommand(CAFE));

        expect((await run(game, rollCommand(1))).outcome.validMove).toBe(true);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(owned(game, CAFE)).toBe(1);
    });
});

describe("Dice Cities — what can't be taken back", () => {
    it("never pushes a snapshot for a roll", async () => {
        const game = makeGame();
        game.specificGameState.hasRolled = false;
        await run(game, rollCommand(3));
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("never pushes a snapshot for the landmark that wins the game, which hands off at once", async () => {
        const game = makeGame();
        const me = seat(game);
        me.doubleUnlocked = true;
        me.bonusDiningAndStore = true;
        me.rerollDoubles = true;

        const { outcome, gameOver } = await run(game, sentBy(new DiceCitiesRequestUnlockRadioTower()));
        expect(outcome.turnOver).toBe(true);
        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("u1");
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
    });

    it("forgets the stack when a player drops out, so no snapshot can bring their city back", async () => {
        const game = makeGame(["u1", "u2", "u3"]);
        await run(game, buyCommand(CAFE));
        getPlayerDropoutAdapter("DiceCitiesGameType")!.dropPlayer(game, "u3");
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
    });
});

describe("Dice Cities — undo on the wire", () => {
    it("tells only the buyer, and only while their purchase is the last move", async () => {
        const game = makeGame();
        expect(wireFor(game, "u1").canUndo).toBe(false);

        await run(game, buyCommand(CAFE));
        expect(wireFor(game, "u1").canUndo).toBe(true);
        expect(wireFor(game, "u1").autoEndTurnAt).toBe(game.specificGameState.autoEndTurnAt);
        for (const viewerId of ["u2", null]) {
            expect(wireFor(game, viewerId).canUndo).toBe(false);
            expect(wireFor(game, viewerId).autoEndTurnAt).toBeNull();
        }

        await run(game, endTurn());
        expect(wireFor(game, "u1").canUndo).toBe(false);
    });

    it("never sends the stack or the anchor", async () => {
        const game = makeGame();
        await run(game, buyCommand(CAFE));
        const wire = wireFor(game, "u1");
        expect(wire).not.toHaveProperty("undoStack");
        expect(wire).not.toHaveProperty("undoAnchorId");
    });
});

describe("Dice Cities — replay", () => {
    // u1 rolls a 1 (the Wheat Field pays them up to 4 coins), buys a Cafe,
    // takes it back, buys a Wheat Field instead and lets the hold run out.
    const log = () => [
        rollCommand(1), buyCommand(CAFE), sentBy(new DiceCitiesUndo()), buyCommand(DiceCitiesCardIds.WHEAT_FIELD), endTurnCommand(),
        rollCommand(1, "u2"), passCommand("u2"),
    ];

    it("replays a purchase taken back and a purchase held and passed to the live table's state", async () => {
        const game = replayableGame([]) as IDiceCitiesGameData;
        for (const command of log()) {
            game.currentTurn = command.senderId;
            expect((await run(game, command)).outcome.validMove).toBe(true);
        }
        expect(owned(game, CAFE)).toBe(0);
        expect(owned(game, DiceCitiesCardIds.WHEAT_FIELD)).toBe(2);

        const replayed = (await buildTimeline(replayableGame(log()), NAMES)).snapshots;
        expect(replayed.at(-1)!.specificGameState).toEqual(gameStateToModel(game.specificGameState, NAMES));
    });

    it("leaves no recap row for the purchase taken back", async () => {
        // Bob's turn first, so the recap he's shown is Alice's whole turn.
        const feed = await buildEventFeed(replayableGame(
            [rollCommand(1, "u2"), passCommand("u2"), ...log().slice(0, 5)],
            buildInitialDiceCitiesState(PLAYERS),
            "u2",
        ), NAMES, "u2");
        const bought = feed.events.filter(e => e.type === "dc_buy").map(e => e.title);
        expect(bought).toEqual(["Alice bought a Wheat Field"]);
        expect(feed.events.some(e => e.type === "dc_undo")).toBe(false);
    });

    it("takes a landmark taken back off the result chart", async () => {
        const cost = DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].cost;
        const saved = saveUpTo(cost, "u1", "u2");

        const undone = replayableGame([...saved, rollCommand(1), trainStation(), undo(), passCommand()]);
        expect(await computePerTurnEvents(undone, detectLandmarkEvent)).toEqual([]);

        const kept = replayableGame([...saved, rollCommand(1), trainStation(), endTurnCommand()]);
        expect(await computePerTurnEvents(kept, detectLandmarkEvent)).toHaveLength(1);
    });
});

describe("Dice Cities — the undoable commands never consume randomness", () => {
    it("leaves a purchase with no recorded field", async () => {
        const game = makeGame();
        for (const command of [buyCommand(CAFE), trainStation()]) {
            expect((await run(game, command)).outcome.validMove).toBe(true);
            expect(game.specificGameState.undoAnchorId).toBe(command.id);
            expect(consumedRandomness(command)).toBe(false);
            await run(game, undo());
        }
    });

    it("declares undoable on the purchases, and on nothing else", () => {
        expect(undoableCommandsIn(import.meta.url, "DiceCitiesLogic.ts").sort()).toEqual([
            "DiceCitiesRequestCardPurchase",
            "DiceCitiesRequestUnlockAmusementPark",
            "DiceCitiesRequestUnlockHarbour",
            "DiceCitiesRequestUnlockRadioTower",
            "DiceCitiesRequestUnlockShoppingMall",
            "DiceCitiesRequestUnlockTrainStation",
        ]);
    });
});
