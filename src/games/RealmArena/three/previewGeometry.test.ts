import { describe, expect, it } from "vitest";
import { at, fieldOf, hillOf } from "@/utils/games/battlefield/testFixtures";
import { azimuthOf, cameraBasis, onScreen, QUARTER, squareCentre, type Vec3 } from "./iso3d";
import { BOARD_UNIT } from "./billboards";
import { areaRise, pathPieces, pathPoints, shieldsAt } from "./previewGeometry";

const basis = cameraBasis(azimuthOf(0));

describe("pathPieces", () => {
    it("is a run for each step between points, hung from its middle", () => {
        const points: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5]];
        const pieces = pathPieces(points, basis);
        expect(pieces).toHaveLength(2);
        expect(pieces[0].at).toEqual([1, 0, 0.5]);
        expect(pieces[1].at).toEqual([1.5, 0, 1]);
    });

    it("measures a run across the frame, in board units: a square's side is half a diagonal", () => {
        // A square along a column runs 10 board units across and 5 down the frame (the diamond is 20 wide, 10 tall).
        const [piece] = pathPieces([[0.5, 0, 0.5], [1.5, 0, 0.5]], basis);
        expect(piece.length).toBeCloseTo(Math.hypot(10, 5), 6);
        expect(piece.rotate).toBeCloseTo(Math.atan2(5, 10) * 180 / Math.PI, 6);
    });

    it("lies a run down a row the other way, down to the left", () => {
        const [piece] = pathPieces([[0.5, 0, 0.5], [0.5, 0, 1.5]], basis);
        expect(piece.rotate).toBeCloseTo(180 - Math.atan2(5, 10) * 180 / Math.PI, 6);
    });

    it("slopes a run up a step up the frame", () => {
        const field = hillOf(["...", "..."], ["000", "400"]);
        const points = pathPoints(field, [at(field, 0, 1), at(field, 1, 1)]);
        const [piece] = pathPieces(points, basis);
        const flat = pathPieces([[0.5, 0, 1.5], [1.5, 0, 1.5]], basis)[0];
        expect(points[0][1]).toBeCloseTo(4 * QUARTER);
        // Down a step, towards the viewer's right: the frame's y is up, so the clockwise turn is the steeper the further it falls.
        expect(piece.rotate).not.toBeCloseTo(flat.rotate, 3);
    });

    it("skips a run that goes nowhere", () => {
        expect(pathPieces([[1, 0, 1], [1, 0, 1]], basis)).toEqual([]);
        expect(pathPieces([[1, 0, 1]], basis)).toEqual([]);
    });

    it("keeps its length through a turn of the view", () => {
        const points: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5]];
        for (const rotation of [1, 2, 3]) {
            expect(pathPieces(points, cameraBasis(azimuthOf(rotation)))[0].length).toBeCloseTo(Math.hypot(10, 5), 6);
        }
    });
});

describe("shieldsAt", () => {
    const field = fieldOf(
        ".......",
        ".......",
        "...#...",
        "..,.,..",
        ".......",
        ".......",
        ".......",
    );

    it("stands one on each side that gives cover, on the middle of the side's edge", () => {
        const shields = shieldsAt(field, at(field, 3, 3));
        expect(shields.map(shield => [shield.side, shield.cover])).toEqual([["north", "full"], ["east", "half"], ["west", "half"]]);
        const north = shields.find(shield => shield.side === "north")!;
        expect(north.at).toEqual([3.5, 0, 3]);
        expect(shields.find(shield => shield.side === "east")!.at).toEqual([4, 0, 3.5]);
    });

    it("gives none for open ground", () => {
        expect(shieldsAt(field, at(field, 5, 5))).toEqual([]);
    });

    it("stands at the square's height", () => {
        const high = hillOf(["...", "...", "..."], ["000", "040", "000"]);
        const walled = hillOf(["...", "#..", "..."], ["000", "440", "000"]);
        expect(shieldsAt(high, at(high, 1, 1))).toEqual([]);
        const [shield] = shieldsAt(walled, at(walled, 1, 1));
        expect(shield.side).toBe("west");
        expect(shield.at[1]).toBeCloseTo(squareCentre(walled, at(walled, 1, 1))[1]);
        expect(shield.at[1]).toBeCloseTo(4 * QUARTER);
    });
});

describe("areaRise", () => {
    it("is the top edge of the area over its middle: half its diamond's height", () => {
        // A 2 by 2 area is a diamond 40 board units wide and 20 tall.
        expect(areaRise(basis, { x: 4, y: 4, width: 2, height: 2 })).toBeCloseTo(10, 6);
        expect(areaRise(basis, { x: 0, y: 0, width: 1, height: 3 })).toBeCloseTo(10, 6);
    });

    it("is the same area's reach at any turn, for a square one", () => {
        const sizes = [0, 1, 2, 3].map(rotation => areaRise(cameraBasis(azimuthOf(rotation)), { x: 2, y: 2, width: 3, height: 3 }));
        sizes.forEach(size => expect(size).toBeCloseTo(sizes[0], 6));
    });

    it("measures in board units, with the camera's own scale", () => {
        const middle = onScreen(basis, [5, 0, 5]);
        const corner = onScreen(basis, [4, 0, 4]);
        expect(areaRise(basis, { x: 4, y: 4, width: 2, height: 2 })).toBeCloseTo((corner.y - middle.y) / BOARD_UNIT, 6);
    });
});
