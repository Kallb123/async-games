// What an achievement is, who owns the catalogue, and the pure helpers that read
// a player's record against it. The design is docs/achievements.md; §3 is this
// file.
//
// It lives beside recap.ts rather than with the guide and tutorial registries in
// src/utils/ui/ because part of an achievement is a rule the server runs, and
// that folder is for presentation. It follows recap.ts's idiom all the same: a
// cross-game registry with one import and one line per game.
//
// **This file ships to the browser.** The profile draws a locked row's
// "3 / 5" by running the very `progress` function the server unlocks on, so the
// catalogue is bundled into the client. Every import from GameResultData below
// is therefore `import type`: that module pulls Mongoose in at runtime, and one
// plain import here would put the database driver in every player's bundle while
// building, typechecking and passing every other test. achievements.test.ts
// walks the runtime import graph from this file to keep it that way — and a
// game's achievements.ts, which this file imports, is held to the same rule.

import type { IGameStats, MatchOutcome } from "@/utils/mongodb/GameResultData";
import { achievements as diceCitiesAchievements } from "@/games/DiceCities/achievements";
import { achievements as settlementsAndCitiesAchievements } from "@/games/SettlementsAndCities/achievements";

// ─── The shape of one achievement ────────────────────────────────────────────

/** What every achievement has, whoever owns it. */
interface AchievementBase {
    /**
     * Stable for ever: it is stored on every unlock. `<game slug>.<name>` for a
     * game's own, `platform.<name>` for the cross-game ones. Never change or
     * reuse one (docs/achievements.md §11): a reused id hands the new
     * achievement to everyone who earned the old one.
     */
    id: string;
    /** Short enough to fit in a row: "Mine Baron". */
    title: string;
    /**
     * One emoji. Always required: it is the icon until a drawn one exists, the
     * fallback if that fails to load, and the icon's text form in push copy.
     */
    icon: string;
    /**
     * A drawn icon, as a path under /art/achievements/, shown wherever the icon
     * is, in place of the emoji. Optional; nothing else changes when one is
     * added (§7.2).
     */
    art?: string;
    /** The requirement, in the player's words: "Own all six Mines at the end of a turn." */
    description: string;
    /**
     * Push the earner when this unlocks mid-game. The toast celebrates every
     * unlock either way; this is for the ones worth buzzing a phone over.
     * Only meaningful on an `at: 'turnEnd'` achievement (§12, test 1).
     */
    notify?: boolean;
}

/** One of a game's own: judged on that game's state, or on the player's record at that game. */
export interface GameAchievement<R> extends AchievementBase {
    criteria: MatchCriteria<R> | CareerCriteria<GameRecord>;
}

/** One of the platform's: judged on the player's record across every game. */
export interface PlatformAchievement extends AchievementBase {
    criteria: CareerCriteria<CareerRecord>;
}

// `any`, because a catalogue holds games whose response types differ and only
// the game's own file knows which; the check is typed against that response
// where it is written, and nothing generic ever reads a view.
export type Achievement = GameAchievement<any> | PlatformAchievement;

// ─── Career criteria: decided by the player's record ─────────────────────────

/** A player's record at one game: its counted games, after this one (§8). */
export interface GameRecord {
    played: number;
    won: number;
}

/** A player's record across every game. */
export interface CareerRecord extends GameRecord {
    /** Keyed by GAME_META slug. */
    games: Record<string, GameRecord>;
}

export interface CareerCriteria<Rec> {
    kind: "career";
    /** How far along the record is. Unlocked once this reaches `target`. */
    progress: (record: Rec) => number;
    target: number;
}

// ─── Match criteria: decided by the game's state ─────────────────────────────

export type MatchCriteria<R> =
    /** Checked at the end of every turn, and once more on the finished game. */
    | { kind: "match"; at: "turnEnd"; check: (view: R, seat: Seat) => boolean }
    /** Checked once, when the rules end the game: for anything that needs the result. */
    | { kind: "match"; at: "end"; check: (view: R, seat: FinishedSeat) => boolean };

export interface Seat {
    userId: string;
}

export interface FinishedSeat extends Seat {
    /** From outcomeFor: the same answer the player's profile gives. */
    outcome: MatchOutcome;
    /** How long the game ran: turns, or moves for a solo game (gameLength). */
    turns: number;
}

