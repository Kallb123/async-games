import { describe, expect, it } from "vitest";
import { squaresOfArea } from "@/utils/games/battlefield/terrain";
import { at, fieldOf, hillOf } from "@/utils/games/battlefield/testFixtures";
import { CENTRE_LABEL, figureRectAt } from "@/games/RealmArena/ui";
import type { Rect } from "@/utils/ui/mapLabels";
import { azimuthOf, boardFrame, cameraBasis, onScreen, QUARTER, squareCentre, type Vec3 } from "./iso3d";
import { BOARD_UNIT, toBoardUnits } from "./billboards";
import { areaMiddle, areaRise, centreLabel, pathPoints, pathStroke, shieldsAt } from "./previewGeometry";

const basis = cameraBasis(azimuthOf(0));

describe("pathStroke", () => {
    it("is a run for each step between points, hung from its middle", () => {
        const points: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5]];
        const pieces = pathStroke(points, basis).pieces;
        expect(pieces).toHaveLength(2);
        expect(pieces[0].at).toEqual([1, 0, 0.5]);
        expect(pieces[1].at).toEqual([1.5, 0, 1]);
    });

    it("measures a run across the frame, in board units: a square's side is half a diagonal", () => {
        // A square along a column runs 10 board units across and 5 down the frame (the diamond is 20 wide, 10 tall).
        const [piece] = pathStroke([[0.5, 0, 0.5], [1.5, 0, 0.5]], basis).pieces;
        expect(piece.length).toBeCloseTo(Math.hypot(10, 5), 6);
        expect(piece.rotate).toBeCloseTo(Math.atan2(5, 10) * 180 / Math.PI, 6);
    });

    it("lies a run down a row the other way, down to the left", () => {
        const [piece] = pathStroke([[0.5, 0, 0.5], [0.5, 0, 1.5]], basis).pieces;
        expect(piece.rotate).toBeCloseTo(180 - Math.atan2(5, 10) * 180 / Math.PI, 6);
    });

    it("slopes a run up a step up the frame", () => {
        const field = hillOf(["...", "..."], ["000", "400"]);
        const points = pathPoints(field, [at(field, 0, 1), at(field, 1, 1)]);
        const [piece] = pathStroke(points, basis).pieces;
        const flat = pathStroke([[0.5, 0, 1.5], [1.5, 0, 1.5]], basis).pieces[0];
        expect(points[0][1]).toBeCloseTo(4 * QUARTER);
        // Down a step, towards the viewer's right: the frame's y is up, so the clockwise turn is the steeper the further it falls.
        expect(piece.rotate).not.toBeCloseTo(flat.rotate, 3);
    });

    it("skips a run that goes nowhere", () => {
        expect(pathStroke([[1, 0, 1], [1, 0, 1]], basis).pieces).toEqual([]);
        expect(pathStroke([[1, 0, 1]], basis).pieces).toEqual([]);
    });

    it("keeps its length through a turn of the view", () => {
        const points: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5]];
        for (const rotation of [1, 2, 3]) {
            expect(pathStroke(points, cameraBasis(azimuthOf(rotation))).pieces[0].length).toBeCloseTo(Math.hypot(10, 5), 6);
        }
    });

    it("puts a dot on every point of a solid path, to round its joints and ends", () => {
        const points: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5]];
        expect(pathStroke(points, basis).discs).toEqual(points);
    });

    describe("dashed", () => {
        // A square's side is hypot(10, 5) = 11.18 across the frame; a dash of 2 and a gap of 1.2, as `.ag-ra-path`'s dasharray.
        const side = Math.hypot(10, 5), dash = [2, 1.2] as const;
        const straight: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5]];
        const bent: Vec3[] = [[0.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 1.5]];

        it("cuts a run into dashes with a gap between, the last cut short at the path's end", () => {
            const { pieces } = pathStroke(straight, basis, dash);
            expect(pieces.map(piece => piece.length)).toEqual([2, 2, 2, expect.closeTo(side - 9.6, 6)]);
            // Each starts a period (3.2) on from the last: the middles of the dashes are 3.2 apart along the run.
            const middle = (i: number) => pieces[i].at[0] - 0.5;
            expect(middle(0)).toBeCloseTo(1 / side);
            expect(middle(1) - middle(0)).toBeCloseTo(3.2 / side);
            expect(middle(2) - middle(1)).toBeCloseTo(3.2 / side);
        });

        it("starts on a dash, so the path leaves its first square lit", () => {
            const { pieces } = pathStroke(straight, basis, dash);
            expect(pieces[0].at[0] - 0.5).toBeCloseTo(1 / side);
        });

        it("caps each dash with a dot at either end", () => {
            const { discs } = pathStroke(straight, basis, dash);
            expect(discs).toHaveLength(8);
            expect(discs[0][0]).toBeCloseTo(0.5);
            expect(discs[1][0] - 0.5).toBeCloseTo(2 / side);
            expect(discs[7][0]).toBeCloseTo(1.5);
        });

        it("runs the pattern on round a corner, a dash that turns it lying along both runs with a dot on the corner", () => {
            const { pieces, discs } = pathStroke(bent, basis, dash);
            // The fourth dash (9.6 to 11.6) runs past the corner at 11.18.
            const turning = pieces.filter(piece => Math.abs(piece.length - (side - 9.6)) < 1e-6 || Math.abs(piece.length - (11.6 - side)) < 1e-6);
            expect(turning).toHaveLength(2);
            expect(turning[0].rotate).not.toBeCloseTo(turning[1].rotate, 3);
            expect(discs).toContainEqual([1.5, 0, 0.5]);
            // The rest of the second run carries on from where the pattern left off, not from a fresh dash.
            const second = pieces.filter(piece => piece.at[2] > 0.5 && piece.at[0] === 1.5);
            expect(second[0].length).toBeCloseTo(11.6 - side);
        });

        it("covers no more of the path than its dashes do", () => {
            const covered = (stroke: ReturnType<typeof pathStroke>) => stroke.pieces.reduce((sum, piece) => sum + piece.length, 0);
            expect(covered(pathStroke(bent, basis, dash))).toBeLessThan(covered(pathStroke(bent, basis)));
            expect(covered(pathStroke(bent, basis, dash))).toBeCloseTo(7 * 2, 6);
        });

        it("leaves only a dot for a path that goes nowhere", () => {
            expect(pathStroke([[1, 0, 1], [1, 0, 1]], basis, dash)).toEqual({ pieces: [], discs: [[1, 0, 1], [1, 0, 1]] });
        });
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
