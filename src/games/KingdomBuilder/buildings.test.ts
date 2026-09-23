import { describe, expect, it } from "vitest";

import {
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS,
    KINGDOM_BUILDER_STARTING_STOCKPILE,
    KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE,
    buildingCostFor,
} from "./buildings";
import economy from "./economy.json";
import { KINGDOM_BUILDER_UNIT_TYPES } from "./units";
import { KINGDOM_BUILDER_RESOURCE_TYPES, canAfford, formatResources, shortfallFor } from "./resources";

describe("Kingdom Builder economy.json", () => {
    // A tuning pass edits this file by hand, so a typo should fail here rather than in a player's stores.
    const entries = [
        ...Object.entries(economy.buildingCosts).map(([name, amounts]) => [`buildingCosts.${name}`, amounts] as const),
        ...Object.entries(economy.unitCosts).map(([name, amounts]) => [`unitCosts.${name}`, amounts] as const),
        ["startingStockpile", economy.startingStockpile] as const,
        ["townCentreTrickle", economy.townCentreTrickle] as const,
    ];

    it.each(entries)("%s names only known resources, in whole non-negative amounts", (_, amounts) => {
        for (const [resource, amount] of Object.entries(amounts)) {
            expect(KINGDOM_BUILDER_RESOURCE_TYPES).toContain(resource);
            expect(Number.isInteger(amount) && amount >= 0).toBe(true);
        }
    });

    it("prices exactly the buildings a player can raise", () => {
        expect(Object.keys(economy.buildingCosts).toSorted()).toEqual([...KINGDOM_BUILDER_PROTOTYPE_BUILDINGS].toSorted());
    });

    it("prices exactly the units a barracks can train", () => {
        expect(Object.keys(economy.unitCosts).toSorted()).toEqual([...KINGDOM_BUILDER_UNIT_TYPES].toSorted());
    });

    it("never gives a building away, so the trickle is what gets a settlement started", () => {
        for (const type of KINGDOM_BUILDER_PROTOTYPE_BUILDINGS) {
            expect(KINGDOM_BUILDER_RESOURCE_TYPES.some(resource => buildingCostFor(type, 1)[resource] > 0)).toBe(true);
        }
        expect(KINGDOM_BUILDER_RESOURCE_TYPES.some(resource => KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE[resource] > 0)).toBe(true);
    });

    it("lets the starting stockpile buy at least one building", () => {
        expect(KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.some(type => canAfford(KINGDOM_BUILDER_STARTING_STOCKPILE, buildingCostFor(type, 1)))).toBe(true);
    });
});

describe("Kingdom Builder building costs", () => {
    it("scales the level-one price linearly with the target level", () => {
        const levelOne = buildingCostFor("barracks", 1);
        expect(buildingCostFor("barracks", 3)).toEqual({ wood: levelOne.wood * 3, stone: levelOne.stone * 3, iron: levelOne.iron * 3 });
    });

    it("reads what the stores are short of, and prints only what is owed", () => {
        const cost = { wood: 20, stone: 10, iron: 0 };
        expect(shortfallFor({ wood: 25, stone: 4, iron: 0 }, cost)).toEqual({ wood: 0, stone: 6, iron: 0 });
        expect(canAfford({ wood: 20, stone: 10, iron: 0 }, cost)).toBe(true);
        expect(canAfford({ wood: 19, stone: 10, iron: 0 }, cost)).toBe(false);
        expect(formatResources(cost)).toBe("20 wood · 10 stone");
    });
});
