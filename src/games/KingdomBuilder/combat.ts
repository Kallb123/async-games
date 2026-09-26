// Combat (GDD §7.3, §7.6, §11.3 PR 22), pure like siege.ts. Battles
// resolve in a fixed initiative order, so composition and which side is
// defending matter without a die roll.

import { KINGDOM_BUILDER_UNIT_TYPES, garrisonOf, type KingdomBuilderGarrison, type KingdomBuilderUnitType } from "./units";
import { subtractUnits, unitCount } from "./armies";

export interface KingdomBuilderCombatStats {
    /** Damage one unit contributes when its formation attacks. */
    attack: number;
    /** Damage one unit can take before it is lost. */
    health: number;
    /** Armour added to its health while resolving damage. */
    defence: number;
}

/** The five field formations use the supplied army values; support units retain their existing values. */
export const KINGDOM_BUILDER_COMBAT_STATS: Record<KingdomBuilderUnitType, KingdomBuilderCombatStats> = {
    militia: { attack: 2, health: 5, defence: 2 },
    scout: { attack: 1, health: 3, defence: 0 },
    spearman: { attack: 3, health: 5, defence: 3 },
    archer: { attack: 4, health: 3, defence: 1 },
    infantry: { attack: 5, health: 10, defence: 5 },
    cavalry: { attack: 10, health: 20, defence: 8 },
    "siege-engine": { attack: 1, health: 10, defence: 0 },
    settler: { attack: 0, health: 4, defence: 0 },
    commander: { attack: 3, health: 12, defence: 0 },
};

/** At most this many passes through the ordered formations are fought before the defender holds. */
export const KINGDOM_BUILDER_COMBAT_ROUNDS = 6;
export const KINGDOM_BUILDER_TOWN_DEFENCE = 0.25;
export const KINGDOM_BUILDER_SIEGE_BREACH = 0.05;

/** What each side lost to one strike. */
export interface KingdomBuilderBattleRound {
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
}

export interface KingdomBuilderBattle {
    attackerWon: boolean;
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    /** Strikes in resolution order; the non-targeted side has no losses in that entry. */
    rounds: KingdomBuilderBattleRound[];
    defence: number;
}

export interface KingdomBuilderBattleGround {
    fortified: boolean;
}

export function defenceAgainst(attacker: Partial<KingdomBuilderGarrison>, ground: KingdomBuilderBattleGround): number {
    if (!ground.fortified) return 0;
    return Math.max(0, KINGDOM_BUILDER_TOWN_DEFENCE - KINGDOM_BUILDER_SIEGE_BREACH * (attacker["siege-engine"] ?? 0));
}

const EPSILON = 1e-9;
const noWounds = () => garrisonOf() as Record<KingdomBuilderUnitType, number>;
const TARGET_ORDER: readonly KingdomBuilderUnitType[] = [
    "spearman", "archer", "cavalry", "militia", "infantry", "scout", "commander", "siege-engine", "settler",
];

/** Spend a damage pool against whole units in priority order, carrying partial wounds between strikes. */
function takeTargetedLosses(
    stack: KingdomBuilderGarrison,
    wounds: Record<KingdomBuilderUnitType, number>,
    damage: number,
    preferred: KingdomBuilderUnitType,
    overflow: boolean,
    divisor: number,
): KingdomBuilderGarrison {
    const lost = garrisonOf();
    const targets = overflow ? [preferred, ...TARGET_ORDER.filter(unit => unit !== preferred)] : [preferred];
    let remaining = damage / divisor;
    for (const unitType of targets) {
        if (remaining <= EPSILON || stack[unitType] === 0) continue;
        const durability = KINGDOM_BUILDER_COMBAT_STATS[unitType].health + KINGDOM_BUILDER_COMBAT_STATS[unitType].defence;
        const available = remaining + wounds[unitType];
        const count = Math.min(stack[unitType], Math.floor(available / durability + EPSILON));
        lost[unitType] = count;
        const spent = count * durability;
        remaining = Math.max(0, available - spent);
        wounds[unitType] = count === stack[unitType] ? 0 : remaining;
        // Partial damage belongs to this formation and cannot overflow until a unit falls.
        if (count < stack[unitType]) remaining = 0;
    }
    return lost;
}

/**
 * Resolve one battle sequence: archers (defender first), horsemen (attacker
 * first, each charge intercepted by opposing spearmen), remaining spearmen,
 * militia, then infantry. Earlier casualties do not get a later strike.
 */
export function resolveBattle(attacker: Partial<KingdomBuilderGarrison>, defender: Partial<KingdomBuilderGarrison>, ground: KingdomBuilderBattleGround): KingdomBuilderBattle {
    let attacking = garrisonOf(attacker);
    let defending = garrisonOf(defender);
    const defence = defenceAgainst(attacking, ground);
    const attackerWounds = noWounds();
    const defenderWounds = noWounds();
    const rounds: KingdomBuilderBattleRound[] = [];

    const strike = (side: "attacker" | "defender", source: KingdomBuilderUnitType, target: KingdomBuilderUnitType, overflow: boolean) => {
        if (unitCount(attacking) === 0 || unitCount(defending) === 0) return;
        const from = side === "attacker" ? attacking : defending;
        const to = side === "attacker" ? defending : attacking;
        const count = from[source];
        if (count === 0) return;
        const losses = takeTargetedLosses(
            to,
            side === "attacker" ? defenderWounds : attackerWounds,
            count * KINGDOM_BUILDER_COMBAT_STATS[source].attack,
            target,
            overflow,
            side === "attacker" ? 1 + defence : 1,
        );
        if (unitCount(losses) === 0) return;
        if (side === "attacker") defending = subtractUnits(defending, losses);
        else attacking = subtractUnits(attacking, losses);
        rounds.push(side === "attacker"
            ? { attacker: garrisonOf(), defender: losses }
            : { attacker: losses, defender: garrisonOf() });
    };

    for (let pass = 0; pass < KINGDOM_BUILDER_COMBAT_ROUNDS && unitCount(attacking) > 0 && unitCount(defending) > 0; pass++) {
        strike("defender", "archer", "spearman", true);
        strike("attacker", "archer", "spearman", true);

        // Spearmen meet each charge before its damage is dealt, and their interception never overflows.
        strike("defender", "spearman", "cavalry", false);
        strike("attacker", "cavalry", "archer", true);
        strike("attacker", "spearman", "cavalry", false);
        strike("defender", "cavalry", "archer", true);

        strike("defender", "spearman", "spearman", false);
        strike("attacker", "spearman", "spearman", false);
        strike("defender", "militia", "militia", true);
        strike("attacker", "militia", "militia", true);
        strike("defender", "infantry", "infantry", true);
        strike("attacker", "infantry", "infantry", true);
    }

    return { attackerWon: unitCount(defending) === 0 && unitCount(attacking) > 0, attacker: attacking, defender: defending, rounds, defence };
}

/** Hands survivors back to contributing stacks, type by type and proportionally. */
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
