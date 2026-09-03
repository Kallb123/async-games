import { describe, expect, it } from "vitest";
import {
    AMBULANCE_START,
    COLS,
    DISPLAY_COLS,
    DISPLAY_ROWS,
    EDGE_COUNT,
    EDGE_DEFS,
    ENGINE_START,
    EXTERIOR_BOTTOM_START,
    EXTERIOR_CORNERS,
    EXTERIOR_TOP_START,
    FAMILY_STARTING_FIRE,
    FAMILY_STARTING_POI,
    INTERIOR_SPACE_COUNT,
    QUADRANT_COUNT,
    ROWS,
    SPACE_COUNT,
    START_SPACE,
    colOf,
    edgeBetween,
    edgesOf,
    exteriorBottomSpace,
    exteriorLeftSpace,
    exteriorRightSpace,
    exteriorTopSpace,
    spaceAtDisplayCell,
    isExteriorSpace,
    isInteriorSpace,
    neighboursOf,
    quadrantOf,
    rowOf,
    spaceForRoll,
    spaceIndex,
    spacesInQuadrant,
    perimeterNeighbours,
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

    it("wraps the building in a full exterior perimeter — a ring of 32 outdoor spaces", () => {
        expect(SPACE_COUNT).toBe(DISPLAY_ROWS * DISPLAY_COLS);
        expect(SPACE_COUNT - INTERIOR_SPACE_COUNT).toBe(32);
        expect(EXTERIOR_TOP_START).toBe(INTERIOR_SPACE_COUNT); // append-only: a saved game keeps the indices it already refers to
        expect(EXTERIOR_BOTTOM_START).toBe(INTERIOR_SPACE_COUNT + COLS);
        for (let col = 0; col < COLS; col++) {
            expect(isExteriorSpace(exteriorTopSpace(col))).toBe(true);
            expect(isExteriorSpace(exteriorBottomSpace(col))).toBe(true);
            expect(isInteriorSpace(exteriorTopSpace(col))).toBe(false);
        }
        for (let row = 0; row < ROWS; row++) {
            expect(isExteriorSpace(exteriorLeftSpace(row))).toBe(true);
            expect(isExteriorSpace(exteriorRightSpace(row))).toBe(true);
        }
        for (const corner of Object.values(EXTERIOR_CORNERS)) expect(isExteriorSpace(corner)).toBe(true);
    });

    it("lays every space out in the display grid exactly once, interior spaces inset by one cell", () => {
        const seen = new Set<number>();
        for (let displayRow = 0; displayRow < DISPLAY_ROWS; displayRow++) {
            for (let displayCol = 0; displayCol < DISPLAY_COLS; displayCol++) {
                const space = spaceAtDisplayCell(displayRow, displayCol);
                expect(seen.has(space)).toBe(false);
                seen.add(space);
                const inset = displayRow > 0 && displayRow < DISPLAY_ROWS - 1 && displayCol > 0 && displayCol < DISPLAY_COLS - 1;
                expect(isInteriorSpace(space)).toBe(inset);
            }
        }
        expect(seen.size).toBe(SPACE_COUNT);
        expect(spaceAtDisplayCell(1, 1)).toBe(spaceIndex(0, 0)); // the interior's own (0,0), inset by the perimeter
    });

    it("has exactly 82 interior wall/door segments, 28 openings onto the perimeter and 32 segments round it (§17.4)", () => {
        const interior = EDGE_DEFS.filter(e => isInteriorSpace(e.a) && isInteriorSpace(e.b));
        const openings = EDGE_DEFS.filter(e => isInteriorSpace(e.a) !== isInteriorSpace(e.b));
        const perimeter = EDGE_DEFS.filter(e => isExteriorSpace(e.a) && isExteriorSpace(e.b));
        expect(interior).toHaveLength(82);
        expect(openings).toHaveLength(2 * COLS + 2 * ROWS);
        expect(perimeter).toHaveLength(32);
        expect(EDGE_COUNT).toBe(142);
        expect(openings.every(e => e.kind === 'open')).toBe(true);
        expect(perimeter.every(e => e.kind === 'open')).toBe(true);
    });

    it("keeps the edge ids a saved game already refers to — the interior segments first, then the top and bottom openings", () => {
        for (let id = 0; id < 82; id++) {
            expect(isInteriorSpace(EDGE_DEFS[id].a) && isInteriorSpace(EDGE_DEFS[id].b)).toBe(true);
        }
        for (let col = 0; col < COLS; col++) {
            expect(edgeBetween(exteriorTopSpace(col), spaceIndex(0, col))).toBe(82 + col);
            expect(edgeBetween(exteriorBottomSpace(col), spaceIndex(ROWS - 1, col))).toBe(82 + COLS + col);
        }
    });

    it("gives every interior space 4 neighbours, every perimeter side space 3 and every corner 2", () => {
        for (let space = 0; space < INTERIOR_SPACE_COUNT; space++) {
            expect(neighboursOf(space)).toHaveLength(4);
        }
        const corners: number[] = Object.values(EXTERIOR_CORNERS);
        for (let space = INTERIOR_SPACE_COUNT; space < SPACE_COUNT; space++) {
            expect(neighboursOf(space)).toHaveLength(corners.includes(space) ? 2 : 3);
        }
    });

    it("has exactly 8 door markers (§3), and every room is reachable through them", () => {
        const doors = EDGE_DEFS.filter(e => e.kind === 'door');
        expect(doors).toHaveLength(8);

        const visited = new Set<number>([START_SPACE]);
        const queue = [START_SPACE];
        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const neighbour of neighboursOf(current)) {
                if (EDGE_DEFS[edgeBetween(current, neighbour)!].kind === 'wall') continue;
                if (visited.has(neighbour)) continue;
                visited.add(neighbour);
                queue.push(neighbour);
            }
        }
        expect(visited.size).toBe(SPACE_COUNT); // no room is walled off with no way in
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

describe("vehicle parking (§6.2 step 6, §12, §17.6 step 9)", () => {
    it("starts the Engine and Ambulance on separate spots, distinct from where firefighters enter", () => {
        expect(isExteriorSpace(ENGINE_START)).toBe(true);
        expect(isExteriorSpace(AMBULANCE_START)).toBe(true);
        expect(ENGINE_START).not.toBe(AMBULANCE_START);
        expect(ENGINE_START).not.toBe(START_SPACE);
        expect(AMBULANCE_START).not.toBe(START_SPACE);
    });

    it("perimeterNeighbours moves one step round the perimeter, never into the building", () => {
        expect(perimeterNeighbours(exteriorTopSpace(3))).toEqual(
            expect.arrayContaining([exteriorTopSpace(2), exteriorTopSpace(4)]));
        expect(perimeterNeighbours(exteriorTopSpace(3))).toHaveLength(2);
        expect(perimeterNeighbours(exteriorTopSpace(0))).toEqual(
            expect.arrayContaining([EXTERIOR_CORNERS.topLeft, exteriorTopSpace(1)]));
        expect(perimeterNeighbours(EXTERIOR_CORNERS.topLeft)).toEqual(
            expect.arrayContaining([exteriorTopSpace(0), exteriorLeftSpace(0)]));
        expect(perimeterNeighbours(exteriorTopSpace(3))).not.toContain(spaceIndex(0, 3)); // never into the building
        expect(perimeterNeighbours(spaceIndex(0, 3))).toEqual([]); // an interior space parks nothing
    });
});

describe("quadrants (§12.3, §17.6 step 9)", () => {
    it("splits the interior grid into 4 equal, disjoint 3x4 quadrants", () => {
        const seen = new Set<number>();
        for (let q = 0; q < QUADRANT_COUNT; q++) {
            const spaces = spacesInQuadrant(q as 0 | 1 | 2 | 3);
            expect(spaces).toHaveLength(INTERIOR_SPACE_COUNT / QUADRANT_COUNT);
            for (const s of spaces) {
                expect(seen.has(s)).toBe(false);
                seen.add(s);
                expect(quadrantOf(s)).toBe(q);
            }
        }
        expect(seen.size).toBe(INTERIOR_SPACE_COUNT);
    });

    it("puts the four corners in four different quadrants", () => {
        const corners = [spaceIndex(0, 0), spaceIndex(0, COLS - 1), spaceIndex(ROWS - 1, 0), spaceIndex(ROWS - 1, COLS - 1)];
        expect(new Set(corners.map(quadrantOf)).size).toBe(4);
    });
});

describe("Family setup data (§6.1)", () => {
    // The rulebook prints these 1-indexed as (row, column); `printed` reads
    // them the same way spaceForRoll reads a d6/d8, so the expectations below
    // can be diffed against §6.1 line by line rather than converted by hand.
    const printed = (row: number, col: number) => spaceIndex(row - 1, col - 1);

    it("has ten starting fire spaces, all interior and unique", () => {
        expect(FAMILY_STARTING_FIRE).toHaveLength(10);
        expect(new Set(FAMILY_STARTING_FIRE).size).toBe(10);
        for (const space of FAMILY_STARTING_FIRE) expect(isInteriorSpace(space)).toBe(true);
    });

    it("places the starting fire on the printed coordinates (§6.1 step 2)", () => {
        expect(FAMILY_STARTING_FIRE).toEqual([
            printed(2, 2), printed(2, 3),
            printed(3, 2), printed(3, 3), printed(3, 4), printed(3, 5),
            printed(4, 4),
            printed(5, 6), printed(5, 7),
            printed(6, 6),
        ]);
    });

    it("has three starting POI spaces, all interior, unique, and clear of the starting fire", () => {
        expect(FAMILY_STARTING_POI).toHaveLength(3);
        expect(new Set(FAMILY_STARTING_POI).size).toBe(3);
        for (const space of FAMILY_STARTING_POI) {
            expect(isInteriorSpace(space)).toBe(true);
            expect(FAMILY_STARTING_FIRE).not.toContain(space);
        }
    });

    it("places the starting POIs on the printed coordinates (§6.1 step 4)", () => {
        expect(FAMILY_STARTING_POI).toEqual([printed(2, 4), printed(5, 1), printed(5, 8)]);
    });

    it("starts every firefighter outside the building, where a knocked-down one is put back (§6.1 step 5, §10.3)", () => {
        expect(isExteriorSpace(START_SPACE)).toBe(true);
    });
});
