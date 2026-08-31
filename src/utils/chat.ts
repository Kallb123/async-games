// Shared chat validation — the one module the composer and the POST route both
// import, so the client's limit and the server's gate cannot drift apart. It
// mirrors src/utils/reactions.ts, which does the same job for the recap
// reactions. See docs/in-game-chat.md §4.

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
