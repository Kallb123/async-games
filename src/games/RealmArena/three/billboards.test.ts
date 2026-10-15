import { describe, expect, it } from "vitest";
import { BOARD_UNIT, fromBoardUnits, toBoardUnits } from "./billboards";

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
