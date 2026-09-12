import { describe, expect, it } from "vitest";
import {
    BannedIsletAction,
    BannedIsletActionKind,
    BannedIsletDiscard,
    BannedIsletEndTurn,
    BannedIsletGameType,
    IBannedIsletFloodPhaseOutcome,
} from "./BannedIsletLogic";
import { buildInitialBannedIsletState } from "./BannedIsletModels";
import type { IBannedIsletGameData, IBannedIsletSpecificGameState } from "./BannedIsletModels";
import { positionOfTile } from "./rules";
import { runCommand } from "@/utils/games/commandPipeline";
import {
    ACTIONS_PER_TURN,
    CARDS_TO_CAPTURE,
    DIFFICULTIES,
    HAND_LIMIT,
    LOSING_WATER_LEVEL,
    PIER_TILE,
    TILE_COUNT,
    TILE_IDS,
    TREASURE_IDS,
    BannedIsletCardId,
    BannedIsletTileId,
} from "./board";
import {
    EAST_OF_MIDDLE,
    FAR_EAST,
    MIDDLE,
    NORTH_EAST,
    NORTH_OF_MIDDLE,
    SOUTH_OF_MIDDLE,
    TOP_TIP,
    TOP_TIP_EAST,
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

// ═══════════════════════════════════════════════════════════════════════════
//  PR 5 — THE DRAW AND FLOOD PHASES (§7 Phases 2-3, §9-§11)
// ═══════════════════════════════════════════════════════════════════════════

function endTurn(fields: Partial<BannedIsletEndTurn> = {}, senderId = "u1"): BannedIsletEndTurn {
    const command = new BannedIsletEndTurn();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, fields);
}

function discard(cardIds: BannedIsletCardId[], senderId = "u1"): BannedIsletDiscard {
    const command = new BannedIsletDiscard();
    command.senderId = senderId;
    command.senderUsername = senderId;
    command.cardIds = cardIds;
    return command;
}

/** A state whose turn is spent, so BannedIsletEndTurn is the only thing left to send. */
function endOfTurnState(
    players: Parameters<typeof baseState>[0] = { u1: {} },
    options: Parameters<typeof baseState>[1] = {},
): IBannedIsletSpecificGameState {
    const state = baseState(players, options);
    for (const ps of state.players.values()) ps.actionsLeft = 0;
    return state;
}

/**
 * §21.7's conservation invariant: 24 tiles and 24 flood cards, and a sunk
 * tile's card leaves the game (§9.1). Whatever the phase did, the sunk tiles
 * plus the flood deck plus the flood discard still account for every card —
 * which is what catches a sunk tile's card being discarded instead of removed.
 */
function floodCardsAccountedFor(state: IBannedIsletSpecificGameState): number {
    return state.positions.filter(p => p.state === 'sunk').length
        + state.floodDeck.length
        + state.floodDiscard.length;
}

