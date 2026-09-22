import { describe, expect, it } from "vitest";

import type { SettlementNode, WorldEdge, WorldNode } from "./landmass";
import { createRandom } from "./random";
import type { TerrainField } from "./terrainField";
import { applyOverlayVocabulary, deriveRoadOverlays, derivePierOverlays, deriveSignpostOverlays, placeScatteredLandmarks } from "./overlayVocabulary";

function fieldOf(columns: number, rows: number, codes: string): TerrainField {
    return { columns, rows, tileSize: 2, codes };
}

function settlement(id: string, x: number, y: number, siteType: SettlementNode["siteType"] = "player-start"): SettlementNode {
    return { id, kind: "settlement", siteType, x, y };
}

describe("deriveRoadOverlays", () => {
    it("lays a road between two occupied settlements, cutting a marsh edge down to the road's own weight", () => {
        const field = fieldOf(5, 1, "sssss"); // marsh, weight 2.5
        const nodesById = new Map<string, WorldNode>([
            ["west", settlement("west", 1, 1)],
            ["east", settlement("east", 9, 1)],
        ]);
        const edges: WorldEdge[] = [{ id: "e0", from: "west", to: "east", terrain: "plains", movementCost: 8 * 2.5, chokepoint: false }];

        const { edges: updated, overlays } = deriveRoadOverlays(field, nodesById, edges, new Map());

        expect(updated[0].movementCost).toBeCloseTo(8 * 1, 6); // never more than the road's own weight
        expect(overlays.map(o => o.code)).toEqual(["R", "R", "R", "R", "R"]);
        expect(new Set(overlays.map(o => o.tile)).size).toBe(5);
    });

    it("never touches an edge with an expansion site at either end — roads are for occupied settlements only", () => {
        const field = fieldOf(5, 1, "sssss");
        const nodesById = new Map<string, WorldNode>([
            ["west", settlement("west", 1, 1, "player-start")],
            ["east", settlement("east", 9, 1, "expansion")],
        ]);
        const edges: WorldEdge[] = [{ id: "e0", from: "west", to: "east", terrain: "plains", movementCost: 20, chokepoint: false }];

        const { edges: updated, overlays } = deriveRoadOverlays(field, nodesById, edges, new Map());
        expect(updated[0].movementCost).toBe(20);
        expect(overlays).toEqual([]);
    });

    it("leaves a bridge or ford's own tile and cost alone rather than overwriting it with a road", () => {
        const field = fieldOf(5, 1, "ggrgg"); // river in the middle, same fixture shape as the connectivity test
        const nodesById = new Map<string, WorldNode>([
            ["west", settlement("west", 1, 1)],
            ["east", settlement("east", 9, 1)],
        ]);
        const edges: WorldEdge[] = [{ id: "e0", from: "west", to: "east", terrain: "river-crossing", movementCost: 1 + 2 + 2 * 2.5 + 2 + 1, chokepoint: true }];
        const existingOverlayByTile = new Map([[2, "B"]]);

        const { edges: updated, overlays } = deriveRoadOverlays(field, nodesById, edges, existingOverlayByTile);
        expect(updated[0].movementCost).toBeCloseTo(1 + 2 + 2 * 2.5 + 2 + 1, 6); // the bridge tile's cost is untouched
        expect(overlays.some(o => o.tile === 2)).toBe(false); // no second overlay drawn on the bridge's own tile
        expect(overlays.map(o => o.tile).sort()).toEqual([0, 1, 3, 4]);
    });
});

