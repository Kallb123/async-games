import { GameEndReason, IGameResponse } from "@/utils/apiModels/GameDataApi";

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

// Any user the app has to put a name to — a Clerk user, a profile DTO, a
// friend row. Every field is optional so all of them fit, and every resolver
// below is the answer to one question about this shape.
export interface NamedUser {
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    id?: string | null;
    // A guest's Clerk username is the random account id createGuest() minted
    // (docs/account-less-play.md §5), not something anyone chose to be seen
    // under — their firstName carries the name they actually typed at join
    // time (step 14), so every resolver below inverts its usual
    // username-first order for a guest.
    publicMetadata?: { guest?: boolean };
}

// The one place "is this user a guest?" gets asked — clerk.ts's own
// name-resolution helpers (userIdListToUsernameList/Map) reuse this rather
// than re-declaring the same publicMetadata check a second time.
export function isGuest(user: NamedUser): boolean {
    return user.publicMetadata?.guest === true;
}

// The handle a player is publicly known by: their Clerk username, which is
// theirs to choose and what a friend types to invite them. A guest's Clerk
// username is the random account id createGuest() minted rather than
// anything anyone picked (docs/account-less-play.md §5), so a guest has no
// handle to show — every caller here treats "no handle" as "show none",
// never as "show the account id".
function publicHandle(user: NamedUser | null | undefined): string | null {
    if (!user || isGuest(user)) return null;
    return user.username || null;
}

// The real name a registered player gave, e.g. "David Smith" — "" when they
// gave none. A guest's firstName is the display name they typed at the join
// screen rather than a legal name, and it is already what every resolver here
// names them by, so a guest has no separate full name to show alongside it.
export function fullName(user: NamedUser | null | undefined): string {
    if (!user || isGuest(user)) return "";
    return [user.firstName, user.lastName].filter(name => name).join(" ");
}

// The name to use for a user in copy another person reads (push notifications,
// "X is waiting on you"), and the name a player acts under in a game. Never
// falls back to a raw user id unless a caller asks for one — a notification
// saying "user_2abc… is waiting" is worse than one saying "Someone is waiting".
export function readableName(user: NamedUser | null | undefined, fallback = "Someone"): string {
    if (!user) return fallback;
    if (isGuest(user)) return user.firstName || fallback;
    return user.username || user.firstName || fallback;
}

// The username a signed-in user acts under (as command sender or game player).
// Same resolution as readableName — this is the same name the server resolves
// for them in usernameList, which is what a client compares against — with
// their id as the last resort a screen needs and a push notification doesn't.
export function currentUsername(user: NamedUser | null | undefined): string {
    return readableName(user, user?.id ?? "");
}

// The name to head a screen *about* a person with — their own profile, the
// badge in the top bar, the "you" chip in an invite list. Inverts
// readableName's order on purpose: this is the friendly name, so the real
// first name they gave comes before the handle they sign in with. A guest
// only ever has the former, since publicHandle gives them none.
//
// Null until the caller actually has a user, so a badge shows a silhouette
// rather than an initial taken from the fallback word.
export function personalName(user: NamedUser | null | undefined, fallback = ""): string | null {
    if (!user) return null;
    return user.firstName || publicHandle(user) || fallback || null;
}

// "David Smith (dave)" for a friends-list row, falling back to whichever half
// exists — a guest has only the name they typed, and nobody has the literal
// word "null", which is what interpolating an unset username used to print.
export function displayName(user: NamedUser): string {
    const handle = publicHandle(user);
    const real = fullName(user);
    if (real && handle) return `${real} (${handle})`;
    return real || readableName(user, "Player");
}

/** The three lines ProfileIdentity heads a profile with. */
export interface ProfileHeading {
    /** Null until we know whose profile this is — the header then shows placeholders. */
    name: string | null;
    /** The handle they chose — null for anyone who has none, a guest included. */
    handle: string | null;
    /** Subtitle when there is no handle: what they are, not what they lack. */
    noHandleLabel?: string;
    /** The real name they gave, "" when they gave none. */
    fullName: string;
}

// A profile header — your own or a friend's — from the one user it is about,
// so the two screens that show one can't drift apart on what a guest sees. A
// guest has no handle they chose and no real name beyond the one already
// heading the screen, so their subtitle says what they are rather than what
// they are missing.
export function profileHeading(user: NamedUser | null | undefined, fallback: string): ProfileHeading {
    return {
        name: personalName(user, fallback),
        handle: publicHandle(user),
        noHandleLabel: user && isGuest(user) ? "Guest account" : undefined,
        fullName: fullName(user),
    };
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

/** How a finished game ended, with every id already resolved to a name. */
export interface FinishedGameOutcome {
    /** The winner's display name — "" for every ending nobody won outright. */
    winner: string;
    endReason?: GameEndReason;
    /** The display name of whoever went quiet, for an abandoned game. */
    forfeitedBy?: string;
}

// The short line naming how a finished game ended: the "Finished" list on the
// home page and the result page's summary row both need one, and both worked
// it out from `winner` and `endReason` themselves — so neither could say
// anything about a co-op table, whose empty winner they'd have read as a draw.
//
// Null when there is nothing to say beyond "nobody won", which the two screens
// word differently: "complete" in a list of many games, "Draw" on the page
// about one.
export function finishedGameCopy(game: FinishedGameOutcome): string | null {
    // A co-op table's result belongs to all of them, and reads the same to
    // everyone — including a friend looking at a game they weren't part of.
    if (game.endReason === 'teamwin') return "The team won";
    if (game.endReason === 'teamloss') return "The team lost";
    if (game.winner) return `${game.winner} won`;
    if (game.endReason === 'abandoned') return abandonedGameCopy(game.forfeitedBy).short;
    return null;
}

// Every game board page needs the same check before rendering its own
// "you won" copy: is this finished game actually a no-winner abandonment?
// Centralising the check (not just the copy above) means each board page
// computes it once instead of re-deriving the `abandoned` predicate and
// calling abandonedGameCopy twice apiece.
export function abandonedGameStatus(
    complete: boolean,
    endReason: string | undefined,
    forfeitedName?: string
): ReturnType<typeof abandonedGameCopy> | null {
    return complete && endReason === 'abandoned' ? abandonedGameCopy(forfeitedName) : null;
}
