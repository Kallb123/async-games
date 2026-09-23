import type {
    IKingdomBuilderSettlement,
    KingdomBuilderResources,
    KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { addUnits, advanceMarch, type KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE, buildingOutputFor } from "./buildings";
import { addResources, resourcesOf } from "./resources";
import { advanceTraining } from "./units";
import { groundlessCatchment, type KingdomBuilderCatchment } from "./worldgen/catchment";

export interface KingdomBuilderTickWorld {
    currentTick: number;
    settlements: readonly IKingdomBuilderSettlement[];
    /**
     * Armies in the field (PR 19). One that reaches a settlement of its
     * owner's rejoins that garrison, and is gone from the list the tick returns.
     */
    armies?: readonly KingdomBuilderMarch[];
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
 */
export function applyTick<T extends KingdomBuilderTickWorld>(world: T): T {
    const currentTick = world.currentTick + 1;
    const { armies, joining } = marchArmies(world, currentTick);
    return {
        ...world,
        currentTick,
        ...(world.armies ? { armies } : {}),
        settlements: world.settlements.map(settlement => {
            const production = productionFor(settlement.tiles, catchmentOf(settlement));
            const construction = settlement.construction;
            const ticksRemaining = construction ? construction.ticksRemaining - 1 : undefined;
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
                ...withJoining(advanceTraining(settlement.trainingQueue, settlement.garrison), joining.get(settlement)),
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
 * garrison the tick it arrives, beside whatever the barracks finished.
 */
function marchArmies(world: KingdomBuilderTickWorld, tick: number) {
    const homes = new Map<string, Map<string, IKingdomBuilderSettlement>>();
    for (const settlement of world.settlements) {
        if (!homes.has(settlement.ownerId)) homes.set(settlement.ownerId, new Map());
        homes.get(settlement.ownerId)!.set(settlement.nodeId, settlement);
    }
    const joining = new Map<IKingdomBuilderSettlement, KingdomBuilderMarch["units"][]>();
    const armies: KingdomBuilderMarch[] = [];
    for (const army of world.armies ?? []) {
        const home = homes.get(army.ownerId) ?? new Map<string, IKingdomBuilderSettlement>();
        const { march, joins } = advanceMarch(army, tick, new Set(home.keys()));
        const settlement = joins === undefined ? undefined : home.get(joins);
        if (!settlement) {
            armies.push(march);
            continue;
        }
        joining.set(settlement, [...(joining.get(settlement) ?? []), march.units]);
    }
    return { armies, joining };
}

function withJoining<T extends { garrison: KingdomBuilderMarch["units"] }>(trained: T, arriving: readonly KingdomBuilderMarch["units"][] = []): T {
    return { ...trained, garrison: arriving.reduce(addUnits, trained.garrison) };
}
