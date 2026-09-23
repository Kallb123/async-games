import { describe, expect, it } from "vitest";
import { HILLS_CODE, MOUNTAINS_CODE, elevationFloorOf } from "./areas";
import { generateLandmass, isLand, pointDistance, type Landmass } from "./landmass";
import { placeMountainRanges, placePasses, rangeElevationAt, rangeElevationGrid, ridgeLength, type MountainRange } from "./mountainRanges";
import { createRandom } from "./random";

const MOUNTAIN_FLOOR = elevationFloorOf(MOUNTAINS_CODE);
const HILLS_FLOOR = elevationFloorOf(HILLS_CODE);

/** A straight east–west range along y = 20, from x = 10 to x = 70. */
function straightRange(passes: MountainRange["passes"] = []): MountainRange {
    return { ridge: Array.from({ length: 21 }, (_, index) => ({ x: 10 + index * 3, y: 20 })), passes, width: 1 };
}

/** Land everywhere but a one-sample border of sea. */
function solidLand(): Landmass {
    const resolution = 50;
    const values = Array.from({ length: resolution * resolution }, (_, index) => {
        const col = index % resolution, row = Math.floor(index / resolution);
        return col === 0 || row === 0 || col === resolution - 1 || row === resolution - 1 ? 0 : 1;
    });
    return { width: 200, height: 140, resolution, values, landThreshold: 0.31 };
}

describe("placeMountainRanges", () => {
    it("is deterministic for a seed", () => {
        const landmass = generateLandmass(createRandom("ranges-land"));
        expect(placeMountainRanges(landmass, createRandom("ranges"))).toEqual(placeMountainRanges(landmass, createRandom("ranges")));
    });

    it("walks every ridge over land, at a length a range can be, kept apart from the others", () => {
        for (let seed = 0; seed < 5; seed++) {
            const landmass = generateLandmass(createRandom(`ranges-land-${seed}`));
            const ranges = placeMountainRanges(landmass, createRandom(`ranges-${seed}`));
            expect(ranges.length, `seed ${seed}`).toBeGreaterThan(1);
            for (const [index, range] of ranges.entries()) {
                expect(range.ridge.every(point => isLand(landmass, point))).toBe(true);
                expect(ridgeLength(range.ridge)).toBeGreaterThanOrEqual(26);
                expect(ridgeLength(range.ridge)).toBeLessThanOrEqual(64);
                for (const other of ranges.slice(index + 1)) {
                    const closest = Math.min(...range.ridge.flatMap(point => other.ridge.map(otherPoint => pointDistance(point, otherPoint))));
                    expect(closest).toBeGreaterThanOrEqual(14);
                }
            }
        }
    });

    it("spends a ridge-length budget in proportion to the land, not a fixed count", () => {
        const land = solidLand();
        const few = placeMountainRanges(land, createRandom("budget"), { mountainShare: 0.03 });
        const many = placeMountainRanges(land, createRandom("budget"), { mountainShare: 0.09 });
        const total = (ranges: MountainRange[]) => ranges.reduce((sum, range) => sum + ridgeLength(range.ridge), 0);
        expect(total(many)).toBeGreaterThan(total(few) * 2);
    });

    it("has no bias towards the middle of the map", () => {
        const land = solidLand();
        const spines = Array.from({ length: 10 }, (_, seed) => placeMountainRanges(land, createRandom(`spread-${seed}`)))
            .flat()
            .flatMap(range => range.ridge);
        const middle = spines.filter(point => point.x > 200 / 3 && point.x < 400 / 3 && point.y > 140 / 3 && point.y < 280 / 3);
        // A ninth of the map, give or take — the old massif put nearly all of it here.
        expect(middle.length / spines.length).toBeLessThan(0.25);
    });
});

describe("placePasses", () => {
    it("cuts none into a short range, one into a middling one and two into a long one, all on the spine", () => {
        const line = (length: number) => Array.from({ length: Math.floor(length / 2) + 1 }, (_, index) => ({ x: index * 2, y: 0 }));
        expect(placePasses(line(20), createRandom("p"))).toHaveLength(0);
        expect(placePasses(line(30), createRandom("p"))).toHaveLength(1);
        const two = placePasses(line(60), createRandom("p"));
        expect(two).toHaveLength(2);
        for (const pass of two) expect(pass.y).toBe(0);
        expect(pointDistance(two[0], two[1])).toBeGreaterThan(10);
    });
});

describe("rangeElevationAt", () => {
    const range = straightRange();
    const length = ridgeLength(range.ridge);

    it("is a mountain on the spine, hills on the flanks, and nothing far away", () => {
        expect(rangeElevationAt(range, length, { x: 40, y: 20 })).toBeGreaterThan(MOUNTAIN_FLOOR);
        const flank = rangeElevationAt(range, length, { x: 40, y: 23.2 });
        expect(flank).toBeGreaterThanOrEqual(HILLS_FLOOR);
        expect(flank).toBeLessThan(MOUNTAIN_FLOOR);
        expect(rangeElevationAt(range, length, { x: 40, y: 40 })).toBe(0);
    });

    it("falls the same way on both flanks", () => {
        expect(rangeElevationAt(range, length, { x: 40, y: 17 })).toBeCloseTo(rangeElevationAt(range, length, { x: 40, y: 23 }), 6);
    });

    it("narrows towards the ends rather than stopping at a wall", () => {
        const middle = rangeElevationAt(range, length, { x: 40, y: 22 });
        const end = rangeElevationAt(range, length, { x: 11, y: 22 });
        expect(end).toBeLessThan(middle);
    });

    it("drops a pass's notch to the hills band, and leaves the rest of the spine a mountain", () => {
        const withPass = straightRange([{ x: 40, y: 20 }]);
        const notch = rangeElevationAt(withPass, length, { x: 40, y: 20 });
        expect(notch).toBeGreaterThanOrEqual(HILLS_FLOOR);
        expect(notch).toBeLessThan(MOUNTAIN_FLOOR);
        expect(rangeElevationAt(withPass, length, { x: 55, y: 20 })).toBeGreaterThan(MOUNTAIN_FLOOR);
    });
});

describe("rangeElevationGrid", () => {
    it("samples every point, and the highest range wins where two meet", () => {
        const low = { ...straightRange(), width: 0.5 };
        const high = { ...straightRange(), width: 1.5 };
        const samples = [{ x: 40, y: 24 }, { x: 40, y: 120 }];
        const grid = rangeElevationGrid([low, high], samples);
        expect(grid).toHaveLength(2);
        expect(grid[0]).toBeCloseTo(rangeElevationAt(high, ridgeLength(high.ridge), samples[0]), 6);
        expect(grid[1]).toBe(0);
    });
});