describe("derivePierOverlays", () => {
    it("finds the nearest beach tile for a coastal settlement site, oriented toward it", () => {
        const field = fieldOf(3, 1, "gbo");
        const nodes: WorldNode[] = [settlement("town", 1, 1)]; // sits on tile 0 (grass)
        expect(derivePierOverlays(field, nodes, new Set())).toEqual([{ tile: 1, code: "P", orientation: "e" }]);
    });

    it("gives nothing to a site with no beach within reach", () => {
        const field = fieldOf(3, 1, "ggg");
        const nodes: WorldNode[] = [settlement("town", 1, 1)];
        expect(derivePierOverlays(field, nodes, new Set())).toEqual([]);
    });

    it("never doubles up on a tile another overlay already claims", () => {
        const field = fieldOf(3, 1, "gbo");
        const nodes: WorldNode[] = [settlement("town", 1, 1)];
        expect(derivePierOverlays(field, nodes, new Set([1]))).toEqual([]);
    });
});

describe("deriveSignpostOverlays", () => {
    const field = fieldOf(1, 1, "g");

    it("marks a node where three or more edges meet", () => {
        const nodes: WorldNode[] = [settlement("hub", 0, 0)];
        const edges: WorldEdge[] = ["a", "b", "c"].map((to, index): WorldEdge => ({ id: `e${index}`, from: "hub", to, terrain: "plains", movementCost: 1, chokepoint: false }));
        expect(deriveSignpostOverlays(field, nodes, edges, new Set())).toEqual([{ tile: 0, code: "J" }]);
    });

    it("leaves a node with fewer than three edges alone", () => {
        const nodes: WorldNode[] = [settlement("leaf", 0, 0)];
        const edges: WorldEdge[] = [{ id: "e0", from: "leaf", to: "other", terrain: "plains", movementCost: 1, chokepoint: false }];
        expect(deriveSignpostOverlays(field, nodes, edges, new Set())).toEqual([]);
    });
});

describe("placeScatteredLandmarks", () => {
    it("is deterministic for the same seed", () => {
        const field = fieldOf(24, 24, "g".repeat(24 * 24));
        const a = placeScatteredLandmarks(field, [], createRandom("scatter"), new Set());
        const b = placeScatteredLandmarks(field, [], createRandom("scatter"), new Set());
        expect(a).toEqual(b);
    });

    it("never places two landmarks on the same tile", () => {
        const field = fieldOf(24, 24, "g".repeat(24 * 24));
        const placements = placeScatteredLandmarks(field, [], createRandom("no-overlap"), new Set());
        const tiles = placements.map(p => p.tile);
        expect(new Set(tiles).size).toBe(tiles.length);
    });

    it("only ever places a landmark on ground its own rule allows", () => {
        // Half woodland (ruins-eligible), half deep ocean (shipwreck needs a
        // beach neighbour it never gets here) — hills/mountains absent
        // entirely, so standing stones and watchtowers should never appear.
        const codes = Array.from({ length: 20 * 20 }, (_, index) => (index % 20 < 10 ? "w" : "o")).join("");
        const field = fieldOf(20, 20, codes);
        const placements = placeScatteredLandmarks(field, [], createRandom("mixed-ground"), new Set());
        expect(placements.every(p => p.code !== "T" && p.code !== "V" && p.code !== "K")).toBe(true);
    });
});

describe("applyOverlayVocabulary", () => {
    it("never lets two of its own passes claim the same tile", () => {
        const field = fieldOf(16, 16, "g".repeat(16 * 16));
        const nodes: WorldNode[] = [settlement("a", 1, 1), settlement("b", 29, 1)];
        const edges: WorldEdge[] = [{ id: "e0", from: "a", to: "b", terrain: "plains", movementCost: 28, chokepoint: false }];

        const { overlays } = applyOverlayVocabulary(field, nodes, edges, [], createRandom("no-collision"));
        const tiles = overlays.map(o => o.tile);
        expect(new Set(tiles).size).toBe(tiles.length);
    });

    it("carries the existing (bridge/ford) overlays through untouched", () => {
        const field = fieldOf(5, 1, "gg?gg");
        const nodes: WorldNode[] = [];
        const existing = [{ tile: 2, code: "B" }];
        const { overlays } = applyOverlayVocabulary(field, nodes, [], existing, createRandom("carry-through"));
        expect(overlays).toEqual(expect.arrayContaining(existing));
    });
});
