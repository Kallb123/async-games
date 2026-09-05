import { describe, expect, it } from "vitest";
import { buildInitialOutbreakState, formatOutbreakCharts, type IOutbreakGameResultStats } from "./OutbreakModels";
import { CITY_COUNT, DIFFICULTIES, DISEASE_COLOR_DEFS, EPIDEMIC_CARD_ID, EVENT_CARD_IDS, epidemicCountFor, isCityCardId, isEventCardId } from "./board";
import { startingHandSize } from "./rules";

const CARD_COUNT = CITY_COUNT + EVENT_CARD_IDS.length; // 53 (§5, §6 step 6)

// §6 steps 6-7, §13: buildInitialOutbreakState deals starting hands from the
// 53 shuffled player cards (48 city + 5 event, §12) first, then builds the
// player deck around the difficulty's epidemic piles — the difficulty dial
// becoming live (§21.6 step 8).
describe("buildInitialOutbreakState — the epidemic-pile player deck (§6 step 7, §13)", () => {
    for (const { id: difficulty, epidemics } of DIFFICULTIES) {
        it(`deals hands from the 53-card deck, then builds a ${epidemics}-epidemic deck for ${difficulty}`, () => {
            const turnOrder = ["u1", "u2", "u3"];
            const state = buildInitialOutbreakState(turnOrder, difficulty);

            expect(epidemicCountFor(difficulty)).toBe(epidemics);

            // Every hand is drawn from ordinary city or event cards — no
            // epidemic ever lands in a starting hand.
            const handSize = startingHandSize(turnOrder.length);
            for (const userId of turnOrder) {
                const hand = state.players.get(userId)!.hand;
                expect(hand).toHaveLength(handSize);
                expect(hand.every(id => isCityCardId(id) || isEventCardId(id))).toBe(true);
            }

            // The remaining deck holds exactly one epidemic per pile, plus
            // every city/event card not already dealt, not already infected
            // at setup (city cards only), and not dealt into a hand.
            const dealt = turnOrder.length * handSize;
            const infected = state.infectionDiscard.length;
            expect(state.playerDeck).toHaveLength(CARD_COUNT - dealt + epidemics);
            expect(state.playerDeck.filter(c => c === EPIDEMIC_CARD_ID)).toHaveLength(epidemics);

            const playerCardsInDeck = state.playerDeck.filter(c => c !== EPIDEMIC_CARD_ID);
            const playerCardsInHands = turnOrder.flatMap(userId => state.players.get(userId)!.hand);
            const allCityCards = Array.from({ length: CITY_COUNT }, (_, id) => id);
            const allPlayerCards = [...allCityCards, ...EVENT_CARD_IDS];
            expect([...playerCardsInDeck, ...playerCardsInHands].sort((a, b) => a - b)).toEqual(allPlayerCards.sort((a, b) => a - b));
            // Infected cities at setup are cosmetic board state, not cards —
            // every city's card is still somewhere in the hands/deck above,
            // independent of the (separate) infection deck/discard.
            expect(infected).toBe(9);

            // No event has been played yet.
            expect(state.oneQuietNightActive).toBe(false);
            expect(state.forecastCards).toEqual([]);
            expect(state.forecastResumePhase).toBeNull();
        });
    }
});

describe("Outbreak result charts", () => {
    const NAMES = new Map([["u1", "Alice"], ["u2", "Bob"]]);

    const stats = (overrides: Partial<IOutbreakGameResultStats> = {}): IOutbreakGameResultStats => ({
        curesDiscovered: 1,
        outbreaks: 2,
        turnsLasted: 2,
        difficulty: 'standard',
        cubesTreatedPerTurn: [new Map([["u1", 0], ["u2", 2]]), new Map([["u1", 3], ["u2", 2]])],
        timesTravelledPerTurn: [new Map([["u1", 1], ["u2", 1]]), new Map([["u1", 2], ["u2", 1]])],
        cubesLeftPerTurn: [
            new Map([["blue", 20], ["yellow", 19], ["black", 21], ["red", 22]]),
            new Map([["blue", 18], ["yellow", 19], ["black", 17], ["red", 22]]),
        ],
        ...overrides,
    });

    it("plots the cube supplies as their own four lines, not as players", () => {
        const charts = formatOutbreakCharts(stats(), NAMES);

        expect(charts.map(c => c.title)).toEqual([
            "Cubes treated per turn",
            "Times travelled per turn",
            "Cubes left in supply",
        ]);

        // The two per-player charts name no series — the result page draws
        // one line per player from its own roster.
        expect(charts[0].series).toBeUndefined();
        expect(charts[1].series).toBeUndefined();

        const supply = charts[2];
        expect(supply.turns).toEqual([
            { blue: 20, yellow: 19, black: 21, red: 22 },
            { blue: 18, yellow: 19, black: 17, red: 22 },
        ]);
        expect(supply.series).toEqual([
            { key: 'blue', name: 'Blue', color: DISEASE_COLOR_DEFS.blue.hex },
            { key: 'yellow', name: 'Yellow', color: DISEASE_COLOR_DEFS.yellow.hex },
            { key: 'black', name: 'Black', color: DISEASE_COLOR_DEFS.black.hex },
            { key: 'red', name: 'Red', color: DISEASE_COLOR_DEFS.red.hex },
        ]);
    });

    it("plots no supply chart for a result recorded before it was tracked", () => {
        // Records written before cubesLeftPerTurn existed read back with no
        // series at all, and a chart of nothing is worse than no chart.
        const charts = formatOutbreakCharts(stats({ cubesLeftPerTurn: [] }), NAMES);
        expect(charts.map(c => c.title)).toEqual(["Cubes treated per turn", "Times travelled per turn"]);
    });
});
