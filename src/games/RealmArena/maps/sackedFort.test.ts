import { describe, expect, it } from "vitest";
import { TERRAIN } from "@/utils/games/battlefield/terrain";
import { mapFor, REALM_ARENA_MAPS } from ".";
import { SACKED_FORT_FOUR, SACKED_FORT_THREE, SACKED_FORT_TWO } from "./sackedFort";

// The Sacked Fort (§30.9): one map, with a set of zones for each size of
// team — the team in the keep in the middle and a warband for each player
// closing in from the edges. What it shares with the Sunken Village is held
// in holdOut.test.ts; this is its walls.
describe.each([
    { FORT: SACKED_FORT_TWO, team: 2 },
    { FORT: SACKED_FORT_THREE, team: 3 },
    { FORT: SACKED_FORT_FOUR, team: 4 },
] as const)("the Sacked Fort for a team of $team", ({ FORT }) => {
    const size = FORT.width;

    it("can't be shut: five ways through every side of the curtain wall, and only low walls round the keep between its pillars", () => {
        /** The runs of squares a character can get across in one side's line, west to east along the north side. */
        const gaps = (row: number, from: number, to: number) => {
            const line = Array.from({ length: to - from + 1 }, (_, i) => FORT.tiles[row * size + from + i].terrain);
            return line.map(terrain => terrain === TERRAIN["#"] ? "#" : "-").join("").split("#").filter(Boolean).length;
        };
        // The north side between its towers (the map is the same on every side); the keep's between its corner pillars.
        expect(gaps(12, 15, 38)).toBeGreaterThanOrEqual(5);
        expect(gaps(20, 21, 32)).toBe(1);
        // A gate six squares wide.
        expect([24, 25, 26, 27, 28, 29].every(col => FORT.tiles[12 * size + col].terrain === TERRAIN["."])).toBe(true);
    });
});

describe("mapFor with the Sacked Fort (§30.9)", () => {
    it("puts a co-op team of two, three or four on it when the host picked it, and anyone else on their usual map", () => {
        expect([2, 3, 4].map(players => mapFor(players, true, "sackedFort"))).toEqual(["sackedFortTwo", "sackedFortThree", "sackedFortFour"]);
        expect(mapFor(1, true, "sackedFort")).toBe("ruinedFort");
        expect(mapFor(2, false, "sackedFort")).toBe("ruinedFort");
        expect(mapFor(2, true)).toBe("twinGateFort");
        // A team of four has no line battle, so the setting check (`fitsCoop`) keeps one from being asked for; the map it would get has no zone for the fourth.
        expect(SACKED_FORT_FOUR.deployments).toHaveLength(8);
        expect(REALM_ARENA_MAPS[mapFor(4, true)].deployments).toHaveLength(6);
    });
});
