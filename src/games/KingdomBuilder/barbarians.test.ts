import { describe, expect, it } from "vitest";

import { unitCount, type KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_BARBARIAN_GARRISONS, assaultVillages, barbarianVillagesFor, type KingdomBuilderBarbarianVillage } from "./barbarians";
import { resolveBattle } from "./combat";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";
import type { SettlementNode } from "./worldgen/landmass";

function site(id: string, x: number, siteType: SettlementNode["siteType"]): SettlementNode {
    return { id, kind: "settlement", siteType, x, y: 0, tile: x };
}

function camp(overrides: Partial<KingdomBuilderMarch> = {}): KingdomBuilderMarch {
    return {
        ownerId: "alice", units: garrisonOf({ militia: 10 }), path: [0, 1], pathCosts: [0, 2], travelled: 2,
        targetNodeId: "village", arrivedAtTick: 5, ...overrides,
    };
}

const village = (garrison: Partial<KingdomBuilderGarrison> = { militia: 4 }): KingdomBuilderBarbarianVillage => ({ nodeId: "village", garrison: garrisonOf(garrison) });
const home = [{ ownerId: "alice", settlementNumber: 0 }];

describe("barbarianVillagesFor", () => {
    it("garrisons the villages nearest the starts lightest and the farthest heaviest (§3.4)", () => {
        const nodes = [
            site("start", 0, "player-start"), site("open", 5, "expansion"),
            site("far", 90, "barbarian"), site("near", 10, "barbarian"), site("middle", 50, "barbarian"),
        ];
        expect(barbarianVillagesFor(nodes)).toEqual([
            { nodeId: "far", garrison: KINGDOM_BUILDER_BARBARIAN_GARRISONS[2] },
            { nodeId: "middle", garrison: KINGDOM_BUILDER_BARBARIAN_GARRISONS[1] },
            { nodeId: "near", garrison: KINGDOM_BUILDER_BARBARIAN_GARRISONS[0] },
        ]);
    });

    it("has nothing to garrison in a world with no barbarian sites", () => {
        expect(barbarianVillagesFor([site("start", 0, "player-start")])).toEqual([]);
    });
});

describe("assaultVillages", () => {
    it("leaves marching armies, and armies camped anywhere but a standing village, alone", () => {
        const marching = camp({ arrivedAtTick: undefined, travelled: 0 });
        const elsewhere = camp({ targetNodeId: "forest" });
        const result = assaultVillages([village()], home, [marching, elsewhere]);
        expect(result).toEqual({ villages: [village()], armies: [marching, elsewhere], captures: [], battles: [] });
    });

    it("turns a won village into the attacker's settlement in their free slot, garrisoned by the survivors", () => {
        const army = camp();
        const expected = resolveBattle(army.units, { militia: 4 }, { fortified: true });
        const result = assaultVillages([village()], home, [army]);
        expect(result.villages).toEqual([]);
        expect(result.armies).toEqual([]);
        expect(result.captures).toEqual([{
            ownerId: "alice", nodeId: "village", settlementNumber: 1, garrison: expected.attacker, caravans: 0, resources: { wood: 0, stone: 0, iron: 0, wheat: 0 },
        }]);
        expect(result.battles).toEqual([{
            nodeId: "village", ownerId: "alice", attacker: army.units, defender: garrisonOf({ militia: 4 }), rounds: expected.rounds, left: expected.attacker,
        }]);
    });

    it("stocks a taken village with what its conquerors' caravans carried", () => {
        const result = assaultVillages([village()], home, [camp({ caravans: 2, cargo: { wood: 30, iron: 10 } })]);
        expect(result.captures).toEqual([expect.objectContaining({ caravans: 2, resources: { wood: 30, stone: 0, iron: 10, wheat: 0 } })]);
        expect(result.armies).toEqual([]);
    });

    it("leaves caravans with nobody to guard them out of the fight", () => {
        const caravans = camp({ units: garrisonOf(), caravans: 1, cargo: { wood: 20 } });
        const result = assaultVillages([village()], home, [caravans]);
        expect(result.battles).toEqual([]);
        expect(result.villages).toEqual([village()]);
        expect(result.armies).toEqual([caravans]);
    });

    it("burns a village won by a player who already holds two settlements, and leaves the army camped on the open site", () => {
        const result = assaultVillages([village()], [...home, { ownerId: "alice", settlementNumber: 1 }], [camp()]);
        expect(result.villages).toEqual([]);
        expect(result.captures).toEqual([]);
        expect(result.armies).toHaveLength(1);
        expect(result.armies[0].targetNodeId).toBe("village");
    });

    it("wipes out an army that loses, and keeps what the village has left", () => {
        const result = assaultVillages([village()], home, [camp({ units: garrisonOf({ militia: 3 }) })]);
        expect(result.armies).toEqual([]);
        expect(result.villages).toEqual([{ nodeId: "village", garrison: resolveBattle({ militia: 3 }, { militia: 4 }, { fortified: true }).defender }]);
        expect(result.villages[0].garrison.militia).toBeLessThan(4);
    });

    it("keeps both sides' survivors after a stand-off, for the next tick's fight", () => {
        // Two siege engines can't finish each other inside six rounds.
        const army = camp({ units: garrisonOf({ "siege-engine": 1 }) });
        const result = assaultVillages([village({ "siege-engine": 1 })], home, [army]);
        const expected = resolveBattle({ "siege-engine": 1 }, { "siege-engine": 1 }, { fortified: true });
        expect([unitCount(expected.attacker), unitCount(expected.defender)]).toEqual([1, 1]);
        expect(result.villages).toEqual([{ nodeId: "village", garrison: expected.defender }]);
        expect(result.armies).toEqual([{ ...army, units: expected.attacker }]);
    });

    it("sends one player's armies in together, and a second player's after, against what is left", () => {
        const first = camp({ units: garrisonOf({ militia: 3 }) });
        const second = camp({ units: garrisonOf({ militia: 3 }) });
        const rival = camp({ ownerId: "bob", units: garrisonOf({ militia: 3 }) });
        const result = assaultVillages([village()], home, [first, rival, second]);
        expect(result.battles.map(battle => [battle.ownerId, battle.attacker.militia])).toEqual([["alice", 6]]);
        expect(result.captures).toMatchObject([{ ownerId: "alice", settlementNumber: 1 }]);
        // Bob came too late: the village is Alice's town now, and his army is camped at it.
        expect(result.armies).toEqual([rival]);
    });

    it("lets the next player in line fight whatever the last one left", () => {
        const stalled = camp({ units: garrisonOf({ militia: 1 }) });
        const rival = camp({ ownerId: "bob", units: garrisonOf({ militia: 12 }) });
        const result = assaultVillages([village()], [], [stalled, rival]);
        expect(result.battles.map(battle => battle.ownerId)).toEqual(["alice", "bob"]);
        expect(result.captures).toMatchObject([{ ownerId: "bob", settlementNumber: 0 }]);
    });
});
