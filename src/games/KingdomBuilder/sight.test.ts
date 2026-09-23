import { describe, expect, it } from "vitest";

import {
    KINGDOM_BUILDER_ARMY_SIGHT,
    KINGDOM_BUILDER_SCOUT_SIGHT,
    KINGDOM_BUILDER_SETTLEMENT_SIGHT,
    armySight,
    isInSight,
    settlementSight,
} from "./sight";

const FIELD = { columns: 20 };
const at = (col: number, row: number) => row * FIELD.columns + col;

describe("Kingdom Builder sight", () => {
    it("lets a scout see farther than an army without one, and only a scout read a garrison", () => {
        expect(armySight(3, { militia: 5 })).toEqual({ tile: 3, radius: KINGDOM_BUILDER_ARMY_SIGHT });
        expect(armySight(3, { militia: 5, scout: 1 })).toEqual({ tile: 3, radius: KINGDOM_BUILDER_SCOUT_SIGHT, scouting: true });
    });

    it("widens a settlement's watch with its barracks, and never reads past the table", () => {
        expect(settlementSight(0, 0).radius).toBe(KINGDOM_BUILDER_SETTLEMENT_SIGHT[0]);
        expect(settlementSight(0, 3).radius).toBeGreaterThan(settlementSight(0, 1).radius);
        expect(settlementSight(0, 99).radius).toBe(KINGDOM_BUILDER_SETTLEMENT_SIGHT.at(-1));
    });

    it("sees a circle of tiles, measured by column and row rather than by index", () => {
        const sights = [{ tile: at(10, 10), radius: 3 }];
        expect(isInSight(FIELD, sights, at(13, 10))).toBe(true);
        expect(isInSight(FIELD, sights, at(12, 12))).toBe(true);
        // A corner of the square the circle sits in is out of it.
        expect(isInSight(FIELD, sights, at(13, 13))).toBe(false);
        // One index along from the edge of a row is the far side of the map, not a neighbour.
        expect(isInSight(FIELD, [{ tile: at(19, 5), radius: 1 }], at(0, 6))).toBe(false);
        expect(isInSight(FIELD, [], at(10, 10))).toBe(false);
    });

    it("counts only scouting sights when asked who can read a garrison", () => {
        const sights = [{ tile: at(0, 0), radius: 5 }, { tile: at(10, 10), radius: 5, scouting: true as const }];
        expect(isInSight(FIELD, sights, at(1, 1), true)).toBe(false);
        expect(isInSight(FIELD, sights, at(11, 11), true)).toBe(true);
    });
});
