import { describe, expect, it, vi } from "vitest";
import { AREAS, areaForCode, areaWeightForCode, windowAreaFor } from "./areas";

describe("the area registry", () => {
    it("gives every area a unique, single-character code", () => {
        const codes = AREAS.map(area => area.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const code of codes) expect(code).toHaveLength(1);
    });

    it("gives every area a unique paint priority", () => {
        const priorities = AREAS.map(area => area.priority);
        expect(new Set(priorities).size).toBe(priorities.length);
    });

    it("reaches every area from the generator: a window, or a named pass terrainField.ts implements", () => {
        const implementedPasses = new Set(["water-split", "river-trace", "beach-band", "fields-radius"]);
        for (const area of AREAS) {
            if (area.placement.kind === "pass") {
                expect(implementedPasses.has(area.placement.name), `${area.name} points at an unimplemented pass`).toBe(true);
            } else {
                expect(area.placement.elevation[0], `${area.name}'s elevation band is inverted`).toBeLessThanOrEqual(area.placement.elevation[1]);
            }
        }
    });

    it("gives every window entry a fallback colour and a real weight", () => {
        for (const area of AREAS) {
            expect(area.fallbackColour).toMatch(/^#[0-9a-f]{6}$/i);
            expect(area.weight === "impassable" || area.weight > 0).toBe(true);
        }
    });
});

describe("areaForCode", () => {
    it("finds a registered area", () => {
        expect(areaForCode("g").name).toBe("Grass");
        expect(areaWeightForCode("m")).toBe(3.5);
    });

    it("falls back to grass weight for an unrecognised code, and never throws", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(() => areaForCode("?")).not.toThrow();
        expect(areaForCode("?").code).toBe("g");
        expect(areaWeightForCode("?")).toBe(1);
        warn.mockRestore();
    });
});

describe("windowAreaFor", () => {
    it("picks mountains at high elevation regardless of moisture", () => {
        expect(windowAreaFor(0.9, 0.1).code).toBe("m");
    });

    it("picks marsh only where low, wet land meets both bands", () => {
        expect(windowAreaFor(0.32, 0.9).code).toBe("s");
        expect(windowAreaFor(0.32, 0.2).code).not.toBe("s");
    });

    it("picks woodland for damp mid elevation, grass otherwise", () => {
        expect(windowAreaFor(0.45, 0.7).code).toBe("w");
        expect(windowAreaFor(0.45, 0.2).code).toBe("g");
    });

    it("picks hills for the upper-middle band independent of moisture", () => {
        expect(windowAreaFor(0.6, 0.9).code).toBe("h");
        expect(windowAreaFor(0.6, 0.1).code).toBe("h");
    });
});
