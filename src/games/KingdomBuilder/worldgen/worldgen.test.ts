import { describe, expect, it } from "vitest";
import { generateWorld } from "./generateWorld";
import { connectWorldGraph, isConnected, routeTerrain } from "./graphConnectivity";
import { findTilePath, isPassableTile, travelGridFor } from "./tilePath";
import { createRandom } from "./random";
import { checkSettlementFairness } from "./settlementSites";
import { generateBaseTerrainField, mainlandOf, tileCentre, type TerrainField } from "./terrainField";
import { WORLD_AREA_SCALE, generateLandmass, isLand } from "./landmass";
import { placeTerrainNodes } from "./terrainNodes";
import { MOUNTAINS_CODE } from "./areas";
import { checkWorldShape } from "./worldShape";
import type { SettlementNode, WorldEdge } from "./landmass";

/** How many mountain tiles fall in each of the map's 3 × 3 ninths, row-major — so index 4 is the middle one. */
function mountainTilesByNinth(field: TerrainField): number[] {
    const ninths = Array.from({ length: 9 }, () => 0);
    for (let tile = 0; tile < field.codes.length; tile++) {
        if (field.codes[tile] !== MOUNTAINS_CODE) continue;
        const col = tile % field.columns, row = Math.floor(tile / field.columns);
        ninths[Math.floor((row * 3) / field.rows) * 3 + Math.floor((col * 3) / field.columns)]++;
    }
    return ninths;
}

function fieldOf(columns: number, rows: number, codes: string): TerrainField {
    return { columns, rows, tileSize: 2, codes };
}

