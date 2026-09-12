import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { BannedIsletGameType } from "./BannedIsletLogic";
import type { IBannedIsletSpecificGameState } from "./BannedIsletModels";
import { ACTIONS_PER_TURN, HAND_LIMIT, LOSING_WATER_LEVEL, PIER_TILE, TILE_COUNT } from "./board";
import { MIDDLE, TOP_TIP, TOP_TIP_EAST, NORTH_OF_MIDDLE, baseState } from "./testFixtures";

// docs/games/banned-islet.md §21.6 PR 6: a stalled turn resolves through this
// game's own commands — forfeit the rest of the actions, then draw and flood,
// then discard if the draw needs it — never by mutating specificGameState from
// the cron. So this exercises resolveStalledTurn exactly as the turn-timer
// cron calls it, against a real BannedIsletGameType and real commands, in the
// shape of src/games/Outbreak/turnTimeout.test.ts.

function makeGame(state: IBannedIsletSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IGameDataDocument {
    return {
        gameId: "g",
        gameType: new BannedIsletGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function playedClassNames(game: IGameDataDocument): string[] {
    return (game.gameState.commandHistory as unknown as { className: string }[]).map(c => c.className);
}

describe("Banned Islet turn timeout (§21.6 PR 6)", () => {
    it("forfeits the remaining actions, then draws and floods", async () => {
        const state = baseState({ u1: { position: MIDDLE }, u2: {} });
        state.waterLevel = 1;                               // §11: rate 2
        state.treasureDeck = ['emberCrown', 'stormIdol'];
        state.floodDeck = ['kelpStair', 'saltMarket', 'crabFlats'];
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('advanced');

        // The island is not skipped: a silent player pays exactly what a
        // player who passed would have.
        expect(playedClassNames(game)).toEqual(['BannedIsletAction', 'BannedIsletEndTurn']);
        expect(state.floodDiscard).toEqual(['kelpStair', 'saltMarket']);
        expect(state.players.get("u1")!.hand).toEqual(['emberCrown', 'stormIdol']);

        // And the next seat gets a playable turn — the counter refills in
        // CheckEndTurn, which the cron's plain advance never called.
        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("ends the turn straight away when the actions were already spent", async () => {
        const state = baseState({ u1: { actionsLeft: 0 }, u2: {} });
        state.floodDeck = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('advanced');

        expect(playedClassNames(game)).toEqual(['BannedIsletEndTurn']);
        expect(game.currentTurn).toBe("u2");
    });

    it("keeps §10's specials back when it has to choose the discard (§21.3)", async () => {
        // The forced discard is rules.ts's `forcedDiscard`, not "the first N in
        // the array": a stalled turn must not cost the team the only Helicopter
        // Lift, which is the card §4.1's win is actually taken with.
        const state = baseState(
            { u1: { actionsLeft: 0, hand: ['helicopterLift', 'sandbags', 'emberCrown', 'stormIdol', 'tideChalice'] }, u2: {} },
        );
        state.treasureDeck = ['rootStone', 'rootStone'];
        state.floodDeck = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('advanced');

        const hand = state.players.get("u1")!.hand;
        expect(hand).toHaveLength(HAND_LIMIT);
        expect(hand).toContain('helicopterLift');
        expect(hand).toContain('sandbags');
    });

    it("resolves a turn the draw left over the hand limit, which nothing else could (§10)", async () => {
        const state = baseState(
            { u1: { actionsLeft: 0, hand: ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'stormIdol'] }, u2: {} },
        );
        state.waterLevel = 1;
        state.treasureDeck = ['tideChalice', 'rootStone'];
        state.floodDeck = ['kelpStair', 'saltMarket'];
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('advanced');

        // Without the adapter this state is a dead end: every other command
        // refuses outside 'actions', and only u1 may send the discard — which
        // the command route stops allowing the moment currentTurn moves on.
        expect(playedClassNames(game)).toEqual(['BannedIsletEndTurn', 'BannedIsletDiscard']);
        expect(state.phase).toBe('actions');
        expect(state.players.get("u1")!.hand).toHaveLength(HAND_LIMIT);
        expect(state.floodDiscard).toHaveLength(2);
        expect(game.currentTurn).toBe("u2");
    });

    it("stops at a flood that ends the game, rather than playing on past it (§4.2)", async () => {
        const state = baseState({ u1: { actionsLeft: 0, position: MIDDLE }, u2: {} }, {
            tiles: { [MIDDLE]: PIER_TILE },
            flooded: [MIDDLE],
        });
        state.waterLevel = 1;
        state.floodDeck = [PIER_TILE, 'kelpStair'];
        const game = makeGame(state);

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('gameOver');

        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
        expect(game.endDetail).toBe('Beacon Pier sank and the way off the island went with it');
    });

    it("declines a turn for a seat the game doesn't hold, rather than looping on it", async () => {
        const state = baseState({ u1: {}, u2: {} });
        const game = makeGame(state, ["u1", "u2", "ghost"]);
        game.currentTurn = "ghost";

        expect(await resolveStalledTurn(game, "ghost", "Ghost")).toBe('declined');
        expect(playedClassNames(game)).toEqual([]);
    });

    it("keeps every flood card accounted for across a forced turn (§21.7)", async () => {
        const state = baseState({ u1: { actionsLeft: 0, position: TOP_TIP }, u2: {} }, {
            flooded: [TOP_TIP_EAST, NORTH_OF_MIDDLE],
        });
        state.waterLevel = LOSING_WATER_LEVEL - 2;          // §11: the deepest rate
        state.floodDeck = [...state.positions.map(p => p.tile)];
        const game = makeGame(state);

        await resolveStalledTurn(game, "u1", "Alice");

        const sunk = state.positions.filter(p => p.state === 'sunk').length;
        expect(sunk + state.floodDeck.length + state.floodDiscard.length).toBe(TILE_COUNT);
    });
});
