import { describe, expect, it } from "vitest";
import { BannedIsletAction, BannedIsletActionKind, BannedIsletGameType } from "./BannedIsletLogic";
import type { IBannedIsletGameData, IBannedIsletSpecificGameState } from "./BannedIsletModels";
import {
    ACTIONS_PER_TURN,
    CARDS_TO_CAPTURE,
    PIER_TILE,
    TREASURE_IDS,
    BannedIsletCardId,
} from "./board";
import {
    EAST_OF_MIDDLE,
    FAR_EAST,
    MIDDLE,
    NORTH_EAST,
    NORTH_OF_MIDDLE,
    SOUTH_OF_MIDDLE,
    TOP_TIP,
    WEST_OF_MIDDLE,
    baseState,
} from "./testFixtures";

// ─── Minimal in-memory game harness (mirrors SolitaireLogic.test.ts) ────────
// Banned Islet's specificGameState is a fully typed schema with a
// Schema.Types.Map of per-player subdocuments, so — like Outbreak — nothing
// here needs markModified: Mongoose tracks those mutations itself.

function makeGame(state: IBannedIsletSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IBannedIsletGameData {
    return {
        gameId: "g",
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IBannedIsletGameData;
}

function cmd(kind: BannedIsletActionKind, fields: Partial<BannedIsletAction> = {}, senderId = "u1"): BannedIsletAction {
    const action = new BannedIsletAction();
    action.senderId = senderId;
    action.senderUsername = senderId;
    action.kind = kind;
    return Object.assign(action, fields);
}

/** Four of a kind plus a spare, so a capture test can prove it paid exactly four. */
const FIVE_EMBER: BannedIsletCardId[] = ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'emberCrown'];

describe("BannedIsletAction 'move' (§8)", () => {
    it("steps onto an orthogonally adjacent tile for one action", async () => {
        const state = baseState({ u1: { position: MIDDLE } });
        const game = makeGame(state);

        const outcome = await cmd('move', { target: NORTH_OF_MIDDLE }).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.position).toBe(NORTH_OF_MIDDLE);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    });

    it("steps onto a flooded tile, which is standable (§9.1)", async () => {
        const state = baseState({ u1: { position: MIDDLE } }, { flooded: [EAST_OF_MIDDLE] });
        const game = makeGame(state);

        expect(await cmd('move', { target: EAST_OF_MIDDLE }).Execute(game)).toEqual({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.position).toBe(EAST_OF_MIDDLE);
    });

    it("refuses a diagonal, a hole and a tile across the island", async () => {
        const state = baseState({ u1: { position: MIDDLE } }, { sunk: [SOUTH_OF_MIDDLE] });
        const game = makeGame(state);

        for (const target of [NORTH_EAST, SOUTH_OF_MIDDLE, TOP_TIP]) {
            expect(await cmd('move', { target }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        }
        expect(state.players.get("u1")!.position).toBe(MIDDLE);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });
});

describe("BannedIsletAction 'shoreUp' (§8)", () => {
    it("dries the tile under the pawn and a flooded neighbour", async () => {
        const state = baseState({ u1: { position: MIDDLE } }, { flooded: [MIDDLE, WEST_OF_MIDDLE] });
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: MIDDLE }).Execute(game)).toEqual({ validMove: true, turnOver: false });
        expect(await cmd('shoreUp', { target: WEST_OF_MIDDLE }).Execute(game)).toEqual({ validMove: true, turnOver: false });

        expect(state.positions[MIDDLE].state).toBe('dry');
        expect(state.positions[WEST_OF_MIDDLE].state).toBe('dry');
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 2);
    });

    it("refuses a dry tile rather than silently eating an action (§16)", async () => {
        const state = baseState({ u1: { position: MIDDLE } });
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: NORTH_OF_MIDDLE }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("never un-sinks a tile (§9.1) and never reaches past a neighbour", async () => {
        const state = baseState({ u1: { position: MIDDLE } }, { sunk: [EAST_OF_MIDDLE], flooded: [FAR_EAST] });
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: EAST_OF_MIDDLE }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        expect(await cmd('shoreUp', { target: FAR_EAST }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        expect(state.positions[EAST_OF_MIDDLE].state).toBe('sunk');
        expect(state.positions[FAR_EAST].state).toBe('flooded');
    });
});

describe("BannedIsletAction 'giveCard' (§8)", () => {
    it("hands a treasure card to a teammate standing on the same tile", async () => {
        const state = baseState({
            u1: { position: MIDDLE, hand: ['emberCrown', 'stormIdol'] },
            u2: { position: MIDDLE, hand: [] },
        });
        const game = makeGame(state);

        const outcome = await cmd('giveCard', { targetUserId: "u2", cardId: 'emberCrown' }).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.hand).toEqual(['stormIdol']);
        expect(state.players.get("u2")!.hand).toEqual(['emberCrown']);
    });

    it("names the recipient by token, so a rename doesn't rewrite the log", async () => {
        const state = baseState({
            u1: { position: MIDDLE, hand: ['emberCrown'] },
            u2: { position: MIDDLE, hand: [] },
        });
        const game = makeGame(state);

        await cmd('giveCard', { targetUserId: "u2", cardId: 'emberCrown' }).Execute(game);

        expect(game.gameState.history[0].text).toBe('{{u1}} gave their Ember Crown card to {{u2}}');
    });

    it("refuses a teammate on another tile — the meet-in-person tax the Messenger removes (§12)", async () => {
        const state = baseState({
            u1: { position: MIDDLE, hand: ['emberCrown'] },
            u2: { position: NORTH_OF_MIDDLE, hand: [] },
        });
        const game = makeGame(state);

        expect(await cmd('giveCard', { targetUserId: "u2", cardId: 'emberCrown' }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        expect(state.players.get("u1")!.hand).toEqual(['emberCrown']);
    });

    it("refuses a card that isn't in hand, a special card, and a gift to yourself", async () => {
        const state = baseState({
            u1: { position: MIDDLE, hand: ['emberCrown', 'helicopterLift'] },
            u2: { position: MIDDLE, hand: [] },
        });
        const game = makeGame(state);

        // §10's specials are played from the holder's own hand, not traded.
        expect(await cmd('giveCard', { targetUserId: "u2", cardId: 'helicopterLift' }).Execute(game).then(o => o.validMove)).toBe(false);
        expect(await cmd('giveCard', { targetUserId: "u2", cardId: 'rootStone' }).Execute(game).then(o => o.validMove)).toBe(false);
        expect(await cmd('giveCard', { targetUserId: "u1", cardId: 'emberCrown' }).Execute(game).then(o => o.validMove)).toBe(false);
        expect(await cmd('giveCard', { targetUserId: "nobody", cardId: 'emberCrown' }).Execute(game).then(o => o.validMove)).toBe(false);

        expect(state.players.get("u1")!.hand).toEqual(['emberCrown', 'helicopterLift']);
        expect(state.players.get("u2")!.hand).toEqual([]);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });
});

describe("BannedIsletAction 'capture' (§8)", () => {
    it("lifts the treasure, discarding exactly four matching cards and keeping the spare", async () => {
        const state = baseState(
            { u1: { position: MIDDLE, hand: FIVE_EMBER } },
            { tiles: { [MIDDLE]: 'cinderTemple' } },
        );
        const game = makeGame(state);

        const outcome = await cmd('capture').Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.treasures.emberCrown).toBe(true);
        expect(state.players.get("u1")!.hand).toEqual(['emberCrown']);
        // §8's discard is part of the action, and the pile is public (§10).
        expect(state.treasureDiscard).toEqual(new Array(CARDS_TO_CAPTURE).fill('emberCrown'));
    });

    it("works from either of the treasure's two tiles", async () => {
        const state = baseState(
            { u1: { position: SOUTH_OF_MIDDLE, hand: FIVE_EMBER } },
            { tiles: { [MIDDLE]: 'cinderTemple', [SOUTH_OF_MIDDLE]: 'ashfallHollow' } },
        );
        const game = makeGame(state);

        expect(await cmd('capture').Execute(game)).toEqual({ validMove: true, turnOver: false });
        expect(state.treasures.emberCrown).toBe(true);
    });

    it("refuses three matching cards, the wrong tile, and a treasure already lifted", async () => {
        const threeCards = baseState(
            { u1: { position: MIDDLE, hand: ['emberCrown', 'emberCrown', 'emberCrown'] } },
            { tiles: { [MIDDLE]: 'cinderTemple' } },
        );
        expect((await cmd('capture').Execute(makeGame(threeCards))).validMove).toBe(false);

        // Four Ember Crowns on a Storm Idol tile buy nothing.
        const wrongTile = baseState(
            { u1: { position: MIDDLE, hand: FIVE_EMBER } },
            { tiles: { [MIDDLE]: 'whistlingSpire' } },
        );
        expect((await cmd('capture').Execute(makeGame(wrongTile))).validMove).toBe(false);

        const alreadyLifted = baseState(
            { u1: { position: MIDDLE, hand: FIVE_EMBER } },
            { tiles: { [MIDDLE]: 'cinderTemple' } },
        );
        alreadyLifted.treasures.emberCrown = true;
        const game = makeGame(alreadyLifted);
        expect((await cmd('capture').Execute(game)).validMove).toBe(false);
        expect(alreadyLifted.players.get("u1")!.hand).toEqual(FIVE_EMBER);
    });
});

describe("BannedIsletAction 'pass' (§8)", () => {
    it("forfeits the rest of the turn's actions rather than one of them", async () => {
        const state = baseState({ u1: {} });
        const game = makeGame(state);

        const outcome = await cmd('pass').Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.actionsLeft).toBe(0);
        expect(game.gameState.history[0].text).toBe(`{{u1}} passed, forfeiting ${ACTIONS_PER_TURN} actions`);
    });

    it("says how many were actually left", async () => {
        const state = baseState({ u1: { actionsLeft: 1 } });
        const game = makeGame(state);

        await cmd('pass').Execute(game);
        expect(game.gameState.history[0].text).toBe('{{u1}} passed, forfeiting 1 action');
    });
});

