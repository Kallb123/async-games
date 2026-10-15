import { describe, expect, it } from "vitest";
import { squaresOfArea } from "@/utils/games/battlefield/terrain";
import { at, fieldOf, hillOf } from "@/utils/games/battlefield/testFixtures";
import { CENTRE_LABEL, figureRectAt } from "@/games/RealmArena/ui";
import type { Rect } from "@/utils/ui/mapLabels";
import { azimuthOf, boardFrame, cameraBasis, onScreen, QUARTER, squareCentre, type Vec3 } from "./iso3d";
import { BOARD_UNIT, toBoardUnits } from "./billboards";
import { areaMiddle, areaRise, centreLabel, pathPieces, pathPoints, shieldsAt } from "./previewGeometry";

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

describe("centreLabel", () => {
    const field = fieldOf(...Array.from({ length: 12 }, () => "............"));
    const area: Rect = { x: 4, y: 4, width: 4, height: 4 };
    const frameAt = (turn: number) => boardFrame(cameraBasis(azimuthOf(turn)), field, 0);
    /** How wide the name's line of text is, in board units. */
    const WIDE = 6;
    const label = (turn: number, figures: number[] = [], frame = frameAt(turn)) => centreLabel(field, cameraBasis(azimuthOf(turn)), area, figures, frame, "Centre", WIDE);
    /** Whether a line of text `WIDE` wide, centred at the label's `x`, lies in the box the label reserved: where it starts or ends, half its width is on one side of the anchor. */
    const holdsText = (placed: ReturnType<typeof label>) => placed.x - WIDE / 2 >= placed.box.x - 1e-6 && placed.x + WIDE / 2 <= placed.box.x + placed.box.width + 1e-6;
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    /** The rectangle a figure on `square` covers, from the middle of the area, as the camera sees it. */
    const figureAt = (turn: number, square: number): Rect => {
        const basis = cameraBasis(azimuthOf(turn));
        const middle = onScreen(basis, areaMiddle(area)), there = onScreen(basis, squareCentre(field, square));
        return figureRectAt(toBoardUnits({ x: there.x - middle.x, y: there.y - middle.y }));
    };
    /** The square of the area whose top is highest up the frame at this turn: where a figure stands in the way of a name over the area. */
    const highest = (turn: number): number => {
        const basis = cameraBasis(azimuthOf(turn));
        const squares = squaresOfArea(field.width, { col: area.x, row: area.y, width: area.width, height: area.height });
        return squares.reduce((best, square) => onScreen(basis, squareCentre(field, square)).y > onScreen(basis, squareCentre(field, best)).y ? square : best);
    };

    it("hangs the name over the top of the area when nothing is in the way, as the isometric board does", () => {
        for (const turn of [0, 1, 2, 3]) {
            const placed = label(turn);
            expect(placed.dir).toBe("n");
            expect(placed.x).toBeCloseTo(0, 6);
            // The box stands the gap clear of the area's top edge.
            expect(placed.box.y + placed.box.height).toBeCloseTo(-(areaRise(cameraBasis(azimuthOf(turn)), area) + CENTRE_LABEL.gap), 6);
        }
    });

    it("ignores a figure that stands nowhere near it", () => {
        expect(label(0, [at(field, 0, 11), at(field, 11, 0)]).dir).toBe("n");
    });

    it("moves to another side of the area when a figure stands where it would go, at every turn of the view", () => {
        for (const turn of [0, 1, 2, 3]) {
            const square = highest(turn);
            const placed = label(turn, [square]);
            expect(placed.dir).not.toBe("n");
            expect(overlaps(placed.box, figureAt(turn, square))).toBe(false);
            // Whichever side it goes to, `x` is still the middle of its text.
            expect(holdsText(placed)).toBe(true);
        }
    });

    it("keeps within the frame", () => {
        const basis = cameraBasis(azimuthOf(0));
        const frame = frameAt(0);
        // A frame that ends just over the area's top: there is no room for the name there.
        const top = onScreen(basis, areaMiddle(area)).y + areaRise(basis, area) * BOARD_UNIT;
        const tight = { ...frame, origin: { x: frame.origin.x, y: top + 2 * BOARD_UNIT } };
        const placed = label(0, [], tight);
        expect(placed.dir).not.toBe("n");
        expect(placed.box.y).toBeGreaterThanOrEqual(toBoardUnits({ x: 0, y: tight.origin.y - onScreen(basis, areaMiddle(area)).y }).y - 1e-6);
    });
});
