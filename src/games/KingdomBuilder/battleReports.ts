import type { Types } from "mongoose";

import { KingdomBuilderBattleModel, type IKingdomBuilderBattle } from "./KingdomBuilderBattleModel";
import { unitCount } from "./armies";
import { KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, type KingdomBuilderGarrison } from "./units";

/** How many of a player's latest battles in a world the view carries. */
export const KINGDOM_BUILDER_BATTLE_REPORTS = 5;

/**
 * A battle as one side reads it (§7.6): theirs first, the other side second,
 * whichever of the two they fought on.
 */
export interface KingdomBuilderBattleReport {
    battleId: string;
    kind: "push" | "sally";
    tick: number;
    /** The settlement's node it was fought at. */
    nodeId: string;
    /** The reader's side started it: pushed the attack, or sallied out. */
    started: boolean;
    /**
     * - `won`: the other side is gone and the reader's isn't.
     * - `lost`: the reader's side is gone.
     * - `held`: both still stand after the last round — which is the defender's.
     */
    outcome: "won" | "lost" | "held";
    /** What went in on the reader's side, and what it met. */
    sent: KingdomBuilderGarrison;
    faced: KingdomBuilderGarrison;
    /** What was left of each. */
    left: KingdomBuilderGarrison;
    faceLeft: KingdomBuilderGarrison;
    /** Each round's losses, the reader's side first. */
    rounds: { lost: KingdomBuilderGarrison; killed: KingdomBuilderGarrison }[];
}

type BattleRecord = { _id: Types.ObjectId } & Pick<IKingdomBuilderBattle, "kind" | "tick" | "nodeId" | "attackerIds" | "attacker" | "defender" | "rounds">;

function afterLosses(stack: Partial<KingdomBuilderGarrison>, losses: readonly Partial<KingdomBuilderGarrison>[]): KingdomBuilderGarrison {
    const left = garrisonOf(stack);
    for (const loss of losses) {
        for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) left[unitType] -= loss[unitType] ?? 0;
    }
    return left;
}

/** A stored battle from one side's point of view. The caller has already made sure they fought in it. */
export function reportFor(battle: BattleRecord, userId: string): KingdomBuilderBattleReport {
    const started = battle.attackerIds.includes(userId);
    const [mine, theirs] = started ? ["attacker", "defender"] as const : ["defender", "attacker"] as const;
    const left = afterLosses(battle[mine], battle.rounds.map(round => round[mine]));
    const faceLeft = afterLosses(battle[theirs], battle.rounds.map(round => round[theirs]));
    const outcome = unitCount(left) === 0 ? "lost" : unitCount(faceLeft) === 0 ? "won" : "held";
    return {
        battleId: battle._id.toString(),
        kind: battle.kind,
        tick: battle.tick,
        nodeId: battle.nodeId,
        started,
        outcome,
        sent: garrisonOf(battle[mine]),
        faced: garrisonOf(battle[theirs]),
        left,
        faceLeft,
        rounds: battle.rounds.map(round => ({ lost: garrisonOf(round[mine]), killed: garrisonOf(round[theirs]) })),
    };
}

/** The player's latest battles in the world, newest first, from either side — and nobody else's. */
export async function recentBattles(worldId: string, userId: string): Promise<KingdomBuilderBattleReport[]> {
    const battles = await KingdomBuilderBattleModel.find({ worldId, $or: [{ attackerIds: userId }, { defenderIds: userId }] })
        .sort({ createdAt: -1, _id: -1 })
        .limit(KINGDOM_BUILDER_BATTLE_REPORTS)
        .select({ kind: 1, tick: 1, nodeId: 1, attackerIds: 1, attacker: 1, defender: 1, rounds: 1 })
        .lean<BattleRecord[]>();
    return battles.map(battle => reportFor(battle, userId));
}
