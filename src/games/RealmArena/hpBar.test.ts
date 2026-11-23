import { describe, expect, it } from "vitest";
import { hasHpBar } from "./hpBar";

describe("hasHpBar", () => {
    it("draws no bar over a Brood minion, but one over its elites and every other character", () => {
        const context = { rulesVersion: 13 };
        for (const character of ["broodSkitterling", "broodSpitter", "broodBloater"] as const) expect(hasHpBar({ character }, context)).toBe(false);
        for (const character of ["broodRavager", "broodBroodmother", "knight", "skitterling"] as const) expect(hasHpBar({ character }, context)).toBe(true);
    });
});
