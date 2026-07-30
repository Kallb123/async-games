// Query-param encoding for "rematch" links: a finished game's banner links to
// its New Game setup page with the same players/options pre-filled. Kept as a
// pure module so the finish banner (encode) and every setup page (decode)
// share one param format instead of each inventing its own.

const PLAYERS_PARAM = "players";
const TURN_TIMER_PARAM = "turnTimer";

export interface RematchOptions {
    invitees: string[];
    turnTimer: string;
    extraParams?: Record<string, string>;
}

export function buildRematchHref(gameUrl: string, opts: RematchOptions): string {
    const params = new URLSearchParams();
    if (opts.invitees.length > 0) params.set(PLAYERS_PARAM, opts.invitees.join(","));
    if (opts.turnTimer) params.set(TURN_TIMER_PARAM, opts.turnTimer);
    for (const [key, value] of Object.entries(opts.extraParams ?? {})) {
        params.set(key, value);
    }
    const qs = params.toString();
    return `/newgame/${gameUrl}${qs ? `?${qs}` : ""}`;
}

export function readRematchPlayers(searchParams: URLSearchParams): string[] {
    return (searchParams.get(PLAYERS_PARAM) ?? "")
        .split(",")
        .map(u => u.trim())
        .filter(Boolean);
}

export function readRematchTurnTimer(searchParams: URLSearchParams, fallback: string): string {
    return searchParams.get(TURN_TIMER_PARAM) ?? fallback;
}

/** Encodes one on/off game option for `RematchOptions.extraParams`. */
export function rematchFlag(key: string, on: boolean): Record<string, string> {
    return { [key]: on ? "1" : "0" };
}

export function readRematchFlag(searchParams: URLSearchParams, key: string): boolean {
    return searchParams.get(key) === "1";
}
