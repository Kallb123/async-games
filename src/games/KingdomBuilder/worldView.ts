import { Types } from "mongoose";

import { buildUserDirectory } from "@/utils/users/clerk";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel, type KingdomBuilderResources, type KingdomBuilderTile } from "./KingdomBuilderSettlementModel";
import { kingdomBuilderMemberIds, KingdomBuilderWorldModel, type KingdomBuilderSeat } from "./KingdomBuilderWorldModel";
import { armyTile, paceOf, pathIndexOf, ticksToArrive } from "./armies";
import { barbarianBandsFor, type KingdomBuilderBarbarianVillage } from "./barbarians";
import { buildingLevelOf } from "./buildings";
import { recentBattles, type KingdomBuilderBattleReport } from "./battleReports";
import { siegesOn } from "./besiegers";
import { marketLevelOf } from "./market";
import { tradeOffersIn, type KingdomBuilderTradeOfferView } from "./tradeBoard";
import { resourcesOf } from "./resources";
import type { KingdomBuilderSiege } from "./siege";
import { assaultFromTick } from "./siege";
import { armySight, isInSight, settlementSight, type KingdomBuilderSight } from "./sight";
import { barracksLevelOf, garrisonOf, type KingdomBuilderGarrison } from "./units";
import { KingdomBuilderPersistenceError } from "./persistence";
import type { Landmass, OverlayPlacement, TerrainField, WorldEdge, WorldNode } from "./worldgen";
import type { KingdomBuilderMarch } from "./armies";
import { ensureFirstSettlement } from "./roster";
import { liveWorldInvitation, reconcileWorldInvitation } from "./worldInvitation";
import { completedBuildLevels } from "./worldSummaryTypes";
import { worldOnTiles } from "./worldTiles";

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
        /** Yours only: the key to a settlement's own screen, which only its owner may open. */
        settlementId?: string;
        nodeId: string;
        isMine: boolean;
        /** The owner's index in `players`. */
        seat: number;
        /**
         * The units stationed there: always on yours, which an army is drawn
         * from (§6.2), and on someone else's only while an army of yours with a
         * scout in it can see the town (§6.1, §6.3) — a live read, gone again
         * the moment the scout moves off.
         */
        garrison?: KingdomBuilderGarrison;
        /**
         * Yours only: the siege on it (§8), if another player's army is camped
         * there. Nobody else is told a town is besieged — a third player learns
         * it only by seeing the army at its gate.
         */
        siege?: KingdomBuilderSiege;
        /** Yours only: what is in its stores — what a caravan can be loaded with, and a trade offer paid from (PR 25). */
        resources?: KingdomBuilderResources;
        /** Yours only: the caravans standing empty at its market. */
        caravans?: number;
        /** Yours only: its market's level, 0 without one. */
        marketLevel?: number;
        /** Yours only: its town centre's level — the shield on its map badge. */
        townCentreLevel?: number;
    }>;
    /**
     * The barbarian villages still standing (§3.4) — public, like every
     * settlement. What is left of a garrison is shown only while a scouting
     * army of the viewer's can see the village, as with a rival's town (§6.3).
     */
    barbarians: Array<{
        nodeId: string;
        /** Its strength band, 1 for the ring nearest the starts — worked out from the public node layout, so no secret. */
        level: number;
        garrison?: KingdomBuilderGarrison;
    }>;
    /** Your own armies in the field (§6.2), with their roads and orders — nobody else's army appears here. */
    armies: KingdomBuilderArmyView[];
    /**
     * Everything of yours that can see (§6.3): your settlements and your
     * armies, each with how far. The map fogs whatever lies outside them.
     */
    sight: KingdomBuilderSight[];
    /**
     * Other players' armies inside that sight — where each stands, whose it is
     * and what it holds, and nothing else: not its road, not where it is bound,
     * not when it gets there. One out of sight is not sent at all (§6.3).
     */
    sightings: KingdomBuilderArmySighting[];
    /**
     * The viewer's latest battles in the world (§7.6), newest first — the
     * ones they started and the ones fought against them — each from their
     * own side. Nobody else's battle appears here.
     */
    battles: KingdomBuilderBattleReport[];
    /** The world's trade board (PR 25): every open offer, oldest first, whoever posted it. */
    offers: KingdomBuilderTradeOfferView[];
    /** The world's live join code — on the map, for its host only (a named invitee who hasn't joined yet sees it on the lobby screen, as with any lobby). */
    invite?: { joinCode: string; expiresAt: string; openSeats: number };
}

