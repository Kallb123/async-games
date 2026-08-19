import { IGameResponse } from "@/utils/apiModels/GameDataApi";

// "Alice", "Alice & Bob", "Alice & 2 others" — the one way the app names a
// group of players, wherever it has to fit them into a line of text.
export function nameList(names: string[], emptyLabel = "solo"): string {
    if (names.length === 0) return emptyLabel;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} & ${names.length - 1} others`;
}

// Human-readable summary of who you're playing against, excluding yourself.
export function opponents(game: IGameResponse, me: string | null | undefined, emptyLabel = "solo"): string {
    return nameList(game.usernameList.filter(u => u !== me), emptyLabel);
}

interface NamedUser {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
}

// "FirstName LastName (username)", falling back to just the username.
export function displayName(user: NamedUser): string {
    const fullName = [user.firstName, user.lastName].filter(name => name).join(" ");
    if (fullName) return `${fullName} (${user.username})`;
    return `${user.username}`;
}

interface SenderUser {
    username?: string | null;
    firstName?: string | null;
    id?: string | null;
}

// The username a signed-in user acts under (as command sender or game
// player): prefers their Clerk username, then first name, then their id.
export function currentUsername(user: SenderUser | null | undefined): string {
    return user?.username || user?.firstName || user?.id || "";
}

// The name to use for a user in copy another person reads (push notifications,
// "X is waiting on you"). Same preference order as currentUsername but never
// falls back to a raw user id — a notification saying "user_2abc… is waiting"
// is worse than one saying "Someone is waiting".
export function readableName(user: SenderUser | null | undefined, fallback = "Someone"): string {
    return user?.username || user?.firstName || fallback;
}

// The one piece of finish-line copy shared by every game: a player missed
// too many turns in a row, so the turntimer cron abandoned the game rather
// than continue without them (see GameEndReason 'abandoned'). Everything else
// about a finished game (the "you won!" text) is per-game flavour and stays
// at each game's own page; this case has none, so it's the one part worth
// sharing — the board page's subtitle/banner and the result list/page rows
// all pull from here rather than each inventing their own wording.
export function abandonedGameCopy(forfeitedName?: string): { subtitle: string; short: string; message: string } {
    const who = forfeitedName || "A player";
    return {
        subtitle: "Game ended",
        short: forfeitedName ? `Ended — ${forfeitedName} went quiet` : "Ended — no winner",
        message: `${who} missed too many turns in a row, so the game has ended with no winner.`,
    };
}
