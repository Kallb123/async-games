import { User } from '@clerk/nextjs/server';

/** The two first-run lists this file reads and writes, by their
 *  `privateMetadata` key. A game guide and a game tutorial are each seen
 *  once per account, independently — see docs/game-tutorials.md §7. */
export type SeenListKey = 'seenGameGuides' | 'seenGameTutorials';

/**
 * Which games' guides (or tutorials — see `SeenListKey`) this account has
 * already had auto-shown, by url slug (see `src/utils/ui/gameGuides.ts` /
 * `gameTutorials.ts`). Stored in `privateMetadata` the same way
 * `notificationPreferences` is (see notificationPreferences.ts) — account-
 * wide rather than per browser, so the welcome doesn't repeat on a new device
 * and doesn't repeat on the next match either. Manually opening the guide (or
 * starting the tutorial) from the game-options menu never touches these
 * lists; only the auto-shown welcome does.
 */
export function getSeen(user: User, key: SeenListKey): string[] {
    const seen = user.privateMetadata?.[key];
    if (!Array.isArray(seen)) {
        return [];
    }
    return seen.filter((entry): entry is string => typeof entry === 'string');
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
