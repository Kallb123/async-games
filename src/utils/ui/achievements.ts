// What the screens that list achievements show: pure, over the catalogue and
// the ids the server sends (docs/achievements.md §7.5). Title, icon and
// description never go over the wire; they are looked up here, so the copy has
// one home and a stored id the catalogue no longer knows is quietly dropped.

import {
    ACHIEVEMENT_CATALOGUE,
    ACHIEVEMENT_NEWS_MS,
    achievementById,
    careerRecord,
    gameRecord,
    unlockedIds,
} from "@/utils/games/achievements";
import type { Achievement, AchievementCatalogue, CareerCriteria } from "@/utils/games/achievements";
import type { IGameStats } from "@/utils/mongodb/GameResultData";
import type { IAchievementUnlock, IGameAchievementUnlock } from "@/utils/mongodb/AchievementUnlockData";
import { GAME_META } from "./games";

/** One achievement as a profile lists it. */
export interface ProfileAchievementRow {
    achievement: Achievement;
    unlocked: boolean;
    /** When it was stored. Absent for one that is met but not yet stored (§5.3). */
    unlockedAt?: string;
    /** The results page of the game that earned it, where there is one to land on. */
    href?: string;
    /** "3 / 5", for a career achievement still locked. */
    progress?: string;
}

/** One heading's worth of rows: the platform's, or one game's. */
export interface ProfileAchievementGroup {
    /** "platform", or the game's GAME_META slug. */
    key: string;
    label: string;
    rows: ProfileAchievementRow[];
}

export interface ProfileAchievements {
    /** How many the player has unlocked, out of `total`. */
    unlocked: number;
    total: number;
    /** The platform's first, then one per game the player has played, most-played first. */
    groups: ProfileAchievementGroup[];
    /** The games they haven't played, in catalogue order: folded away on the profile. */
    unplayed: ProfileAchievementGroup[];
}

/** The results page a finished game's unlock links back to. */
export const resultHref = (gameId: string) => `/games/result/${gameId}`;

/**
 * "3 / 5": how far a record has got toward a career target, never past it.
 * A `progress` that throws shows nothing, the same way it counts as not met.
 */
function progressOf<Rec>(criteria: CareerCriteria<Rec>, record: Rec): string | undefined {
    try {
        const reached = Math.floor(criteria.progress(record));
        if (!Number.isFinite(reached)) return undefined;
        return `${Math.max(0, Math.min(reached, criteria.target))} / ${criteria.target}`;
    } catch {
        return undefined;
    }
}

/**
 * Every achievement, grouped for a profile: the platform's first, then each game
 * the player has played, then (folded) the games they haven't. Unlocked means
 * stored, or a career achievement their record already meets (`unlockedIds`,
 * §5.3); a locked career row carries its progress, worked out by the very
 * `progress` function the server unlocks on, so the two can't disagree.
 *
 * A row links to the results page of the game that earned it only once that
 * page exists (`hasResult`): a game still in play has none yet, and a backfilled
 * unlock has no game at all.
 */
export function profileAchievements(
    unlocks: IAchievementUnlock[],
    byGame: IGameStats[],
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): ProfileAchievements {
    const unlockedSet = unlockedIds(unlocks.map(unlock => unlock.id), byGame, catalogue);
    const stored = new Map(unlocks.map(unlock => [unlock.id, unlock]));
    const career = careerRecord(byGame);

    const rowOf = <Rec>(achievement: Achievement, record: Rec): ProfileAchievementRow => {
        const unlock = stored.get(achievement.id);
        if (unlockedSet.has(achievement.id)) {
            return {
                achievement,
                unlocked: true,
                ...(unlock && { unlockedAt: unlock.unlockedAt }),
                ...(unlock?.gameId && unlock.hasResult && { href: resultHref(unlock.gameId) }),
            };
        }
        const { criteria } = achievement;
        const progress = criteria.kind === "career" ? progressOf(criteria as CareerCriteria<Rec>, record) : undefined;
        return { achievement, unlocked: false, ...(progress && { progress }) };
    };

    const platform: ProfileAchievementGroup = {
        key: "platform",
        label: "Achievements",
        rows: catalogue.platform.map(achievement => rowOf(achievement, career)),
    };
    const gameGroup = (slug: string): ProfileAchievementGroup => ({
        key: slug,
        label: GAME_META[slug]?.name ?? slug,
        rows: catalogue.games[slug].map(achievement => rowOf(achievement, gameRecord(career, slug))),
    });

    // byGame is most-played first, which is the order their groups take.
    const playedSlugs = byGame.map(stats => stats.url).filter(slug => Object.hasOwn(catalogue.games, slug));
    const played = new Set(playedSlugs);
    const groups = [platform, ...[...new Set(playedSlugs)].map(gameGroup)].filter(group => group.rows.length > 0);
    const unplayed = Object.keys(catalogue.games).filter(slug => !played.has(slug)).map(gameGroup)
        .filter(group => group.rows.length > 0);

    const rows = [...groups, ...unplayed].flatMap(group => group.rows);
    return { unlocked: rows.filter(row => row.unlocked).length, total: rows.length, groups, unplayed };
}

