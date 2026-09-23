import type {
    IKingdomBuilderSettlement,
    KingdomBuilderResources,
    KingdomBuilderTile,
} from "./KingdomBuilderSettlementModel";
import { advanceTraining } from "./units";

export interface KingdomBuilderTickWorld {
    currentTick: number;
    settlements: readonly IKingdomBuilderSettlement[];
}

const EMPTY_PRODUCTION: KingdomBuilderResources = { wood: 0, stone: 0, iron: 0 };

/** Returns the resources produced by the settlement's completed buildings. */
export function productionFor(tiles: readonly KingdomBuilderTile[]): KingdomBuilderResources {
    return tiles.reduce<KingdomBuilderResources>((production, tile) => {
        const building = tile.building;
        if (building?.type === "lumber-camp") production.wood += building.level;
        if (building?.type === "quarry") production.stone += building.level;
        if (building?.type === "mine") production.iron += building.level;
        return production;
    }, { ...EMPTY_PRODUCTION });
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
            const production = productionFor(settlement.tiles);
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
                resources: {
                    wood: settlement.resources.wood + production.wood,
                    stone: settlement.resources.stone + production.stone,
                    iron: settlement.resources.iron + production.iron,
                },
                ...advanceTraining(settlement.trainingQueue, settlement.garrison),
                ...(construction && ticksRemaining !== 0
                    ? { construction: { ...construction, ticksRemaining: ticksRemaining! } }
                    : { construction: undefined }),
            };
        }),
    };
}
