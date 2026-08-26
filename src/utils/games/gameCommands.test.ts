import { describe, expect, it } from "vitest";

import { isCommandForGameType } from "./gameCommands";

describe("command ownership", () => {
    it("accepts a game's own command", () => {
        expect(isCommandForGameType("SnakesAndLaddersGameType", "SnakesAndLaddersRequestDiceRoll")).toBe(true);
        expect(isCommandForGameType("SettlementsAndCitiesGameType", "SACRollDice")).toBe(true);
    });

    it("refuses another game's command", () => {
        // The case with teeth: every Execute casts the game to its own shape
        // on the first line, so this one used to reach Solitaire's rules
        // holding a Train Time game.
        expect(isCommandForGameType("TrainTimeGameType", "SolitaireAutoSolve")).toBe(false);
        expect(isCommandForGameType("SnakesAndLaddersGameType", "SACBuildCity")).toBe(false);
    });

    it("refuses a game type's own class as a command", () => {
        // A game type is serialisable too, and deserialises into something
        // with no Execute at all.
        expect(isCommandForGameType("SolitaireGameType", "SolitaireGameType")).toBe(false);
    });

    it("refuses everything for a game nobody has listed", () => {
        expect(isCommandForGameType("ChessGameType", "SolitaireDraw")).toBe(false);
        expect(isCommandForGameType("", "")).toBe(false);
    });
});
