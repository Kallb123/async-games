import { describe, expect, it } from "vitest";
import { OutbreakAction, OutbreakGameType } from "./OutbreakLogic";
import { IOutbreakGameData, IOutbreakPlayerState } from "./OutbreakModels";
import { ATLANTA_CITY_ID, CITIES, CITY_COUNT, DISEASE_COLORS, cityIdsForColor } from "./board";
import { ACTIONS_PER_TURN, CUBES_PER_COLOR, cureCardsRequired, emptyCubeCounts } from "./rules";
import type { IOutbreakSpecificGameState } from "./OutbreakModels";

// ─── Minimal in-memory game harness (mirrors SolitaireLogic.test.ts) ──────────

function idFor(name: string): number {
    const city = CITIES.find(c => c.name === name);
    if (!city) throw new Error(`unknown city: ${name}`);
    return city.id;
}

// A deterministic state with an empty board and a station only in Atlanta —
// buildInitialOutbreakState's initial infection is real RNG and isn't needed
// to exercise the action phase in isolation.
function baseState(turnOrder: string[]): IOutbreakSpecificGameState {
    const cities = Array.from({ length: CITY_COUNT }, () => ({ cubes: emptyCubeCounts(), station: false }));
    cities[ATLANTA_CITY_ID].station = true;

    const players = new Map<string, IOutbreakPlayerState>();
    for (const userId of turnOrder) {
        players.set(userId, { hand: [], city: ATLANTA_CITY_ID, role: null, contingencyCard: null, actionsLeft: ACTIONS_PER_TURN });
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

function makeGame(state: IOutbreakSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IOutbreakGameData {
    return {
        gameId: "g",
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IOutbreakGameData;
}

function cmd(overrides: Partial<OutbreakAction> = {}, senderId = "u1"): OutbreakAction {
    const action = new OutbreakAction();
    action.senderId = senderId;
    action.senderUsername = senderId === "u1" ? "Alice" : "Bob";
    return Object.assign(action, overrides);
}

// ─── Movement ───────────────────────────────────────────────────────────────

describe("OutbreakAction movement", () => {
    it("drives to an adjacent city", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);
        const chicago = idFor("Chicago");

        const outcome = await cmd({ kind: 'drive', destination: chicago }).Execute(game);

        expect(outcome).toMatchObject({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.city).toBe(chicago);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    });

    it("rejects driving to a non-adjacent city", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);
        const tokyo = idFor("Tokyo");

        const outcome = await cmd({ kind: 'drive', destination: tokyo }).Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
        expect(state.players.get("u1")!.city).toBe(ATLANTA_CITY_ID);
    });

    it("flies direct by discarding the destination's city card", async () => {
        const state = baseState(["u1"]);
        const tokyo = idFor("Tokyo");
        state.players.get("u1")!.hand = [tokyo];
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'directFlight', destination: tokyo }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.players.get("u1")!.city).toBe(tokyo);
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.playerDiscard).toEqual([tokyo]);
    });

    it("charters a flight anywhere by discarding the current city's own card", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.hand = [ATLANTA_CITY_ID];
        const game = makeGame(state, ["u1"]);
        const sydney = idFor("Sydney");

        const outcome = await cmd({ kind: 'charterFlight', destination: sydney }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.players.get("u1")!.city).toBe(sydney);
        expect(state.playerDiscard).toEqual([ATLANTA_CITY_ID]);
    });

    it("rejects a charter flight without the current city's own card", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'charterFlight', destination: idFor("Sydney") }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });

    it("shuttles between two research stations for free", async () => {
        const state = baseState(["u1"]);
        const tokyo = idFor("Tokyo");
        state.cities[tokyo].station = true;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'shuttleFlight', destination: tokyo }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.players.get("u1")!.city).toBe(tokyo);
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.playerDiscard).toEqual([]);
    });

    it("rejects a shuttle flight when the destination has no station", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'shuttleFlight', destination: idFor("Tokyo") }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });
});

// ─── Build a Research Station ───────────────────────────────────────────────

