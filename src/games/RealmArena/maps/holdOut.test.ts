import { describe, expect, it } from "vitest";
import { REALM } from "../characters";
import { readyMadeMuster } from "../rules";
import { coordsOf, type Square } from "@/utils/games/battlefield/terrain";
import { DEPLOYMENT_NAMES, REALM_ARENA_MAPS } from ".";
import { fittingHoldOutMap } from "./holdOut";
import { edgeStrips, MIDDLE_CENTRE } from "./middleOut";
import { SACKED_FORT_FOUR, SACKED_FORT_THREE, SACKED_FORT_TWO } from "./sackedFort";
import { SUNKEN_VILLAGE_FOUR, SUNKEN_VILLAGE_THREE } from "./sunkenVillage";
import { inMiddle, onEdge, quarterTurn, sealedOff, sorted, strandedSeats, walksFrom } from "./testFixtures";

// Hold Out's own battlefields (§30.9, §35) are one design: the team in the
// middle of a 54-square map, round its centre, and a warband for each player
// closing in from the edges, unchanged by a quarter turn. So they're held to
// it by one set of checks; each map's file tests what is its own.
describe.each([
    { id: "sackedFortTwo", FIELD: SACKED_FORT_TWO, team: 2 },
    { id: "sackedFortThree", FIELD: SACKED_FORT_THREE, team: 3 },
    { id: "sackedFortFour", FIELD: SACKED_FORT_FOUR, team: 4 },
    { id: "sunkenVillageThree", FIELD: SUNKEN_VILLAGE_THREE, team: 3 },
    { id: "sunkenVillageFour", FIELD: SUNKEN_VILLAGE_FOUR, team: 4 },
] as const)("$id, for a team of $team", ({ id, FIELD, team }) => {
    const size = FIELD.width;
    const quarter = (square: Square) => quarterTurn(FIELD, square);
    const teamZones = FIELD.deployments.slice(0, team), warbandZones = FIELD.deployments.slice(team);
    /** Which edges a zone reaches: north, east, south, west, each corner going to the edge that runs into it clockwise. */
    const edgesOf = (zone: readonly Square[]) => {
        const at = zone.map(square => coordsOf(FIELD, square)), far = size - 3;
        return [
            at.some(({ col, row }) => row < 3 && col < far),
            at.some(({ col, row }) => col >= far && row < far),
            at.some(({ col, row }) => row >= far && col >= 3),
            at.some(({ col, row }) => col < 3 && row >= 3),
        ];
    };

    it("is 54 squares square, with a zone for each player and each warband", () => {
        expect(FIELD).toMatchObject({ width: 54, height: 54 });
        expect(FIELD.deployments).toHaveLength(2 * team);
        expect(REALM_ARENA_MAPS[id]).toBe(FIELD);
        expect(DEPLOYMENT_NAMES[id]).toHaveLength(2 * team);
    });

    it("is unchanged turned a quarter, ground and all, so no edge has the easier approach", () => {
        expect(FIELD.tiles.map((_, square) => FIELD.tiles[quarter(square)])).toEqual(FIELD.tiles);
        expect(sorted(FIELD.objectives.centre.map(quarter))).toEqual(FIELD.objectives.centre);
    });

    it("musters the team side by side in the middle, round its centre", () => {
        for (const zone of teamZones) expect(zone.every(square => inMiddle(FIELD, square))).toBe(true);
        expect(FIELD.objectives.centre.every(square => teamZones.some(zone => zone.includes(square)))).toBe(true);
    });

    it("musters the warbands round the whole edge, every square of it once, each from more than one side", () => {
        const edge = FIELD.tiles.flatMap((_, square) => onEdge(FIELD, square) ? [square] : []);
        expect(sorted(warbandZones.flat())).toEqual(edge);
        for (const zone of warbandZones) expect(edgesOf(zone).filter(Boolean).length).toBe({ 2: 2, 3: 4, 4: 3 }[team]);
        // Turned a quarter, each warband's zone is a warband's: the same one in thirds for three, the other one in halves for two, the next one round for four.
        const turnedTo = (k: number) => team === 2 ? 1 - k : team === 3 ? k : (k + 1) % 4;
        for (const [k, zone] of warbandZones.entries()) {
            expect(sorted(zone.map(quarter)), `warband ${k}`).toEqual(sorted(warbandZones[turnedTo(k)]));
        }
    });

    it("stands a ready-made warband on every side its zone reaches", () => {
        for (const seat of warbandZones.keys()) {
            const picks = readyMadeMuster(FIELD, team + seat, REALM.readyMade[80]);
            const squares = picks.map(pick => pick.square);
            expect(squares.every(square => FIELD.deployments[team + seat].includes(square))).toBe(true);
            expect(new Set(squares).size).toBe(squares.length);
            expect(edgesOf(squares), `warband ${seat}`).toEqual(edgesOf(FIELD.deployments[team + seat]));
        }
    });

    it("lets every zone reach the centre, and nowhere to stand is sealed off", () => {
        expect(strandedSeats(FIELD)).toEqual([]);
        expect(sealedOff(FIELD)).toEqual([]);
    });

    it("keeps a warband out of reach of a melee strike on its first turn", () => {
        // A scout moves 8 a point and has to keep two of its four for the strike.
        const team = teamZones.flat();
        for (const zone of warbandZones) expect(Math.min(...walksFrom(FIELD, zone, team))).toBeGreaterThan(2 * 8 + 1);
    });
});

