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
