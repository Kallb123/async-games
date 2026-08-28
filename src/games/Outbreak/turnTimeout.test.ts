import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { OutbreakGameType } from "./OutbreakLogic";
import { IOutbreakGameData, IOutbreakPlayerState, IOutbreakSpecificGameState } from "./OutbreakModels";
import { ATLANTA_CITY_ID, CITIES, CITY_COUNT } from "./board";
import { ACTIONS_PER_TURN, CUBES_PER_COLOR, HAND_LIMIT, emptyCubeCounts } from "./rules";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";

// docs/games/outbreak-gdd.md §21.6 step 7: a stalled turn resolves through
// Outbreak's own commands (forfeit remaining actions, then draw/infect, then
// discard if the draw needs it), never by mutating specificGameState from the
// cron directly — so this exercises resolveStalledTurn exactly as the
// turn-timer cron calls it, against a real OutbreakGameType and real commands.

function idFor(name: string): number {
    const city = CITIES.find(c => c.name === name);
    if (!city) throw new Error(`unknown city: ${name}`);
    return city.id;
}

// Mirrors OutbreakLogic.test.ts's baseState: an empty board, a station only
// in Atlanta — the initial infection is real RNG and isn't needed here.
function baseState(turnOrder: string[]): IOutbreakSpecificGameState {
    const cities = Array.from({ length: CITY_COUNT }, () => ({ cubes: emptyCubeCounts(), station: false }));
    cities[ATLANTA_CITY_ID].station = true;

    const players = new Map<string, IOutbreakPlayerState>();
    for (const userId of turnOrder) {
        players.set(userId, {
            hand: [],
            city: ATLANTA_CITY_ID,
            role: null,
            contingencyCard: null,
            actionsLeft: ACTIONS_PER_TURN,
            opsExpertFlightUsed: false,
        });
    }

    return {
        difficulty: 'standard',
        cities,
        cubesLeft: { blue: CUBES_PER_COLOR, yellow: CUBES_PER_COLOR, black: CUBES_PER_COLOR, red: CUBES_PER_COLOR },
        cures: { blue: 'none', yellow: 'none', black: 'none', red: 'none' },
        outbreaks: 0,
        infectionRateIndex: 0,
        playerDeck: [],
        playerDiscard: [],
        infectionDeck: [],
        infectionDiscard: [],
        players,
        phase: 'actions',
    };
}

// Real gameType and a no-op markModified — the only two things resolveStalledTurn
// needs beyond what OutbreakLogic.test.ts's own makeGame provides — so this can
// stand in for the live Mongoose document the cron actually calls it with.
function makeGame(state: IOutbreakSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IGameDataDocument {
    return {
        gameId: "g",
        gameType: new OutbreakGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function commandHistory(game: IGameDataDocument): { className: string }[] {
    return game.gameState.commandHistory as unknown as { className: string }[];
}

describe("resolveStalledTurn (Outbreak)", () => {
    it("forfeits every remaining action, then draws and infects, then advances the turn", async () => {
        const state = baseState(["u1", "u2"]);
        state.playerDeck = [idFor("Chicago"), idFor("Miami")];
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        // 4 forfeited actions + the end-of-turn draw, all real commands.
        expect(commandHistory(game).map(c => c.className)).toEqual([
            'OutbreakAction', 'OutbreakAction', 'OutbreakAction', 'OutbreakAction', 'OutbreakEndTurn',
        ]);
        expect(state.players.get("u1")!.actionsLeft).toBe(0);
        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("goes straight to the draw when no actions are left to forfeit", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("Chicago"), idFor("Miami")];
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        expect(commandHistory(game).map(c => c.className)).toEqual(['OutbreakEndTurn']);
        expect(game.currentTurn).toBe("u2");
    });

    it("discards down to the hand limit before advancing, when the forced draw needs it", async () => {
        const state = baseState(["u1", "u2"]);
        const ps = state.players.get("u1")!;
        ps.actionsLeft = 0;
        ps.hand = [idFor("Chicago"), idFor("Miami"), idFor("Tokyo"), idFor("Cairo"), idFor("Sydney"), idFor("Lagos")];
        state.playerDeck = [idFor("Paris"), idFor("Baghdad")];
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        expect(commandHistory(game).map(c => c.className)).toEqual(['OutbreakEndTurn', 'OutbreakDiscard']);
        expect(ps.hand.length).toBe(HAND_LIMIT);
        expect(state.phase).toBe('actions');
        expect(game.currentTurn).toBe("u2");
    });

    it("ends the game in a team loss when the forced draw empties the player deck", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [];
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('gameOver');
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });

    it("reports no adapter for a game type that hasn't registered one", async () => {
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);
        game.gameType = { ...game.gameType, className: "SomeOtherGameType" } as never;

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('noAdapter');
        expect(commandHistory(game)).toEqual([]);
    });
});
