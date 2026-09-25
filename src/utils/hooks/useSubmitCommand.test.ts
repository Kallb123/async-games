// Which board version a command carries — the one piece of `useSubmitCommand`
// that can be asked a question without a browser and a network.

import { describe, expect, it } from "vitest";
import { expectedCommandCountFor } from "./useSubmitCommand";
import { OUT_OF_TURN_TEST_GAME as INTERRUPTS, registerOutOfTurnTestGame, testBoard } from "@/utils/testing/outOfTurnGame";

describe("expectedCommandCountFor", () => {
    registerOutOfTurnTestGame();

    it("names the board it was rendered from in a game a teammate can play out of turn in", () => {
        expect(expectedCommandCountFor(testBoard(INTERRUPTS, { commandCount: 7 }))).toBe(7);
        expect(expectedCommandCountFor(testBoard(INTERRUPTS, { commandCount: 0 }))).toBe(0);
    });

    it("says nothing in any other game, where only its sender moves the board on their turn", () => {
        expect(expectedCommandCountFor(testBoard("snakesandladders", { commandCount: 7 }))).toBeUndefined();
        expect(expectedCommandCountFor(testBoard("outbreak", { commandCount: 7 }))).toBeUndefined();
    });

    it("says nothing before the board has loaded", () => {
        expect(expectedCommandCountFor(null)).toBeUndefined();
    });
});
