import { describe, expect, it } from "vitest";
import { coverAgainst } from "./cover";
import { at, fieldOf, hillOf } from "./testFixtures";

describe("coverAgainst", () => {
    // A character at (3, 3) with a wall due north of it and rubble due west.
    const field = fieldOf(
        ".......",
        ".......",
        ".......",
        "..,....",
        ".......",
        ".......",
        ".......",
    );
    const walled = fieldOf(
        ".......",
        ".......",
        "...#...",
        "..,....",
        ".......",
        ".......",
        ".......",
    );

    it("is full behind high cover and half behind low cover, on the attacker's side", () => {
        const target = at(walled, 3, 3);
        expect(coverAgainst(walled, target, at(walled, 3, 0))).toBe("full");
        expect(coverAgainst(walled, target, at(walled, 0, 3))).toBe("half");
        expect(coverAgainst(field, at(field, 3, 3), at(field, 0, 3))).toBe("half");
    });

    it("is flanked from the far side of its cover", () => {
        const target = at(walled, 3, 3);
        expect(coverAgainst(walled, target, at(walled, 3, 6))).toBe("none");
        expect(coverAgainst(walled, target, at(walled, 6, 3))).toBe("none");
    });

    it("is flanked by an attacker looking along the wall rather than over it", () => {
        const target = at(walled, 3, 3);
        expect(coverAgainst(walled, target, at(walled, 6, 2))).toBe("none");
    });

    it("takes the better of two covers the attack passes between", () => {
        // From the north-west diagonal the line grazes both the wall and the rubble.
        expect(coverAgainst(walled, at(walled, 3, 3), at(walled, 0, 0))).toBe("full");
    });

    it("counts a long wall's next square against an attacker at an angle", () => {
        const longWall = fieldOf(
            ".......",
            ".......",
            ".######",
            ".......",
            ".......",
        );
        // Mostly east and a little north: the line leaves the target eastwards,
        // then crosses the wall square to its north-east.
        expect(coverAgainst(longWall, at(longWall, 1, 3), at(longWall, 5, 0))).toBe("full");
    });

    it("only counts cover next to the target, not further along the line", () => {
        const farWall = fieldOf(
            "...",
            ".#.",
            "...",
            "...",
        );
        expect(coverAgainst(farWall, at(farWall, 1, 3), at(farWall, 1, 0))).toBe("none");
    });

    it("comes from how far the square beside the target rises above it: none for a quarter, half for a half or three quarters, full for a full height", () => {
        // The attacker on the top row, the target at the bottom, and raised ground between them.
        const against = (rise: number) => {
            const field = hillOf([".", ".", "."], ["0", rise.toString(36), "0"]);
            return coverAgainst(field, at(field, 0, 2), at(field, 0, 0));
        };
        expect([0, 1, 2, 3, 4, 6].map(against)).toEqual(["none", "none", "half", "half", "full", "full"]);
    });

    it("measures the rise from where the target stands, so raised ground beside it level with it covers nothing", () => {
        const field = hillOf([".", ".", "."], ["0", "4", "4"]);
        expect(coverAgainst(field, at(field, 0, 2), at(field, 0, 0))).toBe("none");
    });
});
