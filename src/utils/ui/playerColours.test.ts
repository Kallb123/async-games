import { describe, expect, it } from "vitest";
import { playerColour, rosterChartSeries } from "./playerColours";

describe("rosterChartSeries", () => {
    it("draws the players in seat order, in their colours, then whatever the chart adds after them", () => {
        const enemy = { key: "enemy", name: "The enemy", color: "var(--ag-purple)" };
        expect(rosterChartSeries(["Alice", "Bob"], ["a", "b"], [enemy])).toEqual([
            { key: "a", name: "Alice", color: playerColour(0) },
            { key: "b", name: "Bob", color: playerColour(1) },
            enemy,
        ]);
        expect(rosterChartSeries(["Alice"], ["a"])).toEqual([{ key: "a", name: "Alice", color: playerColour(0) }]);
    });
});
