import { describe, expect, it } from "vitest";
import { OVERLAYS, overlayForCode, overlaysCrossing } from "./overlays";

describe("the overlay registry", () => {
    it("gives every overlay a unique code, distinct from any area code", () => {
        const codes = OVERLAYS.map(overlay => overlay.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it("carries only derived, load-bearing entries at this point", () => {
        expect(OVERLAYS.every(overlay => overlay.source === "derived")).toBe(true);
        expect(OVERLAYS.map(overlay => overlay.name).sort()).toEqual(["Bridge", "Ford"]);
    });

    it("states every overlay's movement effect explicitly", () => {
        for (const overlay of OVERLAYS) {
            if (overlay.movement.kind === "passable") {
                expect(overlay.movement.multiplier).toBeGreaterThan(0);
                expect(overlay.movement.appliesTo.length).toBeGreaterThan(0);
            }
        }
    });
});

describe("overlaysCrossing", () => {
    it("finds the bridge for a river tile and the ford for a lake tile", () => {
        expect(overlaysCrossing("r").map(overlay => overlay.name)).toEqual(["Bridge"]);
        expect(overlaysCrossing("l").map(overlay => overlay.name)).toEqual(["Ford"]);
    });

    it("finds nothing that can cross open ocean", () => {
        expect(overlaysCrossing("o")).toEqual([]);
    });
});

describe("overlayForCode", () => {
    it("resolves a stored overlay code back to its definition", () => {
        expect(overlayForCode("B")?.name).toBe("Bridge");
        expect(overlayForCode("?")).toBeUndefined();
    });
});