describe("BannedIsletEndTurn — Phase 3, the flood (§7, §9.1)", () => {
    it("floods dry tiles at the current rate and discards their cards", async () => {
        const state = endOfTurnState();
        state.waterLevel = 1;                       // §11: rate 2
        state.floodDeck = ['kelpStair', 'saltMarket', 'crabFlats'];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
        expect(outcome.floodLog).toEqual([
            { kind: 'flood', tile: 'kelpStair', outcome: 'flooded' },
            { kind: 'flood', tile: 'saltMarket', outcome: 'flooded' },
        ]);
        expect(state.positions[positionOfTile(state.positions, 'kelpStair')].state).toBe('flooded');
        expect(state.positions[positionOfTile(state.positions, 'saltMarket')].state).toBe('flooded');
        expect(state.floodDeck).toEqual(['crabFlats']);
        expect(state.floodDiscard).toEqual(['kelpStair', 'saltMarket']);
    });

    it("sinks a flooded tile and takes its flood card out of the game (§9.1)", async () => {
        const state = endOfTurnState({ u1: { position: FAR_EAST } }, { tiles: { [MIDDLE]: 'kelpStair' }, flooded: [MIDDLE] });
        state.waterLevel = 1;
        state.floodDeck = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(state.positions[MIDDLE].state).toBe('sunk');
        expect(outcome.floodLog[0]).toEqual({ kind: 'flood', tile: 'kelpStair', outcome: 'sunk', swims: [] });
        // The sunk tile's card is gone for good; the one that only flooded is
        // back in the discard, where it is the team's forecast (§14.2).
        expect(state.floodDiscard).toEqual(['saltMarket']);
        expect(state.floodDeck).toEqual([]);
    });

    it("reshuffles the discard and continues the same draw when the deck empties mid-draw (§11)", async () => {
        const state = endOfTurnState();
        state.waterLevel = 1;
        state.floodDeck = [];
        state.floodDiscard = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        // The draw is continued into the reshuffled deck rather than truncated.
        expect(outcome.floodLog[0]).toEqual({ kind: 'reshuffle', shuffledBack: 2 });
        expect(outcome.floodLog.filter(e => e.kind === 'flood')).toHaveLength(2);
        expect([...state.floodDiscard].sort()).toEqual(['kelpStair', 'saltMarket']);
        expect(state.floodDeck).toEqual([]);
    });

    it("draws nothing when every remaining flood card has left the game with its tile", async () => {
        const state = endOfTurnState();
        state.floodDeck = [];
        state.floodDiscard = [];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(outcome.turnOver).toBe(true);
        expect(outcome.floodLog).toEqual([]);
    });

    it("keeps all 24 flood cards accounted for across a run of floods and sinkings (§21.7)", async () => {
        const state = endOfTurnState({ u1: { position: MIDDLE } }, { flooded: [1, 2, 3, 4] });
        state.waterLevel = 8;                       // §11: rate 6
        state.floodDeck = [...TILE_IDS];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(floodCardsAccountedFor(state)).toBe(TILE_COUNT);
    });

    it("refuses to run before the three actions are spent, out of phase, or for a seat that isn't playing", async () => {
        const spent = endOfTurnState();
        spent.phase = 'discard';
        expect(await endTurn().Execute(makeGame(spent))).toEqual({ validMove: false, turnOver: false });

        const unspent = baseState({ u1: {} });
        expect(await endTurn().Execute(makeGame(unspent))).toEqual({ validMove: false, turnOver: false });

        const stranger = endOfTurnState();
        expect(await endTurn({}, "nobody").Execute(makeGame(stranger))).toEqual({ validMove: false, turnOver: false });
    });
});

describe("BannedIsletEndTurn — swimming (§9.2, §21.3)", () => {
    it("swims every pawn the sinking caught, and logs where each one surfaced", async () => {
        const state = endOfTurnState(
            { u1: { position: MIDDLE }, u2: { position: MIDDLE } },
            { tiles: { [MIDDLE]: 'kelpStair', [NORTH_OF_MIDDLE]: 'saltMarket' }, flooded: [MIDDLE] },
        );
        state.waterLevel = 1;
        state.floodDeck = ['kelpStair'];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        const swims = outcome.floodLog[0].swims!;
        expect(swims.map(s => s.userId)).toEqual(["u1", "u2"]);
        expect(swims.every(s => s.from === MIDDLE && s.to !== null && s.to !== MIDDLE)).toBe(true);
        expect(state.players.get("u1")!.position).toBe(swims[0].to);
        expect(state.players.get("u2")!.position).toBe(swims[1].to);
        // §21.3: never a silent pawn teleport — each swim earns its own line.
        expect(game.gameState.history.filter(h => h.text.includes('swam off Kelp Stair'))).toHaveLength(2);
    });
});

