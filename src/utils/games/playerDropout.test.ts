import { describe, expect, it } from "vitest";

// The barrel registers every game's dropout adapter as a side effect.
import "@/utils/apiModels/GameLogic";
import type { IGameData } from "@/utils/mongodb/GameData";
import {
    activeTurnOrder, canDropPlayer, getPlayerDropoutAdapter, nextActivePlayer, PlayerDropped,
} from "./playerDropout";
import { BOARD_TOPOLOGY } from "@/games/SettlementsAndCities/board";
import { makeState, player } from "@/games/SettlementsAndCities/testFixtures";

const A = "user_a", B = "user_b", C = "user_c", D = "user_d";

/** Just enough of a game for the engine-level helpers and one adapter call. */
function game(className: string, specificGameState: unknown = {}, overrides: Partial<IGameData> = {}): IGameData {
    return {
        gameId: "game_1",
        gameType: { className } as IGameData["gameType"],
        userIdList: [A, B, C],
        turnTimer: "1d",
        currentTurn: B,
        lastTurnTimestamp: "",
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: { turnOrder: [A, B, C], history: [], commandHistory: [] },
        complete: false,
        winner: "",
        ...overrides,
        specificGameState,
    } as IGameData;
}

function drop(gameData: IGameData, userId: string) {
    getPlayerDropoutAdapter(gameData.gameType.className)!.dropPlayer(gameData, userId);
}

describe("the rotation helpers", () => {
    it("step over dropped seats, and start from a dropped seat's own place", () => {
        const g = game("SnakesAndLaddersGameType");
        g.gameState.droppedPlayers = [C];
        expect(activeTurnOrder(g)).toEqual([A, B]);
        expect(nextActivePlayer(g, B)).toBe(A);
        expect(nextActivePlayer(g, C)).toBe(A);
        expect(nextActivePlayer(g, A)).toBe(B);
    });
});

describe("canDropPlayer", () => {
    it("refuses a game with no adapter, the player holding the turn, and a table left too small", () => {
        expect(canDropPlayer(game("SmartthinkGameType"), A)).toBe(false);
        expect(canDropPlayer(game("SnakesAndLaddersGameType"), B)).toBe(false);
        expect(canDropPlayer(game("SnakesAndLaddersGameType"), A)).toBe(true);

        const two = game("SnakesAndLaddersGameType", {}, { gameState: { turnOrder: [A, B], history: [], commandHistory: [] } });
        expect(canDropPlayer(two, A)).toBe(false);
    });

    it("lets a co-op table go down to one player", () => {
        const two = game("OutbreakGameType", { players: new Map(), playerDiscard: [] }, { gameState: { turnOrder: [A, B], history: [], commandHistory: [] } });
        expect(canDropPlayer(two, A)).toBe(true);
    });

    it("refuses a phase the game can't reshape", () => {
        expect(canDropPlayer(game("SettlementsAndCitiesGameType", { phase: "setup" }), A)).toBe(false);
        expect(canDropPlayer(game("WorldDominationGameType", { phase: "setup" }), A)).toBe(false);
        expect(canDropPlayer(game("WorldDominationGameType", { phase: "attack" }), A)).toBe(true);
    });
});

describe("PlayerDropped", () => {
    it("marks the seat, writes a history line and leaves the turn where it is", async () => {
        const g = game("SnakesAndLaddersGameType");
        const command = new PlayerDropped();
        command.senderId = A;

        const outcome = await command.Execute(g);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(g.gameState.droppedPlayers).toEqual([A]);
        expect(g.currentTurn).toBe(B);
        expect(g.gameState.history[0]).toMatchObject({ actorId: A });
    });

    it("refuses a second drop of the same player", async () => {
        const g = game("SnakesAndLaddersGameType", {}, { gameState: { turnOrder: [A, B, C, D], history: [], commandHistory: [], droppedPlayers: [A] } });
        const command = new PlayerDropped();
        command.senderId = A;
        expect((await command.Execute(g)).validMove).toBe(false);
    });
});

describe("each game's dropout adapter", () => {
    it("Dice Cities returns the city's coins to the bank and takes the city off the table", () => {
        const gs = { bankMoney: 10, playerStates: new Map([[A, { money: 7 }], [B, { money: 1 }]]) };
        drop(game("DiceCitiesGameType", gs), A);
        expect(gs.bankMoney).toBe(17);
        expect([...gs.playerStates.keys()]).toEqual([B]);
    });

    it("Train Time returns cards and tickets, and ends a last lap only they still owed", () => {
        const gs = {
            discard: [], ticketDeck: [1], finalRoundPending: [A], gameOver: false,
            playerStates: new Map([[A, { hand: ["red"], tickets: [2], pendingTickets: [3] }], [B, {}]]),
        };
        drop(game("TrainTimeGameType", gs), A);
        expect(gs.discard).toEqual(["red"]);
        expect(gs.ticketDeck).toEqual([1, 2, 3]);
        expect([...gs.playerStates.keys()]).toEqual([B]);
        expect(gs.finalRoundPending).toEqual([]);
        expect(gs.gameOver).toBe(true);
    });

    it("Race Cars retires the car and keeps roundIndex on the driver holding the turn", () => {
        const gs = { players: new Map([[A, {}], [B, {}], [C, {}]]), roundOrder: [A, C, B], roundIndex: 2, undoStack: [{}] };
        drop(game("RaceCarsGameType", gs), A);
        expect(gs.roundOrder).toEqual([C, B]);
        expect(gs.roundOrder[gs.roundIndex]).toBe(B);
        expect(gs.players.has(A)).toBe(false);
        expect(gs.undoStack).toEqual([]);
    });

    it("Fires Out hands the dropped player's figures round the rest of the crew", () => {
        const firefighters = [{ ownerId: A }, { ownerId: B }, { ownerId: C }, { ownerId: A }];
        const g = game("FiresOutGameType", { firefighters });
        g.gameState.droppedPlayers = [A];
        drop(g, A);
        expect(firefighters.map(ff => ff.ownerId)).toEqual([B, B, C, C]);
    });

    it("Outbreak and Banned Islet discard the hand and take the pawn off the board", () => {
        const outbreak = { players: new Map([[A, { hand: [4, 5] }], [B, { hand: [] }]]), playerDiscard: [1] };
        drop(game("OutbreakGameType", outbreak), A);
        expect(outbreak.playerDiscard).toEqual([1, 4, 5]);
        expect(outbreak.players.has(A)).toBe(false);

        const islet = { players: new Map([[A, { hand: ["earth"] }], [B, { hand: [] }]]), treasureDiscard: [] };
        drop(game("BannedIsletGameType", islet), A);
        expect(islet.treasureDiscard).toEqual(["earth"]);
        expect(islet.players.has(A)).toBe(false);
    });

    it("Settlements & Cities re-awards Largest Army among the players still at the table", () => {
        const gs = makeState({
            specialBuildQueue: [A, C],
            largestArmyOwner: A,
            vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
            edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
            undoStack: [{ by: B, state: {} as never }],
            playerStates: new Map([[A, player({ knightsPlayed: 5 })], [B, player({ knightsPlayed: 3 })], [C, player({ knightsPlayed: 1 })]]),
        });
        drop(game("SettlementsAndCitiesGameType", gs), A);
        expect(gs.largestArmyOwner).toBe(B);
        expect(gs.specialBuildQueue).toEqual([C]);
        expect(gs.playerStates.has(A)).toBe(false);
        expect(gs.undoStack).toEqual([]);
    });
});
