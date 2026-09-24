import type { Types } from "mongoose";

import { KingdomBuilderBattleModel, type IKingdomBuilderBattle, type KingdomBuilderBattleKind } from "./KingdomBuilderBattleModel";
import { subtractUnits, unitCount } from "./armies";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";

/** How many of a player's latest battles in a world the view carries. */
export const KINGDOM_BUILDER_BATTLE_REPORTS = 5;

/**
 * A battle as one side reads it (§7.6): theirs first, the other side second,
 * whichever of the two they fought on.
 */
export interface KingdomBuilderBattleReport {
    battleId: string;
    kind: KingdomBuilderBattleKind;
    tick: number;
    /** The settlement's (or barbarian village's) node it was fought at. */
    nodeId: string;
    /** The reader's side started it: pushed the attack, or sallied out. */
    started: boolean;
    /**
     * - `won`: the other side is gone and the reader's isn't.
     * - `lost`: the reader's side is gone.
     * - `held`: both still stand after the last round — which is the defender's.
     */
    outcome: "won" | "lost" | "held";
    /**
     * What the reader sent and kept — their own units only, even on a side
     * shared with other besiegers, who are told nothing of each other's (§6.3).
     */
    sent: KingdomBuilderGarrison;
    left: KingdomBuilderGarrison;
    /** What the other side brought, and what was left of it. */
    faced: KingdomBuilderGarrison;
    faceLeft: KingdomBuilderGarrison;
    /**
     * Each round: what the other side lost, and — while the reader's side was
     * theirs alone — what they lost. A shared side's losses are left out, since
     * they would say what the reader's fellow besiegers had.
     */
    rounds: { lost?: KingdomBuilderGarrison; killed: KingdomBuilderGarrison }[];
    /** The reader's own caravans that changed hands in it (§4.7) — absent when none did. */
    caravansTaken?: number;
    caravansLost?: number;
}

type BattleRecord = { _id: Types.ObjectId } & Pick<IKingdomBuilderBattle, "kind" | "tick" | "nodeId" | "attackerIds" | "defenderIds" | "attacker" | "defender" | "rounds" | "shares">;

function afterLosses(stack: Partial<KingdomBuilderGarrison>, losses: readonly Partial<KingdomBuilderGarrison>[]): KingdomBuilderGarrison {
    return losses.reduce<KingdomBuilderGarrison>(subtractUnits, garrisonOf(stack));
}

/** A stored battle from one side's point of view. The caller has already made sure they fought in it. */
export function reportFor(battle: BattleRecord, userId: string): KingdomBuilderBattleReport {
    const started = battle.attackerIds.includes(userId);
    const [mine, theirs] = started ? ["attacker", "defender"] as const : ["defender", "attacker"] as const;
    const alone = (started ? battle.attackerIds : battle.defenderIds).length === 1;
    const share = battle.shares.find(entry => entry.ownerId === userId);
    const sent = garrisonOf(share?.sent), left = garrisonOf(share?.left);
    const faceLeft = afterLosses(battle[theirs], battle.rounds.map(round => round[theirs]));
    const outcome = unitCount(left) === 0 ? "lost" : unitCount(faceLeft) === 0 ? "won" : "held";
    return {
        battleId: battle._id.toString(),
        kind: battle.kind,
        tick: battle.tick,
        nodeId: battle.nodeId,
        started,
        outcome,
        sent,
        left,
        faced: garrisonOf(battle[theirs]),
        faceLeft,
        rounds: battle.rounds.map(round => ({ ...(alone ? { lost: garrisonOf(round[mine]) } : {}), killed: garrisonOf(round[theirs]) })),
        ...(share?.caravansTaken ? { caravansTaken: share.caravansTaken } : {}),
        ...(share?.caravansLost ? { caravansLost: share.caravansLost } : {}),
    };
}

/** The player's latest battles in the world, newest first, from either side — and nobody else's. */
export async function recentBattles(worldId: string, userId: string): Promise<KingdomBuilderBattleReport[]> {
    const battles = await KingdomBuilderBattleModel.find({ worldId, $or: [{ attackerIds: userId }, { defenderIds: userId }] })
        .sort({ createdAt: -1, _id: -1 })
        .limit(KINGDOM_BUILDER_BATTLE_REPORTS)
        .select({ kind: 1, tick: 1, nodeId: 1, attackerIds: 1, defenderIds: 1, attacker: 1, defender: 1, rounds: 1, shares: 1 })
        .lean<BattleRecord[]>();
    return battles.map(battle => reportFor(battle, userId));
}