/** One unlock on a results page, with the achievement it names. */
export interface GameAchievementRow {
    userId: string;
    achievement: Achievement;
    unlockedAt: string;
}

/**
 * What a finished game unlocked, grouped by player in seat order — the order
 * the stats table above it uses — and within a player in the order they were
 * earned. An id the catalogue no longer knows is dropped.
 */
export function gameAchievementRows(
    unlocks: IGameAchievementUnlock[],
    playerIds: string[],
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): GameAchievementRow[] {
    const seat = (userId: string) => {
        const index = playerIds.indexOf(userId);
        return index === -1 ? playerIds.length : index;
    };
    return unlocks
        .flatMap(unlock => {
            const achievement = achievementById(unlock.id, catalogue);
            return achievement ? [{ userId: unlock.userId, achievement, unlockedAt: unlock.unlockedAt }] : [];
        })
        .sort((a, b) => seat(a.userId) - seat(b.userId) || a.unlockedAt.localeCompare(b.unlockedAt));
}

// ─── What the toaster celebrates ─────────────────────────────────────────────

/** An unlock a screen hands the toaster: which, when, and the game that earned it. */
export interface OfferedUnlock {
    id: string;
    unlockedAt: string;
    gameId?: string;
}

/**
 * What this browser has already celebrated: `gameId:achievementId` → when that
 * unlock happened. The time is kept so the list can be pruned by the same
 * one-week age that decides what's news, which bounds it without ever evicting
 * something still worth a toast.
 */
export type CelebratedUnlocks = Record<string, string>;

/** What `celebrate` decides: the unlocks to toast now, and the memory to keep. */
export interface Celebration {
    fresh: { key: string, achievement: Achievement }[];
    celebrated: CelebratedUnlocks;
}

/**
 * Which of `offered` to toast, given what this browser has celebrated before
 * (docs/achievements.md §7.3): each unlock once, and only while it's news.
 *
 * - Only an unlock a game earned. A backfilled career unlock (no `gameId`) was
 *   already true before this game, and isn't this game's to announce (§4.3).
 * - Only one younger than `ACHIEVEMENT_NEWS_MS`, so a new device, cleared
 *   storage or a private window celebrates at most the last week, not a whole
 *   history.
 * - Only one the catalogue knows: a withdrawn achievement has nothing to say.
 * - Never twice: not one already remembered, and not one offered twice at once
 *   (the board and the feed can both hand over the same unlock).
 *
 * The memory it hands back is pruned of anything older than the window, with
 * the fresh ones added. Pure: the toaster passes the clock in.
 */
export function celebrate(
    offered: readonly OfferedUnlock[],
    celebrated: CelebratedUnlocks,
    now: number,
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Celebration {
    const isNews = (unlockedAt: string) => now - Date.parse(unlockedAt) < ACHIEVEMENT_NEWS_MS;
    const kept: CelebratedUnlocks = Object.fromEntries(Object.entries(celebrated).filter(([, unlockedAt]) => isNews(unlockedAt)));
    const fresh: Celebration["fresh"] = [];
    for (const { id, unlockedAt, gameId } of offered) {
        const key = `${gameId}:${id}`;
        const achievement = achievementById(id, catalogue);
        if (!gameId || !achievement || !isNews(unlockedAt) || Object.hasOwn(kept, key)) continue;
        kept[key] = unlockedAt;
        fresh.push({ key, achievement });
    }
    return { fresh, celebrated: kept };
}

/** The toaster's memory as stored: anything that isn't a map of strings reads as nothing celebrated yet. */
export function parseCelebrated(stored: string | null): CelebratedUnlocks {
    try {
        const parsed: unknown = stored === null ? {} : JSON.parse(stored);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch {
        return {};
    }
}
