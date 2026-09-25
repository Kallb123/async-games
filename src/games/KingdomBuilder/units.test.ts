import { describe, expect, it } from "vitest";

import { KINGDOM_BUILDER_STARTING_STOCKPILE, KINGDOM_BUILDER_UPGRADABLE_BUILDINGS } from "./buildings";
import { KINGDOM_BUILDER_RESOURCE_TYPES } from "./resources";
import {
    KINGDOM_BUILDER_MILITARY_UNIT_TYPES,
    KINGDOM_BUILDER_UNIT_TYPES,
    KINGDOM_BUILDER_UNITS,
    advanceTraining,
    barracksLevelOf,
    garrisonOf,
    isUnitType,
    trainingLevelFor,
    trainingTicksFor,
} from "./units";

describe("Kingdom Builder units", () => {
    it("unlocks every unit by its building's top level, and always costs something", () => {
        for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) {
            const unit = KINGDOM_BUILDER_UNITS[unitType];
            expect(unit.trainedAt.level).toBeGreaterThanOrEqual(1);
            expect(unit.trainedAt.level).toBeLessThanOrEqual(KINGDOM_BUILDER_UPGRADABLE_BUILDINGS[unit.trainedAt.building]!);
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

    it("trains the settler at a level-two town centre, and only it as a civilian", () => {
        expect(KINGDOM_BUILDER_UNITS.settler.trainedAt).toEqual({ building: "town-centre", level: 2 });
        expect(trainingTicksFor("settler", 1)).toBeNull();
        expect(trainingTicksFor("settler", 2)).toBe(4);
        expect(trainingLevelFor("settler", [{ position: 4, building: { type: "town-centre", level: 2 } }, { position: 0, building: { type: "barracks", level: 3 } }])).toBe(2);
        expect(trainingLevelFor("cavalry", [{ position: 4, building: { type: "town-centre", level: 2 } }, { position: 0, building: { type: "barracks", level: 3 } }])).toBe(3);
        expect(KINGDOM_BUILDER_MILITARY_UNIT_TYPES).toEqual(KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => unitType !== "settler" && unitType !== "commander"));
    });

    it("recruits the commander at a tavern, faster at each level above the first, and never counts it as an escort", () => {
        const commander = KINGDOM_BUILDER_UNITS.commander;
        expect(commander.trainedAt).toEqual({ building: "tavern", level: 1 });
        expect(commander.speed).toBe("fast");
        expect(commander.leader).toBe(true);
        expect(trainingTicksFor("commander", 0)).toBeNull();
        expect(trainingTicksFor("commander", 1)).toBe(4);
        expect(trainingTicksFor("commander", 2)).toBe(3);
        expect(trainingLevelFor("commander", [{ position: 4, building: { type: "town-centre", level: 2 } }, { position: 1, building: { type: "tavern", level: 2 } }])).toBe(2);
        expect(trainingLevelFor("commander", [{ position: 0, building: { type: "barracks", level: 3 } }])).toBe(0);
        expect(KINGDOM_BUILDER_MILITARY_UNIT_TYPES).not.toContain("commander");
    });

    it("trains a commander out of the queue into the garrison like any unit", () => {
        const result = advanceTraining([{ unitType: "commander", ticksRemaining: 1 }], { militia: 2 });
        expect(result.garrison).toMatchObject({ militia: 2, commander: 1 });
    });

    it("prices the settler above the stockpile it carries, so founding never prints resources", () => {
        for (const resource of KINGDOM_BUILDER_RESOURCE_TYPES) {
            expect(KINGDOM_BUILDER_UNITS.settler.cost[resource]).toBeGreaterThanOrEqual(KINGDOM_BUILDER_STARTING_STOCKPILE[resource]);
        }
        expect(KINGDOM_BUILDER_RESOURCE_TYPES.every(resource => KINGDOM_BUILDER_UNITS.settler.cost[resource] > 0)).toBe(true);
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
        expect(garrisonOf(undefined)).toEqual({ militia: 0, scout: 0, infantry: 0, cavalry: 0, "siege-engine": 0, settler: 0, commander: 0 });
        // A garrison or an army stored before commanders existed has no count for them.
        expect(garrisonOf({ militia: 3, settler: 1 }).commander).toBe(0);
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
