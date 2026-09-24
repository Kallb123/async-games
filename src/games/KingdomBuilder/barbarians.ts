// Barbarian villages (GDD §3.4, §11.3 PR 23), pure like siege.ts. A village
// stands from the world's birth with a fixed garrison that never trains,
// builds or marches. There is no siege at one: an army camped there fights it
// on the tick it arrives, and again every tick after until one side is gone.
// Won, the village becomes the attacker's settlement — or, for a player who
// already holds two, is burnt, leaving open ground anyone can found on.

import type { KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { addUnits, combineCaravans, isCamped, isEscorted, unitCount, type KingdomBuilderMarch } from "./armies";
import { KINGDOM_BUILDER_SETTLEMENT_LIMIT } from "./sites";
import { addResources, resourcesOf } from "./resources";
import { resolveBattle, shareSurvivors, type KingdomBuilderBattleRound } from "./combat";
import { combinedUnits } from "./siege";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";
import { pointDistance, type SettlementNode, type WorldNode } from "./worldgen/landmass";

/** A village still standing, and what is left of its garrison. */
export interface KingdomBuilderBarbarianVillage {
    nodeId: string;
    garrison: KingdomBuilderGarrison;
}

/**
 * What a village starts with, nearest the player starts first (§3.4): the
 * ring closest to the starts falls to a first barracks' militia, the farthest
 * wants infantry and cavalry. First-pass numbers (§12).
 */
export const KINGDOM_BUILDER_BARBARIAN_GARRISONS: readonly KingdomBuilderGarrison[] = [
    garrisonOf({ militia: 4 }),
    garrisonOf({ militia: 6, infantry: 3 }),
    garrisonOf({ militia: 8, infantry: 6, cavalry: 2 }),
];

/** The slots a player's settlements fill — a village taken by someone already at the limit is burnt instead. */
const SETTLEMENT_SLOTS = Array.from({ length: KINGDOM_BUILDER_SETTLEMENT_LIMIT }, (_, slot) => slot);

/**
 * Every barbarian site's starting garrison. The villages are ranked by how far
 * each stands from its nearest player start and split into as many bands as
 * there are garrisons, so every world has the same graduated on-ramp however
 * its starts fell.
 */
export function barbarianVillagesFor(nodes: readonly WorldNode[]): KingdomBuilderBarbarianVillage[] {
    const sites = nodes.filter((node): node is SettlementNode => node.kind === "settlement");
    const starts = sites.filter(site => site.siteType === "player-start");
    const nearestStart = (site: SettlementNode) => Math.min(...starts.map(start => pointDistance(start, site)));
    const ranked = sites.filter(site => site.siteType === "barbarian")
        .map(site => ({ site, distance: nearestStart(site) }))
        .sort((a, b) => a.distance - b.distance || a.site.id.localeCompare(b.site.id));
    const bands = KINGDOM_BUILDER_BARBARIAN_GARRISONS.length;
    return ranked.map(({ site }, rank) => ({
        nodeId: site.id,
        garrison: garrisonOf(KINGDOM_BUILDER_BARBARIAN_GARRISONS[Math.floor(rank * bands / ranked.length)]),
    })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/** One player's armies against a village — kept like any other battle, with nobody on the other side. */
export interface KingdomBuilderVillageBattle {
    nodeId: string;
    ownerId: string;
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    rounds: KingdomBuilderBattleRound[];
    left: KingdomBuilderGarrison;
}

/**
 * A village taken: the settlement it becomes, in the owner's free slot,
 * garrisoned by the survivors — and stocked with whatever the caravans that
 * came with them carried (PR 25), which stand in its market yard after.
 */
export interface KingdomBuilderVillageCapture {
    ownerId: string;
    nodeId: string;
    settlementNumber: number;
    garrison: KingdomBuilderGarrison;
    caravans: number;
    resources: KingdomBuilderResources;
}

export interface KingdomBuilderVillageAssault<T extends KingdomBuilderMarch> {
    /** The villages still standing, with what is left of each garrison. */
    villages: KingdomBuilderBarbarianVillage[];
    /** The armies still in the field, each with what it has left — one wiped out, or one that took a village, is gone. */
    armies: T[];
    captures: KingdomBuilderVillageCapture[];
    battles: KingdomBuilderVillageBattle[];
}

/**
 * Every army camped at a standing village fights it (§3.4). A player's armies
 * there go in together, fortified against as a garrison in its town is; two
 * players' armies at one village go in one after the other, in the order the
 * armies are given (oldest first), each against what the last left. Whoever
 * empties the village takes it, and anyone after them is camped at a town
 * that is now theirs — a siege, which the next tick dates.
 */
export function assaultVillages<T extends KingdomBuilderMarch>(
    villages: readonly KingdomBuilderBarbarianVillage[],
    settlements: readonly { ownerId: string; settlementNumber?: number }[],
    armies: readonly T[],
): KingdomBuilderVillageAssault<T> {
    const standing = new Map(villages.map(village => [village.nodeId, garrisonOf(village.garrison)]));
    const slots = new Map<string, Set<number>>();
    for (const settlement of settlements) {
        if (!slots.has(settlement.ownerId)) slots.set(settlement.ownerId, new Set());
        slots.get(settlement.ownerId)!.add(settlement.settlementNumber ?? 0);
    }
    const left = new Map<T, KingdomBuilderGarrison>();
    const captures: KingdomBuilderVillageCapture[] = [];
    const battles: KingdomBuilderVillageBattle[] = [];

    const attacks = new Map<string, Map<string, T[]>>();
    for (const army of armies) {
        // Caravans with nobody to guard them never go in (march.ts won't send them there either).
        if (!isCamped(army) || !isEscorted(army) || !standing.has(army.targetNodeId)) continue;
        const byOwner = attacks.get(army.targetNodeId) ?? new Map<string, T[]>();
        byOwner.set(army.ownerId, [...(byOwner.get(army.ownerId) ?? []), army]);
        attacks.set(army.targetNodeId, byOwner);
    }
    for (const [nodeId, byOwner] of attacks) {
        for (const [ownerId, camps] of byOwner) {
            const garrison = standing.get(nodeId);
            if (!garrison) break;
            const sent = combinedUnits(camps.map(camp => camp.units));
            const battle = resolveBattle(sent, garrison, { fortified: true });
            battles.push({ nodeId, ownerId, attacker: sent, defender: garrison, rounds: battle.rounds, left: battle.attacker });
            const kept = shareSurvivors(camps.map(camp => camp.units), battle.attacker);
            camps.forEach((camp, index) => left.set(camp, kept[index]));
            if (!battle.attackerWon) {
                standing.set(nodeId, battle.defender);
                continue;
            }
            standing.delete(nodeId);
            const taken = slots.get(ownerId) ?? new Set<number>();
            const slot = SETTLEMENT_SLOTS.find(number => !taken.has(number));
            if (slot === undefined) continue;
            taken.add(slot);
            slots.set(ownerId, taken);
            const { caravans, cargo } = combineCaravans(camps);
            captures.push({ ownerId, nodeId, settlementNumber: slot, garrison: kept.reduce(addUnits, garrisonOf()), caravans, resources: cargo });
            camps.forEach(camp => left.set(camp, garrisonOf()));
        }
    }

    return {
        villages: villages.flatMap(village => {
            const garrison = standing.get(village.nodeId);
            return garrison ? [{ nodeId: village.nodeId, garrison }] : [];
        }),
        armies: armies.flatMap(army => {
            const units = left.get(army);
            if (!units) return [army];
            return unitCount(units) === 0 ? [] : [{ ...army, units }];
        }),
        captures,
        battles,
    };
}
