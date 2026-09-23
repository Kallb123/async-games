import { Types, type ClientSession } from "mongoose";

import { KingdomBuilderSettlementModel, KINGDOM_BUILDER_GRID_SIZE, KINGDOM_BUILDER_TOWN_CENTRE_INDEX, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel, type KingdomBuilderSeat } from "./KingdomBuilderWorldModel";
import { KINGDOM_BUILDER_STARTING_STOCKPILE } from "./buildings";
import { catchmentForSettlement } from "./land";
import { resourcesOf } from "./resources";
import { generateWorld } from "./worldgen";
import type { SettlementNode, WorldNode } from "./worldgen/landmass";

export class KingdomBuilderPersistenceError extends Error {
    constructor(public readonly code: "INVALID_INPUT" | "WORLD_NOT_FOUND" | "SITE_NOT_FOUND" | "SITE_NOT_AVAILABLE" | "WORLD_FULL" | "FORBIDDEN" | "ARMY_NOT_FOUND" | "ARMY_BUSY" | "NO_ROUTE", message: string) {
        super(message);
        this.name = "KingdomBuilderPersistenceError";
    }
}

export type KingdomBuilderSettlementKind = "first" | "expansion";

/** Who is opening a world, and how many seats (themselves included) it holds. */
export interface KingdomBuilderWorldHost {
    userId: string;
    seatCount: number;
}

/**
 * Generates and persists one world. Given a host, the world is born with its
 * roster (§11.3 PR 8) — the host in the first seat, on a free player start —
 * so the caller founds the host's settlement on `roster[0].siteId`.
 */
export async function createWorld(seed: string, session?: ClientSession, host?: KingdomBuilderWorldHost) {
    const normalisedSeed = seed.trim();
    if (!normalisedSeed) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A world seed is required");
    }

    const generated = generateWorld(normalisedSeed);
    let hosting = {};
    if (host) {
        const [site] = freePlayerStarts(generated.nodes, []);
        if (!site) throw new Error("Generated Kingdom Builder world has no starting settlement");
        hosting = {
            hostId: host.userId,
            seatCount: host.seatCount,
            roster: [{ userId: host.userId, siteId: site.id, joinedAt: new Date() }],
        };
    }
    const values = { ...generated, currentTick: 0, ...hosting };
    if (!session) return KingdomBuilderWorldModel.create(values);
    const [world] = await KingdomBuilderWorldModel.create([values], { session });
    return world;
}

/** The player-start sites no seat has claimed yet, in the world's own node order. */
export function freePlayerStarts(nodes: readonly WorldNode[], roster: readonly Pick<KingdomBuilderSeat, "siteId">[]): SettlementNode[] {
    const taken = new Set(roster.map(seat => seat.siteId));
    return nodes.filter((node): node is SettlementNode => node.kind === "settlement" && node.siteType === "player-start" && !taken.has(node.id));
}

function createStartingTiles(): KingdomBuilderTile[] {
    return Array.from({ length: KINGDOM_BUILDER_GRID_SIZE }, (_, position) => ({
        position,
        ...(position === KINGDOM_BUILDER_TOWN_CENTRE_INDEX
            ? { building: { type: "town-centre" as const, level: 1 } }
            : {}),
    }));
}

/**
 * Claims either a player's starting slot or their one expansion slot. Unique
 * world/node and world/owner/settlement-number indexes arbitrate concurrent
 * claims, so neither a site nor a player's second-settlement slot can race.
 */
export async function foundSettlement(
    worldId: string,
    userId: string,
    siteId: string,
    session?: ClientSession,
    kind: KingdomBuilderSettlementKind = "first",
) {
    if (!Types.ObjectId.isValid(worldId) || !userId.trim() || !siteId.trim()) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world, user and site are required");
    }

    const query = KingdomBuilderWorldModel.findById(worldId).select({ nodes: 1, terrainField: 1, endedAt: 1 });
    const world = await (session ? query.session(session) : query).lean();
    if (!world || world.endedAt) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }

    const site = world.nodes.find((node: WorldNode) => node.id === siteId);
    if (!site || site.kind !== "settlement") {
        throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement site not found in this world");
    }
    const requiredSiteType = kind === "first" ? "player-start" : "expansion";
    if (site.siteType !== requiredSiteType) {
        throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", `The site is not available for ${kind === "first" ? "a first" : "an expansion"} settlement`);
    }

    if (kind === "first") {
        const ownerQuery = KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId.trim() });
        const existing = await (session ? ownerQuery.session(session) : ownerQuery);
        if (existing) throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "This player already has a settlement in the world");
    }

    const values = {
        worldId: new Types.ObjectId(worldId),
        ownerId: userId.trim(),
        nodeId: siteId,
        settlementNumber: kind === "first" ? 0 : 1,
        tiles: createStartingTiles(),
        // Only a first settlement gets the stockpile (§4.5): a free second one
        // carrying its own would print resources.
        resources: kind === "first" ? { ...KINGDOM_BUILDER_STARTING_STOCKPILE } : resourcesOf(),
        // Worked out once, here: the ground never changes under a world (§4.6).
        catchment: catchmentForSettlement(world, { nodeId: siteId }),
    };
    if (!session) return KingdomBuilderSettlementModel.create(values);
    const [settlement] = await KingdomBuilderSettlementModel.create([values], { session });
    return settlement;
}
