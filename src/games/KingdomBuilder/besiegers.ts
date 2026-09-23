import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { siegeOf, type KingdomBuilderSiege } from "./siege";

type Besieger = { ownerId: string; targetNodeId: string; besiegingSince?: number };

/**
 * The sieges on these settlements (§8), keyed by node. It reads the armies
 * camped at them, taking only whose each is and when it began — never what an
 * army holds or where it came from — so a defender learns that they are
 * besieged, and since when, from this and nothing more.
 */
export async function siegesOn(worldId: string, settlements: readonly { ownerId: string; nodeId: string }[]): Promise<Map<string, KingdomBuilderSiege>> {
    if (settlements.length === 0) return new Map();
    const camps = await KingdomBuilderArmyModel.find({
        worldId, targetNodeId: { $in: settlements.map(settlement => settlement.nodeId) }, besiegingSince: { $ne: null },
    }).select({ _id: 0, ownerId: 1, targetNodeId: 1, besiegingSince: 1 }).lean<Besieger[]>();
    return new Map(settlements.flatMap(settlement => {
        const siege = siegeOf(settlement, camps);
        return siege ? [[settlement.nodeId, siege] as const] : [];
    }));
}
