// A guest-typed display name is text a real player sees, so this is the one
// floor it has to clear before a lobby seat can be claimed under it — length
// and character set, not moderation (docs/account-less-play.md §8). Callers
// pass an already-trimmed name; whitespace-only input reads as too short.
export const MIN_GUEST_NAME_LENGTH = 1;
export const MAX_GUEST_NAME_LENGTH = 20;

// Letters (any script), digits, spaces and the handful of marks real names
// actually use — nothing that reads as markup or control text.
const VALID_GUEST_NAME = /^[\p{L}\p{N} '.-]+$/u;

export function isValidGuestName(name: string): boolean {
    return name.length >= MIN_GUEST_NAME_LENGTH
        && name.length <= MAX_GUEST_NAME_LENGTH
        && VALID_GUEST_NAME.test(name);
}

// "Dave" -> "Dave", or "Dave (2)", "Dave (3)"... against names already
// seated at the lobby: display names aren't unique the way Clerk usernames
// are (docs/account-less-play.md §5), and two guests both typing "Dave"
// would otherwise be indistinguishable in the same seat list.
export function uniqueGuestName(name: string, takenNames: string[]): string {
    const taken = new Set(takenNames);
    if (!taken.has(name)) {
        return name;
    }
    let suffix = 2;
    while (taken.has(`${name} (${suffix})`)) {
        suffix++;
    }
    return `${name} (${suffix})`;
}
