import { describe, expect, it } from "vitest";

import { advanceMarch, armyTile, paceOf, routeBetween, seizeCaravans, ticksToArrive, type KingdomBuilderMarch } from "./armies";
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

    describe("seizeCaravans (§4.7)", () => {
        // Camped at the end of the road, tile 3 — or, with less travelled, still on the way.
        const caravans = (overrides: Partial<KingdomBuilderMarch> = {}) => march({ units: garrisonOf(), caravans: 2, cargo: { iron: 30 }, travelled: 6, arrivedAtTick: 1, ...overrides });
        const escort = (ownerId: string, overrides: Partial<KingdomBuilderMarch> = {}) => march({ ownerId, travelled: 6, arrivedAtTick: 1, ...overrides });

        it("hands caravans with no escort, and their load, to the first rival army on their tile", () => {
            const first = escort("rival", { caravans: 1, cargo: { wood: 10 } });
            const second = escort("other");
            const taken = caravans();

            const result = seizeCaravans([taken, first, second], 7);

            expect(result.armies).toEqual([{ ...first, caravans: 3, cargo: { wood: 10, stone: 0, iron: 30, wheat: 0 } }, second]);
            expect(result.seized).toEqual([{ tick: 7, nodeId: "camp", ownerId: "owner", captorId: "rival", captor: garrisonOf({ militia: 2 }), caravans: 2 }]);
        });

        it("meets them on the road too, wherever the two stacks stand, and names no place for it", () => {
            // Two tiles into a route that has the rival camped on tile 1.
            const onTheRoad = caravans({ travelled: 2, arrivedAtTick: undefined });
            const rival = escort("rival", { path: [5, 1], pathCosts: [0, 2], travelled: 2 });
            const result = seizeCaravans([onTheRoad, rival], 3);
            expect(result.armies).toEqual([{ ...rival, caravans: 2, cargo: { wood: 0, stone: 0, iron: 30, wheat: 0 } }]);
            // Where they were bound is their owner's business, and the raid's report would tell the taker (§6.3).
            expect(result.seized[0]).not.toHaveProperty("nodeId");
        });

        it("leaves caravans alone that their owner's own army guards, that stand elsewhere, or that only a rival's caravans meet", () => {
            const guarded = [caravans(), escort("owner"), escort("rival")];
            expect(seizeCaravans(guarded, 7)).toEqual({ armies: guarded, seized: [] });
            const apart = [caravans(), escort("rival", { travelled: 4, arrivedAtTick: undefined })];
            expect(seizeCaravans(apart, 7).seized).toEqual([]);
            const traders = [caravans(), caravans({ ownerId: "rival" })];
            expect(seizeCaravans(traders, 7).seized).toEqual([]);
        });
    });
});
