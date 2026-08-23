// Uppercase letters and digits, minus the glyphs that are easy to misread or
// mistype for one another: I/O (look like the letters L/D or the digits 1/0)
// and the digits 0/1 themselves.
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Exported so a caller deciding "is this code complete yet?" — the lobby
// preview fetch on /join's guest screen (step 14) — has one place to read
// the length from rather than hard-coding 4 a second time.
export const JOIN_CODE_LENGTH = 4;

export function generateJoinCode(): string {
    let code = '';
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
    }
    return code;
}

// Someone typing `plum` or `pl um` must land in the same lobby as someone
// typing `PLUM`, so joining tolerates case and stray whitespace.
export function normaliseJoinCode(joinCode: string): string {
    return joinCode.toUpperCase().replace(/\s+/g, '');
}

// The code's second form: a link that opens `/join` with the code already in
// the box (see docs/account-less-play.md §4). The link *is* the code in a URL
// — same normalisation, same join route, same lobby — so the param name and
// its reader live here beside the code rules rather than in the screen, for
// the reason `src/utils/ui/rematch.ts` gives for its own params: one format,
// shared by whoever encodes it (the host's lobby card) and whoever decodes it
// (`/join`), instead of each end inventing its own.
const JOIN_CODE_PARAM = 'code';

/** The in-app path a shared join link points at. Prefix with an origin to share it. */
export function buildJoinHref(joinCode: string): string {
    return `/join?${new URLSearchParams({ [JOIN_CODE_PARAM]: joinCode })}`;
}

/**
 * The code a `/join` link arrived with, normalised — empty when the visitor
 * typed the bare URL, which is the same screen with different hero copy.
 */
export function readJoinCode(searchParams: URLSearchParams): string {
    return normaliseJoinCode(searchParams.get(JOIN_CODE_PARAM) ?? '');
}
