// Shared chat validation — the one module the composer and the POST route both
// import, so the client's limit and the server's gate cannot drift apart. It
// mirrors src/utils/reactions.ts, which does the same job for the recap
// reactions. See docs/in-game-chat.md §4 (messages) and §13.4 (the read
// marker).

export const MAX_MESSAGE_LENGTH = 500;

/**
 * The message as it will be stored, or `null` if it isn't a message.
 *
 * Trims, rejects a non-string, rejects empty, rejects anything over
 * MAX_MESSAGE_LENGTH after trimming, and collapses runs of blank lines so one
 * message can't be a screenful. This is input validation, not moderation: the
 * text itself is never inspected.
 */
export function normaliseMessage(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
        return null;
    }

    // Collapse a run of blank lines (each possibly holding only whitespace) down
    // to a single blank line, so a wall of empty lines can't stretch one message
    // over a screenful. A single line break inside the message is left alone.
    return trimmed.replace(/(?:[ \t]*\n){2,}/g, '\n\n');
}

/**
 * The read marker as it will be stored, or `null` if it isn't one.
 *
 * Rejects a non-string and anything that doesn't parse as a date, then
 * canonicalises to ISO — the marker route applies it with `$max`, which on an
 * ISO string is a lexical comparison, so a value that parsed but wasn't
 * already in that format would compare wrong against the messages it is
 * meant to catch up to. See docs/in-game-chat.md §13.4.
 *
 * Also rejects a year outside the ordinary four-digit range: `Date` accepts
 * one (`new Date('+275760-09-13')` parses fine), but its ISO form gains a
 * sign and extra digits that sort lexically *before* every ordinary
 * timestamp — exactly backwards for a `$max` write and for the route's
 * clamp-to-now comparison, both of which are plain string comparisons.
 */
export function normaliseReadAt(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const iso = parsed.toISOString();
    if (iso.length !== 24) {
        return null;
    }

    return iso;
}
