// Combat (GDD §7.3, §7.6, §11.3 PR 22), pure like siege.ts: deterministic
// multi-round attrition with unit-type counters. No dice — the same two stacks
// always fight the same battle — so the round-by-round log is the whole story,
// and a player who scouted the other side can work the result out beforehand.

import { KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, type KingdomBuilderGarrison, type KingdomBuilderUnitType } from "./units";
import { subtractUnits, unitCount } from "./armies";

export interface KingdomBuilderCombatStats {
    /** Damage one unit deals a round, before counters. */
    attack: number;
    /** Damage it takes to kill one. */
    health: number;
}

/**
 * Each unit's weight in a fight. Militia are cheap and brittle, infantry the
 * sturdy line, cavalry hit hardest, and a siege engine is next to useless in
 * the open — what it is for is a town's defences. A settler strikes no blow at
 * all, but takes its share of them like anyone in the stack, and a commander
 * fights like a veteran and dies like one. First-pass
 * numbers (§12).
 */
export const KINGDOM_BUILDER_COMBAT_STATS: Record<KingdomBuilderUnitType, KingdomBuilderCombatStats> = {
    militia: { attack: 2, health: 6 },
    scout: { attack: 1, health: 3 },
    infantry: { attack: 4, health: 10 },
    cavalry: { attack: 7, health: 12 },
    "siege-engine": { attack: 1, health: 10 },
    settler: { attack: 0, health: 4 },
    // A veteran soldier (§6.5), with no counters for or against it.
    commander: { attack: 3, health: 12 },
};

/**
 * The counters (§7.3): how much harder a unit hits one type than its base
 * attack says. A triangle between the three fighting units — militia's pikes
 * stop cavalry, cavalry ride down infantry, infantry break militia — and
 * everything picks off the slow, lonely siege train, cavalry best of all.
 * Anything not listed is ×1.
 */
export const KINGDOM_BUILDER_COUNTERS: Partial<Record<KingdomBuilderUnitType, Partial<Record<KingdomBuilderUnitType, number>>>> = {
    militia: { cavalry: 2, "siege-engine": 1.5 },
    scout: { "siege-engine": 1.5 },
    infantry: { militia: 1.5, "siege-engine": 1.5 },
    cavalry: { infantry: 1.5, scout: 2, "siege-engine": 2 },
    "siege-engine": { "siege-engine": 1.5 },
};

/** Rounds a battle runs at most. One neither side has ended by then is a stand-off, which holds for the defender. */
export const KINGDOM_BUILDER_COMBAT_ROUNDS = 6;

/**
 * How much a garrison fighting from its own town shrugs off: damage to it is
 * divided by 1 + this. A sally out, in the open, gets none of it (§8).
 */
export const KINGDOM_BUILDER_TOWN_DEFENCE = 0.25;

/** How much of that each siege engine in the attacking stack takes away, down to none. */
export const KINGDOM_BUILDER_SIEGE_BREACH = 0.05;

/** What each side lost in one round. */
export interface KingdomBuilderBattleRound {
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
}

/** A battle fought out: who is left on each side, and how it went round by round. */
export interface KingdomBuilderBattle {
    /** The defender is gone and the attacker isn't. Anything else — both gone, or both standing — holds for the defender. */
    attackerWon: boolean;
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    /** Only the rounds that were fought: none against an empty side. */
    rounds: KingdomBuilderBattleRound[];
    /** The town-defence bonus the defender fought with, after the siege engines had their say — 0 in the open. */
    defence: number;
}

export interface KingdomBuilderBattleGround {
    /** The defender is a garrison behind its own town's defences (a push), not out in the open (a sally). */
    fortified: boolean;
}

export function counterOf(unitType: KingdomBuilderUnitType, target: KingdomBuilderUnitType): number {
    return KINGDOM_BUILDER_COUNTERS[unitType]?.[target] ?? 1;
}

/** The town-defence bonus a garrison keeps against this attacking stack. */
export function defenceAgainst(attacker: Partial<KingdomBuilderGarrison>, ground: KingdomBuilderBattleGround): number {
    if (!ground.fortified) return 0;
    return Math.max(0, KINGDOM_BUILDER_TOWN_DEFENCE - KINGDOM_BUILDER_SIEGE_BREACH * (attacker["siege-engine"] ?? 0));
}

/**
 * The damage a stack deals each of the other side's unit types in a round:
 * every unit spreads its attack over the other side by headcount, so a big
 * block of one type soaks up most of the blows, and hits each type as hard as
 * its counter against it says.
 */
