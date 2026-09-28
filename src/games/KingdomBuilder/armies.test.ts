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
        expect(paceOf({ cavalry: 3 })).toBe(10);
        expect(paceOf({ cavalry: 3, infantry: 1 })).toBe(3);
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
        const pace = 5;
        let army = march({ pathCosts: [0, 2, 5, 8] });
        expect(ticksToArrive(army, pace)).toBe(2);
        army = advanceMarch(army, 1, new Set()).march;
        expect(army.travelled).toBe(5);
        expect(army).not.toHaveProperty("arrivedAtTick");
        expect(armyTile(army)).toBe(2);
        army = advanceMarch(army, 2, new Set()).march;
        expect(armyTile(army)).toBe(3);
        expect(ticksToArrive(army, pace)).toBe(0);
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
        expect(advanceMarch(march({ travelled: 0 }), 9, new Set(["camp"])).joins).toBeUndefined();
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

        it("takes settlers with no soldiers to guard them, alone or with caravans, and guards nothing with them (PR 24)", () => {
            const rival = escort("rival");
            const settlers = caravans({ units: garrisonOf({ settler: 1 }), caravans: undefined, cargo: undefined });
            const alone = seizeCaravans([settlers, rival], 4);
            expect(alone.armies).toEqual([{ ...rival, units: garrisonOf({ militia: 2, settler: 1 }), caravans: 0, cargo: { wood: 0, stone: 0, iron: 0, wheat: 0 } }]);
            expect(alone.seized).toEqual([{ tick: 4, nodeId: "camp", ownerId: "owner", captorId: "rival", captor: garrisonOf({ militia: 2 }), caravans: 0, settlers: 1 }]);

            // A settler is no escort: the caravans beside it are taken, and it with them.
            const withCaravans = seizeCaravans([caravans({ units: garrisonOf({ settler: 2 }) }), rival], 4);
            expect(withCaravans.armies).toEqual([{ ...rival, units: garrisonOf({ militia: 2, settler: 2 }), caravans: 2, cargo: { wood: 0, stone: 0, iron: 30, wheat: 0 } }]);

            // Nor does a rival's lone settler take anything.
            expect(seizeCaravans([caravans(), escort("rival", { units: garrisonOf({ settler: 1 }) })], 4).seized).toEqual([]);
        });

        it("kills a commander with no soldiers to guard it, never folding it into the captor's units (PR 26)", () => {
            const rival = escort("rival");
            const lone = caravans({ units: garrisonOf({ commander: 1 }), caravans: undefined, cargo: undefined, travelled: 2, arrivedAtTick: undefined });
            const onTheRoad = escort("rival", { path: [5, 1], pathCosts: [0, 2], travelled: 2 });
            const killed = seizeCaravans([lone, onTheRoad], 5);
            expect(killed.armies).toEqual([{ ...onTheRoad, caravans: 0, cargo: { wood: 0, stone: 0, iron: 0, wheat: 0 } }]);
            expect(killed.seized).toEqual([{ tick: 5, ownerId: "owner", captorId: "rival", captor: garrisonOf({ militia: 2 }), caravans: 0, commandersLost: 1 }]);

            // Beside caravans and a settler, the commander dies and the rest are taken.
            const party = seizeCaravans([caravans({ units: garrisonOf({ commander: 2, settler: 1 }) }), rival], 6);
            expect(party.armies).toEqual([{ ...rival, units: garrisonOf({ militia: 2, settler: 1 }), caravans: 2, cargo: { wood: 0, stone: 0, iron: 30, wheat: 0 } }]);
            expect(party.seized[0]).toMatchObject({ caravans: 2, settlers: 1, commandersLost: 2 });
        });

        it("leaves a lone commander alone beside its owner's escort, and a commander alone takes nothing", () => {
            const lone = caravans({ units: garrisonOf({ commander: 1 }), caravans: undefined, cargo: undefined });
            const guarded = [lone, escort("owner"), escort("rival")];
            expect(seizeCaravans(guarded, 7)).toEqual({ armies: guarded, seized: [] });
            // A rival's commander is no escort either.
            expect(seizeCaravans([caravans(), escort("rival", { units: garrisonOf({ commander: 1 }) })], 7).seized).toEqual([]);
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

        it("has a rival army fight a scout escort, and take what it guarded once the scouts fall (§6.5)", () => {
            const rival = escort("rival");
            const party = caravans({ units: garrisonOf({ scout: 1, settler: 1 }), caravans: undefined, cargo: undefined });
            const result = seizeCaravans([party, rival], 8);
            expect(result.armies).toEqual([{ ...rival, units: garrisonOf({ militia: 2, settler: 1 }), caravans: 0, cargo: { wood: 0, stone: 0, iron: 0, wheat: 0 } }]);
            expect(result.seized).toEqual([{
                tick: 8, nodeId: "camp", ownerId: "owner", captorId: "rival", captor: garrisonOf({ militia: 2 }), caravans: 0, settlers: 1,
                skirmish: { captorLeft: garrisonOf({ militia: 2 }), scouts: 1, scoutsLeft: 0, rounds: [{ attacker: garrisonOf(), defender: garrisonOf({ scout: 1 }) }] },
            }]);

            // Scouts in a stack of their own guard the settlers beside them the same way — and fall with them.
            const apart = seizeCaravans([caravans({ units: garrisonOf({ scout: 1 }), caravans: undefined, cargo: undefined }), caravans({ units: garrisonOf({ settler: 1 }), caravans: undefined, cargo: undefined }), rival], 8);
            expect(apart.armies).toEqual([{ ...rival, units: garrisonOf({ militia: 2, settler: 1 }), caravans: 0, cargo: { wood: 0, stone: 0, iron: 0, wheat: 0 } }]);
            expect(apart.seized[0]).toMatchObject({ settlers: 1, skirmish: { scouts: 1, scoutsLeft: 0 } });
        });

        it("leaves what scouts guard with them while any stand, and never lets a rival's scouts attack them", () => {
            const rival = escort("rival", { units: garrisonOf({ militia: 1 }) });
            const party = caravans({ units: garrisonOf({ scout: 6, settler: 1 }), caravans: undefined, cargo: undefined });
            const held = seizeCaravans([party, rival], 9);
            // Six passes of one militia's 2 attack cut down four of the six.
            expect(held.armies).toEqual([{ ...party, units: { ...party.units, scout: 2 } }, { ...rival, units: garrisonOf({ militia: 1 }) }]);
            expect(held.seized).toEqual([expect.objectContaining({ caravans: 0, skirmish: expect.objectContaining({ scouts: 6, scoutsLeft: 2 }) })]);
            expect(held.seized[0]).not.toHaveProperty("settlers");

            const scouting = [party, escort("rival", { units: garrisonOf({ scout: 3 }) })];
            expect(seizeCaravans(scouting, 9)).toEqual({ armies: scouting, seized: [] });
        });
    });
});
