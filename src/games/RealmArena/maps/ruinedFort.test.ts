import { describe, expect, it } from "vitest";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, squareAt, type Square } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT as FORT, RUINED_FORT_MAP } from "./ruinedFort";
import { sealedOff, sorted, strandedSeats, towersOverCentre } from "./testFixtures";

/** The same square with the map turned upside down. */
const turned = (square: Square): Square => FORT.tiles.length - 1 - square;

const centre = FORT.objectives.centre;

describe("the Ruined Fort", () => {
    it("is 36 squares wide and 48 long (§13.1)", () => {
        expect(FORT).toMatchObject({ width: 36, height: 48 });
    });

    it("is unchanged turned upside down, so neither side has the better approach (§15.2)", () => {
        const upsideDown = RUINED_FORT_MAP.rows.map(row => [...row].reverse().join("")).reverse();
        expect(upsideDown).toEqual(RUINED_FORT_MAP.rows);
        expect(sorted(FORT.deployments[1].map(turned))).toEqual(FORT.deployments[0]);
        expect(sorted(centre.map(turned))).toEqual(centre);
    });

    it("has a 6×6 centre in the middle of the map (§13.7)", () => {
        const cols = centre.map(square => coordsOf(FORT, square).col);
        const rows = centre.map(square => coordsOf(FORT, square).row);
        expect(centre).toHaveLength(36);
        expect([Math.min(...cols) + Math.max(...cols) + 1, Math.min(...rows) + Math.max(...rows) + 1]).toEqual([FORT.width, FORT.height]);
    });

    it("lets every deployment square reach the centre, and nowhere to stand is sealed off", () => {
        expect(strandedSeats(FORT)).toEqual([]);
        expect(sealedOff(FORT)).toEqual([]);
    });

    it("gives each side a tower that looks down into the keep", () => {
        const towers = towersOverCentre(FORT);
        for (const seat of [0, 1]) {
            expect(towers.some(top => (coordsOf(FORT, top).row < FORT.height / 2) === (seat === 0)), `seat ${seat}`).toBe(true);
        }
    });

    it("can only be got into by the gates and the breaches (§15.2)", () => {
        const squares = (cols: number[], rows: number[]) => cols.flatMap(col => rows.map(row => squareAt(FORT, col, row)!));
        const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
        const gates = squares(range(15, 20), [13, 34]);
        const breaches = [...squares([7], range(18, 20)), ...squares([28], range(27, 29))];
        const courtyard = squares(range(8, 27), range(14, 33));

        expect(gates.every(square => FORT.tiles[square].terrain.name === "Open ground")).toBe(true);
        expect(breaches.every(square => FORT.tiles[square].terrain.name === "Rubble")).toBe(true);
        const { costs } = reachFrom(FORT, FORT.deployments[0][0], Infinity, { blocked: new Set([...gates, ...breaches]) });
        expect(courtyard.filter(square => costs[square] < Infinity)).toEqual([]);
    });
});
