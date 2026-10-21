import { describe, expect, it, vi } from "vitest";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { stepCost } from "@/utils/games/battlefield/pathfinding";
import { squareAt, TERRAIN } from "@/utils/games/battlefield/terrain";
import { battlefieldOf, REALM_ARENA_MAPS } from "./maps";
import { CURRENT_RULESET_VERSION } from "./rulesets";
import { actBy, battleOf, makeGame, musterAll, play } from "./testFixtures";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

// Sight with angles, and the full-height hedge, are rules version 10 (§36): a
// battle created before them keeps level sight and the low hedge to its end,
// and on a replay.
describe("sight by the battle's rules version (§36)", () => {
    const LEVEL = { rulesVersion: 9 }, ANGLED = { rulesVersion: 10 };

    it("fights a battle created under version 10 on the map itself, and an older one on its level-sighted copy", () => {
        for (const id of Object.keys(REALM_ARENA_MAPS) as (keyof typeof REALM_ARENA_MAPS)[]) {
            expect(battlefieldOf(id, [], ANGLED)).toBe(REALM_ARENA_MAPS[id]);
            const level = battlefieldOf(id, [], LEVEL);
            expect(level.levelSight).toBe(true);
            // Made once, so whatever is keyed on the field keeps it.
            expect(battlefieldOf(id, [], LEVEL)).toBe(level);
            expect(battlefieldOf(id, [], {})).toBe(level);
        }
    });

    it("gives an older battle on the Sunken Village the low hedges it began with", () => {
        const tall = battlefieldOf("sunkenVillageThree", [], ANGLED), low = battlefieldOf("sunkenVillageThree", [], LEVEL);
        const hedges = tall.tiles.flatMap((tile, square) => tile.terrain === TERRAIN.h ? [square] : []);
        expect(hedges.length).toBeGreaterThan(0);
        for (const square of hedges) {
            expect(low.tiles[square].terrain).toBe(TERRAIN.v);
            expect(tall.tiles[square].elevation - low.tiles[square].elevation).toBe(TERRAIN.h.height - TERRAIN.v.height);
        }
        // Six in on the north side, the hedge round the village: climbed through in an older battle, not in a new one.
        const outside = squareAt(tall, 6, 5)!, hedge = squareAt(tall, 6, 6)!;
        expect(stepCost(low, outside, hedge)).toBeDefined();
        expect(stepCost(tall, outside, hedge)).toBeUndefined();
        // Blasting clears either.
        expect(battlefieldOf("sunkenVillageThree", [hedge], LEVEL).tiles[hedge].terrain).toBe(TERRAIN["_"]);
        expect(battlefieldOf("sunkenVillageThree", [hedge], ANGLED).tiles[hedge].terrain).toBe(TERRAIN["_"]);
    });

    // A whole battle from before the rebalance, and so before angles, replays exactly in balance.test.ts.
    it("lets an older battle shoot at a tower top from close under it, and refuses it in a new one", async () => {
        // The Ruined Fort's north-west tower top, from four squares out on the open ground west of it,
        // which the parapet hides at that angle (ruinedFort.test.ts).
        const level = battlefieldOf("ruinedFort", [], LEVEL);
        const top = squareAt(level, 7, 13)!, under = squareAt(level, 3, 13)!;
        expect(canSee(level, under, top)).toBe(true);
        for (const context of [LEVEL, ANGLED]) {
            const game = makeGame(["a", "b"], {}, context);
            await musterAll(game);
            const shooter = game.specificGameState.fighters.find(one => one.owner === "a")!, target = game.specificGameState.fighters.find(one => one.owner === "b")!;
            Object.assign(shooter, { character: "archer", square: under });
            target.square = top;
            const shot = Object.assign(actBy("a", { kind: "attack", fighter: shooter.id, target: target.id }), { recordedRolls: [1] });
            expect((await play(game, shot)).outcome.validMove, `version ${context.rulesVersion}`).toBe(context === LEVEL);
        }
    });

    it("reads the rule from the stamp a game was created with", () => {
        expect(battleOf(makeGame()).field.levelSight).toBeUndefined();
        expect(makeGame().specificGameState.rulesVersion).toBe(CURRENT_RULESET_VERSION);
        expect(battleOf(makeGame(undefined, undefined, LEVEL)).field.levelSight).toBe(true);
    });
});
