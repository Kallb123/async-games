import { describe, expect, it } from "vitest";
import { coordsOf, type Square } from "@/utils/games/battlefield/terrain";
import { FOUR_GATE_FORT as FORT, FOUR_GATE_FORT_MAP } from "./fourGateFort";
import { CENTRE, sealedOff, towersOverCentre, walksFrom, walkToCentre } from "./testFixtures";

/** The same square with the map given a quarter turn clockwise. */
const quarterTurn = (square: Square): Square => {
    const { col, row } = coordsOf(FORT, square);
    return col * FORT.width + (FORT.width - 1 - row);
};
const sorted = (squares: readonly Square[]) => [...squares].sort((a, b) => a - b);

describe("the Four-Gate Fort", () => {
    it("is 48 squares square, with a zone for each of four players (§13.1)", () => {
        expect(FORT).toMatchObject({ width: 48, height: 48 });
        expect(FORT.deployments).toHaveLength(4);
    });

    it("is unchanged by a quarter turn, which carries each seat's zone to the next seat's (§19.2)", () => {
        const turned = FOUR_GATE_FORT_MAP.rows.map((_, r) => FOUR_GATE_FORT_MAP.rows.map(row => row[r]).reverse().join(""));
        expect(turned).toEqual(FOUR_GATE_FORT_MAP.rows);
        for (const [seat, zone] of FORT.deployments.entries()) {
            expect(sorted(zone.map(quarterTurn)), `seat ${seat}`).toEqual(sorted(FORT.deployments[(seat + 1) % 4]));
        }
        expect(sorted(FORT.objectives[CENTRE].map(quarterTurn))).toEqual(sorted(FORT.objectives[CENTRE]));
    });

    it("has a 6×6 centre in the middle of the map (§13.7)", () => {
        const centre = FORT.objectives[CENTRE].map(square => coordsOf(FORT, square));
        expect(centre).toHaveLength(36);
        expect(Math.min(...centre.map(({ col }) => col)) + Math.max(...centre.map(({ col }) => col)) + 1).toBe(FORT.width);
        expect(Math.min(...centre.map(({ row }) => row)) + Math.max(...centre.map(({ row }) => row)) + 1).toBe(FORT.height);
    });

    it("lets every deployment square reach the centre, and nowhere to stand is sealed off", () => {
        for (const seat of FORT.deployments.keys()) {
            expect(walksFrom(FORT, FORT.deployments[seat], FORT.objectives[CENTRE]).every(Number.isFinite), `seat ${seat}`).toBe(true);
        }
        expect(sealedOff(FORT)).toEqual([]);
    });

    it("keeps a first turn's walk from reaching the centre (§15.3)", () => {
        // A Scout's whole turn is 4 AP at 6 squares an AP; the centre scores from round 3, but a
        // walk this long still takes most of a turn.
        expect(walkToCentre(FORT, 0).quickest).toBeGreaterThanOrEqual(18);
    });

    it("has a tower between each pair of gates, every one looking down into the keep", () => {
        const towers = towersOverCentre(FORT);
        const middle = (FORT.width - 1) / 2;
        const sides = new Set(towers.map(top => {
            const { col, row } = coordsOf(FORT, top);
            return Math.abs(col - middle) > Math.abs(row - middle) ? (col < middle ? "west" : "east") : (row < middle ? "north" : "south");
        }));
        expect([...sides].sort()).toEqual(["east", "north", "south", "west"]);
    });
});
