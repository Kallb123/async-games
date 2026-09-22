import { describe, expect, it } from "vitest";
import { AREA_BY_CODE } from "./areas";
import { overlayCodesByTile, OVERLAYS, overlayForCode, overlaysCrossing } from "./overlays";

describe("the overlay registry", () => {
    it("gives every overlay a unique code, distinct from any area code", () => {
        const codes = OVERLAYS.map(overlay => overlay.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const code of codes) expect(AREA_BY_CODE.has(code), `overlay code "${code}" collides with an area code`).toBe(false);
    });

    it("carries the load-bearing crossings and the rest of the vocabulary (PR 12)", () => {
        const bySource = Object.groupBy(OVERLAYS, overlay => overlay.source);
        expect((bySource.derived ?? []).map(overlay => overlay.name).sort()).toEqual(["Bridge", "Ford", "Pier", "Road", "Signpost"]);
        expect((bySource.scattered ?? []).map(overlay => overlay.name).sort()).toEqual(["Ruins", "Shipwreck", "Standing stones", "Watchtower"]);
    });

    it("states every overlay's movement effect explicitly", () => {
        for (const overlay of OVERLAYS) {
            if (overlay.movement.kind === "passable") {
                expect(overlay.movement.multiplier).toBeGreaterThan(0);
                expect(overlay.movement.appliesTo.length).toBeGreaterThan(0);
            }
            if (overlay.movement.kind === "weight") {
                expect(overlay.movement.multiplier).toBeGreaterThan(0);
            }
        }
    });

    it("gives Road a weight no area's own weight could ever undercut — the invariant its cost-walk rule rests on", () => {
        const road = OVERLAYS.find(overlay => overlay.name === "Road")!;
        expect(road.movement).toMatchObject({ kind: "weight" });
        if (road.movement.kind === "weight") {
            for (const area of AREA_BY_CODE.values()) {
                if (area.weight === "impassable") continue;
                expect(area.weight, `${area.name}'s own weight must be ≥ Road's`).toBeGreaterThanOrEqual(road.movement.multiplier);
            }
        }
    });
});

describe("overlayCodesByTile", () => {
    it("indexes the sparse placement list by tile", () => {
        const index = overlayCodesByTile([{ tile: 4, code: "B" }, { tile: 9, code: "R" }]);
        expect(index.get(4)).toBe("B");
        expect(index.get(9)).toBe("R");
        expect(index.get(1)).toBeUndefined();
    });

    it("lets the last placement on a tile win, rather than throwing over a generated-world bug", () => {
        expect(overlayCodesByTile([{ tile: 4, code: "B" }, { tile: 4, code: "R" }]).get(4)).toBe("R");
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