describe("BannedIsletEndTurn — Phase 2, the draw (§7, §10)", () => {
    it("draws two treasure cards into the hand", async () => {
        const state = endOfTurnState();
        state.treasureDeck = ['emberCrown', 'stormIdol', 'sandbags'];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(state.players.get("u1")!.hand).toEqual(['emberCrown', 'stormIdol']);
        expect(state.treasureDeck).toEqual(['sandbags']);
    });

    it("shuffles the treasure discard into a new deck when it runs out (§10)", async () => {
        const state = endOfTurnState();
        state.treasureDeck = [];
        state.treasureDiscard = ['emberCrown', 'stormIdol', 'tideChalice'];
        const command = endTurn();
        const game = makeGame(state);

        await command.Execute(game);

        // Routine rather than a crisis: no treasure card ever leaves the game,
        // so the pile always refills the deck — and the order it refilled in is
        // recorded, or a replay would deal somebody a different hand.
        expect(command.recordedTreasureShuffles).toHaveLength(1);
        expect([...command.recordedTreasureShuffles![0]].sort()).toEqual(['emberCrown', 'stormIdol', 'tideChalice']);
        expect(state.players.get("u1")!.hand).toHaveLength(2);
        expect(state.treasureDeck).toHaveLength(1);
    });

    it("holds the turn open at the hand limit, then floods once the discard closes it (§10, §16)", async () => {
        const state = endOfTurnState({ u1: { hand: ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'stormIdol'] } });
        state.waterLevel = 1;
        state.treasureDeck = ['tideChalice', 'rootStone'];
        state.floodDeck = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        const drew = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        // Phase 3 has not run: the island waits on the discard.
        expect(drew.turnOver).toBe(false);
        expect(state.phase).toBe('discard');
        expect(state.players.get("u1")!.hand).toHaveLength(HAND_LIMIT + 2);
        expect(state.floodDeck).toHaveLength(2);

        const closed = await discard(['stormIdol', 'tideChalice']).Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(closed.turnOver).toBe(true);
        expect(state.phase).toBe('actions');
        expect(state.players.get("u1")!.hand).toHaveLength(HAND_LIMIT);
        expect(state.treasureDiscard).toEqual(['stormIdol', 'tideChalice']);
        expect(closed.floodLog.filter(e => e.kind === 'flood')).toHaveLength(2);
    });
});

describe("BannedIsletDiscard (§10)", () => {
    const OVERFULL: BannedIsletCardId[] = ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'stormIdol', 'tideChalice', 'rootStone'];

    function overLimitGame() {
        const state = endOfTurnState({ u1: { hand: [...OVERFULL] } });
        state.phase = 'discard';
        return { state, game: makeGame(state) };
    }

    it("discards repeated copies of the same card, since cards are interchangeable (§10)", async () => {
        const { state, game } = overLimitGame();

        expect((await discard(['emberCrown', 'emberCrown']).Execute(game)).validMove).toBe(true);

        expect(state.players.get("u1")!.hand).toEqual(['emberCrown', 'emberCrown', 'stormIdol', 'tideChalice', 'rootStone']);
        expect(state.treasureDiscard).toEqual(['emberCrown', 'emberCrown']);
    });

    it("refuses a list that lands short of the limit, past it, or names cards the player doesn't hold", async () => {
        for (const cardIds of [
            [] as BannedIsletCardId[],
            ['emberCrown'] as BannedIsletCardId[],                                   // still over the limit
            ['emberCrown', 'emberCrown', 'emberCrown'] as BannedIsletCardId[],       // under it
            ['emberCrown', 'sandbags'] as BannedIsletCardId[],                       // not in hand
            ['stormIdol', 'stormIdol'] as BannedIsletCardId[],                       // only one held
        ]) {
            const { state, game } = overLimitGame();
            expect(await discard(cardIds).Execute(game)).toEqual({ validMove: false, turnOver: false });
            expect(state.players.get("u1")!.hand).toEqual(OVERFULL);
            expect(state.phase).toBe('discard');
        }
    });

    it("refuses to run outside the discard phase", async () => {
        const state = endOfTurnState({ u1: { hand: [...OVERFULL] } });
        expect(await discard(['emberCrown', 'emberCrown']).Execute(makeGame(state))).toEqual({ validMove: false, turnOver: false });
    });
});