// ─── The registry ────────────────────────────────────────────────────────────

// One import per game with achievements, and one line in GAME_ACHIEVEMENTS.
// gameRegistry.test.ts fails when a game ships an achievements.ts that isn't
// listed here, so the two can't drift apart.

/** Keyed by GAME_META slug. A game with no achievements.ts has no entry. */
export const GAME_ACHIEVEMENTS: Record<string, GameAchievement<any>[]> = {
    dicecities: diceCitiesAchievements,
    settlementsandcities: settlementsAndCitiesAchievements,
};

/** The cross-game ones. Owned by the platform, not by any game. Career only, by type. */
export const PLATFORM_ACHIEVEMENTS: PlatformAchievement[] = [
    {
        id: "platform.first-win",
        title: "First win",
        icon: "🏆",
        description: "Win a game.",
        criteria: { kind: "career", progress: career => career.won, target: 1 },
    },
    {
        id: "platform.regular",
        title: "Regular",
        icon: "🎲",
        description: "Play 25 games.",
        criteria: { kind: "career", progress: career => career.played, target: 25 },
    },
    {
        id: "platform.explorer",
        title: "Explorer",
        icon: "🧭",
        description: "Play 5 different games.",
        criteria: {
            kind: "career",
            progress: career => Object.values(career.games).filter(game => game.played > 0).length,
            target: 5,
        },
    },
];

/**
 * Both registries, as one value. Every helper below that reads the catalogue
 * takes it as an optional last parameter and defaults to this one: the real
 * catalogue starts out empty, and a helper that can only be called against an
 * empty catalogue can only be tested against nothing.
 */
export interface AchievementCatalogue {
    games: Record<string, GameAchievement<any>[]>;
    platform: PlatformAchievement[];
}

export const ACHIEVEMENT_CATALOGUE: AchievementCatalogue = {
    games: GAME_ACHIEVEMENTS,
    platform: PLATFORM_ACHIEVEMENTS,
};

function everyAchievement(catalogue: AchievementCatalogue): Achievement[] {
    return [...Object.values(catalogue.games).flat(), ...catalogue.platform];
}

/**
 * The achievement with this id, or undefined. Never throws, the same as
 * `themeIdFor` (docs/game-themes.md §4): a stored id the catalogue no longer
 * knows is a withdrawn achievement, not an error, and the reader drops it.
 */
