import { describe, expect, it } from "vitest";

import { catchmentFor, catchmentScore, catchmentShares, catchmentTiles, groundlessCatchment, missingResources, outputPerLevelFor, tierForShare } from "./catchment";
import type { TerrainField } from "./terrainField";

function fieldOf(columns: number, rows: number, codes: string): TerrainField {
    return { columns, rows, tileSize: 2, codes };
}

describe("a settlement's catchment", () => {
    it("reaches radius 4 as a 9 × 9 square with its corners cut, and leaves off the map out", () => {
        const open = fieldOf(21, 21, "g".repeat(21 * 21));
        const centre = 10 * 21 + 10;
        const tiles = catchmentTiles(open, centre);
        expect(tiles).toHaveLength(69);
        expect(tiles).toContain(centre - 4);
        expect(tiles).not.toContain(centre - 4 * 21 - 4);
        // In a corner, only the quarter on the map counts.
        expect(catchmentTiles(open, 0).length).toBeLessThan(25);
    });

    it("counts each tile for what its area yields, over every tile in reach, sea included", () => {
        // Nine tiles in a row: two woodland, one mountain, two ocean, four grass.
        const shares = catchmentShares(fieldOf(9, 1, "wwmoogggg"), 4);
        expect(shares.wood).toBeCloseTo(2 / 9);
        expect(shares.stone).toBeCloseTo(1 / 9);
        expect(shares.iron).toBeCloseTo(1 / 9);
        expect(shares.wheat).toBeCloseTo(4 / 9);
    });

    it("counts marsh as half a tile of wheat, and grass or fields beside a river or lake as two", () => {
        expect(catchmentShares(fieldOf(9, 1, "sssssssss"), 4).wheat).toBeCloseTo(0.5);
        // g r f: both sides of the river are irrigated; the far grass isn't.
        expect(catchmentShares(fieldOf(9, 1, "ggrfooooo"), 4).wheat).toBeCloseTo((1 + 2 + 2) / 9);
        // Marsh gains nothing from the water beside it.
        expect(catchmentShares(fieldOf(9, 1, "slooooooo"), 4).wheat).toBeCloseTo(0.5 / 9);
    });

    it("sets a tier by share: none, then Poor under 15%, Good to 35%, Rich over it", () => {
        expect(tierForShare(0)).toBe("none");
        expect(tierForShare(0.01)).toBe("poor");
        expect(tierForShare(0.15)).toBe("good");
        expect(tierForShare(0.34)).toBe("good");
        expect(tierForShare(0.36)).toBe("rich");
        expect(catchmentFor(fieldOf(9, 1, "wwmoogggg"), 4)).toEqual({ wood: "good", stone: "poor", iron: "poor", wheat: "rich" });
    });

    it("pays 0–3 a level by tier, and scores land on the sum", () => {
        expect(["none", "poor", "good", "rich"].map(tier => outputPerLevelFor(tier as never))).toEqual([0, 1, 2, 3]);
        expect(catchmentScore({ wood: "rich", stone: "good", iron: "poor", wheat: "none" })).toBe(6);
        expect(missingResources({ wood: "rich", stone: "good", iron: "poor", wheat: "none" })).toEqual(["wheat"]);
    });

    it("gives land with no ground to read Good in everything, iron only where a mine stands", () => {
        expect(groundlessCatchment(false)).toEqual({ wood: "good", stone: "good", iron: "none", wheat: "good" });
        expect(groundlessCatchment(true).iron).toBe("good");
    });

    it("reads an unknown area code as grass rather than throwing", () => {
        expect(() => catchmentFor(fieldOf(3, 1, "g?g"), 1)).not.toThrow();
    });
});
