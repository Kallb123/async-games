// The rules a Clerk handle has to clear, in the one place both sides of the
// app can read them. The server derives a handle for a claiming guest
// (clerk.ts's availableUsernameFrom) and the profile screen lets a player type
// their own — same rules, so they are stated once rather than once each.
//
// Clerk is still the authority: it enforces uniqueness and its own attribute
// settings on the write itself. These are here so a player gets told what a
// handle may contain while they are typing it, instead of after a round trip.
export const MIN_USERNAME_LENGTH = 4;
export const MAX_USERNAME_LENGTH = 64;

// Letters, digits, underscore and hyphen — Clerk's charset. Deliberately
// wider than what `slugifyUsername` below produces (which joins on `_`), so a
// player already holding a hyphenated handle can edit it rather than being
// told the name they have is invalid.
const VALID_USERNAME = /^[a-zA-Z0-9_-]+$/;

/** What a handle may be, as a sentence to show someone who typed otherwise. */
export const USERNAME_RULE = `Usernames are ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} characters, using letters, numbers, underscores and hyphens.`;

export function isValidUsername(username: string): boolean {
    return username.length >= MIN_USERNAME_LENGTH
        && username.length <= MAX_USERNAME_LENGTH
        && VALID_USERNAME.test(username);
}

// A name a player typed can be anything, so a handle derived from one is
// slugged to Clerk's charset before it can be offered as one. Padding to the
// minimum length is the caller's job (see availableUsernameFrom), since only
// it knows what to pad with.
export function slugifyUsername(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, MAX_USERNAME_LENGTH);
}
