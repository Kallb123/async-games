// Achievements built for a test: one line each, so a test reads as the rule it
// is exercising and not the shape of the object around it. The judge takes its
// catalogue as a parameter (awardAchievements.test.ts), and the routes reach it
// through a test catalogue the test fills (gameRoutes.test.ts); both build what
// goes in it here, and so is the row one of them leaves in the store.
//
// Types only from achievements.ts, so this can be imported above or below a
// `vi.mock` of that module without pulling the catalogue in early.
//
// Test-only: test files import it, in src/utils and src/app alike; app code never does.

import { expect } from 'vitest';
import type { CareerRecord, FinishedSeat, GameAchievement, GameRecord, PlatformAchievement, Seat } from '@/utils/games/achievements';

/** What every test achievement shares: its id is also its title and its description. */
const named = (id: string, icon: string) => ({ id, title: id, icon, description: id });

/** A game's own match achievement, checked at the end of every turn. */
export const turnEnd = (id: string, check: (view: any, seat: Seat) => boolean): GameAchievement<any> =>
    ({ ...named(id, '🎲'), criteria: { kind: 'match', at: 'turnEnd', check } });

/** A game's own match achievement, checked once when the rules end the game. */
export const ending = (id: string, check: (view: any, seat: FinishedSeat) => boolean): GameAchievement<any> =>
    ({ ...named(id, '🎲'), criteria: { kind: 'match', at: 'end', check } });

/** A game's own career achievement, judged on the player's record at that game. */
export const ownCareer = (id: string, progress: (record: GameRecord) => number, target: number): GameAchievement<any> =>
    ({ ...named(id, '🎲'), criteria: { kind: 'career', progress, target } });

/** One of the platform's, judged on the player's record across every game. */
export const platform = (id: string, progress: (record: CareerRecord) => number, target: number): PlatformAchievement =>
    ({ ...named(id, '🏆'), criteria: { kind: 'career', progress, target } });

/**
 * An unlock as the collection holds it, for an `expect(...).toEqual`: the game
 * that earned it (`earnedIn`), or none for a backfilled career unlock, which is
 * stored without one. `unlockedAt` is the judge's own clock, so any string will do.
 */
export const unlockRow = (userId: string, achievementId: string, earnedIn?: { gameId: string, url: string }) =>
    ({ userId, achievementId, ...earnedIn, unlockedAt: expect.any(String) });
