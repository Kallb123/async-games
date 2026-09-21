import { describe, expect, it } from "vitest";
import { generateWorld } from "./generateWorld";
import { connectWorldGraph, isConnected, movementCostFor } from "./graphConnectivity";
import { createRandom } from "./random";
import { checkSettlementFairness } from "./settlementSites";
import { generateLandmass, isLand } from "./landmass";
import { placeTerrainNodes } from "./terrainNodes";
import type { SettlementNode, TerrainNode, WorldEdge } from "./landmass";

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

    it("places separated terrain nodes only on land", () => {
        const random = createRandom("terrain");
        const landmass = generateLandmass(random);
        const nodes = placeTerrainNodes(landmass, random, { count: 20, minimumDistance: 5 });
        expect(nodes).toHaveLength(20);
        expect(nodes.every(node => isLand(landmass, node))).toBe(true);
        expect(new Set(nodes.map(node => node.terrain))).toEqual(new Set(["forest", "quarry", "ore"]));
        for (const node of nodes) expect(nodes.filter(other => Math.hypot(node.x - other.x, node.y - other.y) < 5)).toHaveLength(1);
    });

    it("connects every node and gives terrain a documented movement cost", () => {
        const world = generateWorld("connected-world");
        expect(isConnected(world.nodes, world.edges)).toBe(true);
        expect(world.edges.length).toBeGreaterThanOrEqual(world.nodes.length - 1);
        for (const edge of world.edges) expect(edge.movementCost).toBe(movementCostFor(edge.terrain));
    });

    it("derives route terrain from nearby resource geography", () => {
        const nodes: (TerrainNode | SettlementNode)[] = [
            { id: "forest", kind: "terrain", terrain: "forest", resourceYield: 2, x: 0, y: 0 },
            { id: "a", kind: "settlement", siteType: "expansion", x: 1, y: 0 },
            { id: "b", kind: "settlement", siteType: "expansion", x: 2, y: 0 },
        ];
        const edges = connectWorldGraph(nodes, createRandom("routes"), 0);
        expect(edges.every(edge => edge.terrain === "forest" && edge.movementCost === 1.5)).toBe(true);
    });

    it("creates costly crossings where a route meets a central river bridge", () => {
        const nodes: SettlementNode[] = [
            { id: "west", kind: "settlement", siteType: "expansion", x: 0, y: 24 },
            { id: "east", kind: "settlement", siteType: "expansion", x: 100, y: 24 },
        ];
        expect(connectWorldGraph(nodes, createRandom("river"), 0)[0]).toMatchObject({
            terrain: "river-crossing", movementCost: 2.5, chokepoint: true,
        });
    });

    it("does not connect across the central river away from a bridge", () => {
        const nodes: SettlementNode[] = [
            { id: "west", kind: "settlement", siteType: "expansion", x: 0, y: 10 },
            { id: "east", kind: "settlement", siteType: "expansion", x: 100, y: 10 },
        ];
        expect(() => connectWorldGraph(nodes, createRandom("no-bridge"), 0)).toThrow("Unable to connect world graph");
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

    it("generates 20 worlds that all pass the starting-site fairness checks", () => {
        for (let index = 0; index < 20; index++) {
            const world = generateWorld(`fairness-${index}`);
            const terrain = world.nodes.filter((node): node is TerrainNode => node.kind === "terrain");
            const sites = world.nodes.filter((node): node is SettlementNode => node.kind === "settlement");
            const report = checkSettlementFairness(sites, terrain, world.edges);
            expect(report.reasons, `seed fairness-${index}, attempt ${world.generationAttempt}`).toEqual([]);
            expect(sites.filter(site => site.siteType === "player-start")).toHaveLength(10);
            expect(sites.filter(site => site.siteType === "expansion")).toHaveLength(14);
        }
    }, 15_000);
});
