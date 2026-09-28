// Which settlement sites are open (GDD §4.4), pure so the world map and the
// settler's orders read it the same way — the server's word is still
// `foundSettlement`'s own check.

import type { KingdomBuilderWorldView } from "./worldView";
import type { SettlementNode } from "./worldgen/landmass";

/**
 * The number a player's next settlement takes: the lowest one none of theirs
 * holds. There is no cap on how many a player holds — the settler's doubling
 * price is what slows expansion (units.ts) — so the number only keeps each of
 * a player's settlements distinct for the unique owner/number index.
 */
export function nextSettlementNumber(taken: Iterable<number | undefined>): number {
    const held = new Set([...taken].map(number => number ?? 0));
    let number = 0;
    while (held.has(number)) number++;
    return number;
}

/**
 * The sites a settler could found a town on: an expansion site nobody holds,
 * or a barbarian one whose village has burnt (§3.4). A player start is kept
 * for the player who joins on it.
 */
export function openSites(view: Pick<KingdomBuilderWorldView, "nodes" | "settlements" | "barbarians">): SettlementNode[] {
    const taken = new Set([...view.settlements.map(settlement => settlement.nodeId), ...view.barbarians.map(village => village.nodeId)]);
    return view.nodes.filter((node): node is SettlementNode => node.kind === "settlement" && node.siteType !== "player-start" && !taken.has(node.id));
}
