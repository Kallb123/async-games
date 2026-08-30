import { User } from '@clerk/nextjs/server';

/**
 * Which games' guides this account has already had auto-shown, by url slug
 * (see `src/utils/ui/gameGuides.ts`). Stored in `privateMetadata` the same
 * way `notificationPreferences` is (see notificationPreferences.ts) — account-
 * wide rather than per browser, so the welcome doesn't repeat on a new device
 * and doesn't repeat on the next match either. Manually opening the guide from
 * the game-options menu never touches this list; only the auto-shown welcome
 * does.
 */
export function getSeenGameGuides(user: User): string[] {
    const seen = user.privateMetadata?.seenGameGuides;
    if (!Array.isArray(seen)) {
        return [];
    }
    return seen.filter((entry): entry is string => typeof entry === 'string');
}

/** Whether this account has already been auto-shown the given game's guide. */
export function hasSeenGameGuide(user: User, gameUrl: string): boolean {
    return getSeenGameGuides(user).includes(gameUrl);
}

/** The seen list with `gameUrl` added, if it wasn't already there. */
export function withGameGuideSeen(user: User, gameUrl: string): string[] {
    const current = getSeenGameGuides(user);
    return current.includes(gameUrl) ? current : [...current, gameUrl];
}