describe("The action economy (§7 Phase 1, §21.4)", () => {
    it("refuses a player with no actions left", async () => {
        const state = baseState({ u1: { position: MIDDLE, actionsLeft: 0 } });
        const game = makeGame(state);

        expect(await cmd('move', { target: NORTH_OF_MIDDLE }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        expect(state.players.get("u1")!.position).toBe(MIDDLE);
    });

    it("refuses a sender who isn't in the game at all", async () => {
        const game = makeGame(baseState({ u1: { position: MIDDLE } }));
        expect(await cmd('move', { target: NORTH_OF_MIDDLE }, "gatecrasher").Execute(game)).toEqual({ validMove: false, turnOver: false });
    });

    it("refuses every kind while the turn is held open for a hand-limit discard (§10)", async () => {
        const state = baseState({ u1: { position: MIDDLE } });
        state.phase = 'discard';
        const game = makeGame(state);

        for (const kind of ['move', 'shoreUp', 'giveCard', 'capture', 'pass'] as BannedIsletActionKind[]) {
            expect(await cmd(kind, { target: NORTH_OF_MIDDLE }).Execute(game)).toEqual({ validMove: false, turnOver: false });
        }
    });

    it("never ends the turn itself, even on the last action (§21.4)", async () => {
        const state = baseState({ u1: { position: MIDDLE } });
        const game = makeGame(state);

        const targets = [NORTH_OF_MIDDLE, MIDDLE, NORTH_OF_MIDDLE];
        for (const target of targets) {
            expect(await cmd('move', { target }).Execute(game)).toEqual({ validMove: true, turnOver: false });
        }
        expect(state.players.get("u1")!.actionsLeft).toBe(0);
        expect(game.currentTurn).toBe("u1");
    });
});

describe("BannedIsletGameType.CheckEndTurn (§21.4)", () => {
    it("does nothing while the turn is still open", () => {
        const state = baseState({ u1: { actionsLeft: 0 }, u2: { actionsLeft: 0 } });
        const game = makeGame(state);

        new BannedIsletGameType().CheckEndTurn(game, { validMove: true, turnOver: false });

        expect(game.currentTurn).toBe("u1");
        expect(state.players.get("u2")!.actionsLeft).toBe(0);
    });

    it("hands the turn on and refills the next player's actions, not the last player's", () => {
        const state = baseState({ u1: { actionsLeft: 0 }, u2: { actionsLeft: 0 } });
        state.players.get("u2")!.pilotFlightUsed = true;
        const game = makeGame(state);

        new BannedIsletGameType().CheckEndTurn(game, { validMove: true, turnOver: true });

        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
        expect(state.players.get("u2")!.pilotFlightUsed).toBe(false);
        expect(state.players.get("u1")!.actionsLeft).toBe(0);
    });

    it("wraps round the running order", () => {
        const state = baseState({ u1: { actionsLeft: 0 }, u2: { actionsLeft: 0 } });
        const game = makeGame(state);
        game.currentTurn = "u2";

        new BannedIsletGameType().CheckEndTurn(game, { validMove: true, turnOver: true });

        expect(game.currentTurn).toBe("u1");
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });
});

describe("BannedIsletGameType.CheckGameOver (§4.1)", () => {
    // The whole team on Beacon Pier with everything lifted — §4.1 minus the
    // Helicopter Lift, which is all PR 3 can check.
    function escapedState(): IBannedIsletSpecificGameState {
        const state = baseState(
            { u1: { position: MIDDLE }, u2: { position: MIDDLE } },
            { tiles: { [MIDDLE]: PIER_TILE } },
        );
        for (const id of TREASURE_IDS) state.treasures[id] = true;
        return state;
    }

    it("ends the game as a shared win once everything is aboard and everyone is on the pier", () => {
        const state = escapedState();
        const game = makeGame(state);

        expect(new BannedIsletGameType().CheckGameOver(game)).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamwin');
        // A co-op result: no single id can be the winner.
        expect(game.winner).toBe("");
        expect(game.currentTurn).toBe("");
        expect(game.gameState.history[0].text).toMatch(/they win/);
        expect(game.gameState.history[0].text).not.toMatch(/\{\{/);
    });

    it("holds the whole team on the island while one treasure is still out there", () => {
        const state = escapedState();
        state.treasures.rootStone = false;
        const game = makeGame(state);

        expect(new BannedIsletGameType().CheckGameOver(game)).toBe(false);
        expect(game.complete).toBe(false);
    });

    it("holds the whole team on the island while one pawn is still off the pier", () => {
        const state = escapedState();
        state.players.get("u2")!.position = NORTH_OF_MIDDLE;
        const game = makeGame(state);

        expect(new BannedIsletGameType().CheckGameOver(game)).toBe(false);
    });

    it("is not a win on a sunk pier — that is §4.2's loss, and it fires wherever the pawns were (§16)", () => {
        const state = escapedState();
        state.positions[MIDDLE].state = 'sunk';
        const game = makeGame(state);

        expect(new BannedIsletGameType().CheckGameOver(game)).toBe(false);
        expect(game.complete).toBe(false);
    });

    it("passes a finished game straight through without rewriting how it ended", () => {
        const game = makeGame(baseState({ u1: {} }));
        game.complete = true;
        game.endReason = 'teamloss';

        expect(new BannedIsletGameType().CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamloss');
        expect(game.gameState.history).toHaveLength(0);
    });
});

describe("A whole escape, played through the command surface", () => {
    it("walks a treasure to the pier and wins, spending three actions a turn", async () => {
        // Two seats on a small stretch of island: the Ember Crown's Cinder
        // Temple next to Beacon Pier, everything else already lifted.
        const state = baseState(
            {
                u1: { position: NORTH_OF_MIDDLE, hand: ['emberCrown', 'emberCrown', 'emberCrown'] },
                u2: { position: NORTH_OF_MIDDLE, hand: ['emberCrown'] },
            },
            { tiles: { [NORTH_OF_MIDDLE]: 'cinderTemple', [MIDDLE]: PIER_TILE }, flooded: [MIDDLE] },
        );
        for (const id of TREASURE_IDS) state.treasures[id] = id !== 'emberCrown';
        const game = makeGame(state);
        const gameType = new BannedIsletGameType();

        // u2 hands over the fourth card and shores the pier before it sinks.
        game.currentTurn = "u2";
        expect((await cmd('giveCard', { targetUserId: "u1", cardId: 'emberCrown' }, "u2").Execute(game)).validMove).toBe(true);
        expect((await cmd('move', { target: MIDDLE }, "u2").Execute(game)).validMove).toBe(true);
        expect((await cmd('shoreUp', { target: MIDDLE }, "u2").Execute(game)).validMove).toBe(true);
        expect(state.positions[MIDDLE].state).toBe('dry');
        expect(gameType.CheckGameOver(game)).toBe(false);

        // u1 lifts the crown and follows them onto the pier.
        game.currentTurn = "u1";
        expect((await cmd('capture', {}, "u1").Execute(game)).validMove).toBe(true);
        expect(gameType.CheckGameOver(game)).toBe(false);
        expect((await cmd('move', { target: MIDDLE }, "u1").Execute(game)).validMove).toBe(true);

        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamwin');
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 2);
        expect(state.players.get("u2")!.actionsLeft).toBe(0);
    });
});
