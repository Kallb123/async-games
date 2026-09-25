import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    TrainTimeClaimRoute,
    TrainTimeDrawCarriageCard,
    TrainTimeDrawTickets,
    TrainTimeEndTurn,
    TrainTimeGameType,
    TrainTimeUndo,
} from "./TrainTimeLogic";
import { cloneTrainTimeState, gameStateToModel } from "./TrainTimeModels";
import type { ITrainTimeGameData } from "./TrainTimeModels";
import {
    ROUTES,
    SETUP_TICKETS_KEPT_MIN,
    TRAINS_PER_PLAYER,
    buildInitialTrainTimeState,
    liveUndoEntry,
} from "./board";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter, nextActivePlayer } from "@/utils/games/playerDropout";
import { buildTimeline } from "@/utils/games/replay";

// docs/undo.md's fifth game. The one move a Train Time player can take back is
// a claim: it spends cards onto the discard pile and nothing else, while every
// other action draws — carriage cards off a blind deck or a refilling market,
// or destination tickets the player has now seen. A claim is also the whole of
// a turn, so it holds the turn open for ten seconds (§5) rather than handing
// off, and TrainTimeEndTurn closes the hold.

const PLAYERS = ["u1", "u2"];
const NAMES = { u1: "Alice", u2: "Bob" };
const ROUTE = ROUTES.find(r => r.colour === "blue" && r.length === 4)!;
const TURN_STARTED = "2026-09-25T08:00:00.000Z";

function makeGame(userIds: string[] = PLAYERS): ITrainTimeGameData {
    const state = buildInitialTrainTimeState(userIds);
    for (const ps of state.playerStates.values()) {
        ps.tickets = ps.pendingTickets.slice(0, SETUP_TICKETS_KEPT_MIN);
        state.ticketDeck.push(...ps.pendingTickets.slice(SETUP_TICKETS_KEPT_MIN));
        ps.pendingTickets = [];
    }
    state.playerStates.get("u1")!.hand = ["blue", "blue", "blue", "blue", "red"];
    return {
        gameId: "g",
        gameType: new TrainTimeGameType(),
        currentTurn: userIds[0],
        userIdList: userIds,
        lastTurnTimestamp: TURN_STARTED,
        gameState: { turnOrder: [...userIds], history: [], commandHistory: [] },
        specificGameState: state,
        initialSpecificGameState: cloneTrainTimeState(state, userIds),
        complete: false,
        winner: "",
    } as unknown as ITrainTimeGameData;
}

