import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { REALM } from "./characters";
import { ACTION_POINTS } from "./rules";
import { makeGame, musterAll, play, readyMadePicks, muster } from "./testFixtures";

// docs/games/realm-arena.md §17.2: a timed-out turn ends the way the player
// would have ended it — run through the same pipeline the cron runs it
// through, so what's checked here is what a missed turn really does.

describe("a timed-out turn", () => {
    it("musters the ready-made squad in the deployment zone, so the battle can start", async () => {
        const game = makeGame();
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        expect(game.specificGameState.musters[0]).toEqual({ owner: "a", picks: readyMadePicks(game, 0) });
        expect(game.currentTurn).toBe("b");

        expect(await resolveStalledTurn(game, "b", "b")).toBe("advanced");
        expect(game.specificGameState.phase).toBe("battle");
        expect(game.specificGameState.fighters.map(one => one.character)).toEqual([...REALM.readyMade[2], ...REALM.readyMade[2]]);
    });

    it("after an opponent's own muster, still musters the second seat", async () => {
        const game = makeGame();
        await play(game, muster("a", readyMadePicks(game, 0).slice(0, 2)));
        expect(await resolveStalledTurn(game, "b", "b")).toBe("advanced");
        expect(game.specificGameState.phase).toBe("battle");
    });

    it("ends a battle turn with every character on watch", async () => {
        const game = makeGame();
        await musterAll(game);
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        const squad = game.specificGameState.fighters.filter(one => one.owner === "a");
        expect(squad.every(one => one.ap === 0 && one.banked === ACTION_POINTS)).toBe(true);
        expect(game.currentTurn).toBe("b");
    });

    it("declines a seat the battle doesn't have", async () => {
        const game = makeGame();
        expect(await resolveStalledTurn(game, "nobody", "nobody")).toBe("declined");
    });
});
