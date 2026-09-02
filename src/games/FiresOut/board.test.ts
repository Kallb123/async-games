import { describe, expect, it } from "vitest";
import {
    COLS,
    EDGE_COUNT,
    EDGE_DEFS,
    EXTERIOR_BOTTOM_START,
    EXTERIOR_TOP_START,
    FAMILY_STARTING_FIRE,
    FAMILY_STARTING_POI,
    INTERIOR_SPACE_COUNT,
    ROWS,
    SPACE_COUNT,
    colOf,
    edgeBetween,
    edgesOf,
    exteriorBottomSpace,
    exteriorTopSpace,
    isExteriorSpace,
    isInteriorSpace,
    neighboursOf,
    rowOf,
    spaceForRoll,
    spaceIndex,
} from "./board";

describe("Fires Out board grid", () => {
    it("is a 6x8 interior grid (§3): row is the d6, column is the d8", () => {
        expect(ROWS).toBe(6);
        expect(COLS).toBe(8);
        expect(INTERIOR_SPACE_COUNT).toBe(48);
        expect(spaceForRoll(1, 1)).toBe(spaceIndex(0, 0));
        expect(spaceForRoll(6, 8)).toBe(spaceIndex(5, 7));
        expect(rowOf(spaceIndex(3, 5))).toBe(3);
        expect(colOf(spaceIndex(3, 5))).toBe(5);
    });

    it("has one exterior space per column, above row 0 and below the last row", () => {
        expect(SPACE_COUNT).toBe(INTERIOR_SPACE_COUNT + 2 * COLS);
        expect(EXTERIOR_TOP_START).toBe(INTERIOR_SPACE_COUNT);
        expect(EXTERIOR_BOTTOM_START).toBe(INTERIOR_SPACE_COUNT + COLS);
        for (let col = 0; col < COLS; col++) {
            expect(isExteriorSpace(exteriorTopSpace(col))).toBe(true);
            expect(isExteriorSpace(exteriorBottomSpace(col))).toBe(true);
            expect(isInteriorSpace(exteriorTopSpace(col))).toBe(false);
        }
    });

    it("has exactly 82 interior wall/door segments plus 16 exterior openings (§17.4)", () => {
        const interior = EDGE_DEFS.filter(e => isInteriorSpace(e.a) && isInteriorSpace(e.b));
        const exterior = EDGE_DEFS.filter(e => !isInteriorSpace(e.a) || !isInteriorSpace(e.b));
        expect(interior).toHaveLength(82);
        expect(exterior).toHaveLength(16);
        expect(EDGE_COUNT).toBe(98);
    });

    it("gives every interior space 4 neighbours (3 in columns 0 and 7, which have no side exterior track) and every exterior space exactly 1", () => {
        for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
            const edgeColumn = colOf(space) === 0 || colOf(space) === COLS - 1;
            expect(neighboursOf(space)).toHaveLength(edgeColumn ? 3 : 4);
        }
        for (let space = INTERIOR_SPACE_COUNT; space < SPACE_COUNT; space++) {
            expect(neighboursOf(space)).toHaveLength(1);
        }
    });

    it("edgeBetween is symmetric and undefined for non-adjacent spaces", () => {
        const a = spaceIndex(2, 2);
        const b = spaceIndex(2, 3);
        expect(edgeBetween(a, b)).toBe(edgeBetween(b, a));
        expect(edgeBetween(a, b)).toBeDefined();
        expect(edgeBetween(spaceIndex(0, 0), spaceIndex(5, 7))).toBeUndefined();
    });

    it("every edge id indexes back into EDGE_DEFS at the same position", () => {
        EDGE_DEFS.forEach((edge, index) => expect(edge.id).toBe(index));
    });

    it("edgesOf agrees with edgeBetween for every adjacent pair", () => {
        for (let space = 0; space < SPACE_COUNT; space++) {
            for (const neighbour of neighboursOf(space)) {
                const id = edgeBetween(space, neighbour);
                expect(edgesOf(space)).toContain(id);
            }
        }
    });

    it("is fully connected — every space is reachable from space 0", () => {
        const visited = new Set<number>([0]);
        const queue = [0];
        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const neighbour of neighboursOf(current)) {
                if (!visited.has(neighbour)) {
                    visited.add(neighbour);
                    queue.push(neighbour);
                }
            }
        }
        expect(visited.size).toBe(SPACE_COUNT);
    });
});

describe("Family setup data (§6.1)", () => {
    it("has a cluster of ten starting fire spaces, all interior and unique", () => {
        expect(FAMILY_STARTING_FIRE).toHaveLength(10);
        expect(new Set(FAMILY_STARTING_FIRE).size).toBe(10);
        for (const space of FAMILY_STARTING_FIRE) expect(isInteriorSpace(space)).toBe(true);
    });

    it("has three starting POI spaces, all interior, unique, and clear of the starting fire", () => {
        expect(FAMILY_STARTING_POI).toHaveLength(3);
        expect(new Set(FAMILY_STARTING_POI).size).toBe(3);
        for (const space of FAMILY_STARTING_POI) {
            expect(isInteriorSpace(space)).toBe(true);
            expect(FAMILY_STARTING_FIRE).not.toContain(space);
        }
    });
});