export interface KingdomBuilderArmyView {
    armyId: string;
    units: KingdomBuilderGarrison;
    /** The tile it stands on now. */
    tile: number;
    /** The rest of its road, from `tile` to the end — just `tile` once it has arrived. */
    route: number[];
    fromNodeId: string;
    targetNodeId: string;
    /** 0 once it has arrived. */
    ticksToArrive: number;
    /** The tick it arrived on, once it has. */
    arrivedAtTick?: number;
    /** The tick it began besieging the settlement it is camped at (§8), if it is. */
    besiegingSince?: number;
    /** The first tick this army may push a full attack, when the target has walls. */
    assaultFromTick?: number;
    /** The caravans travelling with it (PR 25), and what they carry — 0 and nothing for a stack with none. */
    caravans: number;
    cargo: KingdomBuilderResources;
}

export interface KingdomBuilderArmySighting {
    /** The owner's index in `players`. */
    seat: number;
    /** The tile it stands on now. */
    tile: number;
    units: KingdomBuilderGarrison;
    /** How many caravans travel with it (PR 25) — a covered cart shows it is one, never what it carries. */
    caravans?: number;
}

function validateWorldId(worldId: string) {
    if (!Types.ObjectId.isValid(worldId)) {
        throw new KingdomBuilderPersistenceError("INVALID_INPUT", "A valid world is required");
    }
}

type SettlementRow = {
    _id: Types.ObjectId; ownerId: string; nodeId: string; tiles?: KingdomBuilderTile[]; garrison?: Partial<KingdomBuilderGarrison>;
    resources?: Partial<KingdomBuilderResources>; caravans?: number;
};

function readSettlements(worldId: string): Promise<SettlementRow[]> {
    return KingdomBuilderSettlementModel.find({ worldId })
        .select({ ownerId: 1, nodeId: 1, tiles: 1, garrison: 1, resources: 1, caravans: 1 })
        .lean<SettlementRow[]>();
}

/** The viewer's own armies — the query names the owner, so nobody else's is ever read. */
async function readArmies(worldId: string, userId: string): Promise<KingdomBuilderArmyView[]> {
    const armies = await KingdomBuilderArmyModel.find({ worldId, ownerId: userId }).sort({ createdAt: 1, _id: 1 }).lean();
    return armies.map(army => {
        const units = garrisonOf(army.units);
        const arrivedAtTick = army.arrivedAtTick ?? undefined;
        const besiegingSince = army.besiegingSince ?? undefined;
        const caravans = army.caravans ?? 0;
        return {
            armyId: army._id.toString(),
            units,
            tile: armyTile(army),
            route: army.path.slice(pathIndexOf(army)),
            fromNodeId: army.fromNodeId,
            targetNodeId: army.targetNodeId,
            ticksToArrive: arrivedAtTick === undefined ? Math.max(1, ticksToArrive(army, paceOf(units, caravans) ?? 1)) : 0,
            ...(arrivedAtTick === undefined ? {} : { arrivedAtTick }),
            ...(besiegingSince === undefined ? {} : { besiegingSince }),
            caravans,
            cargo: resourcesOf(army.cargo),
        };
    });
}

type RivalArmyRow = Pick<KingdomBuilderMarch, "ownerId" | "units" | "path" | "pathCosts" | "travelled" | "caravans">;

