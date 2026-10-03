// A player's character mastery, read from their Realm Arena results
// (docs/games/realm-arena.md §23.3). Nothing stores XP: each result keeps what
// every character did in that battle (`computeRealmArenaResultStats`), and a
// player's XP is the weights of mastery.ts applied to those rows summed here,
// so it can't fall out of step with the games behind it.
//
// Server-only: it reads the GameResult collection.

import { GameResultModel, RESULT_COUNTS_FILTER } from "@/utils/mongodb/GameResultData";
import { isCharacterId, type CharacterId } from "./characters";
import { rankOf, xpOf, type MasteryRecord, type MasterySnapshot } from "./mastery";

/** How long the lookup a battle is created with may run before the battle starts without it. */
export const SNAPSHOT_TIME_LIMIT_MS = 3000;

/** One player's record with one character, as the aggregation hands it back. */
interface MasteryGroup extends Omit<MasteryRecord, "battles"> {
    _id: { userId: string; character: string };
    battles: number;
}

/** Each character's record and XP, for one player. */
export type PlayerMastery = Partial<Record<CharacterId, MasteryRecord & { xp: number }>>;

/**
 * Each of `userIds`' records with each character they've fought with, by
 * userId: every battle that counts as played (the achievements' rule, win or
 * lose — §23.1) and counts for stats at all (no unclaimed guest at the table).
 * A player with no such battle is missing.
 *
 * One aggregation for the whole party. The { playerIds: 1, gameType: 1 }
 * index finds a player's Realm Arena results, so a long record in other games
 * costs nothing, and what comes back is at most one group per player and
 * character, however many battles there were. Each result is cut to its rows
 * before they're unwound.
 */
export async function masteryOf(userIds: readonly string[], options: { maxTimeMS?: number } = {}): Promise<Map<string, PlayerMastery>> {
    const byPlayer = new Map<string, PlayerMastery>();
    if (userIds.length === 0) return byPlayer;
    const players = [...userIds];
    const groups: MasteryGroup[] = await GameResultModel.aggregate([
        { $match: { playerIds: { $in: players }, gameType: "RealmArena", countsAsPlayed: { $ne: false }, ...RESULT_COUNTS_FILTER } },
        { $project: { _id: 0, row: "$stats.mastery" } },
        { $unwind: "$row" },
        { $match: { "row.userId": { $in: players } } },
        { $group: {
            _id: { userId: "$row.userId", character: "$row.character" },
            battles: { $sum: 1 },
            attacks: { $sum: "$row.attacks" },
            abilities: { $sum: "$row.abilities" },
            items: { $sum: "$row.items" },
        } },
    ], options);
    for (const { _id: { userId, character }, ...record } of groups) {
        // A character since taken out of the game earns nobody anything.
        if (!isCharacterId(character)) continue;
        const mastery = byPlayer.get(userId) ?? {};
        mastery[character] = { ...record, xp: xpOf(record) };
        byPlayer.set(userId, mastery);
    }
    return byPlayer;
}

/**
 * The ranks a battle is created with (§23.3): each player's rank with each
 * character, keeping only those above 0.
 *
 * If the results can't be read in time, the battle starts with nobody ranked
 * rather than not at all. It's the whole party's lookup, so everyone fights
 * with the starter characters alike, and ranks only ever unlock options, never
 * power (§23), so nobody is outgunned for it.
 */
export async function masterySnapshotOf(userIds: readonly string[]): Promise<MasterySnapshot> {
    let byPlayer: Map<string, PlayerMastery>;
    try {
        byPlayer = await masteryOf(userIds, { maxTimeMS: SNAPSHOT_TIME_LIMIT_MS });
    } catch (err) {
        console.error("Realm Arena: couldn't read mastery, so the battle starts with nobody ranked", err);
        return {};
    }
    const snapshot: MasterySnapshot = {};
    for (const [userId, mastery] of byPlayer) {
        const ranks = Object.fromEntries(Object.entries(mastery)
            .map(([character, record]) => [character, rankOf(record.xp)] as const)
            .filter(([, rank]) => rank > 0));
        if (Object.keys(ranks).length > 0) snapshot[userId] = ranks;
    }
    return snapshot;
}
