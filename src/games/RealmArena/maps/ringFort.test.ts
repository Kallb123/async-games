import { describe, expect, it } from "vitest";
import { coordsOf, type Square } from "@/utils/games/battlefield/terrain";
import { RING_FORT as FORT, RING_FORT_MAP } from "./ringFort";
import { CENTRE, sealedOff, towersOverCentre, walksFrom, walkToCentre } from "./testFixtures";

/** The same square with the map mirrored left to right. */
const mirrored = (square: Square): Square => {
    const { col, row } = coordsOf(FORT, square);
    return row * FORT.width + (FORT.width - 1 - col);
};
const sorted = (squares: readonly Square[]) => [...squares].sort((a, b) => a - b);
const seats = [0, 1, 2];
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

describe("the Ring Fort", () => {
    it("is 48 squares square, with a zone for each of three players (§13.1)", () => {
        expect(FORT).toMatchObject({ width: 48, height: 48 });
        expect(FORT.deployments).toHaveLength(3);
    });

    it("is unchanged mirrored, which swaps the two top seats and keeps the bottom one (§19.2)", () => {
        expect(RING_FORT_MAP.rows.map(row => [...row].reverse().join(""))).toEqual(RING_FORT_MAP.rows);
        expect(sorted(FORT.deployments[0].map(mirrored))).toEqual(sorted(FORT.deployments[1]));
        expect(sorted(FORT.deployments[2].map(mirrored))).toEqual(sorted(FORT.deployments[2]));
        expect(sorted(FORT.objectives[CENTRE].map(mirrored))).toEqual(sorted(FORT.objectives[CENTRE]));
    });

    it("has a 6×6 centre (§13.7)", () => {
        expect(FORT.objectives[CENTRE]).toHaveLength(36);
    });

    it("lets every deployment square reach the centre, and nowhere to stand is sealed off", () => {
        for (const seat of seats) {
            expect(walksFrom(FORT, FORT.deployments[seat], FORT.objectives[CENTRE]).every(Number.isFinite), `seat ${seat}`).toBe(true);
        }
        expect(sealedOff(FORT)).toEqual([]);
    });

    // Mirroring only makes the top seats match each other, so the bottom seat is held level with
    // them by measurement. A Scout moves 6 squares an AP; the tolerances are a fraction of that.
    it("gives every seat the same quickest walk to the centre, and about the same average (§19.2)", () => {
        const walks = seats.map(seat => walkToCentre(FORT, seat));
        expect(spread(walks.map(walk => walk.quickest))).toBe(0);
        expect(spread(walks.map(walk => walk.average))).toBeLessThanOrEqual(2);
        expect(walks[0].quickest).toBeGreaterThanOrEqual(16);
    });

    it("puts every pair of seats about the same distance apart (§19.2)", () => {
        const apart = (one: number, other: number) => Math.min(...walksFrom(FORT, FORT.deployments[one], FORT.deployments[other]));
        expect(spread([apart(0, 1), apart(1, 2), apart(2, 0)])).toBeLessThanOrEqual(2);
    });

    it("has three towers looking down into the keep, none nearer to one seat than the others", () => {
        const towers = towersOverCentre(FORT);
        // A tower top is 2×2, so three towers are twelve squares.
        expect(towers).toHaveLength(12);
        // No seat has a tower to climb much sooner than another does.
        const nearest = seats.map(seat => Math.min(...walksFrom(FORT, towers, FORT.deployments[seat])));
        expect(spread(nearest)).toBeLessThanOrEqual(2);
    });
});
