// Query-param encoding for "rematch" links: a finished game's banner links to
// its New Game setup page with the same players/options pre-filled. Kept as a
// pure module so the finish banner (encode) and every setup page (decode)
// share one param format instead of each inventing its own.

const PLAYERS_PARAM = "players";
const TURN_TIMER_PARAM = "turnTimer";
const THEME_PARAM = "theme";

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

/**
 * Carries the finished game's theme into the rematch's setup screen, so
 * "play that again" means the game they just played rather than the default
 * dressing (see utils/ui/gameThemes.ts). Shaped as `extraParams`, since only
 * a themed game has one to pass.
 */
export function rematchTheme(theme: string | undefined): Record<string, string> {
    return theme ? { [THEME_PARAM]: theme } : {};
}

/** The theme a rematch link asks for, if any — normalise it before using it. */
export function readRematchTheme(searchParams: URLSearchParams): string | null {
    return searchParams.get(THEME_PARAM);
}

/** Encodes one on/off game option for `RematchOptions.extraParams`. */
export function rematchFlag(key: string, on: boolean): Record<string, string> {
    return { [key]: on ? "1" : "0" };
}

export function readRematchFlag(searchParams: URLSearchParams, key: string): boolean {
    return searchParams.get(key) === "1";
}
