import { describe, expect, it } from "vitest";
import { battlefieldWith, buildBattlefield, coordsOf, coverOfRise, distance, facingTowards, FULL_HEIGHT, riseOf, squareAt, TERRAIN, type BattlefieldMap, type Terrain } from "./terrain";
import { coverAgainst } from "./cover";
import { pathCost } from "./pathfinding";

const map = (overrides: Partial<BattlefieldMap>): BattlefieldMap => ({
    name: "Test field",
    rows: ["...", ".,.", "..."],
    deployments: [],
    objectives: {},
    ...overrides,
});

describe("TERRAIN", () => {
    it("gives every terrain a whole movement cost of at least 1, or none at all", () => {
        for (const terrain of Object.values(TERRAIN)) {
            expect((Number.isInteger(terrain.moveCost) && terrain.moveCost >= 1) || terrain.moveCost === Infinity, terrain.name).toBe(true);
        }
    });

    it("gives every terrain a whole number of quarters of height", () => {
        for (const terrain of Object.values(TERRAIN)) expect(Number.isInteger(terrain.height) && terrain.height >= 0, terrain.name).toBe(true);
    });

    it("plays the table in §13.1", () => {
        expect(TERRAIN["."]).toMatchObject({ moveCost: 1, standable: true, height: 0, cover: "none", blocksSight: false });
        // Low cover's half cover, and a wall's full, come from their height alone.
        expect(TERRAIN[","]).toMatchObject({ standable: false, height: 2, cover: "none", blocksSight: false });
        expect(TERRAIN["o"]).toMatchObject({ standable: false, height: 3, cover: "none", blocksSight: false });
        expect(TERRAIN["#"]).toMatchObject({ moveCost: Infinity, standable: false, height: FULL_HEIGHT, blocksSight: false });
        // Trees hide whatever their height.
        expect(TERRAIN["T"]).toMatchObject({ moveCost: Infinity, cover: "full", blocksSight: true });
        expect(TERRAIN["s"]).toMatchObject({ moveCost: 2, standable: true, stairs: true });
        expect(TERRAIN["^"].height).toBeGreaterThan(TERRAIN["#"].height);
        // A parapet gives whoever is on the tower top half cover, by standing half a height above it.
        expect(TERRAIN["P"]).toMatchObject({ moveCost: Infinity, standable: false });
        expect(coverOfRise(TERRAIN["P"].height - TERRAIN["^"].height)).toBe("half");
    });

    it("plays the Sunken Village's terrain as what it's drawn from, but for a hedge's sight (§35.1)", () => {
        const rules = ({ name: _, ...rest }: Terrain) => rest;
        expect(rules(TERRAIN["="])).toEqual(rules(TERRAIN["."]));
        expect(rules(TERRAIN["H"])).toEqual(rules(TERRAIN["#"]));
        // A hedge is a low wall nobody can see through.
        expect(rules(TERRAIN["h"])).toEqual({ ...rules(TERRAIN["o"]), blocksSight: true });
    });
});

describe("coverOfRise", () => {
    it("gives nothing for a quarter, half cover for a half or three quarters, and full cover for a full height", () => {
        expect([0, 1, 2, 3, 4, 7, -2].map(coverOfRise)).toEqual(["none", "none", "half", "half", "full", "full", "none"]);
    });
});

