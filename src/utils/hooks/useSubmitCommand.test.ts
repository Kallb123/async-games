// Which board version a command carries — the one piece of `useSubmitCommand`
// that can be asked a question without a browser and a network.

import { describe, expect, it } from "vitest";
import { commandVersionFor, expectedCommandCountFor } from "./useSubmitCommand";
import { FIRST_COMMAND_VERSION } from "@/utils/ui/games";
import { OUT_OF_TURN_TEST_GAME as INTERRUPTS, registerOutOfTurnTestGame } from "@/utils/testing/outOfTurnGame";
import { testBoard } from "@/utils/testing/testBoard";

describe("expectedCommandCountFor", () => {
    registerOutOfTurnTestGame();

    it("names the board it was rendered from in a game a teammate can play out of turn in", () => {
        expect(expectedCommandCountFor(testBoard(INTERRUPTS, { commandCount: 7 }))).toBe(7);
        expect(expectedCommandCountFor(testBoard(INTERRUPTS, { commandCount: 0 }))).toBe(0);
        expect(expectedCommandCountFor(testBoard("outbreak", { commandCount: 7 }))).toBe(7);
    });

    it("says nothing in any other game, where only its sender moves the board on their turn", () => {
        expect(expectedCommandCountFor(testBoard("snakesandladders", { commandCount: 7 }))).toBeUndefined();
    });

    it("says nothing before the board has loaded", () => {
        expect(expectedCommandCountFor(null)).toBeUndefined();
    });
});

describe("commandVersionFor", () => {
    it("names the rules version this bundle was built with, for every game", () => {
        expect(commandVersionFor(testBoard("snakesandladders", { commandCount: 7 }))).toBe(FIRST_COMMAND_VERSION);
        expect(commandVersionFor(testBoard("outbreak", { commandCount: 7 }))).toBe(FIRST_COMMAND_VERSION);
    });

    it("says nothing before the board has loaded, when nothing is sent", () => {
        expect(commandVersionFor(null)).toBeUndefined();
    });
});
