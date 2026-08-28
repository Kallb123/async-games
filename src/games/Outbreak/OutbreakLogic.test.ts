import { describe, expect, it } from "vitest";
import { OutbreakAction, OutbreakDiscard, OutbreakEndTurn, OutbreakGameType } from "./OutbreakLogic";
import { IOutbreakGameData, IOutbreakPlayerState } from "./OutbreakModels";
import { ADJACENCY, ATLANTA_CITY_ID, CITIES, CITY_COUNT, DISEASE_COLORS, EPIDEMIC_CARD_ID, cityIdsForColor } from "./board";
import {
    ACTIONS_PER_TURN,
    CUBES_PER_CITY_LIMIT,
    CUBES_PER_COLOR,
    HAND_LIMIT,
    INFECTION_RATE_TRACK,
    OUTBREAK_LOSS_THRESHOLD,
    cureCardsRequired,
    emptyCubeCounts,
} from "./rules";
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

function endTurnCmd(senderId = "u1"): OutbreakEndTurn {
    const command = new OutbreakEndTurn();
    command.senderId = senderId;
    command.senderUsername = senderId === "u1" ? "Alice" : "Bob";
    return command;
}

function discardCmd(cardIds: number[], senderId = "u1"): OutbreakDiscard {
    const command = new OutbreakDiscard();
    command.senderId = senderId;
    command.senderUsername = senderId === "u1" ? "Alice" : "Bob";
    command.cardIds = cardIds;
    return command;
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

    it("never ends the turn itself, even on the fourth action — only OutbreakEndTurn may (§21.4)", async () => {
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        let outcome;
        for (let i = 0; i < ACTIONS_PER_TURN; i++) {
            outcome = await cmd({ kind: 'pass' }).Execute(game);
            expect(outcome).toEqual({ validMove: true, turnOver: false });
        }
        expect(state.players.get("u1")!.actionsLeft).toBe(0);
        expect(state.phase).toBe('actions');
        expect(game.currentTurn).toBe("u1");
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

        for (const color of DISEASE_COLORS) {
            const cardIds = cityIdsForColor(color).slice(0, cureCardsRequired());
            const outcome = await cmd({ kind: 'cure', color, cardIds }).Execute(game);
            expect(outcome).toEqual({ validMove: true, turnOver: false });
        }

        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamwin');
        // Nobody ever drew a card or placed a cube — the four cure actions
        // alone won the game before OutbreakEndTurn was ever called.
        expect(state.cubesLeft).toEqual({ blue: CUBES_PER_COLOR, yellow: CUBES_PER_COLOR, black: CUBES_PER_COLOR, red: CUBES_PER_COLOR });
    });
});

// ─── OutbreakEndTurn — the draw and infect phases (§21.6 step 6) ───────────