describe("Kingdom Builder world generation", () => {
    it("creates a deterministic island with ocean around its border", () => {
        const first = generateLandmass(createRandom("island"), { resolution: 20 });
        const second = generateLandmass(createRandom("island"), { resolution: 20 });
        expect(first).toEqual(second);
        for (let index = 0; index < first.resolution; index++) {
            expect(isLand(first, { x: index / (first.resolution - 1) * first.width, y: 0 })).toBe(false);
            expect(isLand(first, { x: index / (first.resolution - 1) * first.width, y: first.height })).toBe(false);
        }
    });

    it("places separated terrain nodes only on land, matching the ground beneath them, each on a tile of its own", () => {
        const random = createRandom("terrain");
        const landmass = generateLandmass(random);
        const { field } = generateBaseTerrainField(landmass, random);
        const nodes = placeTerrainNodes(landmass, field, mainlandOf(field), random, { count: 20, minimumDistance: 5 });
        expect(nodes).toHaveLength(20);
        expect(nodes.every(node => isLand(landmass, node))).toBe(true);
        expect(new Set(nodes.map(node => node.terrain))).toEqual(new Set(["forest", "quarry", "ore"]));
        expect(new Set(nodes.map(node => node.tile)).size).toBe(20);
        for (const node of nodes) {
            expect(node).toMatchObject(tileCentre(node.tile % field.columns, Math.floor(node.tile / field.columns)));
            // Standing a node on its tile's centre moves it at most half a tile's diagonal.
            expect(nodes.filter(other => Math.hypot(node.x - other.x, node.y - other.y) < 5 - 2 * Math.SQRT2)).toHaveLength(1);
        }
    });

    it("connects every node with a real, terrain-derived movement cost", () => {
        const world = generateWorld("connected-world");
        expect(isConnected(world.nodes, world.edges)).toBe(true);
        expect(world.edges.length).toBeGreaterThanOrEqual(world.nodes.length - 1);
        for (const edge of world.edges) expect(edge.movementCost).toBeGreaterThan(0);
    });

    it("stands every node on its own passable tile, and runs every edge's path from one node's tile to the other's", () => {
        const world = generateWorld("on-the-tiles");
        const grid = travelGridFor(world.terrainField, world.overlays);
        const tileOf = new Map(world.nodes.map(node => [node.id, node.tile]));
        expect(new Set(tileOf.values()).size).toBe(world.nodes.length);
        for (const node of world.nodes) expect(isPassableTile(grid, node.tile), node.id).toBe(true);
        for (const edge of world.edges) {
            expect(edge.path![0]).toBe(tileOf.get(edge.from));
            expect(edge.path![edge.path!.length - 1]).toBe(tileOf.get(edge.to));
            expect(edge.path!.every(tile => isPassableTile(grid, tile)), edge.id).toBe(true);
            // Roads only ever make a route cheaper than the path it was found as.
            expect(edge.movementCost).toBeLessThanOrEqual(findTilePath(travelGridFor(world.terrainField, world.overlays.filter(o => o.code !== "R")), edge.path![0], edge.path![edge.path!.length - 1])!.cost + 1e-9);
        }
    });

    it("still connects every world once water can veto an edge", () => {
        for (let index = 0; index < 5; index++) {
            const world = generateWorld(`water-aware-${index}`);
            expect(isConnected(world.nodes, world.edges), `seed water-aware-${index}`).toBe(true);
        }
    });

    it("fails fast on a spent wall-clock budget rather than only on the attempt cap", () => {
        // A generator that now rejects more edges per attempt needs a deadline,
        // not just a count, or an unlucky seed can run long enough to outlive
        // its caller's request — see the route's own maxDuration.
        expect(() => generateWorld("budget-exhausted", { budgetMs: 0 })).toThrow(/timed out after 0 attempts/);
    });

    it("reads a route's terrain off the ground its path actually crosses", () => {
        expect(routeTerrain(fieldOf(5, 1, "wwwww"), [0, 1, 2, 3, 4])).toBe("forest");
        expect(routeTerrain(fieldOf(5, 1, "ggrgg"), [0, 1, 2, 3, 4])).toBe("river-crossing");
        // An unknown code (a rolling deploy reading a newer world) reads as grass rather than throwing.
        expect(routeTerrain(fieldOf(5, 1, "gg?gg"), [0, 1, 2, 3, 4])).toBe("plains");
    });

    it("draws each edge as the cheapest tile path between its nodes, costing what that path costs", () => {
        const field = fieldOf(5, 3, "ggggg" + "rrrrr" + "ggggg");
        const nodes: SettlementNode[] = [
            { id: "north", kind: "settlement", siteType: "expansion", x: 1, y: 1, tile: 0 },
            { id: "south", kind: "settlement", siteType: "expansion", x: 1, y: 5, tile: 10 },
        ];
        const bridge = [{ tile: 9, code: "B", orientation: "ns" }];
        const grid = travelGridFor(field, bridge);
        const [edge] = connectWorldGraph(nodes, field, grid, createRandom("river"), 0);
        // Round by the bridge at the far end, not straight over the river.
        expect(edge.path).toContain(9);
        expect(edge.path![0]).toBe(0);
        expect(edge.path![edge.path!.length - 1]).toBe(10);
        expect(edge.movementCost).toBeCloseTo(findTilePath(grid, 0, 10)!.cost, 9);
        expect(edge).toMatchObject({ terrain: "river-crossing", chokepoint: true });
    });

    it("refuses a world where some node has no path to the rest", () => {
        const nodes: SettlementNode[] = [
            { id: "west", kind: "settlement", siteType: "expansion", x: 1, y: 1, tile: 0 },
            { id: "east", kind: "settlement", siteType: "expansion", x: 9, y: 1, tile: 4 },
        ];
        const field = fieldOf(5, 1, "ggogg");
        expect(() => connectWorldGraph(nodes, field, travelGridFor(field), createRandom("no-crossing"), 0)).toThrow("Unable to connect world graph");
    });

    it("reports graph-hop separation, parity, cornering and missing-resource violations from a fixed fixture", () => {
        const starts: SettlementNode[] = ["a", "b", "c", "d"].map((id, index) => ({
            id, kind: "settlement", siteType: "player-start", x: index * 20 + 1, y: 1, tile: index * 10,
        }));
        const pairs = [["a", "b"], ["a", "c"], ["a", "d"]];
        const edges: WorldEdge[] = pairs.map(([from, to], index) => ({
            id: `e${index}`, from, to, terrain: "plains", movementCost: 1, chokepoint: false,
        }));
        // One row of ground: a's land has mountains, woodland and grass in
        // reach; everyone else's is grass alone — rich in wheat, and nothing else.
        const field = fieldOf(40, 1, "mmwgg" + "g".repeat(35));
        const report = checkSettlementFairness(starts, edges, field, { minimumStartHops: 2, parityTolerance: 0.2 });
        expect(report.reasons).toContain("a and b are too close");
        expect(report.reasons).toContain("a is cornered by other starts");
        expect(report.reasons).toContain("a falls outside the resource-parity band");
        expect(report.reasons).toContain("b has no wood or stone or iron in its land");
        expect(report.reasons.some(reason => reason.startsWith("a has no"))).toBe(false);
    });

    it("reproduces a world exactly from its seed", () => {
        expect(generateWorld("repeatable")).toEqual(generateWorld("repeatable"));
        expect(generateWorld("repeatable").nodes).not.toEqual(generateWorld("different").nodes);
    });

    it("generates 20 worlds that all pass the starting-site fairness and map-shape checks, with their mountains spread across the map", () => {
        let spreadWorlds = 0;
        let middleNinthShare = 0;
        for (let index = 0; index < 20; index++) {
            const world = generateWorld(`fairness-${index}`);
            expect(checkWorldShape(world.terrainField), `seed fairness-${index}`).toEqual([]);
            const ninths = mountainTilesByNinth(world.terrainField);
            const mountains = ninths.reduce((sum, count) => sum + count, 0);
            if (ninths.filter(count => count > 0).length >= 3) spreadWorlds++;
            middleNinthShare += ninths[4] / mountains / 20;
            const sites = world.nodes.filter((node): node is SettlementNode => node.kind === "settlement");
            const report = checkSettlementFairness(sites, world.edges, world.terrainField);
            // Every start yields all four resources (§4.6) — checkSettlementFairness says so if one doesn't.
            expect(report.reasons, `seed fairness-${index}, attempt ${world.generationAttempt}`).toEqual([]);
            expect(sites.filter(site => site.siteType === "player-start")).toHaveLength(10);
            expect(sites.filter(site => site.siteType === "expansion")).toHaveLength(10 * WORLD_AREA_SCALE);
            expect(sites.filter(site => site.siteType === "barbarian")).toHaveLength(4 * WORLD_AREA_SCALE);
        }
        // §3.7's answer to "one block in the middle": mountains in at least
        // three of the map's ninths in most worlds, and the middle ninth
        // holding no more than its fair share of them on average.
        expect(spreadWorlds).toBeGreaterThanOrEqual(18);
        expect(middleNinthShare).toBeLessThan(0.25);
    }, 60_000);
});
