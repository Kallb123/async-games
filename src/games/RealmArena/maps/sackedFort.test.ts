import { describe, expect, it } from "vitest";
import { REALM } from "../characters";
import { readyMadeMuster } from "../rules";
import { coordsOf, TERRAIN, type Square } from "@/utils/games/battlefield/terrain";
import { DEPLOYMENT_NAMES, mapFor, REALM_ARENA_MAPS } from ".";
import { SACKED_FORT_THREE, SACKED_FORT_TWO } from "./sackedFort";
import { sealedOff, sorted, strandedSeats, walksFrom } from "./testFixtures";

// The Sacked Fort (§30.9): one map, with a set of zones for each size of
// team — the team in the keep in the middle and a warband for each player
// closing in from the edges.
describe.each([
    { id: "sackedFortTwo", FORT: SACKED_FORT_TWO, team: 2 },
    { id: "sackedFortThree", FORT: SACKED_FORT_THREE, team: 3 },
] as const)("the Sacked Fort for a team of $team", ({ id, FORT, team }) => {
    const size = FORT.width;
    /** The same square with the map turned a quarter, clockwise. */
    const quarter = (square: Square): Square => {
        const { col, row } = coordsOf(FORT, square);
        return col * size + size - 1 - row;
    };
    const teamZones = FORT.deployments.slice(0, team), warbandZones = FORT.deployments.slice(team);
    const onEdge = (square: Square) => {
        const { col, row } = coordsOf(FORT, square);
        return Math.min(col, row, size - 1 - col, size - 1 - row) < 3;
    };
    /** Which edges a zone reaches: north, east, south, west, each corner going to the edge that runs into it clockwise. */
    const edgesOf = (zone: readonly Square[]) => {
        const at = zone.map(square => coordsOf(FORT, square)), far = size - 3;
        return [
            at.some(({ col, row }) => row < 3 && col < far),
            at.some(({ col, row }) => col >= far && row < far),
            at.some(({ col, row }) => row >= far && col >= 3),
            at.some(({ col, row }) => col < 3 && row >= 3),
        ];
    };

    it("is 54 squares square, with a zone for each player and each warband", () => {
        expect(FORT).toMatchObject({ width: 54, height: 54 });
        expect(FORT.deployments).toHaveLength(2 * team);
        expect(REALM_ARENA_MAPS[id]).toBe(FORT);
        expect(DEPLOYMENT_NAMES[id]).toHaveLength(2 * team);
    });

    it("is unchanged turned a quarter, so no edge has the easier approach", () => {
        expect(FORT.tiles.map((_, square) => FORT.tiles[quarter(square)].terrain)).toEqual(FORT.tiles.map(tile => tile.terrain));
        expect(sorted(FORT.objectives.centre.map(quarter))).toEqual(FORT.objectives.centre);
    });

    it("musters the team side by side in the keep, round its centre", () => {
        const keep = (square: Square) => Object.values(coordsOf(FORT, square)).every(at => at > 20 && at < size - 21);
        for (const zone of teamZones) expect(zone.every(keep)).toBe(true);
        expect(FORT.objectives.centre.every(square => teamZones.some(zone => zone.includes(square)))).toBe(true);
    });

    it("musters the warbands round the whole edge, every square of it once, each from more than one side", () => {
        const edge = FORT.tiles.flatMap((_, square) => onEdge(square) ? [square] : []);
        expect(sorted(warbandZones.flat())).toEqual(edge);
        for (const zone of warbandZones) expect(edgesOf(zone).filter(Boolean).length).toBe(team === 2 ? 2 : 4);
        // Turned a quarter, each warband's zone is a warband's: the same one in thirds, the other one in halves.
        for (const [k, zone] of warbandZones.entries()) {
            expect(sorted(zone.map(quarter)), `warband ${k}`).toEqual(sorted(warbandZones[team === 2 ? 1 - k : k]));
        }
    });

    it("stands a ready-made warband on every side its zone reaches", () => {
        for (const seat of warbandZones.keys()) {
            const picks = readyMadeMuster(FORT, team + seat, REALM.readyMade[80]);
            const squares = picks.map(pick => pick.square);
            expect(squares.every(square => FORT.deployments[team + seat].includes(square))).toBe(true);
            expect(new Set(squares).size).toBe(squares.length);
            expect(edgesOf(squares), `warband ${seat}`).toEqual(edgesOf(FORT.deployments[team + seat]));
        }
    });

    it("lets every zone reach the centre, and nowhere to stand is sealed off", () => {
        expect(strandedSeats(FORT)).toEqual([]);
        expect(sealedOff(FORT)).toEqual([]);
    });

    it("keeps a warband out of reach of a melee strike on its first turn", () => {
        // A scout moves 8 a point and has to keep two of its four for the strike.
        const team = teamZones.flat();
        for (const zone of warbandZones) expect(Math.min(...walksFrom(FORT, zone, team))).toBeGreaterThan(2 * 8 + 1);
    });

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
    it("puts a co-op team of two or three on it when the host picked it, and anyone else on their usual map", () => {
        expect([2, 3].map(players => mapFor(players, true, "sackedFort"))).toEqual(["sackedFortTwo", "sackedFortThree"]);
        expect(mapFor(1, true, "sackedFort")).toBe("ruinedFort");
        expect(mapFor(2, false, "sackedFort")).toBe("ruinedFort");
        expect(mapFor(2, true)).toBe("twinGateFort");
    });
});
