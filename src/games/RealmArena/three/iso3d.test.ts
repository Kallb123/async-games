import { describe, expect, it } from "vitest";
import { FULL_HEIGHT, type Facing } from "@/utils/games/battlefield/terrain";
import { MIN_ASPECT } from "@/games/RealmArena/ui";
import { azimuthOf, boardFrame, cameraBasis, cameraFor, figureMatrix, frameRect, fromFrame, groundAt, lightOf, lookAtFor, lookAtGround, onScreen, QUARTER, regionOnScreen, toFrame, turnedPoint, type Vec3 } from "./iso3d";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Where a column-major matrix takes a point. */
const apply = (m: number[], [x, y, z]: Vec3): Vec3 => [0, 1, 2].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]) as Vec3;

describe("the 3D board's geometry", () => {
    it("stands a full height half as tall on screen as a square is wide, as the isometric board does", () => {
        const basis = cameraBasis(azimuthOf(0));
        const across = onScreen(basis, [1, 0, 0]).x - onScreen(basis, [0, 0, 1]).x;
        const up = onScreen(basis, [0, FULL_HEIGHT * QUARTER, 0]).y - onScreen(basis, [0, 0, 0]).y;
        expect(up).toBeCloseTo(Math.abs(across) / 2, 6);
    });

    it("looks with the map's back corner at the top, its columns running down to the right and its rows down to the left", () => {
        const basis = cameraBasis(azimuthOf(0));
        const column = onScreen(basis, [1, 0, 0]), row = onScreen(basis, [0, 0, 1]);
        expect(column.x).toBeGreaterThan(0);
        expect(column.y).toBeLessThan(0);
        expect(row.x).toBeLessThan(0);
        expect(row.y).toBeLessThan(0);
    });

    it("keeps its axes square to each other at every turn", () => {
        for (const rotation of [0, 1, 2, 3]) {
            const { back, right, up } = cameraBasis(azimuthOf(rotation));
            expect(dot(back, right)).toBeCloseTo(0, 9);
            expect(dot(back, up)).toBeCloseTo(0, 9);
            expect(dot(right, up)).toBeCloseTo(0, 9);
            expect(up[1]).toBeGreaterThan(0);
        }
    });

    it("finds the ground a point of the frame shows, whichever way the camera looks", () => {
        for (const rotation of [0, 1, 2, 3]) {
            const basis = cameraBasis(azimuthOf(rotation));
            const ground: Vec3 = [17.5, 0, 6.25];
            const found = groundAt(basis, onScreen(basis, ground));
            found.forEach((n, i) => expect(n).toBeCloseTo(ground[i], 9));
        }
    });

    it("keeps the ground at the middle of the frame there through a turn, a frame at a time", () => {
        const pivot: Vec3 = [23.9, 0, 16.3];
        for (const [from, to] of [[0, 1], [1, 2], [3, 0], [0, 3]]) {
            let basis = cameraBasis(azimuthOf(from));
            let target = lookAtGround(basis, pivot);
            for (let step = 1; step <= 12; step++) {
                // As `Board3D` turns: about whatever is at the middle of the frame, at each angle on the way.
                const kept = groundAt(basis, onScreen(basis, target));
                basis = cameraBasis(azimuthOf(from) + (azimuthOf(to) - azimuthOf(from)) * step / 12);
                target = lookAtGround(basis, kept);
                groundAt(basis, onScreen(basis, target)).forEach((n, i) => expect(n).toBeCloseTo(pivot[i], 9));
            }
        }
    });

    it("loses the middle of the frame if the looked-at point is left as it was when the camera turns", () => {
        const pivot: Vec3 = [23.9, 0, 16.3];
        const target = lookAtGround(cameraBasis(azimuthOf(0)), pivot);
        const turned = cameraBasis(azimuthOf(1));
        expect(Math.hypot(...groundAt(turned, onScreen(turned, target)).map((n, i) => n - pivot[i]))).toBeGreaterThan(1);
    });

    it("draws a figure facing d on a board turned r quarters the way an unturned board draws one facing d + 2r, as the sprites' cells are picked", () => {
        const heading = (facing: number, rotation: number) => {
            const basis = cameraBasis(azimuthOf(rotation));
            const forward = apply(figureMatrix([0, 0, 0], facing, false), [1, 0, 0]);
            const { x, y } = onScreen(basis, forward);
            return Math.atan2(y, x);
        };
        for (let facing = 0; facing < 8; facing++) {
            for (const rotation of [1, 2, 3]) {
                const turned = heading(facing, rotation), unturned = heading((facing + 2 * rotation) % 8, 0);
                expect(Math.cos(turned - unturned)).toBeCloseTo(1, 6);
            }
        }
    });

    it("turns a figure's own frame — forward, left and up — into the world, its left to its forward's left", () => {
        const at: Vec3 = [3.5, 0.2, 4.5];
        const m = figureMatrix(at, 0 as Facing, false);
        expect(apply(m, [0, 0, 0])).toEqual(at);
        expect(apply(m, [1, 0, 0]).map((n, i) => n - at[i])).toEqual([1, 0, 0].map(n => expect.closeTo(n, 9)));
        // Facing along the columns, its left is towards the row before.
        expect(apply(m, [0, 1, 0])[2] - at[2]).toBeCloseTo(-1, 9);
        expect(apply(m, [0, 0, 1])[1] - at[1]).toBeCloseTo(1, 9);
    });

    it("lays a fallen figure on its back across its square, its head where its back was", () => {
        const m = figureMatrix([0, 0, 0], 0 as Facing, true);
        const head = apply(m, [0, 0, 0.69]);
        expect(head[1]).toBeCloseTo(0.09, 2);
        expect(head[0]).toBeLessThan(0);
    });

    it("lights from up, the left and a little towards the viewer, turning with the view", () => {
        for (const rotation of [0, 1, 2, 3]) {
            const basis = cameraBasis(azimuthOf(rotation));
            const { light } = lightOf(basis);
            expect(dot(light, basis.right)).toBeLessThan(0);
            expect(light[1]).toBeGreaterThan(0.7);
            expect(dot(light, basis.back)).toBeGreaterThan(0);
        }
    });

    it("looks at what a frame centred on a region centres", () => {
        const basis = cameraBasis(azimuthOf(0));
        const region = regionOnScreen(basis, { x: 2, y: 3, width: 4, height: 4 }, 0);
        const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
        const look = onScreen(basis, lookAtFor(basis, centre));
        expect(look.x).toBeCloseTo(centre.x, 9);
        expect(look.y).toBeCloseTo(centre.y, 9);
    });
});

