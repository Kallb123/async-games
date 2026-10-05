import { describe, expect, it } from "vitest";
import type { IGameData } from "@/utils/mongodb/GameData";
import { finishedGameCopy } from "@/utils/ui/players";
import { endAsTeam } from "./endAsTeam";

// The shared co-op ending (docs/games/realm-arena.md §29.5): one result for the
// whole table, which finishGame then announces as one.

const playing = (): IGameData => ({
    complete: false,
    winner: "",
    currentTurn: "u1",
    gameState: { turnOrder: ["u1", "u2"], history: [{ text: "{{u1}} ended their turn", actorId: "u1" }], commandHistory: [] },
} as unknown as IGameData);

describe("endAsTeam", () => {
    it("ends the game for everybody, with nobody's turn and nobody the winner", () => {
        const game = playing();
        endAsTeam(game, "teamwin", "The team wins the battle", "41 points to 33");
        expect(game).toMatchObject({ complete: true, winner: "", endReason: "teamwin", endDetail: "41 points to 33", currentTurn: "" });
        expect(game.gameState.history[0]).toEqual({ text: "The team wins the battle" });
        // …which the finished game's copy words for the whole team.
        expect(finishedGameCopy(game)).toBe("The team won — 41 points to 33");
    });

    it("leaves the detail alone when it isn't given", () => {
        const game = playing();
        endAsTeam(game, "teamloss", "The team loses");
        expect(game.endReason).toBe("teamloss");
        expect(game).not.toHaveProperty("endDetail");
        expect(finishedGameCopy(game)).toBe("The team lost");
    });
});
