import type {
    IKingdomBuilderSettlement,
    KingdomBuilderResources,
    KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { addUnits, advanceMarch, type KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE, buildingOutputFor } from "./buildings";
import { addResources, resourcesOf } from "./resources";
import { besiegedProduction, siegeOf, siegeStage } from "./siege";
import { advanceTraining, garrisonOf } from "./units";
import { groundlessCatchment, type KingdomBuilderCatchment } from "./worldgen/catchment";

export interface KingdomBuilderTickWorld {
    currentTick: number;
    settlements: readonly IKingdomBuilderSettlement[];
    /**
     * Armies in the field (PR 19). One that reaches a settlement of its
     * owner's rejoins that garrison, and is gone from the list the tick returns.
     * One camped at someone else's besieges it (PR 21) — so the list has to
     * hold the camped armies as well as the marching ones.
     */
    armies?: readonly KingdomBuilderMarch[];
}

/** "1 tick", "5 ticks" — how every screen counts time in a world (§5.5). */
export function formatTicks(count: number): string {
    return `${count} tick${count === 1 ? "" : "s"}`;
}

/**
 * Returns the resources produced by the settlement's completed buildings: each
 * production building its level × what its land's tier pays (§4.6). The town
 * centre's trickle comes whatever else stands, so a settlement too poor for
 * its cheapest building still earns its way to one (§4.5).
 */
export function productionFor(tiles: readonly KingdomBuilderTile[], catchment: KingdomBuilderCatchment): KingdomBuilderResources {
    return tiles.reduce<KingdomBuilderResources>((production, tile) => {
        const building = tile.building;
        if (building?.type === "town-centre") return addResources(production, KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE);
        const output = building && buildingOutputFor(building.type, building.level, catchment);
        if (output) production[output.resource] += output.amount;
        return production;
    }, resourcesOf());
}

/**
 * A settlement's stored land, or — for one the tick cron hasn't backfilled
 * (it does so before ticking) — the groundless fallback, so no path through
 * the engine produces nothing for want of a field it didn't get.
 */
function catchmentOf(settlement: IKingdomBuilderSettlement): KingdomBuilderCatchment {
    return settlement.catchment ?? groundlessCatchment(settlement.tiles);
}

/**
 * Applies one deterministic world tick without mutating its input. Production
 * is collected before construction advances, so a building completed by this
 * tick starts producing on the next one. Training advances beside it: the
 * barracks' queue and the building queue are separate (§4.2).
 *
 * A besieged settlement (§8) — one with an army of someone else's camped at it
 * as the tick begins — produces half, and once the siege's grace period is
 * over, its building and training stop where they are too.
 */
export function applyTick<T extends KingdomBuilderTickWorld>(world: T): T {
    const currentTick = world.currentTick + 1;
    const { armies, joining } = marchArmies(world, currentTick);
    return {
        ...world,
        currentTick,
        ...(world.armies ? { armies } : {}),
        settlements: world.settlements.map(settlement => {
            const siege = siegeOf(settlement, world.armies ?? []);
            const halted = siege !== undefined && siegeStage(siege, currentTick) === "full";
            const produced = productionFor(settlement.tiles, catchmentOf(settlement));
            const production = siege ? besiegedProduction(produced) : produced;
            const construction = settlement.construction;
            const ticksRemaining = construction ? construction.ticksRemaining - (halted ? 0 : 1) : undefined;
            const tiles = settlement.tiles.map(tile => ({
                ...tile,
                ...(tile.building ? { building: { ...tile.building } } : {}),
                ...(construction && ticksRemaining === 0 && tile.position === construction.tilePosition
                    ? { building: { type: construction.buildingType, level: construction.targetLevel } }
                    : {}),
            }));

            return {
                ...settlement,
                tiles,
                resources: addResources(settlement.resources, production),
                ...withJoining(
                    halted ? { trainingQueue: (settlement.trainingQueue ?? []).map(order => ({ ...order })), garrison: garrisonOf(settlement.garrison) } : advanceTraining(settlement.trainingQueue, settlement.garrison),
                    joining.get(settlement),
                ),
                ...(construction && ticksRemaining !== 0
                    ? { construction: { ...construction, ticksRemaining: ticksRemaining! } }
                    : { construction: undefined }),
            };
        }),
    };
}

/**
 * Every army's move this tick (§6.2). Movement comes after the settlements'
 * own work in the same tick, so an army that marches home is back in the
 * garrison the tick it arrives, beside whatever the barracks finished — and an
 * army that arrives at someone else's settlement begins its siege this tick,
 * biting from the next.
 */
function marchArmies(world: KingdomBuilderTickWorld, tick: number) {
    const homes = new Map<string, Map<string, IKingdomBuilderSettlement>>();
    const ownerAt = new Map<string, string>();
    for (const settlement of world.settlements) {
        if (!homes.has(settlement.ownerId)) homes.set(settlement.ownerId, new Map());
        homes.get(settlement.ownerId)!.set(settlement.nodeId, settlement);
        ownerAt.set(settlement.nodeId, settlement.ownerId);
    }
    const joining = new Map<IKingdomBuilderSettlement, KingdomBuilderMarch["units"][]>();
    const armies: KingdomBuilderMarch[] = [];
    for (const army of world.armies ?? []) {
        const home = homes.get(army.ownerId) ?? new Map<string, IKingdomBuilderSettlement>();
        const { march, joins } = advanceMarch(army, tick, new Set(home.keys()));
        const settlement = joins === undefined ? undefined : home.get(joins);
        if (!settlement) {
            armies.push(withSiege(march, ownerAt.get(march.targetNodeId), tick));
            continue;
        }
        joining.set(settlement, [...(joining.get(settlement) ?? []), march.units]);
    }
    return { armies, joining };
}

function withJoining<T extends { garrison: KingdomBuilderMarch["units"] }>(trained: T, arriving: readonly KingdomBuilderMarch["units"][] = []): T {
    return { ...trained, garrison: arriving.reduce(addUnits, trained.garrison) };
}

/**
 * Starts or ends a camped army's siege (§8): camped at a settlement that isn't
 * its owner's and not yet dated, it begins now; dated, but with no such
 * settlement there any more — its owner left the world — it ends.
 */
function withSiege<T extends KingdomBuilderMarch>(march: T, ownerThere: string | undefined, tick: number): T {
    const camped = march.arrivedAtTick !== undefined && march.arrivedAtTick !== null;
    const hostile = camped && ownerThere !== undefined && ownerThere !== march.ownerId;
    const dated = march.besiegingSince !== undefined && march.besiegingSince !== null;
    if (hostile && !dated) return { ...march, besiegingSince: tick };
    if (!hostile && dated) {
        const ended = { ...march };
        delete ended.besiegingSince;
        return ended;
    }
    return march;
}
