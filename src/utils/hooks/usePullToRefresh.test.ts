// The pull's rules on their own — what counts as a pull, and how far it has
// gone — without a touchscreen or a React tree.

import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD_PX, pullDistance } from "./usePullToRefresh";

const START = { x: 100, y: 100 };

describe("pullDistance", () => {
    it("follows the finger down at half its speed", () => {
        expect(pullDistance(START, { x: 100, y: 140 }, 0)).toBe(20);
    });

    it("takes twice the threshold of finger travel to arm a refresh", () => {
        expect(pullDistance(START, { x: 100, y: 100 + PULL_THRESHOLD_PX * 2 }, 0)).toBe(PULL_THRESHOLD_PX);
    });

    it("stops following past its limit", () => {
        expect(pullDistance(START, { x: 100, y: 1000 }, 0)).toBe(96);
    });

    it("is not a pull once the finger goes back above where it started", () => {
        expect(pullDistance(START, { x: 100, y: 100 }, 0)).toBeNull();
        expect(pullDistance(START, { x: 100, y: 80 }, 0)).toBeNull();
    });

    it("is not a pull when the finger goes more sideways than down", () => {
        expect(pullDistance(START, { x: 160, y: 140 }, 0)).toBeNull();
        expect(pullDistance(START, { x: 40, y: 140 }, 0)).toBeNull();
    });

    it("is not a pull once the page has scrolled under the finger", () => {
        expect(pullDistance(START, { x: 100, y: 200 }, 5)).toBeNull();
    });

    it("still counts at the top of an iOS rubber-band bounce", () => {
        expect(pullDistance(START, { x: 100, y: 200 }, -12)).toBe(50);
    });
});
