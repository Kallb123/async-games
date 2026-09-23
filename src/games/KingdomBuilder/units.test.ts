import { describe, expect, it } from "vitest";

import {
    KINGDOM_BUILDER_BARRACKS_MAX_LEVEL,
    KINGDOM_BUILDER_UNIT_TYPES,
    KINGDOM_BUILDER_UNITS,
    advanceTraining,
    barracksLevelOf,
    garrisonOf,
    isUnitType,
    trainingTicksFor,
} from "./units";

describe("Kingdom Builder units", () => {
    it("unlocks every unit by the barracks' top level, and always costs something", () => {
        for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) {
            const unit = KINGDOM_BUILDER_UNITS[unitType];
            expect(unit.barracksLevel).toBeGreaterThanOrEqual(1);
            expect(unit.barracksLevel).toBeLessThanOrEqual(KINGDOM_BUILDER_BARRACKS_MAX_LEVEL);
            expect(unit.cost.wood + unit.cost.stone + unit.cost.iron).toBeGreaterThan(0);
            expect(Object.values(unit.cost).every(amount => Number.isInteger(amount) && amount >= 0)).toBe(true);
        }
    });

    it("gates units on the barracks level and trains faster above it, never below one tick", () => {
        expect(trainingTicksFor("infantry", 1)).toBeNull();
        expect(trainingTicksFor("infantry", 2)).toBe(3);
        expect(trainingTicksFor("infantry", 3)).toBe(2);
        expect(trainingTicksFor("militia", 1)).toBe(2);
        expect(trainingTicksFor("militia", 3)).toBe(1);
        expect(trainingTicksFor("militia", 9)).toBe(1);
    });

    it("reads the barracks level off the tiles", () => {
        expect(barracksLevelOf([{ position: 0, building: { type: "mine", level: 3 } }])).toBe(0);
        expect(barracksLevelOf([{ position: 0 }, { position: 1, building: { type: "barracks", level: 2 } }])).toBe(2);
    });

    it("rejects forged unit types", () => {
        expect(isUnitType("militia")).toBe(true);
        expect(isUnitType("dragon")).toBe(false);
        expect(isUnitType("constructor")).toBe(false);
        expect(isUnitType(3)).toBe(false);
    });

    it("reads a missing garrison as empty", () => {
        expect(garrisonOf(undefined)).toEqual({ militia: 0, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0 });
        expect(garrisonOf({ cavalry: 2 }).cavalry).toBe(2);
    });

    it("advances only the head of the queue and finishes one unit per tick", () => {
        const queue = [{ unitType: "militia" as const, ticksRemaining: 1 }, { unitType: "scout" as const, ticksRemaining: 1 }];

        const first = advanceTraining(queue, undefined);
        expect(first.garrison.militia).toBe(1);
        expect(first.trainingQueue).toEqual([{ unitType: "scout", ticksRemaining: 1 }]);

        const second = advanceTraining(first.trainingQueue, first.garrison);
        expect(second.garrison).toMatchObject({ militia: 1, scout: 1 });
        expect(second.trainingQueue).toEqual([]);
        expect(queue[0].ticksRemaining).toBe(1);
    });

    it("counts down the unit in training without touching the ones behind it", () => {
        const result = advanceTraining([
            { unitType: "infantry", ticksRemaining: 3 },
            { unitType: "infantry", ticksRemaining: 3 },
        ], { infantry: 4 });
        expect(result.trainingQueue.map(order => order.ticksRemaining)).toEqual([2, 3]);
        expect(result.garrison.infantry).toBe(4);
    });
});
