// When a board polls — the one piece of `useGameData` that can be asked a
// question without a browser, a Clerk session and a clock. Clerk is stubbed
// only so importing the module doesn't drag the SDK into a node test.

import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: null, isLoaded: false }) }));

// Below the mock on purpose: vitest hoists `vi.mock` above the imports.
import { boardCanMove } from "./useGameData";
import { OUT_OF_TURN_TEST_GAME as INTERRUPTS, registerOutOfTurnTestGame } from "@/utils/testing/outOfTurnGame";
import { testBoard } from "@/utils/testing/testBoard";

describe("boardCanMove", () => {
    registerOutOfTurnTestGame();

    it("polls while somebody else holds the turn, in any game", () => {
        expect(boardCanMove(testBoard("snakesandladders", { currentTurn: "them" }), "me")).toBe(true);
        expect(boardCanMove(testBoard(INTERRUPTS, { currentTurn: "them" }), "me")).toBe(true);
    });

    it("stays quiet on the viewer's own turn in a game nobody can play out of turn in", () => {
        expect(boardCanMove(testBoard("snakesandladders"), "me")).toBe(false);
        expect(boardCanMove(testBoard("outbreak"), "me")).toBe(false);
    });

    it("polls on the viewer's own turn in a game a teammate can play out of turn in", () => {
        expect(boardCanMove(testBoard(INTERRUPTS), "me")).toBe(true);
    });

    it("never polls a finished game, or one that hasn't loaded", () => {
        expect(boardCanMove(testBoard(INTERRUPTS, { complete: true }), "me")).toBe(false);
        expect(boardCanMove(testBoard("snakesandladders", { currentTurn: "them", complete: true }), "me")).toBe(false);
        expect(boardCanMove(testBoard(INTERRUPTS, { currentTurn: "" }), "me")).toBe(false);
        expect(boardCanMove(null, "me")).toBe(false);
        expect(boardCanMove(undefined, "me")).toBe(false);
    });

    it("treats a viewer still signing in as watching somebody else's turn", () => {
        expect(boardCanMove(testBoard("snakesandladders"), undefined)).toBe(true);
    });

    it("doesn't take a game it has never heard of as one with out-of-turn plays", () => {
        expect(boardCanMove(testBoard("nosuchgame"), "me")).toBe(false);
    });
});
