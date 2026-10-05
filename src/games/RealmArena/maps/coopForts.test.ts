import { describe, expect, it } from "vitest";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, TERRAIN, type Square } from "@/utils/games/battlefield/terrain";
import { DEPLOYMENT_NAMES, mapFor, REALM_ARENA_MAPS } from ".";
import { THREE_GATE_FORT, THREE_GATE_FORT_MAP } from "./threeGateFort";
import { TWIN_GATE_FORT, TWIN_GATE_FORT_MAP } from "./twinGateFort";
import { sealedOff, sorted, strandedSeats, towersOverCentre, walkToCentre } from "./testFixtures";

// The co-op battlefields (§29.2) are one design at two widths, so they're held
// to it by one set of checks: a line battle, the team along the top edge and a
// warband opposite each player along the bottom, unchanged by a half turn.
describe.each([
    { id: "twinGateFort", FORT: TWIN_GATE_FORT, MAP: TWIN_GATE_FORT_MAP, team: 2, width: 48 },
    { id: "threeGateFort", FORT: THREE_GATE_FORT, MAP: THREE_GATE_FORT_MAP, team: 3, width: 64 },
] as const)("the $MAP.name", ({ id, FORT, MAP, team, width }) => {
    /** The same square with the map turned upside down. */
    const turned = (square: Square): Square => FORT.tiles.length - 1 - square;
    const cols = (zone: readonly Square[]) => [...new Set(zone.map(square => coordsOf(FORT, square).col))];
    const rows = (zone: readonly Square[]) => [...new Set(zone.map(square => coordsOf(FORT, square).row))];
    const players = [...Array(team).keys()];
    // The curtain wall's north face is the row the Ruined Fort's is (§15.1).
    const WALL_ROW = 13;

    it(`is ${width} squares wide and 48 deep, with a zone for each player and each warband`, () => {
        expect(FORT).toMatchObject({ width, height: 48 });
        expect(FORT.deployments).toHaveLength(2 * team);
        expect(REALM_ARENA_MAPS[id]).toBe(FORT);
        expect(DEPLOYMENT_NAMES[id]).toHaveLength(2 * team);
    });

    it("lines the team up along the top edge and the warbands along the bottom, each warband opposite a player (§29.2)", () => {
        const [teamZones, warbandZones] = [FORT.deployments.slice(0, team), FORT.deployments.slice(team)];
        expect(teamZones.map(rows)).toEqual(players.map(() => [0, 1, 2]));
        expect(warbandZones.map(rows)).toEqual(players.map(() => [45, 46, 47]));
        // Side by side across the whole edge, west to east.
        expect(teamZones.flatMap(cols)).toEqual([...Array(width).keys()]);
        for (const seat of players) expect(cols(warbandZones[seat]), `warband ${seat}`).toEqual(cols(teamZones[seat]));
    });

    it("is unchanged turned upside down, which carries each player's zone to a warband's (§29.2)", () => {
        const upsideDown = MAP.rows.map(row => [...row].reverse().join("")).reverse();
        expect(upsideDown).toEqual(MAP.rows);
        // West to east on top is east to west underneath.
        for (const seat of players) {
            expect(sorted(FORT.deployments[seat].map(turned)), `seat ${seat}`).toEqual(sorted(FORT.deployments[2 * team - 1 - seat]));
        }
        expect(sorted(FORT.objectives.centre.map(turned))).toEqual(sorted(FORT.objectives.centre));
    });

    it("has a 6×6 centre in the middle of the map (§13.7)", () => {
        const centre = FORT.objectives.centre.map(square => coordsOf(FORT, square));
        expect(centre).toHaveLength(36);
        expect(Math.min(...centre.map(({ col }) => col)) + Math.max(...centre.map(({ col }) => col)) + 1).toBe(FORT.width);
        expect(Math.min(...centre.map(({ row }) => row)) + Math.max(...centre.map(({ row }) => row)) + 1).toBe(FORT.height);
    });

    it("lets every deployment square reach the centre, and nowhere to stand is sealed off", () => {
        expect(strandedSeats(FORT)).toEqual([]);
        expect(sealedOff(FORT)).toEqual([]);
    });

    it("keeps a first turn's walk from reaching the centre, wherever a squad starts (§15.3)", () => {
        // A walk this long still takes most of a turn; the centre scores from round 3.
        for (const seat of players) expect(walkToCentre(FORT, seat).quickest, `seat ${seat}`).toBeGreaterThanOrEqual(18);
    });

    it("gives each player a gate of their own, a tower on either hand of it, and every tower a view into the keep", () => {
        const tops = FORT.tiles.flatMap(({ terrain }, square) => terrain === TERRAIN["^"] ? [square] : []);
        expect(sorted(towersOverCentre(FORT))).toEqual(tops);
        // A tower top is 2×2, and there's one more tower on each wall than there are gates in it.
        expect(tops).toHaveLength(2 * 4 * (team + 1));

        const wall = MAP.rows[WALL_ROW];
        const gates = [...wall.matchAll(/(?<=#)\.+(?=#)/g)].map(match => ({ from: match.index, to: match.index + match[0].length - 1 }));
        const towerCols = [...wall.matchAll(/\^\^/g)].map(match => match.index);
        expect(gates).toHaveLength(team);
        for (const [seat, gate] of gates.entries()) {
            const zone = cols(FORT.deployments[seat]);
            expect(gate.from >= zone[0] && gate.to <= zone.at(-1)!, `seat ${seat}'s gate`).toBe(true);
            expect(towerCols.filter(col => col < gate.from).at(-1), `the tower west of seat ${seat}'s gate`).toBe(towerCols[seat]);
            expect(towerCols.find(col => col > gate.to), `the tower east of seat ${seat}'s gate`).toBe(towerCols[seat + 1]);
        }
    });

    it("can only be got into by the gates and the rubble breaches", () => {
        // The open ground and rubble in the curtain wall's line, top and bottom and both sides:
        // the walls across run between the end towers (columns 4–7 and their mirror), and the
        // side walls (column 5 and its mirror) down between the towers' parapets (rows 12–15 and theirs).
        const inWall = (square: Square) => {
            const { col, row } = coordsOf(FORT, square);
            const across = (row === WALL_ROW || row === FORT.height - 1 - WALL_ROW) && col > 7 && col < FORT.width - 8;
            const down = (col === 5 || col === FORT.width - 6) && row > 15 && row < FORT.height - 16;
            return across || down;
        };
        const ways = new Set(FORT.tiles.flatMap(({ terrain }, square) => inWall(square) && (terrain === TERRAIN["."] || terrain === TERRAIN[","]) ? [square] : []));

        const keep = FORT.objectives.centre[0];
        expect(reachFrom(FORT, FORT.deployments[0][0], Infinity, { blocked: ways }).costs[keep]).toBe(Infinity);
    });
});

describe("mapFor (§29.2)", () => {
    it("puts a co-op team on the line battle for its size, and a free-for-all on the map for its party", () => {
        expect([1, 2, 3].map(players => mapFor(players, true))).toEqual(["ruinedFort", "twinGateFort", "threeGateFort"]);
        expect([2, 3, 4].map(players => mapFor(players, false))).toEqual(["ruinedFort", "ringFort", "fourGateFort"]);
    });

    it("picks maps with a zone for every player and every warband", () => {
        for (const players of [1, 2, 3]) expect(REALM_ARENA_MAPS[mapFor(players, true)].deployments).toHaveLength(2 * players);
    });
});