describe("the frame BoardZoom scrolls and zooms the camera's view of the board in", () => {
    // A long map and a square one, the shapes a quarter turn most changes.
    const grids = [{ width: 54, height: 54 }, { width: 78, height: 30 }, { width: 11, height: 40 }];
    const TURNS = [0, 1, 2, 3];
    const frameAt = (grid: { width: number; height: number }, rotation: number, top = 8) => {
        const basis = cameraBasis(azimuthOf(rotation));
        return { basis, frame: boardFrame(basis, grid, top) };
    };

    it("is the same size at every turn, so BoardZoom's viewBox never changes with it", () => {
        for (const grid of grids) {
            const { frame: first } = frameAt(grid, 0);
            for (const rotation of TURNS) {
                const { frame } = frameAt(grid, rotation);
                expect(frame.size.width).toBeCloseTo(first.size.width, 9);
                expect(frame.size.height).toBeCloseTo(first.size.height, 9);
            }
            // The diamond a map makes is as wide as its two sides together, a square's diagonal to the side.
            expect(first.size.width).toBeCloseTo((grid.width + grid.height) / Math.SQRT2, 9);
        }
    });

    it("is at least MIN_ASPECT as tall as it is wide, and no shorter than what stands in it", () => {
        for (const grid of grids) {
            const { frame } = frameAt(grid, 0);
            expect(frame.size.height).toBeGreaterThanOrEqual(frame.size.width * MIN_ASPECT - 1e-9);
        }
        // A tiny map is a strip: the frame takes the height of what stands in it.
        const strip = frameAt({ width: 6, height: 6 }, 0, 12);
        expect(strip.frame.size.height).toBeGreaterThan(strip.frame.size.width * MIN_ASPECT);
    });

    it("holds the ground and the tallest top within it at every turn, with room over the back for a figure and its HP bar", () => {
        for (const grid of grids) {
            for (const rotation of TURNS) {
                const { basis, frame } = frameAt(grid, rotation);
                for (const [col, row] of [[0, 0], [grid.width, 0], [grid.width, grid.height], [0, grid.height]]) {
                    for (const height of [0, 8 * QUARTER]) {
                        const at = toFrame(frame, onScreen(basis, [col, height, row]));
                        expect(at.x).toBeGreaterThanOrEqual(-1e-9);
                        expect(at.x).toBeLessThanOrEqual(frame.size.width + 1e-9);
                        expect(at.y).toBeGreaterThanOrEqual(-1e-9);
                        expect(at.y).toBeLessThanOrEqual(frame.size.height + 1e-9);
                    }
                }
                // Whoever stands on the highest top at the map's far corner, about a square tall on screen, is in the frame too.
                const furthest = [[0, 0], [grid.width, 0], [grid.width, grid.height], [0, grid.height]]
                    .map(([col, row]) => toFrame(frame, onScreen(basis, [col, 8 * QUARTER + 1.1, row])).y);
                expect(Math.min(...furthest)).toBeGreaterThanOrEqual(-1e-9);
            }
        }
    });

    it("holds the ground in the middle across, at every turn", () => {
        for (const grid of grids) {
            for (const rotation of TURNS) {
                const { basis, frame } = frameAt(grid, rotation);
                const middle = toFrame(frame, onScreen(basis, [grid.width / 2, 0, grid.height / 2]));
                expect(middle.x).toBeCloseTo(frame.size.width / 2, 9);
            }
        }
    });

    it("turns a point of the frame to where it is drawn after a turn, whatever the map's shape", () => {
        for (const grid of grids) {
            for (const from of TURNS) {
                const to = (from + 1) % 4;
                const a = frameAt(grid, from), b = frameAt(grid, to);
                const point = { x: a.frame.size.width * 0.37, y: a.frame.size.height * 0.61 };
                const turned = turnedPoint(a, b, point);
                // The same ground is under both.
                const before = groundAt(a.basis, fromFrame(a.frame, point)), after = groundAt(b.basis, fromFrame(b.frame, turned));
                before.forEach((n, i) => expect(after[i]).toBeCloseTo(n, 9));
            }
        }
    });

    it("comes back to the same point after four quarter turns, or a turn and its undoing", () => {
        const grid = { width: 78, height: 30 };
        const point = { x: 13.7, y: 9.2 };
        let at = point;
        for (let rotation = 0; rotation < 4; rotation++) at = turnedPoint(frameAt(grid, rotation), frameAt(grid, (rotation + 1) % 4), at);
        expect(at.x).toBeCloseTo(point.x, 9);
        expect(at.y).toBeCloseTo(point.y, 9);
        const there = turnedPoint(frameAt(grid, 0), frameAt(grid, 1), point);
        const back = turnedPoint(frameAt(grid, 1), frameAt(grid, 0), there);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
    });

    it("projects a region of squares into the frame, the whole map filling its width", () => {
        for (const rotation of TURNS) {
            const grid = { width: 78, height: 30 };
            const { basis, frame } = frameAt(grid, rotation);
            const whole = frameRect(frame, regionOnScreen(basis, { x: 0, y: 0, width: grid.width, height: grid.height }, 0));
            expect(whole.x).toBeCloseTo(0, 9);
            expect(whole.width).toBeCloseTo(frame.size.width, 9);
            expect(whole.y).toBeGreaterThan(0);
            expect(whole.y + whole.height).toBeLessThan(frame.size.height);
        }
    });

    it("shows a view of the whole frame as the whole map in a pane the frame's shape", () => {
        const grid = { width: 78, height: 30 };
        for (const rotation of TURNS) {
            const { basis, frame } = frameAt(grid, rotation);
            const width = 390, height = width * frame.size.height / frame.size.width;
            const { ground, zoom } = cameraFor(basis, frame, { x: 0, y: 0, ...frame.size }, width);
            expect(zoom).toBeCloseTo(width / frame.size.width, 9);
            const target = onScreen(basis, lookAtGround(basis, ground));
            for (const [col, row] of [[0, 0], [grid.width, 0], [grid.width, grid.height], [0, grid.height]]) {
                const p = onScreen(basis, [col, 0, row]);
                const px = (p.x - target.x) * zoom + width / 2, py = (target.y - p.y) * zoom + height / 2;
                expect(px).toBeGreaterThanOrEqual(-1e-6);
                expect(px).toBeLessThanOrEqual(width + 1e-6);
                expect(py).toBeGreaterThanOrEqual(0);
                expect(py).toBeLessThanOrEqual(height);
            }
        }
    });

    it("keeps the ground a turn started over when BoardZoom's pivot has put the view's middle where the ground is, at the same zoom", () => {
        const grid = { width: 78, height: 30 };
        const view = { x: 40, y: 14, width: 25, height: 17 };
        const a = frameAt(grid, 0), b = frameAt(grid, 3);
        const centre = turnedPoint(a, b, { x: view.x + view.width / 2, y: view.y + view.height / 2 });
        const after = { ...view, x: centre.x - view.width / 2, y: centre.y - view.height / 2 };
        const was = cameraFor(a.basis, a.frame, view, 390), now = cameraFor(b.basis, b.frame, after, 390);
        was.ground.forEach((n, i) => expect(now.ground[i]).toBeCloseTo(n, 9));
        expect(now.zoom).toBe(was.zoom);
    });
});
