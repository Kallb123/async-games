import { describe, expect, it, vi } from "vitest";
import {
    AREAS,
    BEACH_CODE,
    FIELDS_CODE,
    GRASS_CODE,
    HILLS_CODE,
    LAND_WINDOW_CODES,
    MOUNTAINS_CODE,
    OCEAN_CODE,
    PROVISIONAL_WATER_CODE,
    RIVER_CODE,
    WOODLAND_CODE,
    areaForCode,
    areaWeightForCode,
    windowAreaFor,
} from "./areas";
import { KINGDOM_BUILDER_RESOURCE_TYPES } from "../resources";

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

    it("declares what every area yields in a catchment (§4.6), even if nothing, in known resources and sensible amounts", () => {
        const resources = new Set(KINGDOM_BUILDER_RESOURCE_TYPES as readonly string[]);
        for (const area of AREAS) {
            expect(area.yields, `${area.name} declares no yields`).toBeDefined();
            for (const [resource, amount] of Object.entries({ ...area.yields, ...area.irrigated })) {
                expect(resources.has(resource), `${area.name} yields unknown ${resource}`).toBe(true);
                expect(amount, `${area.name}'s ${resource}`).toBeGreaterThan(0);
                expect(amount, `${area.name}'s ${resource}`).toBeLessThanOrEqual(2);
            }
            if (area.irrigated) {
                for (const [resource, amount] of Object.entries(area.yields)) {
                    expect(area.irrigated[resource as keyof typeof area.irrigated] ?? 0, `${area.name} yields less by water`).toBeGreaterThanOrEqual(amount);
                }
            }
            if (area.irrigates) expect(area.yields, `${area.name} irrigates, so yields nothing itself`).toEqual({});
        }
    });

    it("yields every resource from some ground, or no building for it could ever be raised", () => {
        for (const resource of KINGDOM_BUILDER_RESOURCE_TYPES) {
            expect(AREAS.some(area => (area.yields[resource] ?? 0) > 0), resource).toBe(true);
        }
    });

    it("gives every window entry a fallback colour and a real weight", () => {
        for (const area of AREAS) {
            expect(area.fallbackColour).toMatch(/^#[0-9a-f]{6}$/i);
            expect(area.weight === "impassable" || area.weight > 0).toBe(true);
        }
    });
});

describe("the pass codes terrainField.ts reads and writes", () => {
    it("resolve to the matching registry entry's own code — one export each, not a second listing", () => {
        expect(AREAS.find(area => area.code === PROVISIONAL_WATER_CODE)?.name).toBe("Lake");
        expect(AREAS.find(area => area.code === GRASS_CODE)?.name).toBe("Grass");
        expect(AREAS.find(area => area.code === OCEAN_CODE)?.name).toBe("Ocean");
        expect(AREAS.find(area => area.code === RIVER_CODE)?.name).toBe("River");
        expect(AREAS.find(area => area.code === BEACH_CODE)?.name).toBe("Beach");
        expect(AREAS.find(area => area.code === FIELDS_CODE)?.name).toBe("Fields");
    });

    it("lists exactly the window-placed areas as land-window codes", () => {
        const windowCodes = AREAS.filter(area => area.placement.kind === "window").map(area => area.code).sort();
        expect([...LAND_WINDOW_CODES].sort()).toEqual(windowCodes);
    });
});

describe("the codes overlayVocabulary.ts reads for scattered-landmark placement", () => {
    it("resolve to the matching registry entry's own code — one export each, not a second listing", () => {
        expect(AREAS.find(area => area.code === WOODLAND_CODE)?.name).toBe("Woodland");
        expect(AREAS.find(area => area.code === HILLS_CODE)?.name).toBe("Hills");
        expect(AREAS.find(area => area.code === MOUNTAINS_CODE)?.name).toBe("Mountains");
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
