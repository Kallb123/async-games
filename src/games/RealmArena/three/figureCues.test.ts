import { describe, expect, it } from "vitest";
import { shoveAt, type Shove } from "@/games/RealmArena/ui";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { BOARD_UNIT } from "./billboards";
import { fallingAt, groundMove, mayBeHidden, shoveOf } from "./figureCues";
import { azimuthOf, cameraBasis, onScreen, squareCentre, type Vec3 } from "./iso3d";

/** A flat field with a long wall (`#`, a full height) across one row. */
function field(rows: string[]) {
    return buildBattlefield({ name: "Test", rows, deployments: [], objectives: {} });
}

describe("a downed character fading", () => {
    const fall = { start: 1000, length: 400 };

    it("stands as it was until the blow lands, with the fallen figure unseen", () => {
        expect(fallingAt(fall, undefined, 999, false)).toEqual({ standing: 1, lying: null });
        expect(fallingAt(fall, undefined, 1000, false)).toEqual({ standing: 1, lying: 0 });
    });

    it("eases the standing figure out as the fallen one eases in, never leaving a gap to see through", () => {
        for (let ms = 1000; ms <= 1400; ms += 20) {
            const { standing, lying } = fallingAt(fall, undefined, ms, false);
            expect(standing + lying!, `${ms}ms`).toBeGreaterThanOrEqual(1 - 1e-9);
        }
        expect(fallingAt(fall, undefined, 1400, false)).toEqual({ standing: 0, lying: 1 });
    });

    it("keeps the fallen figure unseen until the walk it was downed in reaches its square", () => {
        expect(fallingAt(fall, 1200, 1100, false).lying).toBeNull();
        expect(fallingAt(fall, 1200, 1200, false).lying).toBe(0);
    });

    it("shows the fallen figure at once with reduced motion", () => {
        expect(fallingAt(fall, undefined, 999, true).lying).toBeNull();
        expect(fallingAt(fall, undefined, 1000, true).lying).toBe(1);
    });
});

describe("a figure knocked along the ground", () => {
    const flat = field(["........", "........", "........", "........"]);
    // A blow from the square at column 1, row 1 to the one at column 2, row 1: half way through, the knock is at its furthest.
    const shove: Shove = { start: 0, length: 100, from: 1 * 8 + 1, to: 1 * 8 + 2, reach: 1.5 };

    it("moves the figure over the ground, never into it", () => {
        for (const rotation of [0, 1, 2, 3]) {
            const [, y] = shoveOf([shove], 50, flat, cameraBasis(azimuthOf(rotation)));
            expect(y).toBe(0);
        }
    });

    it("lands as far across the frame as the isometric board's knock, whichever way the view is turned", () => {
        for (const rotation of [0, 1, 2, 3]) {
            const basis = cameraBasis(azimuthOf(rotation));
            const move = shoveOf([shove], 50, flat, basis);
            const seen = onScreen(basis, move);
            const wanted = shoveAt([shove], 50, square => {
                const { x, y } = onScreen(basis, squareCentre(flat, square));
                return { x: x / BOARD_UNIT, y: -y / BOARD_UNIT };
            });
            expect(seen.x / BOARD_UNIT).toBeCloseTo(wanted.x, 6);
            expect(-seen.y / BOARD_UNIT).toBeCloseTo(wanted.y, 6);
            expect(Math.hypot(seen.x, seen.y) / BOARD_UNIT).toBeCloseTo(shove.reach, 6);
        }
    });

    it("goes away from where the blow came from", () => {
        // Column 1 to column 2 is +x in the world.
        const [x] = shoveOf([shove], 50, flat, cameraBasis(azimuthOf(0)));
        expect(x).toBeGreaterThan(0);
    });

    it("stays still outside the blow, and with none", () => {
        const basis = cameraBasis(azimuthOf(0));
        expect(shoveOf([shove], 150, flat, basis).map(n => n + 0)).toEqual([0, 0, 0]);
        expect(shoveOf([], 50, flat, basis)).toEqual([0, 0, 0]);
    });

    it("turns an offset on screen into the ground move that makes it", () => {
        const basis = cameraBasis(azimuthOf(1));
        const seen = onScreen(basis, groundMove(basis, { x: 3, y: -2 }));
        expect(seen.x).toBeCloseTo(3 * BOARD_UNIT, 9);
        expect(seen.y).toBeCloseTo(2 * BOARD_UNIT, 9);
    });
});

describe("whether something in front could hide a figure", () => {
    // A wall across row 3 of a map 9 squares wide: the camera unturned stands off the front corner, towards +x and +z.
    const walled = field([
        ".........",
        ".........",
        ".........",
        "#########",
        ".........",
        ".........",
    ]);
    const basis = cameraBasis(azimuthOf(0));
    const top = Math.max(...walled.tiles.map(tile => tile.elevation));
    const feetOn = (col: number, row: number): Vec3 => squareCentre(walled, row * walled.width + col);

    it("finds a figure standing just behind a wall, as seen from the front", () => {
        expect(mayBeHidden(walled, basis, feetOn(3, 2), top)).toBe(true);
    });

    it("finds a figure well in front of a wall, or on open ground, clear", () => {
        expect(mayBeHidden(walled, basis, feetOn(3, 5), top)).toBe(false);
        expect(mayBeHidden(field(["....", "....", "...."]), basis, [1.5, 0, 1.5], 0)).toBe(false);
    });

    it("finds a figure far behind a wall clear: a wall hides only so far behind it", () => {
        const long = field([...Array.from({ length: 10 }, () => "........."), "#########", "........."]);
        expect(mayBeHidden(long, basis, squareCentre(long, 0 * long.width + 4), 4)).toBe(false);
    });

    it("finds the same figure hidden from behind the wall once the view is turned to look the other way", () => {
        const behind = cameraBasis(azimuthOf(2));
        expect(mayBeHidden(walled, behind, feetOn(3, 2), top)).toBe(false);
        expect(mayBeHidden(walled, behind, feetOn(3, 4), top)).toBe(true);
    });
});