describe("Waters Rise! (§11)", () => {
    it("raises the meter, puts the whole flood discard back on top of the deck and discards itself", async () => {
        const state = endOfTurnState();
        state.waterLevel = 1;
        state.treasureDeck = ['watersRise', 'emberCrown'];
        state.floodDeck = ['shellRoad'];
        state.floodDiscard = ['kelpStair', 'saltMarket', 'crabFlats'];
        const command = endTurn();
        const game = makeGame(state);

        const outcome = await command.Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(state.waterLevel).toBe(2);
        expect(outcome.floodLog[0]).toEqual({ kind: 'watersRise', waterLevelAfter: 2, floodRateAfter: 2, shuffledBack: 3 });
        // Never held (§10) — it goes straight to the treasure discard.
        expect(state.players.get("u1")!.hand).toEqual(['emberCrown']);
        expect(state.treasureDiscard).toEqual(['watersRise']);
        // The three returned cards went on *top*, so Phase 3's two draws came
        // out of them and the card that was already in the deck is untouched
        // at the bottom.
        const returned = command.recordedFloodShuffles![0];
        expect([...returned].sort()).toEqual(['crabFlats', 'kelpStair', 'saltMarket']);
        expect(state.floodDeck).toEqual([returned[2], 'shellRoad']);
        expect(state.floodDiscard).toEqual([returned[0], returned[1]]);
        expect(floodCardsAccountedFor(state)).toBe(4);
    });

    it("resolves the first fully before the second is drawn (§16)", async () => {
        const state = endOfTurnState();
        state.waterLevel = 1;
        state.treasureDeck = ['watersRise', 'watersRise'];
        state.floodDeck = [];
        state.floodDiscard = ['kelpStair'];
        const command = endTurn();
        const game = makeGame(state);

        const outcome = await command.Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(state.waterLevel).toBe(3);
        // The first rise takes the whole discard; the second picks up what the
        // first left, which is nothing — exactly §16's "correct and brutal".
        expect(command.recordedFloodShuffles!.slice(0, 2)).toEqual([['kelpStair'], []]);
        expect(outcome.floodLog.filter(e => e.kind === 'watersRise')).toHaveLength(2);
    });

    it("prefers a recorded shuffle over rolling a new one, so a replay re-orders the deck identically (§21.4)", async () => {
        const recorded: BannedIsletTileId[][] = [['crabFlats', 'kelpStair', 'saltMarket']];
        const state = endOfTurnState();
        state.waterLevel = 2;                       // rises to 3 — §11: rate 3, the whole deck
        state.treasureDeck = ['watersRise', 'emberCrown'];
        state.floodDiscard = ['kelpStair', 'saltMarket', 'crabFlats'];
        const game = makeGame(state);

        const outcome = await endTurn({ recordedFloodShuffles: recorded }).Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(outcome.floodLog.filter(e => e.kind === 'flood').map(e => e.tile))
            .toEqual(['crabFlats', 'kelpStair', 'saltMarket']);
    });
});