describe("buildBattlefield", () => {
    it("reads the rows into one terrain per square, row by row", () => {
        const field = buildBattlefield(map({ rows: ["..#", ",.T"] }));
        expect(field).toMatchObject({ width: 3, height: 2 });
        expect(field.tiles.map(tile => tile.terrain.name)).toEqual(["Open ground", "Open ground", "Wall", "Rubble", "Open ground", "Trees"]);
    });

    it("stands each square's terrain on its ground, flat where the map has no elevation", () => {
        expect(buildBattlefield(map({ rows: ["..#"] })).tiles.map(tile => tile.elevation)).toEqual([0, 0, FULL_HEIGHT]);
        const hill = buildBattlefield(map({ rows: ["..#", ",.."], elevation: ["01a", "220"] }));
        // Base 36: "a" is ten quarters of ground, and the wall stands a full height on it.
        expect(hill.tiles.map(tile => tile.elevation)).toEqual([0, 1, 10 + FULL_HEIGHT, 2 + TERRAIN[","].height, 2, 0]);
        expect(riseOf(hill, 3, 4)).toBe(TERRAIN[","].height);
    });

    it("turns deployment zones and objectives into their squares", () => {
        const field = buildBattlefield(map({
            deployments: [{ col: 0, row: 0, width: 3, height: 1 }, { col: 0, row: 2, width: 2, height: 1 }],
            objectives: { centre: { col: 1, row: 1, width: 2, height: 2 } },
        }));
        expect(field.deployments).toEqual([[0, 1, 2], [6, 7]]);
        expect(field.objectives).toEqual({ centre: [4, 5, 7, 8] });
    });

    it("takes a deployment zone in several areas, keeping the areas it was drawn as", () => {
        const parts = [{ col: 0, row: 0, width: 3, height: 1 }, { col: 2, row: 1, width: 1, height: 2 }];
        const field = buildBattlefield(map({ deployments: [parts, { col: 0, row: 2, width: 2, height: 1 }] }));
        expect(field.deployments).toEqual([[0, 1, 2, 5, 8], [6, 7]]);
        expect(field.deploymentAreas).toEqual([parts, [{ col: 0, row: 2, width: 2, height: 1 }]]);
        expect(() => buildBattlefield(map({ deployments: [[parts[0], { col: 2, row: 0, width: 1, height: 2 }]] })))
            .toThrow(/deployment 0's areas overlap/);
    });

    it("throws on a map drawn wrong", () => {
        expect(() => buildBattlefield(map({ rows: [] }))).toThrow(/at least one square/);
        expect(() => buildBattlefield(map({ rows: ["...", ".."] }))).toThrow(/row 1 is 2 squares wide/);
        expect(() => buildBattlefield(map({ rows: ["..?"] }))).toThrow(/unknown terrain "\?" at column 2, row 0/);
        expect(() => buildBattlefield(map({ elevation: ["000", "000"] }))).toThrow(/elevation has 2 rows, not 3/);
        expect(() => buildBattlefield(map({ elevation: ["000", "00", "000"] }))).toThrow(/elevation row 1 is 2 squares wide/);
        expect(() => buildBattlefield(map({ elevation: ["000", "0A0", "000"] }))).toThrow(/unknown ground level "A" at column 1, row 1/);
        expect(() => buildBattlefield(map({ rows: ["..", ".."], objectives: { centre: { col: 1, row: 1, width: 2, height: 1 } } })))
            .toThrow(/objective "centre" doesn't fit/);
        expect(() => buildBattlefield(map({ deployments: [{ col: 0, row: 1, width: 3, height: 1 }] })))
            .toThrow(/deployment 0 has a square nobody can stand on/);
        expect(() => buildBattlefield(map({ objectives: { centre: { col: 1, row: 1, width: 1, height: 1 } } })))
            .toThrow(/objective "centre" has nowhere to stand/);
        expect(() => buildBattlefield(map({ objectives: { centre: { col: 0.5, row: 0, width: 1, height: 1 } } })))
            .toThrow(/doesn't fit/);
    });

    it("doesn't take a letter from Object's prototype for terrain", () => {
        expect(() => buildBattlefield(map({ rows: ["constructor"] }))).toThrow(/unknown terrain "c"/);
    });
});

describe("squareAt / coordsOf", () => {
    const field = buildBattlefield(map({ rows: ["....", "....", "...."] }));

    it("round-trips every square", () => {
        for (let square = 0; square < field.tiles.length; square++) {
            const { col, row } = coordsOf(field, square);
            expect(squareAt(field, col, row)).toBe(square);
        }
    });

    it("has no square off the map", () => {
        expect(squareAt(field, -1, 0)).toBeUndefined();
        expect(squareAt(field, 4, 0)).toBeUndefined();
        expect(squareAt(field, 0, 3)).toBeUndefined();
    });
});

describe("facingTowards", () => {
    const field = buildBattlefield(map({ rows: ["...", "...", "..."] }));
    const middle = squareAt(field, 1, 1)!;

    it("turns 45° a facing, from along the columns towards the rows", () => {
        const steps: [number, number][] = [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0]];
        expect(steps.map(([col, row]) => facingTowards(field, middle, squareAt(field, col, row)!))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it("rounds a long way to the nearest facing, and faces 0 towards itself", () => {
        const wide = buildBattlefield(map({ rows: [".........", "........."] }));
        expect(facingTowards(wide, 0, squareAt(wide, 8, 1)!)).toBe(0);
        expect(facingTowards(wide, squareAt(wide, 8, 1)!, 0)).toBe(4);
        expect(facingTowards(field, middle, middle)).toBe(0);
    });
});

describe("distance", () => {
    const field = buildBattlefield(map({ rows: ["....", "....", "...."] }));

    it("measures centre to centre, as the crow flies", () => {
        expect(distance(field, 0, 3)).toBe(3);
        expect(distance(field, 0, 9)).toBe(Math.hypot(1, 2));
        expect(distance(field, 9, 0)).toBe(distance(field, 0, 9));
        expect(distance(field, 5, 5)).toBe(0);
    });
});

describe("battlefieldWith (realm-arena.md §22)", () => {
    // Rubble, a low wall, a wall, a tree and a stair, on a rise of a quarter.
    const field = buildBattlefield(map({ rows: [",o#Ts", "....."], elevation: ["11111", "00000"] }));

    it("blasts low cover to scorched ground, level with the ground it stood on", () => {
        const blasted = battlefieldWith(field, [0, 1]);
        for (const square of [0, 1]) {
            expect(blasted.tiles[square]).toEqual({ terrain: TERRAIN["_"], elevation: 1 });
            expect(blasted.tiles[square].terrain).toMatchObject({ moveCost: 1, standable: true, height: 0, cover: "none", blocksSight: false });
        }
        // The map it was read from is left as it was.
        expect(field.tiles[0].terrain).toBe(TERRAIN[","]);
    });

    it("never blasts anything but low cover, whatever it's asked to", () => {
        const blasted = battlefieldWith(field, [2, 3, 4, 5, -1, 99, 0.5]);
        expect(blasted).toBe(field);
        expect(battlefieldWith(field, [])).toBe(field);
        expect(battlefieldWith(field, [2, 0]).tiles.slice(1)).toEqual(field.tiles.slice(1));
    });

    it("takes away the cover it gave, and opens a way across it", () => {
        const flat = buildBattlefield(map({ rows: ["...", ".,.", "..."] }));
        const behind = 7, beyond = 1, left = 3, right = 5;
        const blasted = battlefieldWith(flat, [4]);
        expect(coverAgainst(flat, behind, beyond)).toBe("half");
        expect(coverAgainst(blasted, behind, beyond)).toBe("none");
        expect(pathCost(blasted, [left, 4, right])).toBeLessThan(pathCost(flat, [left, 4, right])!);
    });
});
