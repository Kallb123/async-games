import { describe, expect, it } from "vitest";
import { FULL_HEIGHT, type Facing } from "@/utils/games/battlefield/terrain";
import { azimuthOf, cameraBasis, figureMatrix, fitZoom, lightOf, lookAtFor, onScreen, QUARTER, regionOnScreen, type Vec3 } from "./iso3d";

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

    it("fits a region into a frame, and looks at what it centres", () => {
        const basis = cameraBasis(azimuthOf(0));
        const region = regionOnScreen(basis, { x: 2, y: 3, width: 4, height: 4 }, 0);
        const zoom = fitZoom(region, { width: 400, height: 300 }, 20);
        expect(region.width * zoom).toBeLessThanOrEqual(360 + 1e-6);
        expect(region.height * zoom).toBeLessThanOrEqual(260 + 1e-6);
        const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
        const look = onScreen(basis, lookAtFor(basis, centre));
        expect(look.x).toBeCloseTo(centre.x, 9);
        expect(look.y).toBeCloseTo(centre.y, 9);
    });
});
