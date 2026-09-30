import { describe, expect, it } from "vitest";
import { canSee, sightLine } from "./lineOfSight";
import { at, fieldOf } from "./testFixtures";

describe("sightLine", () => {
    const field = fieldOf(
        ".....",
        ".....",
        ".....",
    );

    it("crosses every square along a straight row, ends left out", () => {
        expect(sightLine(field, at(field, 0, 1), at(field, 4, 1))).toEqual({
            crossed: [at(field, 1, 1), at(field, 2, 1), at(field, 3, 1)],
            grazed: [],
        });
    });

    it("goes corner to corner on a true diagonal, grazing the squares either side", () => {
        expect(sightLine(field, at(field, 0, 0), at(field, 2, 2))).toEqual({
            crossed: [at(field, 1, 1)],
            grazed: [[at(field, 1, 0), at(field, 0, 1)], [at(field, 2, 1), at(field, 1, 2)]],
        });
    });

    it("crosses each square the line passes the inside of on a shallow slope", () => {
        // The line drops into row 1 halfway across column 2.
        expect(sightLine(field, at(field, 0, 0), at(field, 4, 1)).crossed)
            .toEqual([at(field, 1, 0), at(field, 2, 0), at(field, 2, 1), at(field, 3, 1)]);
    });

    it("is the same squares from either end", () => {
        const there = sightLine(field, at(field, 0, 2), at(field, 4, 0));
        const back = sightLine(field, at(field, 4, 0), at(field, 0, 2));
        expect(back.crossed).toEqual([...there.crossed].reverse());
    });

    it("is empty between neighbours", () => {
        expect(sightLine(field, at(field, 1, 1), at(field, 2, 1))).toEqual({ crossed: [], grazed: [] });
    });
});

describe("canSee", () => {
    it("sees over open ground and low cover, not through walls or trees", () => {
        const field = fieldOf(
            ".,o.",
            ".#..",
            ".T..",
        );
        expect(canSee(field, at(field, 0, 0), at(field, 3, 0))).toBe(true);
        expect(canSee(field, at(field, 0, 1), at(field, 3, 1))).toBe(false);
        expect(canSee(field, at(field, 0, 2), at(field, 3, 2))).toBe(false);
    });

    it("sees past one corner of high cover, but not through a diagonal wall", () => {
        const pillar = fieldOf(
            ".#",
            "..",
        );
        expect(canSee(pillar, at(pillar, 0, 0), at(pillar, 1, 1))).toBe(true);

        const diagonal = fieldOf(
            ".#",
            "#.",
        );
        expect(canSee(diagonal, at(diagonal, 0, 0), at(diagonal, 1, 1))).toBe(false);
    });

    it("always sees itself and its neighbours", () => {
        const field = fieldOf(
            "###",
            "#.#",
            "###",
        );
        expect(canSee(field, at(field, 1, 1), at(field, 1, 1))).toBe(true);
    });
});
