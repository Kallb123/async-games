import { describe, expect, it } from "vitest";
import { coursesOf, hashed } from "./stoneTexture";

describe("the castle's courses of stone", () => {
    const lengths = [0.28, 0.58] as const;
    const stones = coursesOf(12, 0.2, lengths, 2, 1);
    const course = (k: number) => stones.filter(stone => Math.abs(stone.y - k * 0.2) < 1e-9);

    it("lay every course end to end round the face, each stone as long as a stone may be", () => {
        for (let k = 0; k < 12; k++) {
            const run = course(k);
            expect(run.reduce((sum, stone) => sum + stone.width, 0)).toBeCloseTo(2);
            for (const stone of run) {
                expect(stone.width).toBeGreaterThanOrEqual(lengths[0] - 1e-9);
                expect(stone.width).toBeLessThanOrEqual(lengths[1] + 1e-9);
                expect(stone.x).toBeGreaterThanOrEqual(0);
                expect(stone.x).toBeLessThan(2);
                expect(stone.height).toBe(0.2);
            }
        }
        expect(stones.every(stone => stone.y < 12 * 0.2)).toBe(true);
    });

    it("start each course in the middle of a stone of the course above, so no joint runs straight up through both", () => {
        for (let k = 1; k < 12; k++) {
            const start = course(k)[0].x;
            const joints = course(k - 1).map(stone => stone.x);
            const gap = Math.min(...joints.map(joint => Math.min(Math.abs(joint - start), 2 - Math.abs(joint - start))));
            expect(gap).toBeGreaterThan(lengths[0] / 2 - 1e-9);
        }
    });

    it("are the same every time they're laid", () => {
        expect(coursesOf(12, 0.2, lengths, 2, 1)).toEqual(stones);
        expect(coursesOf(12, 0.2, lengths, 2, 2)).not.toEqual(stones);
    });

    it("pick a stone's shade from a hash that spreads neighbouring numbers over the whole range", () => {
        const picks = Array.from({ length: 1000 }, (_, i) => hashed(i));
        expect(Math.min(...picks)).toBeLessThan(0.01);
        expect(Math.max(...picks)).toBeGreaterThan(0.99);
        expect(picks.filter(pick => pick < 0.5).length).toBeGreaterThan(450);
        expect(picks.filter(pick => pick < 0.5).length).toBeLessThan(550);
    });
});
