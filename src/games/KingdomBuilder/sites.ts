// Which settlement sites are open (GDD §4.4), pure so the world map and the
// settler's orders read it the same way — the server's word is still
// `foundSettlement`'s own check.

import type { KingdomBuilderWorldView } from "./worldView";
import type { SettlementNode } from "./worldgen/landmass";

/** How many settlements one player may hold in a world: a first, and one founded or taken after it. */
export const KINGDOM_BUILDER_SETTLEMENT_LIMIT = 2;

/**
 * The sites a settler could found a town on: an expansion site nobody holds,
 * or a barbarian one whose village has burnt (§3.4). A player start is kept
 * for the player who joins on it.
 */
export function openSites(view: Pick<KingdomBuilderWorldView, "nodes" | "settlements" | "barbarians">): SettlementNode[] {
    const taken = new Set([...view.settlements.map(settlement => settlement.nodeId), ...view.barbarians.map(village => village.nodeId)]);
    return view.nodes.filter((node): node is SettlementNode => node.kind === "settlement" && node.siteType !== "player-start" && !taken.has(node.id));
}