export function achievementById(
    id: string,
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Achievement | undefined {
    return everyAchievement(catalogue).find(achievement => achievement.id === id);
}

/**
 * How long an unlock stays news: a week (docs/achievements.md §7.3). The toaster
 * celebrates an unlock only while it is younger than this, and the recent feed it
 * reads (`GET /api/achievements/recent`) goes back exactly this far, so the two
 * agree about what is still worth a toast.
 */
export const ACHIEVEMENT_NEWS_MS = 7 * 24 * 60 * 60 * 1000;

// ─── The player's record ─────────────────────────────────────────────────────

/**
 * What one game's stats row counts for an achievement.
 *
 * `played` is `IGameStats.played`, not the `total` the profile shows: a
 * surrender or an abandonment that lasted under two turns is in `total` but not
 * in `played` (§8). So an achievement's progress can sit a game or two behind the
 * profile's match count, because it skips the games somebody ended almost as
 * soon as they began.
 *
 * `won` is `wins` as it stands. `byGame` is already folded through `outcomeFor`,
 * so a co-op team win counts and a dropped player's game doesn't, and that rule
 * isn't written out a second time here.
 */
function recordOf(stats: IGameStats): GameRecord {
    return { played: stats.played, won: stats.wins };
}

/**
 * Both records a criterion can be handed, from the `byGame` the server and the
 * client already have: the career across every game, and each game's own under
 * `games`. One function builds them for both, so the profile's "3 / 5" and the
 * server's unlock are the same number.
 *
 * Pure. A game the player has never played has no entry in `games`; read it
 * through `gameRecord` rather than indexing in.
 */
export function careerRecord(byGame: IGameStats[]): CareerRecord {
    const games = new Map<string, GameRecord>();
    for (const stats of byGame) {
        const { played, won } = recordOf(stats);
        const record = games.get(stats.url) ?? { played: 0, won: 0 };
        // Summed rather than assigned, so a url that somehow appeared twice
        // can't leave the top level and `games` disagreeing about a game.
        games.set(stats.url, { played: record.played + played, won: record.won + won });
    }
    const records = [...games.values()];
    return {
        played: records.reduce((sum, record) => sum + record.played, 0),
        won: records.reduce((sum, record) => sum + record.won, 0),
        // fromEntries, not an index assignment: a key is never special to it.
        games: Object.fromEntries(games),
    };
}

/**
 * The player's record at one game: what a game's own career achievement is
 * judged on. Zeroes for a game they have never played, so a `progress` never
 * has to guard for the entry being missing.
 */
export function gameRecord(career: CareerRecord, slug: string): GameRecord {
    return career.games[slug] ?? { played: 0, won: 0 };
}

// ─── Career achievements ─────────────────────────────────────────────────────

/**
 * Whether `record` has reached this criterion's target.
 *
 * A `progress` function that throws is treated as not met, with a warning that
 * names it (§10). This runs on the profile as well as on the server, so it
 * mustn't throw out: one broken achievement costs only itself, not every other
 * row on the page and not the game-over pass behind it. `NaN` isn't met either,
 * because every comparison with it is false.
 */
function isMet<Rec>(achievement: Achievement, criteria: CareerCriteria<Rec>, record: Rec): boolean {
    try {
        return criteria.progress(record) >= criteria.target;
    } catch (error) {
        console.warn(`Achievement ${achievement.id}: progress threw; counting it as not met.`, error);
        return false;
    }
}

/**
 * Every career achievement in the catalogue that `career` already meets: each
 * game's own, judged on that game's record, and the platform's, judged on the
 * whole. A match achievement is never in the answer, because a record can't
 * decide one.
 */
export function careerMet(
    career: CareerRecord,
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Achievement[] {
    const met: Achievement[] = [];
    for (const [slug, achievements] of Object.entries(catalogue.games)) {
        const record = gameRecord(career, slug);
        for (const achievement of achievements) {
            const { criteria } = achievement;
            if (criteria.kind === "career" && isMet(achievement, criteria, record)) met.push(achievement);
        }
    }
    for (const achievement of catalogue.platform) {
        if (isMet(achievement, achievement.criteria, career)) met.push(achievement);
    }
    return met;
}

/**
 * The record as it stood before one game that has just finished: one off
 * `played` if that game counted as played, one off `won` if it was a win, at
 * the top level and under `games[slug]`. Never below zero, and the input is left
 * alone.
 *
 * It exists to tell an unlock this game *tipped* from one it merely
 * *backfilled* (§4.3): an achievement that's met now but not met on this record
 * was earned by this game. It edits the record rather than asking each
 * achievement, so it works for any `progress` function, including ones nobody
 * has written yet.
 */
export function withoutThisGame(
    career: CareerRecord,
    slug: string,
    thisGame: { played: boolean; won: boolean },
): CareerRecord {
    const take = (record: GameRecord): GameRecord => ({
        played: Math.max(0, record.played - (thisGame.played ? 1 : 0)),
        won: Math.max(0, record.won - (thisGame.won ? 1 : 0)),
    });
    return {
        ...take(career),
        // A game with no entry has nothing to take back out of, so it stays
        // without one rather than growing an entry of zeroes.
        games: Object.hasOwn(career.games, slug)
            ? { ...career.games, [slug]: take(career.games[slug]) }
            : career.games,
    };
}

/**
 * Everything a player has unlocked: the ids stored for them that the catalogue
 * still knows, and every career achievement their `byGame` already meets (§5.3).
 * The second half is what makes a veteran's first look at the feature show what
 * they have earned, with nothing stored and nothing backfilled first.
 *
 * A stored id the catalogue doesn't know is dropped quietly, never an error: it
 * is an achievement that has since been withdrawn (§3.5).
 */
export function unlockedIds(
    stored: string[],
    byGame: IGameStats[],
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Set<string> {
    const known = new Set(everyAchievement(catalogue).map(achievement => achievement.id));
    const ids = new Set(stored.filter(id => known.has(id)));
    for (const { id } of careerMet(careerRecord(byGame), catalogue)) ids.add(id);
    return ids;
}