function damageDealt(from: KingdomBuilderGarrison, to: KingdomBuilderGarrison): Record<KingdomBuilderUnitType, number> {
    const targets = unitCount(to);
    return Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(target => {
        const share = targets === 0 ? 0 : to[target] / targets;
        const damage = KINGDOM_BUILDER_UNIT_TYPES.reduce(
            (total, unitType) => total + from[unitType] * KINGDOM_BUILDER_COMBAT_STATS[unitType].attack * counterOf(unitType, target) * share, 0,
        );
        return [target, damage];
    })) as Record<KingdomBuilderUnitType, number>;
}

// Soaks up floating-point dust, so 18 damage against 6 health is 3 dead and not 2.
const EPSILON = 1e-9;

/**
 * Takes a round's damage off a stack. Damage too small to kill a unit isn't
 * lost: it is carried in `wounds` to the next round, so a small stack still
 * wears a big one down rather than bouncing off it for ever.
 */
function takeLosses(stack: KingdomBuilderGarrison, wounds: Record<KingdomBuilderUnitType, number>, damage: Record<KingdomBuilderUnitType, number>, divisor: number): KingdomBuilderGarrison {
    return Object.fromEntries(KINGDOM_BUILDER_UNIT_TYPES.map(unitType => {
        const { health } = KINGDOM_BUILDER_COMBAT_STATS[unitType];
        const taken = wounds[unitType] + damage[unitType] / divisor;
        const lost = Math.min(stack[unitType], Math.floor(taken / health + EPSILON));
        wounds[unitType] = stack[unitType] === lost ? 0 : taken - lost * health;
        return [unitType, lost];
    })) as KingdomBuilderGarrison;
}

const noWounds = () => garrisonOf() as Record<KingdomBuilderUnitType, number>;

/**
 * Fights a battle out (§7.3). Each round both sides strike at once, from what
 * stood at the start of it, and it goes on until one side is gone or
 * `KINGDOM_BUILDER_COMBAT_ROUNDS` have been fought.
 */
export function resolveBattle(attacker: Partial<KingdomBuilderGarrison>, defender: Partial<KingdomBuilderGarrison>, ground: KingdomBuilderBattleGround): KingdomBuilderBattle {
    let attacking = garrisonOf(attacker);
    let defending = garrisonOf(defender);
    const defence = defenceAgainst(attacking, ground);
    const attackerWounds = noWounds();
    const defenderWounds = noWounds();
    const rounds: KingdomBuilderBattleRound[] = [];
    while (rounds.length < KINGDOM_BUILDER_COMBAT_ROUNDS && unitCount(attacking) > 0 && unitCount(defending) > 0) {
        const round = {
            attacker: takeLosses(attacking, attackerWounds, damageDealt(defending, attacking), 1),
            defender: takeLosses(defending, defenderWounds, damageDealt(attacking, defending), 1 + defence),
        };
        attacking = subtractUnits(attacking, round.attacker);
        defending = subtractUnits(defending, round.defender);
        rounds.push(round);
    }
    return { attackerWon: unitCount(defending) === 0 && unitCount(attacking) > 0, attacker: attacking, defender: defending, rounds, defence };
}

/**
 * Hands a side's survivors back to the stacks it fought with, type by type in
 * proportion to what each brought — largest remainder first, the earlier stack
 * on a tie — so several armies fighting as one each come home with their share.
 */
export function shareSurvivors(stacks: readonly Partial<KingdomBuilderGarrison>[], survivors: Partial<KingdomBuilderGarrison>): KingdomBuilderGarrison[] {
    const shares = stacks.map(() => garrisonOf());
    for (const unitType of KINGDOM_BUILDER_UNIT_TYPES) {
        const brought = stacks.map(stack => stack[unitType] ?? 0);
        const total = brought.reduce((sum, count) => sum + count, 0);
        const left = Math.min(survivors[unitType] ?? 0, total);
        if (left === 0) continue;
        const exact = brought.map(count => count * left / total);
        exact.forEach((share, index) => { shares[index][unitType] = Math.floor(share + EPSILON); });
        let spare = left - shares.reduce((sum, share) => sum + share[unitType], 0);
        const byRemainder = exact.map((share, index) => ({ index, remainder: share - shares[index][unitType] }))
            .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        for (const { index } of byRemainder) {
            if (spare === 0) break;
            shares[index][unitType] += 1;
            spare -= 1;
        }
    }
    return shares;
}
