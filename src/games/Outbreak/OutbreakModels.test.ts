import { describe, expect, it } from "vitest";
import { buildInitialOutbreakState } from "./OutbreakModels";
import { CITY_COUNT, DIFFICULTIES, EPIDEMIC_CARD_ID, epidemicCountFor } from "./board";
import { startingHandSize } from "./rules";

// §6 steps 6-7, §13: buildInitialOutbreakState deals starting hands from the
// 48 shuffled city cards first, then builds the player deck around the
// difficulty's epidemic piles — the difficulty dial becoming live (§21.6
// step 8).
describe("buildInitialOutbreakState — the epidemic-pile player deck (§6 step 7, §13)", () => {
    for (const { id: difficulty, epidemics } of DIFFICULTIES) {
        it(`deals hands from plain city cards, then builds a ${epidemics}-epidemic deck for ${difficulty}`, () => {
            const turnOrder = ["u1", "u2", "u3"];
            const state = buildInitialOutbreakState(turnOrder, difficulty);

            expect(epidemicCountFor(difficulty)).toBe(epidemics);

            // Every hand is drawn from ordinary city cards — no epidemic ever
            // lands in a starting hand.
            const handSize = startingHandSize(turnOrder.length);
            for (const userId of turnOrder) {
                const hand = state.players.get(userId)!.hand;
                expect(hand).toHaveLength(handSize);
                expect(hand.every(id => id >= 0 && id < CITY_COUNT)).toBe(true);
            }

            // The remaining deck holds exactly one epidemic per pile, plus
            // every city card not already dealt, not already infected at
            // setup, and not dealt into a hand.
            const dealt = turnOrder.length * handSize;
            const infected = state.infectionDiscard.length;
            expect(state.playerDeck).toHaveLength(CITY_COUNT - dealt + epidemics);
            expect(state.playerDeck.filter(c => c === EPIDEMIC_CARD_ID)).toHaveLength(epidemics);

            const cityCardsInDeck = state.playerDeck.filter(c => c !== EPIDEMIC_CARD_ID);
            const cityCardsInHands = turnOrder.flatMap(userId => state.players.get(userId)!.hand);
            const allCityCards = Array.from({ length: CITY_COUNT }, (_, id) => id);
            expect([...cityCardsInDeck, ...cityCardsInHands].sort((a, b) => a - b)).toEqual(allCityCards);
            // Infected cities at setup are cosmetic board state, not cards —
            // every city's card is still somewhere in the hands/deck above,
            // independent of the (separate) infection deck/discard.
            expect(infected).toBe(9);
        });
    }
});
