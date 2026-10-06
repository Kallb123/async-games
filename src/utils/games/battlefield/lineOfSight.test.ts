import { describe, expect, it } from "vitest";
import { canSee, sightLine } from "./lineOfSight";
import { at, fieldOf, hillOf } from "./testFixtures";

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

    it("walks no further than it's asked to, but every square of the line until then", () => {
        const wide = fieldOf(...Array(7).fill("........."));
        for (const to of [at(wide, 8, 3), at(wide, 7, 6), at(wide, 2, 6), at(wide, 8, 0)]) {
            const whole = sightLine(wide, at(wide, 0, 0), to);
            const near = (square: number) => Math.max(square % wide.width, Math.floor(square / wide.width)) <= 2;
            const part = sightLine(wide, at(wide, 0, 0), to, 2);
            expect(part.crossed.filter(near)).toEqual(whole.crossed.filter(near));
            expect(part.grazed.filter(pair => pair.some(near))).toEqual(whole.grazed.filter(pair => pair.some(near)));
            expect(part.crossed.length).toBeLessThan(whole.crossed.length);
        }
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

    it("looks down the side of full cover directly beside the viewer, but not through it or past later cover", () => {
        const beside = fieldOf(
            ".#...",
            ".....",
        );
        expect(canSee(beside, at(beside, 0, 0), at(beside, 4, 1))).toBe(true);
        expect(canSee(beside, at(beside, 0, 0), at(beside, 4, 0))).toBe(false);
        // The allowance belongs to the viewer beside the cover, not to the
        // distant figure looking back towards them.
        expect(canSee(beside, at(beside, 4, 1), at(beside, 0, 0))).toBe(false);

        const further = fieldOf(
            ".##..",
            ".....",
        );
        expect(canSee(further, at(further, 0, 0), at(further, 4, 1))).toBe(false);
    });

    it("always sees itself and its neighbours", () => {
        const field = fieldOf(
            "###",
            "#.#",
            "###",
        );
        expect(canSee(field, at(field, 1, 1), at(field, 1, 1))).toBe(true);
    });

    it("is blocked by anything a full height above both ends, and not by less", () => {
        const sight = (wall: string, near: string, far: string) => {
            const field = hillOf(["....."], [`${near}0${wall}0${far}`]);
            return canSee(field, at(field, 0, 0), at(field, 4, 0));
        };
        expect(sight("4", "0", "0")).toBe(false);
        expect(sight("3", "0", "0")).toBe(true);
        // From half a height up, a wall a full height off the ground is looked over.
        expect(sight("4", "2", "0")).toBe(true);
        expect(sight("4", "0", "2")).toBe(true);
        expect(sight("6", "2", "0")).toBe(false);
    });

    it("is blocked by trees whatever the heights", () => {
        const field = hillOf(["..T.."], ["80008"]);
        expect(canSee(field, at(field, 0, 0), at(field, 4, 0))).toBe(false);
    });

    it("looks over a wall from a tower top", () => {
        const fort = fieldOf("^.#..");
        expect(canSee(fort, at(fort, 0, 0), at(fort, 4, 0))).toBe(true);
        expect(canSee(fort, at(fort, 1, 0), at(fort, 4, 0))).toBe(false);
    });
});