describe("OutbreakEndTurn", () => {
    it("rejects while actions remain", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 1;
        const game = makeGame(state, ["u1"]);

        const outcome = await endTurnCmd().Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("rejects outside the action phase", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.phase = 'discard';
        const game = makeGame(state, ["u1"]);

        const outcome = await endTurnCmd().Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("draws two cards and ends the turn when the hand stays within the limit", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.actionsLeft = 0;
        const [first, second, third] = [idFor("Chicago"), idFor("Tokyo"), idFor("Miami")];
        state.playerDeck = [first, second, third];
        const game = makeGame(state, ["u1", "u2"]);
        const gameType = new OutbreakGameType();

        const outcome = await endTurnCmd().Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: true });
        expect(state.players.get("u1")!.hand).toEqual([first, second]);
        expect(state.playerDeck).toEqual([third]);
        expect(state.phase).toBe('actions');

        gameType.CheckEndTurn(game, outcome);
        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("moves to the discard phase when the draw pushes the hand over the limit", async () => {
        const state = baseState(["u1"]);
        const ps = state.players.get("u1")!;
        ps.actionsLeft = 0;
        ps.hand = cityIdsForColor('red').slice(0, 6);
        state.playerDeck = [idFor("Chicago"), idFor("Miami")];
        const game = makeGame(state, ["u1"]);

        const outcome = await endTurnCmd().Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(state.phase).toBe('discard');
        expect(ps.hand.length).toBe(8);
    });

    it("loses the game immediately when the player deck is empty on a draw (§4.2 time-out)", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [];
        const game = makeGame(state, ["u1"]);
        const gameType = new OutbreakGameType();

        await endTurnCmd().Execute(game);

        expect(game.complete).toBe(true);
        expect(game.winner).toBe('');
        expect(game.endReason).toBe('teamloss');
        expect(game.currentTurn).toBe('');
        expect(gameType.CheckGameOver(game)).toBe(true);
    });

    it("infects at the fixed rate of 2, placing one cube per card drawn", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("San Francisco"), idFor("Osaka")];
        const cardA = idFor("Chicago"); // blue
        const cardB = idFor("Lagos"); // yellow
        state.infectionDeck = [cardA, cardB];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.cities[cardA].cubes.blue).toBe(1);
        expect(state.cities[cardB].cubes.yellow).toBe(1);
        expect(state.cubesLeft.blue).toBe(CUBES_PER_COLOR - 1);
        expect(state.cubesLeft.yellow).toBe(CUBES_PER_COLOR - 1);
        expect(state.infectionDiscard).toEqual([cardA, cardB]);
        expect(state.infectionDeck).toEqual([]);
        expect(game.complete).toBe(false);
    });

    it("triggers an outbreak that spreads a cube to every adjacent city", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("San Francisco"), idFor("Osaka")];
        state.cities[ATLANTA_CITY_ID].cubes.blue = CUBES_PER_CITY_LIMIT;
        state.infectionDeck = [ATLANTA_CITY_ID];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.outbreaks).toBe(1);
        expect(state.cities[ATLANTA_CITY_ID].cubes.blue).toBe(CUBES_PER_CITY_LIMIT);
        for (const neighbor of ADJACENCY[ATLANTA_CITY_ID]) {
            expect(state.cities[neighbor].cubes.blue).toBe(1);
        }
        expect(game.complete).toBe(false);
    });

    it("loses the game when an outbreak pushes the marker to the threshold (§4.2 outbreak cascade)", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("San Francisco"), idFor("Osaka")];
        state.outbreaks = OUTBREAK_LOSS_THRESHOLD - 1;
        state.cities[ATLANTA_CITY_ID].cubes.blue = CUBES_PER_CITY_LIMIT;
        state.infectionDeck = [ATLANTA_CITY_ID];
        const game = makeGame(state, ["u1"]);
        const gameType = new OutbreakGameType();

        await endTurnCmd().Execute(game);

        expect(state.outbreaks).toBe(OUTBREAK_LOSS_THRESHOLD);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
        expect(gameType.CheckGameOver(game)).toBe(true);
    });

    it("loses the game when a colour's cube supply runs out mid-infection (§4.2, §16)", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("San Francisco"), idFor("Osaka")];
        const chicago = idFor("Chicago"); // blue, currently uninfected
        state.cubesLeft.blue = 0;
        state.infectionDeck = [chicago];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.cities[chicago].cubes.blue).toBe(0);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });

    it("skips cube placement for an eradicated disease but still discards the card", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [idFor("San Francisco"), idFor("Osaka")];
        const chicago = idFor("Chicago"); // blue
        state.cures.blue = 'eradicated';
        state.infectionDeck = [chicago];
        const game = makeGame(state, ["u1"]);

        const outcome = await endTurnCmd().Execute(game);

        expect(state.cities[chicago].cubes.blue).toBe(0);
        expect(state.infectionDiscard).toEqual([chicago]);
        expect(game.complete).toBe(false);
        expect(outcome).toEqual({ validMove: true, turnOver: true });
    });
});

// ─── OutbreakDiscard — the hand-limit discard step (§21.6 step 6) ─────────

