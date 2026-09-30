// MongoDB's duplicate-key error code. A unique index is how several things
// here are made safe against two requests racing — a join code, a rate-limit
// window, a recorded game result, a friendship, a reaction — and in every one
// of them this error is the expected outcome of losing that race rather than a
// failure: the constraint did its job. Named once so the five places that
// check for it don't each carry a bare 11000.
const DUPLICATE_KEY = 11000;

export function isDuplicateKeyError(err: unknown): boolean {
    return (err as { code?: number } | null)?.code === DUPLICATE_KEY;
}

/**
 * True if the only thing that went wrong was a duplicate key.
 *
 * A `bulkWrite` reports its failures in `writeErrors` rather than as one error
 * with a code, and an unordered one carries on past them — so the useful
 * question is not "was this a duplicate key" but "was *everything* that
 * failed one". A batch where one row lost a race and another hit a real write
 * failure still deserves the log line.
 */
export function isOnlyDuplicateKeyErrors(error: unknown): boolean {
    const writeErrors = (error as { writeErrors?: unknown } | null)?.writeErrors;
    if (Array.isArray(writeErrors)) {
        // Walked, rather than read off the error's own `code` — because the
        // driver copies `writeErrors[0].code` up to the top level, so that
        // field says what the *first* failure was and never whether the rest
        // were the same. Each entry exposes its code through a getter over an
        // inner `err`, so both spellings are accepted.
        return writeErrors.length > 0
            && writeErrors.every(one => isDuplicateKeyError(one) || isDuplicateKeyError((one as { err?: unknown })?.err));
    }
    return isDuplicateKeyError(error);
}