function as<T extends IGameCommand>(command: T, senderId: string): T {
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

function claim(senderId = "u1", route = ROUTE): TrainTimeClaimRoute {
    const command = as(new TrainTimeClaimRoute(), senderId);
    command.routeId = route.id;
    command.cards = Array(route.length).fill(route.colour);
    return command;
}

const undo = (senderId = "u1") => as(new TrainTimeUndo(), senderId);
const endTurn = (senderId = "u1") => as(new TrainTimeEndTurn(), senderId);
const draw = (senderId = "u1") => as(new TrainTimeDrawCarriageCard(), senderId);

function run(game: ITrainTimeGameData, command: IGameCommand) {
    return runCommand(game, new TrainTimeGameType(), command);
}

function seat(game: ITrainTimeGameData, userId = "u1") {
    return game.specificGameState.playerStates.get(userId)!;
}

/** What CreateDataResponse sends `viewerId` — the same `liveUndoEntry` test it runs. */
function wireFor(game: ITrainTimeGameData, viewerId: string | null) {
    const canUndo = liveUndoEntry(
        game.specificGameState,
        viewerId,
        game.gameState.commandHistory.at(-1)?.id ?? null,
        game.lastTurnTimestamp,
    ) !== null;
    return gameStateToModel(game.specificGameState, NAMES, viewerId, canUndo);
}

describe("Train Time — taking a claim back", () => {
    it("puts the route, the cards, the trains and the points back, and the turn is still theirs", async () => {
        const game = makeGame();
        const before = cloneTrainTimeState(game.specificGameState, PLAYERS);

        await run(game, claim());
        expect(game.specificGameState.routeOwners[ROUTE.id]).toBe("u1");

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        const gs = game.specificGameState;
        expect(gs.routeOwners[ROUTE.id]).toBeNull();
        expect(seat(game).hand).toEqual(["blue", "blue", "blue", "blue", "red"]);
        expect(seat(game).trains).toBe(TRAINS_PER_PLAYER);
        expect(seat(game).score).toBe(0);
        expect(seat(game).routesClaimed).toBe(0);
        expect(gs.discard).toEqual(before.discard);
        expect(gs.autoEndTurnAt).toBeNull();
        expect(game.currentTurn).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");

        // …and the turn is open again: any action, including the same claim.
        expect((await run(game, claim())).outcome.validMove).toBe(true);
    });

    it("takes back the last lap a claim started", async () => {
        const game = makeGame();
        seat(game).trains = 6;

        await run(game, claim());
        expect(game.specificGameState.finalRoundPending).toEqual(PLAYERS);

        await run(game, undo());
        expect(game.specificGameState.finalRoundPending).toBeNull();
        expect(seat(game).trains).toBe(6);
    });

    it("restores from a copy, not a view — a later change to the live state can't reach the snapshot", async () => {
        const game = makeGame();
        await run(game, claim());
        seat(game).hand.push("engine");
        seat(game, "u2").score = 99;

        await run(game, undo());
        expect(seat(game).hand).toEqual(["blue", "blue", "blue", "blue", "red"]);
        expect(seat(game, "u2").score).toBe(0);
    });
});

describe("Train Time — the ten-second hold", () => {
    it("holds the turn open after a claim instead of handing it off", async () => {
        const game = makeGame();
        const { outcome } = await run(game, claim());

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(game.currentTurn).toBe("u1");
        const deadline = new Date(game.specificGameState.autoEndTurnAt!).getTime();
        expect(deadline).toBeGreaterThan(Date.now());
    });

    it("refuses every other action while it is open — the claim was the turn", async () => {
        const game = makeGame();
        seat(game).hand.push("blue", "blue", "blue", "blue");
        await run(game, claim());

        const twin = ROUTES.find(r => r.colour === "blue" && r.length === 4 && r.id !== ROUTE.id && r.twinId !== ROUTE.id)!;
        for (const command of [draw(), as(new TrainTimeDrawTickets(), "u1"), claim("u1", twin)]) {
            expect((await run(game, command)).outcome.validMove).toBe(false);
        }
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
    });

    it("hands off on TrainTimeEndTurn, and nothing can be taken back after it", async () => {
        const game = makeGame();
        await run(game, claim());

        expect((await run(game, endTurn())).outcome).toEqual({ validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u2");
        const gs = game.specificGameState;
        expect(gs.autoEndTurnAt).toBeNull();
        expect(gs.undoStack).toEqual([]);
        expect(gs.undoAnchorId).toBeNull();
        expect(gs.routeOwners[ROUTE.id]).toBe("u1");

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
    });

    it("refuses TrainTimeEndTurn with no hold open, so it can't skip a turn", async () => {
        const game = makeGame();
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);

        await run(game, claim());
        await run(game, undo());
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);
        expect(game.currentTurn).toBe("u1");
    });

    it("refuses a player the hold doesn't belong to", async () => {
        const game = makeGame();
        await run(game, claim());
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        expect((await run(game, endTurn("u2"))).outcome.validMove).toBe(false);
        expect(game.specificGameState.routeOwners[ROUTE.id]).toBe("u1");
    });

    it("goes stale when the turn timer passes the turn on without a command", async () => {
        // Train Time has no turn-timeout adapter: an expired turn is the cron
        // stepping currentTurn on and restarting the clock. In a two-seat game
        // that timed out twice the turn comes straight back round with the
        // claim still the last command — it must not be undoable then, nor
        // lock its player out of their new turn.
        const game = makeGame();
        await run(game, claim());

        game.currentTurn = nextActivePlayer(game, "u1");
        game.lastTurnTimestamp = "2026-09-26T08:00:00.000Z";
        game.currentTurn = nextActivePlayer(game, "u2");
        game.lastTurnTimestamp = "2026-09-27T08:00:00.000Z";
        expect(game.currentTurn).toBe("u1");

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect((await run(game, endTurn())).outcome.validMove).toBe(false);
        expect(wireFor(game, "u1").canUndo).toBe(false);
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
        expect((await run(game, draw())).outcome.validMove).toBe(true);
    });
});

describe("Train Time — what can't be taken back", () => {
    it("never pushes a snapshot for a draw or a ticket draw", async () => {
        const game = makeGame();
        await run(game, draw());
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        await run(game, draw());

        await run(game, as(new TrainTimeDrawTickets(), "u2"));
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
    });

    it("never pushes a snapshot for the claim that ends the game, which hands off at once", async () => {
        const game = makeGame();
        game.specificGameState.finalRoundPending = ["u1"];

        const { outcome, gameOver } = await run(game, claim());
        expect(outcome.turnOver).toBe(true);
        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
    });

    it("forgets the stack when a player drops out, so no snapshot can bring their seat back", async () => {
        const game = makeGame(["u1", "u2", "u3"]);
        await run(game, claim());
        getPlayerDropoutAdapter("TrainTimeGameType")!.dropPlayer(game, "u3");
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
    });
});

describe("Train Time — undo on the wire", () => {
    it("tells only the claimer, and only while their claim is the last move", async () => {
        const game = makeGame();
        expect(wireFor(game, "u1").canUndo).toBe(false);

        await run(game, claim());
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
        await run(game, claim());
        const wire = wireFor(game, "u1");
        expect(wire).not.toHaveProperty("undoStack");
        expect(wire).not.toHaveProperty("undoAnchorId");
    });
});

describe("Train Time — replay", () => {
    it("replays a claim taken back and a claim held and passed to the live table's state", async () => {
        const game = makeGame();
        await run(game, claim());
        await run(game, undo());
        await run(game, claim());
        await run(game, endTurn());

        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToModel(game.specificGameState, NAMES, viewerId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            expect(replayed.at(-1)!.specificGameState).toEqual(live);
        }
    });
});

describe("Train Time — the undoable command never consumes randomness", () => {
    it("leaves a claim with no recorded field", async () => {
        const game = makeGame();
        const command = claim();
        expect((await run(game, command)).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoAnchorId).toBe(command.id);
        expect(consumedRandomness(command)).toBe(false);
    });

    it("declares undoable on the claim, and on nothing else", () => {
        const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "TrainTimeLogic.ts"), "utf8");
        const found: string[] = [];
        for (const match of source.matchAll(/export class (\w+) implements IGameCommand \{([\s\S]*?)myString\(/g)) {
            if (/readonly undoable = true/.test(match[2])) found.push(match[1]);
        }
        expect(found).toEqual(["TrainTimeClaimRoute"]);
    });
});
