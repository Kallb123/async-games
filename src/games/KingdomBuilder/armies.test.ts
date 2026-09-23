import { describe, expect, it } from "vitest";

import { advanceMarch, armyTile, paceOf, routeBetween, ticksToArrive, type KingdomBuilderMarch } from "./armies";
import { garrisonOf, KINGDOM_BUILDER_PACES } from "./units";
import { travelGridFor } from "./worldgen/tilePath";

function march(overrides: Partial<KingdomBuilderMarch> = {}): KingdomBuilderMarch {
    return {
        ownerId: "owner", units: garrisonOf({ militia: 2 }),
        path: [0, 1, 2, 3], pathCosts: [0, 2, 4, 6], travelled: 0, targetNodeId: "camp",
        ...overrides,
    };
}

describe("Kingdom Builder armies", () => {
    it("moves a stack at its slowest unit's pace (§6.2)", () => {
        expect(paceOf({ cavalry: 3 })).toBe(KINGDOM_BUILDER_PACES.fast);
        expect(paceOf({ cavalry: 3, infantry: 1 })).toBe(KINGDOM_BUILDER_PACES.medium);
        expect(paceOf({ scout: 1, "siege-engine": 1 })).toBe(KINGDOM_BUILDER_PACES.slow);
        expect(paceOf({ militia: 0 })).toBeNull();
    });

    it("prices a route tile by tile, so rough ground costs more than the distance", () => {
        const grid = travelGridFor({ columns: 4, rows: 1, tileSize: 2, codes: "gghg" });
        const route = routeBetween(grid, 0, 3)!;
        expect(route.path).toEqual([0, 1, 2, 3]);
        // A step spends half its length on each tile: grass is 1, hills 2.
        expect(route.pathCosts).toEqual([0, 2, 5, 8]);
        expect(routeBetween(travelGridFor({ columns: 3, rows: 1, tileSize: 2, codes: "gog" }), 0, 2)).toBeUndefined();
    });

    it("spends its pace each tick and stands on the last tile it has paid for", () => {
        const pace = KINGDOM_BUILDER_PACES.slow;
        let army = march({ pathCosts: [0, 2, 5, 8] });
        expect(ticksToArrive(army, pace)).toBe(4);
        army = advanceMarch(army, 1, new Set()).march;
        expect(army.travelled).toBe(2);
        expect(army).not.toHaveProperty("arrivedAtTick");
        expect(armyTile(army)).toBe(1);
        army = advanceMarch(army, 2, new Set()).march;
        // Half way across the hill, still on the tile before it.
        expect(armyTile(army)).toBe(1);
        expect(ticksToArrive(army, pace)).toBe(2);
    });

    it("arrives on the tick it runs out of road and then stays put", () => {
        const { march: arrived } = advanceMarch(march({ travelled: 5 }), 9, new Set());
        expect(arrived).toMatchObject({ travelled: 6, arrivedAtTick: 9 });
        expect(armyTile(arrived)).toBe(3);
        expect(ticksToArrive(arrived, 2)).toBe(0);
        expect(advanceMarch(arrived, 10, new Set()).march).toBe(arrived);
    });

    it("rejoins the garrison when the road ends at one of its owner's own settlements", () => {
        expect(advanceMarch(march({ travelled: 5 }), 9, new Set(["camp"])).joins).toBe("camp");
        expect(advanceMarch(march({ travelled: 1 }), 9, new Set(["camp"])).joins).toBeUndefined();
    });
});
