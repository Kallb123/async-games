// A player's character mastery, read from their Realm Arena results
// (docs/games/realm-arena.md §23.3). Nothing stores XP: each result keeps what
// every character did in that battle (`computeRealmArenaResultStats`), and a
// player's XP is the weights of mastery.ts applied to those rows summed here,
// so it can't fall out of step with the games behind it.
//
// Server-only: it reads the GameResult collection.

import { GameResultModel, RESULT_COUNTS_FILTER } from "@/utils/mongodb/GameResultData";
import { withTimeout } from "@/utils/withTimeout";
import { isCharacterId, type CharacterId } from "./characters";
import { rankOf, xpOf, type MasteryRecord, type MasterySnapshot } from "./mastery";

/** How long the lookup a battle is created with may run on the database before the battle starts without it. */
export const SNAPSHOT_TIME_LIMIT_MS = 3000;

/**
 * How long the battle's creation waits for it: the server-side limit and a
 * little over, for a driver that never gets as far as the server (a failover,
 * a stalled socket), where `maxTimeMS` can't fire.
 */
export const SNAPSHOT_WAIT_MS = SNAPSHOT_TIME_LIMIT_MS + 500;

/** One player's record with one character, as the aggregation hands it back. */
type MasteryGroup = MasteryRecord & { _id: { userId: string; character: string } };

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
 * character, however many battles there were. Each result is cut to the
 * party's own rows before they're unwound, so an opponent's are never
 * exploded only to be thrown away.
 */
export async function masteryOf(userIds: readonly string[], options: { maxTimeMS?: number } = {}): Promise<Map<string, PlayerMastery>> {
    const byPlayer = new Map<string, PlayerMastery>();
    if (userIds.length === 0) return byPlayer;
    const players = [...userIds];
    const groups: MasteryGroup[] = await GameResultModel.aggregate([
        { $match: { playerIds: { $in: players }, gameType: "RealmArena", countsAsPlayed: { $ne: false }, ...RESULT_COUNTS_FILTER } },
        { $project: { _id: 0, row: { $filter: { input: "$stats.mastery", cond: { $in: ["$$this.userId", players] } } } } },
        { $unwind: "$row" },
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
 * rather than not at all, which `withTimeout` logs. It's the whole party's
 * lookup, so everyone fights with the starter characters alike, and ranks only
 * ever unlock options, never power (§23), so nobody is outgunned for it.
 */
export async function masterySnapshotOf(userIds: readonly string[]): Promise<MasterySnapshot> {
    const byPlayer = await withTimeout(
        () => masteryOf(userIds, { maxTimeMS: SNAPSHOT_TIME_LIMIT_MS }),
        SNAPSHOT_WAIT_MS,
        new Map<string, PlayerMastery>(),
        "Realm Arena: reading mastery for a new battle",
    );
    const snapshot: MasterySnapshot = {};
    for (const [userId, mastery] of byPlayer) {
        for (const [character, record] of Object.entries(mastery) as [CharacterId, { xp: number }][]) {
            const rank = rankOf(record.xp);
            if (rank > 0) snapshot[userId] = { ...snapshot[userId], [character]: rank };
        }
    }
    return snapshot;
}