describe("OutbreakAction buildStation", () => {
    it("builds a station by discarding the matching city card", async () => {
        const state = baseState(["u1"]);
        const chicago = idFor("Chicago");
        state.players.get("u1")!.city = chicago;
        state.players.get("u1")!.hand = [chicago];
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'buildStation' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.cities[chicago].station).toBe(true);
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.playerDiscard).toEqual([chicago]);
    });

    it("rejects building where a station already stands", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.hand = [ATLANTA_CITY_ID];
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'buildStation' }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });

    it("requires relocating an existing station once all six are placed", async () => {
        const state = baseState(["u1"]);
        const stationCities = ["Chicago", "New York", "London", "Tokyo", "Sydney"].map(idFor);
        for (const id of stationCities) state.cities[id].station = true; // + Atlanta = 6

        const bangkok = idFor("Bangkok");
        state.players.get("u1")!.city = bangkok;
        state.players.get("u1")!.hand = [bangkok];
        const game = makeGame(state, ["u1"]);

        const withoutRelocate = await cmd({ kind: 'buildStation' }).Execute(game);
        expect(withoutRelocate.validMove).toBe(false);

        const chicago = idFor("Chicago");
        const outcome = await cmd({ kind: 'buildStation', relocateFrom: chicago }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.cities[chicago].station).toBe(false);
        expect(state.cities[bangkok].station).toBe(true);
        // Still exactly six on the board.
        expect(state.cities.filter(c => c.station).length).toBe(6);
    });
});

// ─── Treat Disease ──────────────────────────────────────────────────────────

describe("OutbreakAction treatDisease", () => {
    it("removes one cube of the chosen colour", async () => {
        const state = baseState(["u1"]);
        state.cities[ATLANTA_CITY_ID].cubes.blue = 2;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'treatDisease', color: 'blue' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.cities[ATLANTA_CITY_ID].cubes.blue).toBe(1);
        expect(state.cubesLeft.blue).toBe(CUBES_PER_COLOR + 1);
    });

    it("rejects treating a colour with no cubes in the city", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'treatDisease', color: 'blue' }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });

    it("clears every cube of a cured colour from the city in one action", async () => {
        const state = baseState(["u1"]);
        state.cities[ATLANTA_CITY_ID].cubes.blue = 3;
        state.cubesLeft.blue = CUBES_PER_COLOR - 3;
        state.cures.blue = 'cured';
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'treatDisease', color: 'blue' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.cities[ATLANTA_CITY_ID].cubes.blue).toBe(0);
        expect(state.cubesLeft.blue).toBe(CUBES_PER_COLOR);
    });

    it("eradicates a cured colour the moment its last cube leaves the board", async () => {
        const state = baseState(["u1"]);
        state.cities[ATLANTA_CITY_ID].cubes.blue = 1;
        state.cubesLeft.blue = CUBES_PER_COLOR - 1;
        state.cures.blue = 'cured';
        const game = makeGame(state, ["u1"]);

        await cmd({ kind: 'treatDisease', color: 'blue' }).Execute(game);

        expect(state.cures.blue).toBe('eradicated');
    });
});

// ─── Share Knowledge ────────────────────────────────────────────────────────

describe("OutbreakAction shareKnowledge", () => {
    it("gives the current city's card to a teammate in the same city", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [ATLANTA_CITY_ID];
        const game = makeGame(state);

        const outcome = await cmd({ kind: 'shareKnowledge', targetUserId: "u2", direction: 'give' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.players.get("u2")!.hand).toEqual([ATLANTA_CITY_ID]);
    });

    it("takes the current city's card from a teammate in the same city", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u2")!.hand = [ATLANTA_CITY_ID];
        const game = makeGame(state);

        const outcome = await cmd({ kind: 'shareKnowledge', targetUserId: "u2", direction: 'take' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.players.get("u1")!.hand).toEqual([ATLANTA_CITY_ID]);
        expect(state.players.get("u2")!.hand).toEqual([]);
    });

    it("rejects sharing with a teammate who isn't in the same city", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [ATLANTA_CITY_ID];
        state.players.get("u2")!.city = idFor("Chicago");
        const game = makeGame(state);

        const outcome = await cmd({ kind: 'shareKnowledge', targetUserId: "u2", direction: 'give' }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });
});

// ─── Discover a Cure ────────────────────────────────────────────────────────

