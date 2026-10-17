import { describe, expect, it } from "vitest";
import { BOARD_UNIT, fromBoardUnits, shadowUniform, toBoardUnits } from "./billboards";

describe("board units", () => {
    it("takes a point across the frame to the isometric board's units, y down, and back", () => {
        expect(toBoardUnits({ x: BOARD_UNIT * 3, y: BOARD_UNIT * 2 })).toEqual({ x: 3, y: -2 });
        const there = fromBoardUnits({ x: 5, y: -7 });
        expect(there.x).toBeCloseTo(5 * BOARD_UNIT, 12);
        expect(there.y).toBeCloseTo(7 * BOARD_UNIT, 12);
        const back = toBoardUnits(fromBoardUnits({ x: 5, y: -7 }));
        expect(back.x).toBeCloseTo(5, 9);
        expect(back.y).toBeCloseTo(-7, 9);
    });
});

describe("a billboard's shadow", () => {
    it("is handed to the shader in the world's units, with its alpha as it is", () => {
        const [dx, dy, , alpha] = shadowUniform({ dx: 1, dy: 0.3, blur: 0.4, alpha: 0.5 });
        expect(dx).toBeCloseTo(BOARD_UNIT, 12);
        expect(dy).toBeCloseTo(0.3 * BOARD_UNIT, 12);
        expect(alpha).toBe(0.5);
    });

    it("takes its blur on a ring that spreads the nine taps as widely as the blur's own deviation", () => {
        const blur = 0.4;
        const ring = shadowUniform({ dx: 0, dy: 0, blur, alpha: 1 })[2] / BOARD_UNIT;
        // A fifth of the weight in the middle, the rest on eight taps round a ring: along an axis they spread by (1 - 0.2) * ring² / 2.
        expect(0.8 * ring * ring / 2).toBeCloseTo(blur * blur, 9);
    });
});
