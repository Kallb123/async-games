import { describe, expect, it } from "vitest";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { coordsOf, distance, squareAt, type Square } from "@/utils/games/battlefield/terrain";
import { FOUR_GATE_FORT as FORT, FOUR_GATE_FORT_MAP } from "./fourGateFort";

const size = FORT.width;
/** The same square with the map given a quarter turn clockwise. */
const turned = (square: Square): Square => {
    const { col, row } = coordsOf(FORT, square);
    return squareAt(FORT, size - 1 - row, col)!;
};
const sorted = (squares: readonly Square[]) => [...squares].sort((a, b) => a - b);
const middle = (squares: readonly Square[]) => {
    const coords = squares.map(square => coordsOf(FORT, square));
    const mean = (pick: (c: { col: number; row: number }) => number) => coords.reduce((total, c) => total + pick(c), 0) / coords.length;
    return squareAt(FORT, Math.round(mean(c => c.col)), Math.round(mean(c => c.row)))!;
};

const centre = FORT.objectives.centre;
const standable = FORT.terrain.flatMap((terrain, square) => terrain.standable ? [square] : []);

describe("the Four-Gate Fort", () => {
    it("is 48 squares a side (§13.1), with a corner for each of four seats", () => {
        expect(FORT).toMatchObject({ width: 48, height: 48 });
        expect(FORT.deployments).toHaveLength(4);
    });

    it("is unchanged by a quarter turn, which takes each corner to the next seat's (§15.4)", () => {
        const quarterTurn = FOUR_GATE_FORT_MAP.rows.map((_, row) =>
            FOUR_GATE_FORT_MAP.rows.map(line => line[row]).reverse().join(""));
        expect(quarterTurn).toEqual(FOUR_GATE_FORT_MAP.rows);
        for (const [seat, zone] of FORT.deployments.entries()) {
            expect(sorted(zone.map(turned)), `seat ${seat}`).toEqual(sorted(FORT.deployments[(seat + 1) % 4]));
        }
        expect(sorted(centre.map(turned))).toEqual(sorted(centre));
    });

    it("puts the corners about 40 squares apart (§13.1), with a 6×6 centre in the middle (§13.7)", () => {
        const corners = FORT.deployments.map(middle);
        for (const [seat, corner] of corners.entries()) {
            const gap = distance(FORT, corner, corners[(seat + 1) % 4]);
            expect(gap, `seat ${seat}`).toBeGreaterThanOrEqual(38);
            expect(gap, `seat ${seat}`).toBeLessThanOrEqual(44);
        }
        expect(centre).toHaveLength(36);
        expect(centre.every(square => FORT.terrain[square].standable)).toBe(true);
    });

    it("lets every deployment square reach the centre", () => {
        for (const [seat, zone] of FORT.deployments.entries()) {
            for (const square of zone) {
                const { costs } = reachFrom(FORT, square);
                expect(centre.some(c => costs[c] < Infinity), `seat ${seat}, square ${square}`).toBe(true);
            }
        }
    });

    it("has nowhere to stand that's sealed off from the rest of the map", () => {
        const { costs } = reachFrom(FORT, FORT.deployments[0][0]);
        const sealed = standable.filter(square => costs[square] === Infinity).map(square => coordsOf(FORT, square));
        expect(sealed).toEqual([]);
    });

    it("can only be got into by the four corner gates", () => {
        const gates = [12, 13, 14, 15].flatMap(n => [squareAt(FORT, n, 12)!, squareAt(FORT, 12, n)!]).flatMap(square => [square, turned(square), turned(turned(square)), turned(turned(turned(square)))]);
        expect(gates.every(square => FORT.terrain[square].standable)).toBe(true);
        const { costs } = reachFrom(FORT, FORT.deployments[0][0], Infinity, { blocked: new Set(gates) });
        expect(centre.filter(square => costs[square] < Infinity)).toEqual([]);
    });

    it("has a tower on each side that looks down into the keep, climbed from inside the walls", () => {
        const towerTops = standable.filter(square => FORT.terrain[square].highGround);
        expect(towerTops).toHaveLength(16);
        // The quarter turn carries a tower that sees in to the other three.
        const north = towerTops.filter(top => coordsOf(FORT, top).row < 20);
        expect(north.some(top => centre.some(square => canSee(FORT, top, square)))).toBe(true);
        // Blocking the courtyard's four stairs leaves no way up.
        const stairs = standable.filter(square => FORT.terrain[square].name === "Tower stair");
        expect(stairs).toHaveLength(4);
        const { costs } = reachFrom(FORT, FORT.deployments[0][0], Infinity, { blocked: new Set(stairs) });
        expect(towerTops.filter(square => costs[square] < Infinity)).toEqual([]);
    });
});
