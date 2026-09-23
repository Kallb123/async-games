import { describe, expect, it } from "vitest";
import type { TerrainField } from "./terrainField";
import { COMPOSITION_BANDS, MAXIMUM_MOUNTAIN_REGION_SHARE, checkWorldShape, compositionOf, largestMountainRegionShare } from "./worldShape";

/** Builds a one-row field from a count per code, in order. */
function stripOf(parts: [string, number][]): TerrainField {
    const codes = parts.map(([code, count]) => code.repeat(count)).join("");
    return { columns: codes.length, rows: 1, tileSize: 2, codes };
}

/** A world whose land sits in the middle of every band, its mountains in three masses: 8 mountain, 14 hills, 24 woodland, 40 grass + fields, 3 marsh, 5 lake/river, 6 beach. */
const BALANCED: [string, number][] = [["o", 50], ["m", 3], ["g", 1], ["m", 3], ["g", 1], ["m", 2], ["h", 14], ["w", 24], ["g", 29], ["f", 10], ["s", 3], ["l", 3], ["r", 2], ["b", 5]];

describe("compositionOf", () => {
    it("measures each band as a share of every tile that isn't ocean", () => {
        const shares = compositionOf(stripOf(BALANCED));
        const byLabel = Object.fromEntries(COMPOSITION_BANDS.map((band, index) => [band.label, shares[index]]));
        expect(byLabel.mountains).toBeCloseTo(0.08, 6);
        expect(byLabel["grass and fields"]).toBeCloseTo(0.41, 6);
        expect(byLabel["lakes and rivers"]).toBeCloseTo(0.05, 6);
    });

    it("reports nothing rather than dividing by zero for a world of sea", () => {
        expect(compositionOf(stripOf([["o", 10]])).every(share => share === 0)).toBe(true);
    });
});

describe("largestMountainRegionShare", () => {
    it("measures the biggest eight-connected mass of mountains against all of them", () => {
        // Two masses of 3 and 1, the first joined only diagonally.
        const field: TerrainField = { columns: 4, rows: 3, tileSize: 2, codes: "mggm" + "gmgg" + "ggmg" };
        expect(largestMountainRegionShare(field)).toBeCloseTo(3 / 4, 6);
    });

    it("is 0 for a world with no mountains", () => {
        expect(largestMountainRegionShare(stripOf([["g", 5]]))).toBe(0);
    });
});

describe("checkWorldShape", () => {
    it("passes a world inside every band with its mountains split up", () => {
        expect(checkWorldShape(stripOf(BALANCED))).toEqual([]);
    });

    it("names each band a world falls outside", () => {
        const reasons = checkWorldShape(stripOf([["o", 10], ["g", 90], ["m", 10]]));
        expect(reasons.some(reason => reason.startsWith("hills"))).toBe(true);
        expect(reasons.some(reason => reason.startsWith("woodland"))).toBe(true);
        expect(reasons.some(reason => reason.startsWith("grass and fields"))).toBe(true);
    });

    it(`rejects one mountain mass holding more than ${MAXIMUM_MOUNTAIN_REGION_SHARE * 100}% of the mountains`, () => {
        const massif = BALANCED.map(([code, count]): [string, number] => (code === "g" && count === 1 ? ["m", 1] : [code, count]));
        expect(checkWorldShape(stripOf(massif))).toContainEqual(expect.stringMatching(/one mountain region holds 100%/));
    });
});