describe("OutbreakAction cure", () => {
    it("discovers a cure by discarding the required cards at a research station", async () => {
        const state = baseState(["u1"]);
        const blueCards = cityIdsForColor('blue').slice(0, cureCardsRequired());
        state.players.get("u1")!.hand = [...blueCards];
        // A cube still on the board — this cure should stop at 'cured', not
        // jump straight to 'eradicated'.
        state.cities[idFor("Chicago")].cubes.blue = 1;
        state.cubesLeft.blue = CUBES_PER_COLOR - 1;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'cure', color: 'blue', cardIds: blueCards }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.cures.blue).toBe('cured');
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.playerDiscard).toEqual(blueCards);
    });

    it("rejects curing away from a research station", async () => {
        const state = baseState(["u1"]);
        const blueCards = cityIdsForColor('blue').slice(0, cureCardsRequired());
        state.players.get("u1")!.city = idFor("Chicago");
        state.players.get("u1")!.hand = [...blueCards];
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'cure', color: 'blue', cardIds: blueCards }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });

    it("rejects curing with too few matching cards", async () => {
        const state = baseState(["u1"]);
        const blueCards = cityIdsForColor('blue').slice(0, cureCardsRequired() - 1);
        state.players.get("u1")!.hand = [...blueCards];
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'cure', color: 'blue', cardIds: blueCards }).Execute(game);

        expect(outcome.validMove).toBe(false);
    });

    it("eradicates a colour cured with zero cubes already on the board", async () => {
        const state = baseState(["u1"]);
        const blueCards = cityIdsForColor('blue').slice(0, cureCardsRequired());
        state.players.get("u1")!.hand = [...blueCards];
        // cubesLeft already starts at CUBES_PER_COLOR (no cubes on the board).
        const game = makeGame(state, ["u1"]);

        await cmd({ kind: 'cure', color: 'blue', cardIds: blueCards }).Execute(game);

        expect(state.cures.blue).toBe('eradicated');
    });
});

// ─── Pass / the action economy ──────────────────────────────────────────────

describe("OutbreakAction pass and the four-action turn", () => {
    it("forfeits a single action without changing the board", async () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'pass' }).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    });

    it("rejects any action once actionsLeft is exhausted", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd({ kind: 'pass' }).Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("reports turnOver on the fourth action, and CheckEndTurn hands the turn to the next player with a full refill", async () => {
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);
        const gameType = new OutbreakGameType();

        let outcome;
        for (let i = 0; i < ACTIONS_PER_TURN; i++) {
            outcome = await cmd({ kind: 'pass' }).Execute(game);
            expect(outcome.validMove).toBe(true);
        }
        expect(outcome).toMatchObject({ turnOver: true });
        expect(state.players.get("u1")!.actionsLeft).toBe(0);

        gameType.CheckEndTurn(game, outcome!);

        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });
});

// ─── Game over ──────────────────────────────────────────────────────────────

describe("OutbreakGameType.CheckGameOver", () => {
    it("is not over while any disease remains uncured", () => {
        const state = baseState(["u1"]);
        state.cures = { blue: 'cured', yellow: 'cured', black: 'cured', red: 'none' };
        const game = makeGame(state, ["u1"]);

        expect(new OutbreakGameType().CheckGameOver(game)).toBe(false);
        expect(game.complete).toBe(false);
    });

    it("wins the team the moment all four diseases are cured or eradicated", () => {
        const state = baseState(["u1"]);
        state.cures = { blue: 'cured', yellow: 'eradicated', black: 'cured', red: 'cured' };
        const game = makeGame(state, ["u1"]);

        const gameOver = new OutbreakGameType().CheckGameOver(game);

        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe('');
        expect(game.endReason).toBe('teamwin');
        expect(game.currentTurn).toBe('');
    });

    it("plays a full game — curing all four diseases in one player's four actions — and wins", async () => {
        const state = baseState(["u1", "u2"]);
        const ps = state.players.get("u1")!;
        ps.hand = DISEASE_COLORS.flatMap(color => cityIdsForColor(color).slice(0, cureCardsRequired()));
        const game = makeGame(state, ["u1", "u2"]);
        const gameType = new OutbreakGameType();

        let outcome;
        for (const color of DISEASE_COLORS) {
            const cardIds = cityIdsForColor(color).slice(0, cureCardsRequired());
            outcome = await cmd({ kind: 'cure', color, cardIds }).Execute(game);
            expect(outcome.validMove).toBe(true);
        }

        expect(outcome).toMatchObject({ turnOver: true });
        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamwin');
        // Nobody ever drew a card or placed a cube — the loss conditions of §4.2
        // simply have no way to fire in this commit.
        expect(state.cubesLeft).toEqual({ blue: CUBES_PER_COLOR, yellow: CUBES_PER_COLOR, black: CUBES_PER_COLOR, red: CUBES_PER_COLOR });
    });
});
