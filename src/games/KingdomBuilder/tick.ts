import type {
    IKingdomBuilderSettlement,
    KingdomBuilderResources,
    KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_BUILDING_PRODUCES, KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE } from "./buildings";
import { addResources, resourcesOf } from "./resources";
import { advanceTraining } from "./units";
import { groundlessCatchment, outputPerLevelFor, type KingdomBuilderCatchment } from "./worldgen/catchment";

export interface KingdomBuilderTickWorld {
    currentTick: number;
    settlements: readonly IKingdomBuilderSettlement[];
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
        const resource = building && KINGDOM_BUILDER_BUILDING_PRODUCES[building.type];
        if (resource) production[resource] += building.level * outputPerLevelFor(catchment[resource]);
        return production;
    }, resourcesOf());
}

/**
 * A settlement's stored land, or — for one the tick cron hasn't backfilled
 * (it does so before ticking) — the groundless fallback, so no path through
 * the engine produces nothing for want of a field it didn't get.
 */
function catchmentOf(settlement: IKingdomBuilderSettlement): KingdomBuilderCatchment {
    return settlement.catchment ?? groundlessCatchment(settlement.tiles.some(tile => tile.building?.type === "mine"));
}

/**
 * Applies one deterministic world tick without mutating its input. Production
 * is collected before construction advances, so a building completed by this
 * tick starts producing on the next one. Training advances beside it: the
 * barracks' queue and the building queue are separate (§4.2).
 */
export function applyTick<T extends KingdomBuilderTickWorld>(world: T): T {
    return {
        ...world,
        currentTick: world.currentTick + 1,
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
                ...advanceTraining(settlement.trainingQueue, settlement.garrison),
                ...(construction && ticksRemaining !== 0
                    ? { construction: { ...construction, ticksRemaining: ticksRemaining! } }
                    : { construction: undefined }),
            };
        }),
    };
}
