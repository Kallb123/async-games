import { describe, expect, it } from "vitest";
import { buildBattlefield, coordsOf, distance, squareAt, TERRAIN, type BattlefieldMap } from "./terrain";

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

    it("plays the table in §13.1", () => {
        expect(TERRAIN["."]).toMatchObject({ moveCost: 1, standable: true, cover: "none", blocksSight: false });
        expect(TERRAIN[","]).toMatchObject({ moveCost: 3, standable: false, cover: "half", blocksSight: false });
        expect(TERRAIN["#"]).toMatchObject({ moveCost: Infinity, standable: false, cover: "full", blocksSight: true });
        expect(TERRAIN["s"]).toMatchObject({ moveCost: 2, standable: true, cover: "none", highGround: false });
        expect(TERRAIN["^"]).toMatchObject({ moveCost: 1, standable: true, cover: "none", highGround: true });
    });
});

describe("buildBattlefield", () => {
    it("reads the rows into one terrain per square, row by row", () => {
        const field = buildBattlefield(map({ rows: ["..#", ",.T"] }));
        expect(field).toMatchObject({ width: 3, height: 2 });
        expect(field.terrain.map(t => t.name)).toEqual(["Open ground", "Open ground", "Wall", "Rubble", "Open ground", "Trees"]);
    });

    it("turns deployment zones and objectives into their squares", () => {
        const field = buildBattlefield(map({
            deployments: [{ col: 0, row: 0, width: 3, height: 1 }, { col: 0, row: 2, width: 2, height: 1 }],
            objectives: { centre: { col: 1, row: 1, width: 2, height: 2 } },
        }));
        expect(field.deployments).toEqual([[0, 1, 2], [6, 7]]);
        expect(field.objectives).toEqual({ centre: [4, 5, 7, 8] });
    });

    it("throws on a map drawn wrong", () => {
        expect(() => buildBattlefield(map({ rows: [] }))).toThrow(/at least one square/);
        expect(() => buildBattlefield(map({ rows: ["...", ".."] }))).toThrow(/row 1 is 2 squares wide/);
        expect(() => buildBattlefield(map({ rows: ["..?"] }))).toThrow(/unknown terrain "\?" at column 2, row 0/);
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
        for (let square = 0; square < field.terrain.length; square++) {
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

describe("distance", () => {
    const field = buildBattlefield(map({ rows: ["....", "....", "...."] }));

    it("measures centre to centre, as the crow flies", () => {
        expect(distance(field, 0, 3)).toBe(3);
        expect(distance(field, 0, 9)).toBe(Math.hypot(1, 2));
        expect(distance(field, 9, 0)).toBe(distance(field, 0, 9));
        expect(distance(field, 5, 5)).toBe(0);
    });
});
