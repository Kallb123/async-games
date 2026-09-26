import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import type { IKingdomBuilderSettlement } from "./KingdomBuilderSettlementModel";
import type { KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_SIEGE_GRACE_TICKS, KINGDOM_BUILDER_WALL_DELAY_TICKS_PER_LEVEL, assaultFromTick, besiegedProduction, siegeOf, siegeStage } from "./siege";
import { applyTick } from "./tick";
import { garrisonOf } from "./units";

const town = { ownerId: "defender", nodeId: "town" };

function camp(overrides: Partial<KingdomBuilderMarch> = {}): KingdomBuilderMarch {
    return {
        ownerId: "attacker", units: garrisonOf({ militia: 2 }), path: [0, 1], pathCosts: [0, 2], travelled: 2,
        targetNodeId: "town", arrivedAtTick: 3, besiegingSince: 3, ...overrides,
    };
}

function settlement(overrides: Partial<IKingdomBuilderSettlement> = {}): IKingdomBuilderSettlement {
    return {
        worldId: new Types.ObjectId(), ownerId: "defender", nodeId: "town",
        tiles: [
            { position: 0, building: { type: "lumber-camp", level: 2 } },
            { position: 4, building: { type: "town-centre", level: 1 } },
        ],
        resources: { wood: 0, stone: 0, iron: 0, wheat: 0 },
        catchment: { wood: "good", stone: "poor", iron: "poor", wheat: "poor" },
        construction: { tilePosition: 1, buildingType: "quarry", targetLevel: 1, ticksRemaining: 3 },
        trainingQueue: [{ unitType: "militia", ticksRemaining: 2 }],
        garrison: garrisonOf({ militia: 1 }),
        createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
    };
}

describe("siegeOf", () => {
    it("dates a siege from the earliest army still besieging, and ends its grace period after it", () => {
        const siege = siegeOf(town, [camp({ besiegingSince: 9 }), camp({ besiegingSince: 5 })]);
        expect(siege).toEqual({ sinceTick: 5, fullFromTick: 5 + KINGDOM_BUILDER_SIEGE_GRACE_TICKS + 1 });
        expect(siegeStage(siege!, 5 + KINGDOM_BUILDER_SIEGE_GRACE_TICKS)).toBe("grace");
        expect(siegeStage(siege!, 5 + KINGDOM_BUILDER_SIEGE_GRACE_TICKS + 1)).toBe("full");
    });

    it.each([
        ["the owner's own army", camp({ ownerId: "defender" })],
        ["an army camped somewhere else", camp({ targetNodeId: "elsewhere" })],
        ["an army not yet dated by the tick", camp({ besiegingSince: undefined })],
    ])("ignores %s", (_, army) => {
        expect(siegeOf(town, [army])).toBeUndefined();
    });
});

it("each completed wall level holds a full attack off for another fixed interval", () => {
    expect(assaultFromTick(7, [])).toBe(7);
    expect(assaultFromTick(7, [{ position: 0, building: { type: "walls", level: 3 } }]))
        .toBe(7 + 3 * KINGDOM_BUILDER_WALL_DELAY_TICKS_PER_LEVEL);
});

it("halves production, rounding down", () => {
    expect(besiegedProduction({ wood: 5, stone: 1, iron: 0, wheat: 4 })).toEqual({ wood: 2, stone: 0, iron: 0, wheat: 2 });
});

describe("a siege in the tick", () => {
    it("begins the tick an army arrives at someone else's settlement, and bites from the next", () => {
        const marching = camp({ path: [0, 1], pathCosts: [0, 2], travelled: 0, arrivedAtTick: undefined, besiegingSince: undefined });
        const arrived = applyTick({ currentTick: 3, settlements: [settlement()], armies: [marching] });
        expect(arrived.armies[0]).toMatchObject({ arrivedAtTick: 4, besiegingSince: 4 });
        // Wood 2 × 2 (Good) + the trickle's 1, unbesieged on the tick it arrives.
        expect(arrived.settlements[0].resources.wood).toBe(5);

        const next = applyTick(arrived);
        expect(next.settlements[0].resources.wood - arrived.settlements[0].resources.wood).toBe(2);
    });

    it("lets building and training carry on through the grace period, and stops them after it", () => {
        const army = camp({ besiegingSince: 10 });
        const grace = applyTick({ currentTick: 10, settlements: [settlement()], armies: [army] });
        expect(grace.settlements[0].construction?.ticksRemaining).toBe(2);
        expect(grace.settlements[0].trainingQueue).toEqual([{ unitType: "militia", ticksRemaining: 1 }]);

        const full = applyTick({ currentTick: 10 + KINGDOM_BUILDER_SIEGE_GRACE_TICKS, settlements: [settlement()], armies: [army] });
        expect(full.settlements[0].construction?.ticksRemaining).toBe(3);
        expect(full.settlements[0].trainingQueue).toEqual([{ unitType: "militia", ticksRemaining: 2 }]);
        expect(full.settlements[0].garrison).toEqual(garrisonOf({ militia: 1 }));
    });

    it("dates a camp at a settlement founded under it on the next tick, so it gets its grace period too", () => {
        const camped = camp({ arrivedAtTick: 1, besiegingSince: undefined });
        const ticked = applyTick({ currentTick: 20, settlements: [settlement()], armies: [camped] });
        expect(ticked.armies[0].besiegingSince).toBe(21);
        expect(ticked.settlements[0].construction?.ticksRemaining).toBe(3 - 1);
    });

    it("ends the siege once nobody else's settlement stands there", () => {
        const ticked = applyTick({ currentTick: 20, settlements: [], armies: [camp()] });
        expect(ticked.armies[0]).not.toHaveProperty("besiegingSince");
        expect(ticked.armies[0].arrivedAtTick).toBe(3);
    });

    it("lays no siege on an army's own settlement — it rejoins the garrison", () => {
        const home = camp({ ownerId: "defender", travelled: 0, arrivedAtTick: undefined, besiegingSince: undefined });
        const ticked = applyTick({ currentTick: 3, settlements: [settlement()], armies: [home] });
        expect(ticked.armies).toEqual([]);
        expect(ticked.settlements[0].garrison?.militia).toBe(3);
    });
});
