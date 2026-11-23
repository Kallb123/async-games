import { it, vi } from "vitest";
import { makeGame, musterAll, play, playOne, endTurnBy, warbandTurnBy, warbandsOf } from "./testFixtures";
vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));
it("x", async () => {
    const game = makeGame(["a","b"], {}, { rulesVersion: 13, coop: { enemy: "realm", random: true, mission: "holdOut" } });
    await musterAll(game);
    const gs = game.specificGameState;
    await playOne(game, endTurnBy("a")); console.log(game.currentTurn);
    await playOne(game, endTurnBy("b")); console.log(game.currentTurn, gs.threat);
    const r = await playOne(game, warbandTurnBy(game.currentTurn, [])); console.log(r.outcome.validMove, game.currentTurn, gs.threat, gs.fighters.length);
    const r2 = await playOne(game, warbandTurnBy(game.currentTurn, [])); console.log(r2.outcome.validMove, game.currentTurn, gs.threat, gs.fighters.length, gs.roundsPlayed);
});