describe("The four defeats (§4.2)", () => {
    it("ends the game when Beacon Pier sinks, whoever was standing on it (§16)", async () => {
        const state = endOfTurnState({ u1: { position: MIDDLE } }, { tiles: { [MIDDLE]: PIER_TILE }, flooded: [MIDDLE] });
        state.waterLevel = 1;
        state.floodDeck = [PIER_TILE, 'kelpStair'];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
        expect(game.endDetail).toBe('Beacon Pier sank and the way off the island went with it');
        // The pier loss fires first, so the rest of the rate is never drawn.
        expect(state.floodDeck).toEqual(['kelpStair']);
    });

    it("ends the game when both of an uncaptured treasure's tiles sink", async () => {
        const state = endOfTurnState({ u1: { position: MIDDLE } }, {
            tiles: { [WEST_OF_MIDDLE]: 'cinderTemple', [EAST_OF_MIDDLE]: 'ashfallHollow' },
            flooded: [WEST_OF_MIDDLE, EAST_OF_MIDDLE],
        });
        state.waterLevel = 1;
        state.floodDeck = ['cinderTemple', 'ashfallHollow'];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(game.endReason).toBe('teamloss');
        expect(game.endDetail).toBe('both Ember Crown tiles sank with the treasure still on the island');
    });

    it("does not end the game when a treasure already captured loses its tiles", async () => {
        const state = endOfTurnState({ u1: { position: MIDDLE } }, {
            tiles: { [WEST_OF_MIDDLE]: 'cinderTemple', [EAST_OF_MIDDLE]: 'ashfallHollow' },
            flooded: [WEST_OF_MIDDLE, EAST_OF_MIDDLE],
        });
        state.treasures.emberCrown = true;
        state.waterLevel = 1;
        state.floodDeck = ['cinderTemple', 'ashfallHollow'];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(game.complete).toBeFalsy();
    });

    it("ends the game when a sinking leaves a pawn with nowhere to swim (§9.2)", async () => {
        const state = endOfTurnState(
            { u1: { position: TOP_TIP } },
            { tiles: { [TOP_TIP]: 'kelpStair' }, flooded: [TOP_TIP], sunk: [TOP_TIP_EAST, NORTH_OF_MIDDLE] },
        );
        state.waterLevel = 1;
        state.floodDeck = ['kelpStair'];
        const game = makeGame(state);

        const outcome = await endTurn().Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(game.endReason).toBe('teamloss');
        expect(game.endDetail).toBe('a player was swept off Kelp Stair with nowhere to swim');
        expect(outcome.floodLog[0].swims).toEqual([{ userId: "u1", from: TOP_TIP, to: null }]);
        // The pawn stays where it drowned rather than being moved nowhere.
        expect(state.players.get("u1")!.position).toBe(TOP_TIP);
    });

    it("ends the game when Waters Rise! takes the meter to the skull (§11)", async () => {
        const state = endOfTurnState();
        state.waterLevel = LOSING_WATER_LEVEL - 1;
        state.treasureDeck = ['watersRise', 'emberCrown'];
        state.floodDeck = ['kelpStair'];
        const command = endTurn();
        const game = makeGame(state);

        const outcome = await command.Execute(game) as IBannedIsletFloodPhaseOutcome;

        expect(state.waterLevel).toBe(LOSING_WATER_LEVEL);
        expect(game.endDetail).toBe(`the water level reached ${LOSING_WATER_LEVEL}`);
        // §11 step 1 ends it before step 2 re-orders anything, and nothing floods.
        expect(command.recordedFloodShuffles).toBeUndefined();
        expect(state.floodDeck).toEqual(['kelpStair']);
        expect(outcome.floodLog).toEqual([{ kind: 'watersRise', waterLevelAfter: LOSING_WATER_LEVEL }]);
    });

    it("never puts a {{userId}} token in endDetail, which nothing resolves (§4.2)", async () => {
        const state = endOfTurnState(
            { u1: { position: TOP_TIP } },
            { tiles: { [TOP_TIP]: 'kelpStair' }, flooded: [TOP_TIP], sunk: [TOP_TIP_EAST, NORTH_OF_MIDDLE] },
        );
        state.floodDeck = ['kelpStair'];
        const game = makeGame(state);

        await endTurn().Execute(game);

        expect(game.endDetail).not.toContain('{{');
        // The history line, which *is* resolved, still names who drowned.
        expect(game.gameState.history[0].text).toContain('{{u1}}');
    });
});

describe("A whole game, at every difficulty (§13, §21.7)", () => {
    // Plays legal-but-passive turns — three passes and an end turn per player,
    // discarding down whenever the draw demands it — until the island wins or
    // the deck can no longer hurt anybody. Nothing here is good play; the point
    // is that the loop always terminates, never deadlocks, and never leaves a
    // flood card unaccounted for (§21.7's conservation invariant).
    it.each(DIFFICULTIES.map(d => d.id))("terminates without deadlocking on %s", async (difficulty) => {
        const turnOrder = ["u1", "u2"];
        const state = buildInitialBannedIsletState(turnOrder, difficulty);
        const game = makeGame(state, turnOrder);
        const gameType = new BannedIsletGameType();

        for (let turn = 0; turn < 200 && !game.complete; turn++) {
            const userId = game.currentTurn;
            const ps = state.players.get(userId)!;

            if (state.phase === 'discard') {
                const over = ps.hand.length - HAND_LIMIT;
                const { gameOver } = await runCommand(game, gameType, discard(ps.hand.slice(0, over), userId));
                expect(game.gameState.commandHistory.length).toBeGreaterThan(0);
                if (gameOver) break;
            } else {
                expect((await runCommand(game, gameType, cmd('pass', {}, userId))).outcome.validMove).toBe(true);
                const { outcome, gameOver } = await runCommand(game, gameType, endTurn({}, userId));
                expect(outcome.validMove).toBe(true);
                if (gameOver) break;
            }
            expect(floodCardsAccountedFor(state)).toBe(TILE_COUNT);
        }

        // A table that never moves always loses, and always to a named defeat.
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
        expect(game.endDetail).toBeTruthy();
        expect(floodCardsAccountedFor(state)).toBe(TILE_COUNT);
    });
});
