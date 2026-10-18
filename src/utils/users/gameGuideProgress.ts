import type { User } from '@clerk/nextjs/server';

/** The two first-run lists this file reads and writes, by their
 *  legacy `privateMetadata` key (and key inside `gameIntroProgress`).
 *  A game guide and a game tutorial are each seen
 *  once per account, independently — see docs/game-tutorials.md §7. */
export type SeenListKey = 'seenGameGuides' | 'seenGameTutorials';

/**
 * Which games' guides (or tutorials — see `SeenListKey`) this account has
 * already had auto-shown, by url slug (see `src/utils/ui/gameGuides.ts` /
 * `gameTutorials.ts`). Stored in `privateMetadata` the same way
 * `notificationPreferences` is (see notificationPreferences.ts) — account-
 * wide rather than per browser, so the welcome doesn't repeat on a new device
 * and doesn't repeat on the next match either. Manually opening the guide (or
 * starting the tutorial) from the game-options menu keeps the same progress.
 * Legacy arrays remain readable; new saves merge individual per-game flags
 * under `gameIntroProgress`, so concurrent dismissals cannot replace a list.
 */
export function getSeen(user: User, key: SeenListKey): string[] {
    const legacy = user.privateMetadata?.[key];
    const progress = user.privateMetadata?.gameIntroProgress;
    const marks = isRecord(progress) ? progress[key] : undefined;
    return [...new Set([
        ...(Array.isArray(legacy) ? legacy.filter((entry): entry is string => typeof entry === 'string') : []),
        ...(isRecord(marks) ? Object.keys(marks).filter(game => marks[game] === true) : []),
    ])];
}

/** Whether this account has already been auto-shown the given game's guide
 *  (or tutorial). */
export function hasSeen(user: User, key: SeenListKey, gameUrl: string): boolean {
    return getSeen(user, key).includes(gameUrl);
}

/** The `key` list with `gameUrl` added, if it wasn't already there. */
export function withSeen(user: User, key: SeenListKey, gameUrl: string): string[] {
    const current = getSeen(user, key);
    return current.includes(gameUrl) ? current : [...current, gameUrl];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
