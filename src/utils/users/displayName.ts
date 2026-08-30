// The rules a display name has to clear, in the one place everything that
// asks can read them — the sibling of `username.ts`, which does the same for
// the handle. A display name is text a real player sees, so this is a floor
// on length and character set, not moderation
// (docs/account-less-play.md §8). Callers pass an already-trimmed name;
// whitespace-only input reads as too short.
//
// It started life beside the guest join flow, because a guest was the only
// person who got to type one. Display names (docs/dynamic-names.md §5) made
// it every player's rule, and a rule named for guests is how somebody ends up
// writing a second one for everybody else.
export const MIN_DISPLAY_NAME_LENGTH = 1;
export const MAX_DISPLAY_NAME_LENGTH = 20;

// Letters (any script), digits, spaces and the handful of marks real names
// actually use — nothing that reads as markup or control text. Brackets are in
// the set because the lobby mints names containing them: `uniqueGuestName`
// suffixes a second "Dave" at a table to "Dave (2)", and a guest must be able
// to save the name they are already playing under.
const VALID_DISPLAY_NAME = /^[\p{L}\p{N} '.()-]+$/u;

// ...and at least one of those characters has to be a letter or a digit, so a
// name can't be made entirely of punctuation and render as very nearly nothing.
const HAS_A_CHARACTER = /[\p{L}\p{N}]/u;

/** What a display name may be, as a sentence to show someone who typed otherwise. */
export const DISPLAY_NAME_RULE = `Up to ${MAX_DISPLAY_NAME_LENGTH} characters, using letters, numbers, spaces and ordinary name punctuation.`;

export function isValidDisplayName(name: string): boolean {
    return name.length >= MIN_DISPLAY_NAME_LENGTH
        && name.length <= MAX_DISPLAY_NAME_LENGTH
        && VALID_DISPLAY_NAME.test(name)
        && HAS_A_CHARACTER.test(name);
}
