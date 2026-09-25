// When a board polls — the one piece of `useGameData` that can be asked a
// question without a browser, a Clerk session and a clock. Clerk is stubbed
// only so importing the module doesn't drag the SDK into a node test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: null, isLoaded: false }) }));

// Below the mock on purpose: vitest hoists `vi.mock` above the imports.
import { boardCanMove } from "./useGameData";
import { GAME_META } from "@/utils/ui/games";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { IGameType } from "@/utils/apiModels/GameLogic";

// No real game plays out of turn yet, so the flagged case is a game of our own,
// registered for these tests only — which keeps the real lookup in the test.
const INTERRUPTS = "testinterrupts";

function game(url: string, currentTurn: string, complete = false): IGameDataResponse {
    return {
        gameType: { url } as IGameType,
        usernameList: [],
        userIdList: ["me", "them"],
        turnTimer: "",
        currentTurn,
        gameState: { turnOrder: ["me", "them"], history: [], commandCount: 0 },
        complete,
        winner: "",
    };
}

describe("boardCanMove", () => {
    beforeEach(() => {
        GAME_META[INTERRUPTS] = { ...GAME_META.outbreak, url: INTERRUPTS, hasOutOfTurnPlays: true };
    });

    afterEach(() => {
        delete GAME_META[INTERRUPTS];
    });

    it("polls while somebody else holds the turn, in any game", () => {
        expect(boardCanMove(game("snakesandladders", "them"), "me")).toBe(true);
        expect(boardCanMove(game(INTERRUPTS, "them"), "me")).toBe(true);
    });

    it("stays quiet on the viewer's own turn in a game nobody can play out of turn in", () => {
        expect(boardCanMove(game("snakesandladders", "me"), "me")).toBe(false);
        expect(boardCanMove(game("outbreak", "me"), "me")).toBe(false);
    });

    it("polls on the viewer's own turn in a game a teammate can play out of turn in", () => {
        expect(boardCanMove(game(INTERRUPTS, "me"), "me")).toBe(true);
    });

    it("never polls a finished game, or one that hasn't loaded", () => {
        expect(boardCanMove(game(INTERRUPTS, "me", true), "me")).toBe(false);
        expect(boardCanMove(game("snakesandladders", "them", true), "me")).toBe(false);
        expect(boardCanMove(game(INTERRUPTS, ""), "me")).toBe(false);
        expect(boardCanMove(null, "me")).toBe(false);
        expect(boardCanMove(undefined, "me")).toBe(false);
    });

    it("treats a viewer still signing in as watching somebody else's turn", () => {
        expect(boardCanMove(game("snakesandladders", "me"), undefined)).toBe(true);
    });

    it("doesn't take a game it has never heard of as one with out-of-turn plays", () => {
        expect(boardCanMove(game("nosuchgame", "me"), "me")).toBe(false);
    });
});
