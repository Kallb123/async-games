import { describe, expect, it } from "vitest";
import { REALM } from "../characters";
import { readyMadeMuster } from "../rules";
import { coordsOf, type Square } from "@/utils/games/battlefield/terrain";
import { DEPLOYMENT_NAMES, REALM_ARENA_MAPS } from ".";
import { fittingHoldOutMap } from "./holdOut";
import { SACKED_FORT_THREE, SACKED_FORT_TWO } from "./sackedFort";
import { SUNKEN_VILLAGE_THREE } from "./sunkenVillage";
import { inMiddle, onEdge, quarterTurn, sealedOff, sorted, strandedSeats, walksFrom } from "./testFixtures";

// Hold Out's own battlefields (§30.9, §35) are one design: the team in the
// middle of a 54-square map, round its centre, and a warband for each player
// closing in from the edges, unchanged by a quarter turn. So they're held to
// it by one set of checks; each map's file tests what is its own.
describe.each([
    { id: "sackedFortTwo", FIELD: SACKED_FORT_TWO, team: 2 },
    { id: "sackedFortThree", FIELD: SACKED_FORT_THREE, team: 3 },
    { id: "sunkenVillageThree", FIELD: SUNKEN_VILLAGE_THREE, team: 3 },
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
        for (const zone of warbandZones) expect(edgesOf(zone).filter(Boolean).length).toBe(team === 2 ? 2 : 4);
        // Turned a quarter, each warband's zone is a warband's: the same one in thirds, the other one in halves.
        for (const [k, zone] of warbandZones.entries()) {
            expect(sorted(zone.map(quarter)), `warband ${k}`).toEqual(sorted(warbandZones[team === 2 ? 1 - k : k]));
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

describe("fittingHoldOutMap", () => {
    it("offers each battlefield to the team it's built for, and the Sacked Fort to a team it fits that the pick doesn't", () => {
        expect([1, 2, 3].map(players => fittingHoldOutMap("sunkenVillage", players))).toEqual([undefined, "sackedFort", "sunkenVillage"]);
        expect([1, 2, 3].map(players => fittingHoldOutMap("sackedFort", players))).toEqual([undefined, "sackedFort", "sackedFort"]);
    });
});
