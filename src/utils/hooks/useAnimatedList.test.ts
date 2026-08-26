import { describe, expect, it } from "vitest";
import { planList } from "./useAnimatedList";

const placeholders = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ key: `placeholder-${i}`, placeholder: true }));

const rows = (...keys: string[]) => keys.map(key => ({ key, placeholder: false }));

describe("planList", () => {
    it("swaps a placeholder for each row that lands on it, and animates nothing else", () => {
        const plan = planList(placeholders(2), ["a", "b"]);

        expect(plan.order).toEqual(["a", "b"]);
        // Each row is told which placeholder it took over, so it can transition
        // from the height that placeholder was standing at.
        expect([...plan.handovers]).toEqual([["placeholder-0", "a"], ["placeholder-1", "b"]]);
        expect(plan.entering).toEqual([]);
    });

    it("grows in only the rows with no placeholder to take over", () => {
        const plan = planList(placeholders(2), ["a", "b", "c"]);

        expect(plan.order).toEqual(["a", "b", "c"]);
        expect(plan.entering).toEqual(["c"]);
    });

    it("collapses the placeholders left over when fewer rows land", () => {
        const plan = planList(placeholders(2), ["a"]);

        // The spare stays where it was, below the row that took the first slot.
        expect(plan.order).toEqual(["a", "placeholder-1"]);
        expect([...plan.handovers]).toEqual([["placeholder-0", "a"]]);
        expect(plan.entering).toEqual([]);
    });

    it("collapses every placeholder when the response has nothing in it", () => {
        const plan = planList(placeholders(2), []);

        expect(plan.order).toEqual(["placeholder-0", "placeholder-1"]);
        expect(plan.handovers.size).toBe(0);
    });

    it("keeps a departing row in the slot it held", () => {
        const plan = planList(rows("a", "b", "c"), ["a", "c"]);

        expect(plan.order).toEqual(["a", "b", "c"]);
        expect(plan.entering).toEqual([]);
    });

    it("grows in a row that arrives with nothing to replace", () => {
        const plan = planList(rows("a"), ["a", "b"]);

        expect(plan.order).toEqual(["a", "b"]);
        expect(plan.entering).toEqual(["b"]);
    });
});
