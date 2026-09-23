import { describe, expect, it } from "vitest";

import {
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS,
    KINGDOM_BUILDER_STARTING_STOCKPILE,
    KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE,
    buildingCostFor,
} from "./buildings";
import { KINGDOM_BUILDER_ECONOMY as economy } from "./economy";
import { KINGDOM_BUILDER_RESOURCE_TYPES, canAfford, formatResources, resourcesOf, shortfallFor, tunedResources } from "./resources";

describe("Kingdom Builder economy.ts", () => {
    // Its types already demand a price for every building and unit; this is
    // the rule they can't state, run over the real file.
    const entries = [
        ...Object.entries(economy.buildingCosts).map(([name, amounts]) => [`buildingCosts.${name}`, amounts] as const),
        ...Object.entries(economy.unitCosts).map(([name, amounts]) => [`unitCosts.${name}`, amounts] as const),
        ["startingStockpile", economy.startingStockpile] as const,
        ["townCentreTrickle", economy.townCentreTrickle] as const,
    ];

    it.each(entries)("%s is in whole non-negative amounts", (name, amounts) => {
        expect(() => tunedResources(name, amounts)).not.toThrow();
    });

    it("never gives a building away, so the trickle is what gets a settlement started", () => {
        for (const type of KINGDOM_BUILDER_PROTOTYPE_BUILDINGS) {
            expect(KINGDOM_BUILDER_RESOURCE_TYPES.some(resource => buildingCostFor(type, 1)[resource] > 0)).toBe(true);
        }
        expect(KINGDOM_BUILDER_RESOURCE_TYPES.some(resource => KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE[resource] > 0)).toBe(true);
    });

    it("refuses a bad entry when the file loads, rather than failing open", () => {
        expect(() => tunedResources("test", { wood: -15 })).toThrow("bad wood");
        expect(() => tunedResources("test", { wood: 1.5 })).toThrow("bad wood");
        expect(tunedResources("test", { stone: 3 })).toEqual({ wood: 0, stone: 3, iron: 0, wheat: 0 });
    });

    it("lets the starting stockpile buy at least one building", () => {
        expect(KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.some(type => canAfford(KINGDOM_BUILDER_STARTING_STOCKPILE, buildingCostFor(type, 1)))).toBe(true);
    });
});

describe("Kingdom Builder building costs", () => {
    it("scales the level-one price linearly with the target level", () => {
        const levelOne = buildingCostFor("barracks", 1);
        expect(buildingCostFor("barracks", 3)).toEqual({ wood: levelOne.wood * 3, stone: levelOne.stone * 3, iron: levelOne.iron * 3, wheat: 0 });
    });

    it("reads what the stores are short of, and prints only what is owed", () => {
        const cost = { wood: 20, stone: 10, iron: 0, wheat: 5 };
        expect(shortfallFor({ wood: 25, stone: 4, iron: 0, wheat: 5 }, cost)).toEqual({ wood: 0, stone: 6, iron: 0, wheat: 0 });
        expect(canAfford({ wood: 20, stone: 10, iron: 0, wheat: 5 }, cost)).toBe(true);
        expect(canAfford({ wood: 20, stone: 10, iron: 0, wheat: 4 }, cost)).toBe(false);
        expect(formatResources(cost)).toBe("20 wood · 10 stone · 5 wheat");
    });

    it("reads a stored settlement with no wheat, from before it existed, as holding none", () => {
        expect(resourcesOf({ wood: 3, stone: 2, iron: 1 })).toEqual({ wood: 3, stone: 2, iron: 1, wheat: 0 });
    });
});