describe("OutbreakDiscard", () => {
    it("rejects outside the discard phase", async () => {
        const state = baseState(["u1"]);
        state.players.get("u1")!.hand = cityIdsForColor('red').slice(0, 9);
        const game = makeGame(state, ["u1"]);

        const outcome = await discardCmd([cityIdsForColor('red')[0]]).Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("rejects discarding a card not held", async () => {
        const state = baseState(["u1"]);
        const hand = cityIdsForColor('red').slice(0, 9);
        state.players.get("u1")!.hand = [...hand];
        state.phase = 'discard';
        const game = makeGame(state, ["u1"]);

        const outcome = await discardCmd([idFor("Chicago")]).Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("rejects discarding too few to reach the hand limit", async () => {
        const state = baseState(["u1"]);
        const hand = cityIdsForColor('red').slice(0, 9); // 9 cards, 2 over the limit
        state.players.get("u1")!.hand = [...hand];
        state.phase = 'discard';
        const game = makeGame(state, ["u1"]);

        const outcome = await discardCmd([hand[0]]).Execute(game);

        expect(outcome).toEqual({ validMove: false, turnOver: false });
    });

    it("discards down to the hand limit, resumes the action phase, and runs the infect phase", async () => {
        const state = baseState(["u1", "u2"]);
        const hand = cityIdsForColor('red').slice(0, 9);
        const ps = state.players.get("u1")!;
        ps.hand = [...hand];
        ps.actionsLeft = 0;
        state.phase = 'discard';
        const cardA = idFor("Chicago"); // blue
        state.infectionDeck = [cardA];
        const game = makeGame(state, ["u1", "u2"]);
        const gameType = new OutbreakGameType();
        const toDiscard = hand.slice(0, 2);

        const outcome = await discardCmd(toDiscard).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: true });
        expect(ps.hand).toEqual(hand.slice(2));
        expect(ps.hand.length).toBe(HAND_LIMIT);
        expect(state.playerDiscard).toEqual(toDiscard);
        expect(state.phase).toBe('actions');
        // The infect phase ran once the hand limit was resolved.
        expect(state.cities[cardA].cubes.blue).toBe(1);

        gameType.CheckEndTurn(game, outcome);
        expect(game.currentTurn).toBe("u2");
    });
});

// ─── OutbreakEndTurn — epidemics (§9.1, §21.6 step 8) ──────────────────────

describe("OutbreakEndTurn epidemics", () => {
    // An epidemic on top of the player deck, with an ordinary city card
    // behind it — every test overrides infectionDeck/infectionDiscard to set
    // up its own Infect/Intensify scenario.
    function stateWithEpidemicDraw(): IOutbreakSpecificGameState {
        const state = baseState(["u1"]);
        state.players.get("u1")!.actionsLeft = 0;
        state.playerDeck = [EPIDEMIC_CARD_ID, idFor("Osaka")];
        return state;
    }

    // Same as above, but the hand is pre-filled to exactly HAND_LIMIT with
    // cards unrelated to any city a test inspects, so drawing Osaka pushes it
    // one over the limit. That defers Phase 3 (the ordinary infect phase) to
    // a later OutbreakDiscard instead of letting it run inside this Execute
    // call — isolating the epidemic's own Increase/Infect/Intensify steps
    // from an ordinary infect draw that could otherwise re-draw (and
    // re-outbreak, or re-shuffle) the very city a test just set up.
    function stateWithEpidemicDrawIsolated(): IOutbreakSpecificGameState {
        const state = stateWithEpidemicDraw();
        state.players.get("u1")!.hand = cityIdsForColor('black').slice(0, HAND_LIMIT);
        return state;
    }

    it("Increase: advances the infection rate track one space", async () => {
        const state = stateWithEpidemicDraw();
        state.infectionDeck = [idFor("Tokyo")];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.infectionRateIndex).toBe(1);
    });

    it("Increase: clamps at the end of the track rather than overflowing", async () => {
        const state = stateWithEpidemicDraw();
        state.infectionRateIndex = INFECTION_RATE_TRACK.length - 1;
        state.infectionDeck = [idFor("Tokyo")];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.infectionRateIndex).toBe(INFECTION_RATE_TRACK.length - 1);
    });

    it("Infect: draws the bottom infection card and places 3 cubes on it", async () => {
        const state = stateWithEpidemicDrawIsolated();
        const bottom = idFor("Chicago"); // blue
        state.infectionDeck = [idFor("Tokyo"), bottom];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.cities[bottom].cubes.blue).toBe(CUBES_PER_CITY_LIMIT);
        expect(state.cubesLeft.blue).toBe(CUBES_PER_COLOR - CUBES_PER_CITY_LIMIT);
    });

    it("Infect: skips cube placement for an eradicated disease but still discards the card", async () => {
        const state = stateWithEpidemicDrawIsolated();
        const bottom = idFor("Chicago"); // blue
        state.cures.blue = 'eradicated';
        state.infectionDeck = [idFor("Tokyo"), bottom];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.cities[bottom].cubes.blue).toBe(0);
    });

    it("Infect: triggers an outbreak instead of a 4th cube when the drawn city is already saturated", async () => {
        const state = stateWithEpidemicDrawIsolated();
        const bottom = ATLANTA_CITY_ID; // blue
        state.cities[bottom].cubes.blue = CUBES_PER_CITY_LIMIT;
        state.infectionDeck = [idFor("Tokyo"), bottom];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.outbreaks).toBe(1);
        for (const neighbor of ADJACENCY[bottom]) {
            expect(state.cities[neighbor].cubes.blue).toBe(1);
        }
    });

    it("discards the epidemic card itself, never adding it to the hand", async () => {
        const state = stateWithEpidemicDrawIsolated();
        state.infectionDeck = [idFor("Tokyo")];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.players.get("u1")!.hand).not.toContain(EPIDEMIC_CARD_ID);
        expect(state.playerDiscard).toContain(EPIDEMIC_CARD_ID);
    });

    it("Intensify: shuffles the infection discard back onto the deck and empties the discard pile", async () => {
        const state = stateWithEpidemicDrawIsolated();
        const bottom = idFor("Chicago");
        const alreadyDiscarded = [idFor("Miami"), idFor("Sydney")];
        state.infectionDeck = [idFor("Tokyo"), bottom];
        state.infectionDiscard = [...alreadyDiscarded];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.infectionDiscard).toEqual([]);
        const reshuffled = [...alreadyDiscarded, bottom].sort((a, b) => a - b);
        expect(state.infectionDeck.slice(0, reshuffled.length).sort((a, b) => a - b)).toEqual(reshuffled);
    });

    it("records the Intensify shuffle order and reproduces it exactly on replay", async () => {
        const state = stateWithEpidemicDrawIsolated();
        state.infectionDeck = [idFor("Tokyo"), idFor("Chicago")];
        state.infectionDiscard = [idFor("Miami"), idFor("Sydney"), idFor("Bangkok"), idFor("Kolkata"), idFor("Delhi")];
        const game = makeGame(state, ["u1"]);
        const command = endTurnCmd();

        await command.Execute(game);
        const firstRunOrder = [...state.infectionDeck];
        expect(command.recordedIntensifyOrders).toHaveLength(1);

        // Replay: rebuild the identical pre-command state and re-run with the
        // recorded order supplied, exactly as buildTimeline() would.
        const replayState = stateWithEpidemicDrawIsolated();
        replayState.infectionDeck = [idFor("Tokyo"), idFor("Chicago")];
        replayState.infectionDiscard = [idFor("Miami"), idFor("Sydney"), idFor("Bangkok"), idFor("Kolkata"), idFor("Delhi")];
        const replayGame = makeGame(replayState, ["u1"]);
        const replayCommand = endTurnCmd();
        replayCommand.recordedIntensifyOrders = command.recordedIntensifyOrders;

        await replayCommand.Execute(replayGame);

        expect(replayState.infectionDeck).toEqual(firstRunOrder);
    });

    it("resolves two epidemics drawn in the same draw phase fully, one before the other (§16)", async () => {
        const state = stateWithEpidemicDraw();
        state.playerDeck = [EPIDEMIC_CARD_ID, EPIDEMIC_CARD_ID];
        state.infectionDeck = [idFor("Tokyo"), idFor("Chicago")];
        const game = makeGame(state, ["u1"]);
        const command = endTurnCmd();

        const outcome = await command.Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: true });
        expect(state.infectionRateIndex).toBe(2); // two Increase steps
        expect(command.recordedIntensifyOrders).toHaveLength(2); // two Intensify shuffles
        expect(state.players.get("u1")!.hand).toEqual([]); // no city card was drawn at all
        expect(state.playerDiscard).toEqual([EPIDEMIC_CARD_ID, EPIDEMIC_CARD_ID]);
    });

    it("ends the game in a team loss when an epidemic's outbreak reaches the threshold, without running Intensify", async () => {
        const state = stateWithEpidemicDraw();
        state.outbreaks = OUTBREAK_LOSS_THRESHOLD - 1;
        const saturated = ATLANTA_CITY_ID; // blue
        state.cities[saturated].cubes.blue = CUBES_PER_CITY_LIMIT;
        const miami = idFor("Miami");
        state.infectionDeck = [idFor("Tokyo"), saturated];
        state.infectionDiscard = [miami];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.outbreaks).toBe(OUTBREAK_LOSS_THRESHOLD);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
        // Intensify never ran: the pre-existing discard pile is untouched.
        expect(state.infectionDiscard).toEqual([miami, saturated]);
        expect(state.infectionDeck).toEqual([idFor("Tokyo")]);
    });

    it("loses the game when an epidemic's Infect step can't be paid for by the cube supply", async () => {
        const state = stateWithEpidemicDraw();
        const chicago = idFor("Chicago"); // blue, currently uninfected — needs all 3 cubes at once
        state.cubesLeft.blue = 2;
        state.infectionDeck = [idFor("Tokyo"), chicago];
        const game = makeGame(state, ["u1"]);

        await endTurnCmd().Execute(game);

        expect(state.cities[chicago].cubes.blue).toBe(0);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });
});