/**
 * Other players' armies, as far as the viewer's sight reaches (§6.3). The read
 * takes only what finding the army's tile needs — never its orders, nor what
 * its caravans carry — and the reply carries only the tile, the owner's seat,
 * the units and how many caravans, of the armies in sight. Ordered by seat and
 * tile rather than by when each set out.
 */
async function readSightings(worldId: string, userId: string, field: Pick<TerrainField, "columns"> | undefined, sights: readonly KingdomBuilderSight[], seatOf: ReadonlyMap<string, number>): Promise<KingdomBuilderArmySighting[]> {
    if (!field || sights.length === 0) return [];
    const armies = await KingdomBuilderArmyModel.find({ worldId, ownerId: { $ne: userId } })
        .select({ ownerId: 1, units: 1, path: 1, pathCosts: 1, travelled: 1, caravans: 1 })
        .lean<RivalArmyRow[]>();
    return armies.flatMap(army => {
        const seat = seatOf.get(army.ownerId);
        const tile = armyTile(army);
        return seat === undefined || tile === undefined || !isInSight(field, sights, tile) ? [] : [{
            seat, tile, units: garrisonOf(army.units), ...(army.caravans ? { caravans: army.caravans } : {}),
        }];
    }).sort((a, b) => a.seat - b.seat || a.tile - b.tile);
}

