import { Types } from "mongoose";

import { buildUserDirectory } from "@/utils/users/clerk";

import { KingdomBuilderSettlementModel, prepareMultipleSettlementsIndex, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel, type KingdomBuilderSeat } from "./KingdomBuilderWorldModel";
import { foundSettlement, KingdomBuilderPersistenceError } from "./persistence";
import type { Landmass, OverlayPlacement, TerrainField, WorldEdge, WorldNode } from "./worldgen";
import { ensureFirstSettlement } from "./roster";
import { liveWorldInvitation } from "./worldInvitation";
import { completedBuildLevels } from "./worldSummaryTypes";

/** One seat in a world, as every member sees it (§11.3 PR 8). */
export interface KingdomBuilderWorldPlayer {
    /** Join order — the host is 0. Also the index a settlement's `seat` points at, and the player's colour. */
    seat: number;
    name: string;
    imageUrl: string | null;
    isMe: boolean;
    isHost: boolean;
}

export interface KingdomBuilderWorldView {
    worldId: string;
    currentTick: number;
    completedBuildLevels: number;
    landmass: Landmass;
    /** The generated ground (§3.5.2) — absent on a world generated before it landed, which keeps drawing today's flat silhouette instead (§3.5.6). */
    terrainField?: TerrainField;
    /** The derived, load-bearing overlays (bridges, fords) on that ground (§3.5.3). */
    overlays?: OverlayPlacement[];
    nodes: WorldNode[];
    edges: WorldEdge[];
    /** How many seats the world holds, and who holds them, in join order. */
    seatCount: number;
    players: KingdomBuilderWorldPlayer[];
    settlements: Array<{
        settlementId: string;
        nodeId: string;
        isMine: boolean;
        /** The owner's index in `players`. */
        seat: number;
    }>;
    /** The world's live join code — sent to its host only, the one player who offered the seats. */
    invite?: { joinCode: string; expiresAt: string; openSeats: number };
}

function validateWorldId(worldId: string) {
    if (!Types.ObjectId.isValid(worldId)) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world is required");
    }
}

type SettlementRow = { _id: Types.ObjectId; ownerId: string; nodeId: string; tiles?: KingdomBuilderTile[] };

function readSettlements(worldId: string): Promise<SettlementRow[]> {
    return KingdomBuilderSettlementModel.find({ worldId })
        .select({ ownerId: 1, nodeId: 1, tiles: 1 })
        .lean<SettlementRow[]>();
}

export async function worldView(worldId: string, userId: string): Promise<KingdomBuilderWorldView> {
    validateWorldId(worldId);
    let settlements = await readSettlements(worldId);
    const ownsSettlement = settlements.some(settlement => settlement.ownerId === userId);

    const world = await KingdomBuilderWorldModel.findById(worldId)
        .select({ currentTick: 1, landmass: 1, terrainField: 1, overlays: 1, nodes: 1, edges: 1, hostId: 1, seatCount: 1, roster: 1 })
        .lean();
    const roster: KingdomBuilderSeat[] = world?.roster ?? [];
    const seat = roster.find(entry => entry.userId === userId);
    // A world is open to its members only: the roster, or — for a world opened
    // before rosters existed — the owners of its settlements. Not a member and
    // not there are the same answer, so a stranger can't probe for worlds.
    if (!world || (!ownsSettlement && !seat)) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }
    if (seat && !ownsSettlement) {
        // Seated by a join that died before founding: finish it (idempotent).
        await ensureFirstSettlement(worldId, userId, seat.siteId);
        settlements = await readSettlements(worldId);
    }

    // Join order is seat order. A pre-roster world has only its settlements'
    // owners to go on — a world of one, in practice.
    const memberIds = roster.length > 0
        ? roster.map(entry => entry.userId)
        : [...new Set(settlements.map(settlement => settlement.ownerId))];
    const seatOf = new Map(memberIds.map((memberId, index) => [memberId, index]));
    const hostId = world.hostId ?? memberIds[0];
    const [directory, invite] = await Promise.all([
        buildUserDirectory(memberIds),
        hostId === userId ? liveWorldInvitation(worldId) : Promise.resolve(undefined),
    ]);

    return {
        worldId,
        currentTick: world.currentTick,
        completedBuildLevels: settlements
            .filter(settlement => settlement.ownerId === userId)
            .reduce((total, settlement) => total + completedBuildLevels(settlement.tiles ?? []), 0),
        landmass: world.landmass,
        terrainField: world.terrainField,
        overlays: world.overlays,
        nodes: world.nodes,
        edges: world.edges,
        seatCount: Math.max(world.seatCount ?? 1, memberIds.length),
        players: memberIds.map((memberId, index) => ({
            seat: index,
            name: directory.name(memberId),
            imageUrl: directory.imageUrl(memberId),
            isMe: memberId === userId,
            isHost: memberId === hostId,
        })),
        settlements: settlements.flatMap(settlement => {
            const ownerSeat = seatOf.get(settlement.ownerId);
            return ownerSeat === undefined ? [] : [{
                settlementId: settlement._id.toString(),
                nodeId: settlement.nodeId,
                isMine: settlement.ownerId === userId,
                seat: ownerSeat,
            }];
        }),
        ...(invite ? { invite } : {}),
    };
}

export async function foundExpansion(worldId: string, userId: string, siteId: unknown): Promise<KingdomBuilderWorldView> {
    validateWorldId(worldId);
    if (typeof siteId !== "string" || !siteId.trim()) throw new KingdomBuilderPersistenceError("INVALID_INPUT", "Choose a settlement site");
    const isMember = await KingdomBuilderSettlementModel.exists({ worldId, ownerId: userId });
    if (!isMember) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");

    try {
        await prepareMultipleSettlementsIndex();
        await foundSettlement(worldId, userId, siteId, undefined, "expansion");
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            throw new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "That site is unavailable or you already have two settlements");
        }
        throw error;
    }
    return worldView(worldId, userId);
}