// A team of four (§37): each of the four team zones is a quarter of the
// middle, and the warbands take the edge's thirds in a Latin square, so no
// edge's third is anybody's twice and none is left out.
describe.each([
    { id: "sackedFortFour", FIELD: SACKED_FORT_FOUR },
    { id: "sunkenVillageFour", FIELD: SUNKEN_VILLAGE_FOUR },
] as const)("$id's zones for four", ({ id, FIELD }) => {
    const [teamZones, warbandAreas] = [FIELD.deployments.slice(0, 4), FIELD.deployments.slice(4)];
    const thirds = edgeStrips(3);

    it("cuts the middle into four 6 × 4 quarters, clockwise from the north west, which together hold the centre and overlap nowhere", () => {
        expect(teamZones.map(zone => zone.length)).toEqual([24, 24, 24, 24]);
        expect(new Set(teamZones.flat()).size).toBe(96);
        const corner = (zone: readonly Square[]) => {
            const at = zone.map(square => coordsOf(FIELD, square));
            return [Math.min(...at.map(({ col }) => col)), Math.min(...at.map(({ row }) => row))];
        };
        expect(teamZones.map(corner)).toEqual([[21, 23], [27, 23], [27, 27], [21, 27]]);
        expect(MIDDLE_CENTRE).toEqual({ col: 24, row: 24, width: 6, height: 6 });
        expect(FIELD.objectives.centre.every(square => teamZones.some(zone => zone.includes(square)))).toBe(true);
    });

    it("gives warband k part j of strip (k + j) mod 4 for j = 0, 1, 2: the first, middle and last thirds, so every third of the edge is used once", () => {
        const third = (strip: number, part: number) => FIELD.tiles.flatMap((_, square) => {
            const { col, row } = coordsOf(FIELD, square), area = thirds[strip][part];
            return col >= area.col && col < area.col + area.width && row >= area.row && row < area.row + area.height ? [square] : [];
        });
        expect(warbandAreas).toHaveLength(4);
        for (const [k, zone] of warbandAreas.entries()) {
            expect(sorted(zone), `warband ${k}`).toEqual(sorted([0, 1, 2].flatMap(j => third((k + j) % 4, j))));
        }
        // Twelve thirds of 3 × 17 squares, none twice.
        expect(new Set(warbandAreas.flat()).size).toBe(12 * 3 * 17);
    });

    it("names its zones as they are: a quarter of the middle for each player, and for each warband the third of three edges", () => {
        const ground = id === "sackedFortFour" ? "keep" : "green";
        expect(DEPLOYMENT_NAMES[id]).toEqual([
            `in the north-west of the ${ground}`, `in the north-east of the ${ground}`, `in the south-east of the ${ground}`, `in the south-west of the ${ground}`,
            "at the first third of the north edge, the middle of the east edge and the last third of the south edge",
            "at the first third of the east edge, the middle of the south edge and the last third of the west edge",
            "at the first third of the south edge, the middle of the west edge and the last third of the north edge",
            "at the first third of the west edge, the middle of the north edge and the last third of the east edge",
        ]);
    });
});

describe("fittingHoldOutMap", () => {
    it("offers each battlefield to the team it's built for, and the Sacked Fort to a team it fits that the pick doesn't", () => {
        expect([1, 2, 3, 4, 5].map(players => fittingHoldOutMap("sunkenVillage", players))).toEqual([undefined, "sackedFort", "sunkenVillage", "sunkenVillage", undefined]);
        expect([1, 2, 3, 4, 5].map(players => fittingHoldOutMap("sackedFort", players))).toEqual([undefined, "sackedFort", "sackedFort", "sackedFort", undefined]);
    });
});