export async function worldView(worldId: string, userId: string): Promise<KingdomBuilderWorldView> {
    validateWorldId(worldId);
    let settlements = await readSettlements(worldId);
    const ownsSettlement = settlements.some(settlement => settlement.ownerId === userId);

    const world = await KingdomBuilderWorldModel.findById(worldId)
        .select({ currentTick: 1, landmass: 1, terrainField: 1, overlays: 1, nodes: 1, edges: 1, hostId: 1, seatCount: 1, roster: 1, endedAt: 1, barbarians: 1 })
        .lean();
    const roster: KingdomBuilderSeat[] = world?.roster ?? [];
    const villages: KingdomBuilderBarbarianVillage[] = world?.barbarians ?? [];
    const seat = roster.find(entry => entry.userId === userId);
    // A world is open to its members only: the roster, or — for a world opened
    // before rosters existed — the owners of its settlements. Not a member and
    // not there are the same answer, so a stranger can't probe for worlds —
    // and an ended world (§9.1) is not there for anyone.
    if (!world || world.endedAt || (!ownsSettlement && !seat)) {
        throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    }
    if (seat && !ownsSettlement) {
        // Seated by a join that died before founding: finish it (idempotent).
        await ensureFirstSettlement(worldId, userId, seat.siteId);
        settlements = await readSettlements(worldId);
    }

    // Join order is seat order. A pre-roster world has only its settlements'
    // owners to go on — a world of one, in practice.
    const memberIds = kingdomBuilderMemberIds(world, settlements.map(settlement => settlement.ownerId));
    const seatOf = new Map(memberIds.map((memberId, index) => [memberId, index]));
    const onTiles = worldOnTiles(world);
    const bands = barbarianBandsFor(onTiles.nodes);
    if (onTiles.changed && world.terrainField) {
        // Once per world from before PR 16 (§3.8): the snap and the re-drawn
        // routes are the same on every read, so the first viewer saves them.
        // Guarded on the nodes still lacking tiles, so a second viewer racing
        // the first writes nothing; a failure here only means the next view
        // works them out again.
        await KingdomBuilderWorldModel.updateOne({ _id: worldId, "nodes.tile": { $exists: false } }, { $set: { nodes: onTiles.nodes, edges: onTiles.edges } })
            .catch(error => console.error(`Kingdom Builder: could not save world ${worldId} onto its tiles`, error));
    }
    const hostId = world.hostId ?? memberIds[0];
    const [directory, invite, armies, sieges, battles, offers] = await Promise.all([
        buildUserDirectory(memberIds),
        hostId === userId ? liveWorldInvitation(worldId) : Promise.resolve(undefined),
        readArmies(worldId, userId),
        siegesOn(worldId, settlements.filter(settlement => settlement.ownerId === userId)),
        // A history, not the board: a failed read shows no battles rather than no world.
        recentBattles(worldId, userId).catch(error => {
            console.error(`Kingdom Builder: could not read the battles in world ${worldId}`, error);
            return [];
        }),
        // The market, not the board: a failed read shows an empty board rather than no world.
        tradeOffersIn(worldId, userId, seatOf).catch(error => {
            console.error(`Kingdom Builder: could not read the trade offers in world ${worldId}`, error);
            return [];
        }),
        // The repair for a leave that died before handing the invitation on (§9.1).
        hostId === userId && roster.length > 0
            ? reconcileWorldInvitation(worldId, hostId, memberIds).catch(error => console.error(`Kingdom Builder: could not reconcile the invitation for world ${worldId}`, error))
            : undefined,
    ]);

    // What the viewer can see (§6.3): each settlement's watch, then each army's.
    const field = world.terrainField;
    const tileOf = new Map(onTiles.nodes.map(node => [node.id, node.tile]));
    const sight: KingdomBuilderSight[] = !field ? [] : [
        ...settlements.flatMap(settlement => {
            const tile = tileOf.get(settlement.nodeId);
            return settlement.ownerId !== userId || tile === undefined ? [] : [settlementSight(tile, barracksLevelOf(settlement.tiles ?? []))];
        }),
        ...armies.map(army => armySight(army.tile, army.units)),
    ];
    const sightings = await readSightings(worldId, userId, field, sight, seatOf);
    const isScouted = (nodeId: string) => {
        const tile = tileOf.get(nodeId);
        return !!field && tile !== undefined && isInSight(field, sight, tile, true);
    };

    return {
        worldId,
        currentTick: world.currentTick,
        completedBuildLevels: settlements
            .filter(settlement => settlement.ownerId === userId)
            .reduce((total, settlement) => total + completedBuildLevels(settlement.tiles ?? []), 0),
        landmass: world.landmass,
        terrainField: world.terrainField,
        overlays: world.overlays,
        nodes: onTiles.nodes,
        edges: onTiles.edges,
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
                ...(settlement.ownerId === userId ? { settlementId: settlement._id.toString() } : {}),
                nodeId: settlement.nodeId,
                isMine: settlement.ownerId === userId,
                seat: ownerSeat,
                ...(settlement.ownerId === userId || isScouted(settlement.nodeId) ? { garrison: garrisonOf(settlement.garrison) } : {}),
                ...(settlement.ownerId === userId && sieges.has(settlement.nodeId) ? { siege: sieges.get(settlement.nodeId)! } : {}),
                ...(settlement.ownerId === userId ? {
                    resources: resourcesOf(settlement.resources),
                    caravans: settlement.caravans ?? 0,
                    marketLevel: marketLevelOf(settlement.tiles ?? []),
                    townCentreLevel: buildingLevelOf(settlement.tiles ?? [], "town-centre"),
                } : {}),
            }];
        }),
        barbarians: villages.map(village => ({
            nodeId: village.nodeId,
            level: (bands.get(village.nodeId) ?? 0) + 1,
            ...(isScouted(village.nodeId) ? { garrison: garrisonOf(village.garrison) } : {}),
        })),
        armies: armies.map(army => {
            if (army.besiegingSince === undefined) return army;
            const target = settlements.find(settlement => settlement.nodeId === army.targetNodeId);
            return target ? { ...army, assaultFromTick: assaultFromTick(army.besiegingSince, target.tiles ?? []) } : army;
        }),
        sight,
        sightings,
        battles,
        offers,
        ...(invite ? { invite } : {}),
    };
}
