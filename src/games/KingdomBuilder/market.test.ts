import { describe, expect, it } from "vitest";

import { KINGDOM_BUILDER_MARKET_MAX_LEVEL, amountsFrom, caravanCapacityOf, depositTo, exchangeRateFor, resourceTotal, spendFrom } from "./market";

describe("Kingdom Builder market", () => {
    it("asks less for each resource as the market grows, and nothing without one", () => {
        expect(exchangeRateFor(0)).toBeNull();
        const rates = Array.from({ length: KINGDOM_BUILDER_MARKET_MAX_LEVEL }, (_, index) => exchangeRateFor(index + 1)!);
        expect(rates).toEqual([4, 3, 2]);
        // Always worse than making it: even the top rate costs more than one for one.
        expect(Math.min(...rates)).toBeGreaterThan(1);
    });

    it("reads amounts from a request, refusing anything but whole known resources", () => {
        expect(amountsFrom({ wood: 5, iron: 2 })).toEqual({ wood: 5, stone: 0, iron: 2, wheat: 0 });
        expect(amountsFrom(undefined)).toEqual({ wood: 0, stone: 0, iron: 0, wheat: 0 });
        for (const forged of [null, [], "5", { gold: 1 }, { wood: -1 }, { wood: 1.5 }, { wood: "5" }, { wood: 1e9 }]) {
            expect(amountsFrom(forged)).toBeNull();
        }
    });

    it("measures a load against what the caravans carry", () => {
        expect(resourceTotal({ wood: 30, wheat: 20 })).toBe(50);
        expect(caravanCapacityOf(2)).toBe(100);
    });

    it("spends and deposits only the resources a set holds", () => {
        expect(spendFrom({ wood: 4, stone: 0, iron: 1, wheat: 0 }, "cargo")).toEqual({
            filter: { "cargo.wood": { $gte: 4 }, "cargo.iron": { $gte: 1 } },
            $inc: { "cargo.wood": -4, "cargo.iron": -1 },
        });
        expect(depositTo({ wood: 0, stone: 3, iron: 0, wheat: 2 })).toEqual({ "resources.stone": 3, "resources.wheat": 2 });
    });
});
