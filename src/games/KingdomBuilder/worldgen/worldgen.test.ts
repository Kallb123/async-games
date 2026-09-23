import { describe, expect, it } from "vitest";
import { generateWorld } from "./generateWorld";
import { connectWorldGraph, edgeCostFor, isConnected } from "./graphConnectivity";
import { createRandom } from "./random";
import { checkSettlementFairness } from "./settlementSites";
import { generateBaseTerrainField, type TerrainField } from "./terrainField";
import { WORLD_AREA_SCALE, generateLandmass, isLand } from "./landmass";
import { placeTerrainNodes } from "./terrainNodes";
import { MOUNTAINS_CODE } from "./areas";
import { checkWorldShape } from "./worldShape";
import type { SettlementNode, TerrainNode, WorldEdge } from "./landmass";

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

    it("places separated terrain nodes only on land, matching the ground beneath them", () => {
        const random = createRandom("terrain");
        const landmass = generateLandmass(random);
        const { field } = generateBaseTerrainField(landmass, random);
        const nodes = placeTerrainNodes(landmass, field, random, { count: 20, minimumDistance: 5 });
        expect(nodes).toHaveLength(20);
        expect(nodes.every(node => isLand(landmass, node))).toBe(true);
        expect(new Set(nodes.map(node => node.terrain))).toEqual(new Set(["forest", "quarry", "ore"]));
        for (const node of nodes) expect(nodes.filter(other => Math.hypot(node.x - other.x, node.y - other.y) < 5)).toHaveLength(1);
    });

    it("connects every node with a real, terrain-derived movement cost", () => {
        const world = generateWorld("connected-world");
        expect(isConnected(world.nodes, world.edges)).toBe(true);
        expect(world.edges.length).toBeGreaterThanOrEqual(world.nodes.length - 1);
        for (const edge of world.edges) expect(edge.movementCost).toBeGreaterThan(0);
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

    it("derives route terrain from the ground the line actually crosses", () => {
        const field = fieldOf(5, 1, "wwwww");
        const result = edgeCostFor(field, { x: 1, y: 1 }, { x: 9, y: 1 });
        expect(result).toMatchObject({ terrain: "forest", passable: true });
        expect(result.cost).toBeCloseTo(8 * 1.5, 6);
    });

    it("never throws on an unrecognised area code — a rolling deploy can read a world a newer instance generated", () => {
        const field = fieldOf(5, 1, "gg?gg");
        expect(() => edgeCostFor(field, { x: 1, y: 1 }, { x: 9, y: 1 })).not.toThrow();
        // An unknown code renders at grass weight, so the route is unaffected.
        expect(edgeCostFor(field, { x: 1, y: 1 }, { x: 9, y: 1 })).toMatchObject({ terrain: "plains", passable: true, cost: 8 });
    });

    it("crosses a river only through a bridge it writes on the crossing tile", () => {
        const nodes: SettlementNode[] = [
            { id: "west", kind: "settlement", siteType: "expansion", x: 1, y: 1 },
            { id: "east", kind: "settlement", siteType: "expansion", x: 9, y: 1 },
        ];
        const field = fieldOf(5, 1, "ggrgg");
        const { edges, overlays } = connectWorldGraph(nodes, field, createRandom("river"), 0);
        expect(edges[0]).toMatchObject({ terrain: "river-crossing", chokepoint: true });
        // Tiles crossed (world x 1→9 over 2-unit tiles): 1 unit of grass, 2 of
        // grass, 2 of river at the bridge's ×2.5, then 2 and 1 more of grass.
        expect(edges[0].movementCost).toBeCloseTo(1 * 1 + 2 * 1 + 2 * 2.5 + 2 * 1 + 1 * 1, 6);
        // The crossing runs east–west (west and east sit on the same row), so
        // the bridge's own orientation key follows the direction of travel,
        // not the river it crosses (§3.5.5).
        expect(overlays).toEqual([{ tile: 2, code: "B", orientation: "ew" }]);
    });

    it("orients a bridge/ford by the direction of travel across it, not the water's own direction", () => {
        const northSouth: SettlementNode[] = [
            { id: "north", kind: "settlement", siteType: "expansion", x: 1, y: 1 },
            { id: "south", kind: "settlement", siteType: "expansion", x: 1, y: 9 },
        ];
        const field = fieldOf(1, 5, "grrrg");
        const { overlays } = connectWorldGraph(northSouth, field, createRandom("river-ns"), 0);
        expect(overlays.every(overlay => overlay.orientation === "ns")).toBe(true);
    });

    it("never crosses open ocean, with or without an extra edge to try", () => {
        const nodes: SettlementNode[] = [
            { id: "west", kind: "settlement", siteType: "expansion", x: 1, y: 1 },
            { id: "east", kind: "settlement", siteType: "expansion", x: 9, y: 1 },
        ];
        const field = fieldOf(5, 1, "ggogg");
        expect(() => connectWorldGraph(nodes, field, createRandom("no-crossing"), 0)).toThrow("Unable to connect world graph");
    });

    it("reports graph-hop separation, parity, and cornering violations from a fixed fixture", () => {
        const starts: SettlementNode[] = ["a", "b", "c", "d"].map((id, index) => ({
            id, kind: "settlement", siteType: "player-start", x: index, y: 0,
        }));
        const terrain: TerrainNode[] = ["a", "b", "c"].map((owner, index) => ({
            id: `ore-${owner}`, kind: "terrain", terrain: "ore", resourceYield: 10, x: index, y: 1,
        }));
        const pairs = [["a", "b"], ["a", "c"], ["a", "d"], ["a", "ore-a"], ["b", "ore-b"], ["c", "ore-c"]];
        const edges: WorldEdge[] = pairs.map(([from, to], index) => ({
            id: `e${index}`, from, to, terrain: "plains", movementCost: 1, chokepoint: false,
        }));
        const report = checkSettlementFairness(starts, terrain, edges, { minimumStartHops: 2, resourceHops: 1, parityTolerance: 0.2 });
        expect(report.reasons).toContain("a and b are too close");
        expect(report.reasons).toContain("a is cornered by other starts");
        expect(report.reasons.some(reason => reason.includes("resource-parity band"))).toBe(true);
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
            const terrain = world.nodes.filter((node): node is TerrainNode => node.kind === "terrain");
            const sites = world.nodes.filter((node): node is SettlementNode => node.kind === "settlement");
            const report = checkSettlementFairness(sites, terrain, world.edges);
            expect(report.reasons, `seed fairness-${index}, attempt ${world.generationAttempt}`).toEqual([]);
            expect(sites.filter(site => site.siteType === "player-start")).toHaveLength(10);
            expect(sites.filter(site => site.siteType === "expansion")).toHaveLength(14 * WORLD_AREA_SCALE);
        }
        // §3.7's answer to "one block in the middle": mountains in at least
        // three of the map's ninths in most worlds, and the middle ninth
        // holding no more than its fair share of them on average.
        expect(spreadWorlds).toBeGreaterThanOrEqual(18);
        expect(middleNinthShare).toBeLessThan(0.25);
    }, 60_000);
});
