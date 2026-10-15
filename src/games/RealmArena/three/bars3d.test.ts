import { describe, expect, it } from "vitest";
import { maxHpOf, newFighter } from "@/games/RealmArena/rules";
import { barLevels, pulseAt } from "./bars3d";

const knight = newFighter(0, "alice", "knight", 0);
const max = maxHpOf(knight);
const at = (hp: number) => ({ ...knight, hp });

describe("barLevels", () => {
    it("fills a full bar, with no chip and nothing to flash", () => {
        expect(barLevels(knight, knight, undefined, undefined)).toEqual({ fill: 1, chip: 1, preview: null });
    });

    it("lets the chip reach past the fill to where the HP a blow took off has drained down to", () => {
        const drawn = at(max - 4);
        const levels = barLevels(drawn, drawn, max - 1, undefined);
        expect(levels.fill).toBeCloseTo((max - 4) / max);
        expect(levels.chip).toBeCloseTo((max - 1) / max);
    });

    it("has no chip once it has drained down to the fill, or when it is below it", () => {
        const drawn = at(max - 4);
        expect(barLevels(drawn, drawn, max - 4, undefined).chip).toBeCloseTo(barLevels(drawn, drawn, undefined, undefined).fill);
        expect(barLevels(drawn, drawn, 0, undefined).chip).toBeCloseTo((max - 4) / max);
    });

    it("flashes what a blow would take off the end of the bar, as dark", () => {
        const { preview } = barLevels(knight, knight, undefined, -3);
        expect(preview).toEqual({ from: (max - 3) / max, to: 1, gain: false });
    });

    it("never takes a blow below empty", () => {
        expect(barLevels(at(2), at(2), undefined, -10).preview).toEqual({ from: 0, to: 2 / max, gain: false });
    });

    it("flashes what a heal would give beyond the fill, as light, and never past full", () => {
        const hurt = at(max - 5);
        expect(barLevels(hurt, hurt, undefined, 2).preview).toEqual({ from: (max - 5) / max, to: (max - 3) / max, gain: true });
        expect(barLevels(hurt, hurt, undefined, 50).preview).toEqual({ from: (max - 5) / max, to: 1, gain: true });
    });

    it("flashes nothing for a change that leaves the bar as it is", () => {
        expect(barLevels(knight, knight, undefined, 4).preview).toBeNull();
        expect(barLevels(knight, knight, undefined, 0).preview).toBeNull();
        expect(barLevels(at(0), at(0), undefined, -4).preview).toBeNull();
    });

    it("measures the change from the figure as it stands, not as its bar is drawn mid-playback", () => {
        const stands = at(max - 2), drawn = at(max);
        expect(barLevels(drawn, stands, undefined, -1).preview).toEqual({ from: (max - 3) / max, to: (max - 2) / max, gain: false });
    });
});

describe("pulseAt", () => {
    it("starts full, dips to the least half-way through and is full again at the end, as the isometric board's flash does", () => {
        expect(pulseAt(0)).toBeCloseTo(1);
        expect(pulseAt(400)).toBeCloseTo(0.15);
        expect(pulseAt(800)).toBeCloseTo(1);
        expect(pulseAt(2000)).toBeCloseTo(pulseAt(400));
    });

    it("stays between the least and full, and is the same going down as coming up", () => {
        for (let ms = 0; ms < 800; ms += 20) {
            expect(pulseAt(ms)).toBeGreaterThanOrEqual(0.15 - 1e-9);
            expect(pulseAt(ms)).toBeLessThanOrEqual(1);
            expect(pulseAt(ms)).toBeCloseTo(pulseAt(800 - ms));
        }
    });

    it("takes the least it is given", () => {
        expect(pulseAt(400, 0.5, 800)).toBeCloseTo(0.5);
    });
});
