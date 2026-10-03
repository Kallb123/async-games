// Character mastery (docs/games/realm-arena.md §23): experience earned per
// player and per character by what that character does in a battle, and the
// ranks it reaches. The weights and thresholds are data — retuning one is an
// edit here, and reprices every player's history at once, since nothing stores
// XP: it's worked out from the counts each battle's result keeps (§23.3).
//
// Pure, with no server-only imports, so the muster screen and the profile read
// the same table the server does.

import type { CharacterId } from "./characters";

/**
 * What one character — or every one of a kind in a squad, pooled — did in a
 * battle that earns XP (§23.1): each attack (reactions included), each
 * ability and each item used. Moving, hunkering down and going on watch earn
 * nothing, so aren't counted.
 */
export interface Tally {
    attacks: number;
    abilities: number;
    items: number;
}

export const NO_TALLY: Readonly<Tally> = { attacks: 0, abilities: 0, items: 0 };

/** Two tallies summed: the one place that lists the counts (masteryRecord.ts's `$group` sums the same three). */
export function addTally(a: Readonly<Tally>, b: Readonly<Tally>): Tally {
    return { attacks: a.attacks + b.attacks, abilities: a.abilities + b.abilities, items: a.items + b.items };
}

/** A character's record across every battle that counts: how many it fought in, and its tallies summed. */
export interface MasteryRecord extends Tally {
    battles: number;
}

/**
 * XP for each thing a character did (§23.1): a little for being there, more
 * for each attack and item, most for each ability. The same whatever it
 * rolled, and nothing for winning.
 */
export const XP_WEIGHTS = { battle: 2, attack: 3, ability: 5, item: 3 } as const;

/** The XP each rank is reached at, rank 1 first (§23.1). */
export const RANK_XP = [60, 180, 450] as const;

/** 0 is the starter character of §13.6, with nothing unlocked. */
export type Rank = 0 | 1 | 2 | 3;

export function xpOf({ battles, attacks, abilities, items }: MasteryRecord): number {
    return battles * XP_WEIGHTS.battle + attacks * XP_WEIGHTS.attack + abilities * XP_WEIGHTS.ability + items * XP_WEIGHTS.item;
}

export function rankOf(xp: number): Rank {
    return RANK_XP.filter(threshold => xp >= threshold).length as Rank;
}

/**
 * Each player's rank with each character, taken as a battle is created
 * (§23.3) and fixed for the whole of it, so a rank reached mid-battle changes
 * nothing and a replay reads a muster the way it was checked. By userId, then
 * character; a character missing, or a player missing, is rank 0. The options
 * a rank unlocks are data keyed by rank, and an option once given a rank keeps
 * it, so the ranks are all a battle needs to keep.
 */
export type MasterySnapshot = Record<string, Partial<Record<CharacterId, Rank>>>;
