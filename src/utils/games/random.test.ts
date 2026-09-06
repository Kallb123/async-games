import { describe, expect, it, vi } from "vitest";

import { randomFloat, randomInt } from "./random";

describe("randomInt", () => {
    it("stays inside [0, maxExclusive)", () => {
        for (let i = 0; i < 2000; i++) {
            const value = randomInt(6);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(6);
        }
    });

    it("reaches every value in the range", () => {
        const seen = new Set<number>();
        for (let i = 0; i < 2000; i++) seen.add(randomInt(6));
        expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("only ever returns 0 for a range of one", () => {
        expect(randomInt(1)).toBe(0);
    });

    // The reason this doesn't just take `draw % max`: the top of the uint32
    // range doesn't divide evenly, so the short final bucket has to be
    // redrawn or the low faces come up fractionally more often.
    it("redraws rather than folding the short bucket onto the low values", () => {
        const draws = [0xfffffffe, 7];
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
            (array as Uint32Array)[0] = draws.shift()!;
            return array;
        });

        // 2^32 % 6 === 4, so the last four uint32s are rejected: 0xfffffffe is
        // one of them and the 7 behind it is what answers instead.
        expect(randomInt(6)).toBe(1);
        expect(entropy).toHaveBeenCalledTimes(2);
        entropy.mockRestore();
    });

    it("rejects a bound it cannot draw uniformly", () => {
        expect(() => randomInt(0)).toThrow(RangeError);
        expect(() => randomInt(-1)).toThrow(RangeError);
        expect(() => randomInt(2.5)).toThrow(RangeError);
        expect(() => randomInt(2 ** 32 + 1)).toThrow(RangeError);
    });

    it("draws from the platform CSPRNG, not Math.random", () => {
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues");
        const random = vi.spyOn(Math, "random");

        randomInt(6);

        expect(entropy).toHaveBeenCalled();
        expect(random).not.toHaveBeenCalled();
        entropy.mockRestore();
        random.mockRestore();
    });
});

describe("randomFloat", () => {
    it("stays inside [0, 1)", () => {
        for (let i = 0; i < 2000; i++) {
            const value = randomFloat();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it("bottoms out at 0 and tops out just short of 1", () => {
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
            (array as Uint32Array).fill(0);
            return array;
        });
        expect(randomFloat()).toBe(0);

        entropy.mockImplementation((array) => {
            (array as Uint32Array).fill(0xffffffff);
            return array;
        });
        expect(randomFloat()).toBe(1 - Number.EPSILON / 2);
        entropy.mockRestore();
    });
});
