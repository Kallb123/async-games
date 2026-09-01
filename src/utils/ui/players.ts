import { ICompletedGame, IGameResponse } from "@/utils/apiModels/GameDataApi";

// "Alice", "Alice & Bob", "Alice & 2 others" — the one way the app names a
// group of players, wherever it has to fit them into a line of text.
// Shown for a userId Clerk can't resolve (a deleted account, most likely
// today) instead of silently dropping it — see clerk.ts, which re-exports this.
export const UNKNOWN_PLAYER_NAME = "Unknown player";

export function nameList(names: string[], emptyLabel = "solo"): string {
    if (names.length === 0) return emptyLabel;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} & ${names.length - 1} others`;
}

// Human-readable summary of who you're playing against, excluding yourself.
// Identifies "you" by your stable Clerk userId rather than your display name —
// reading the parallel userIdList/usernameList to filter by id and show the
// name. A rename can't make you count as your own opponent, and two players
// sharing a display name are still told apart.
export function opponentsById(game: IGameResponse, myId: string | null | undefined, emptyLabel = "solo"): string {
    const names = game.usernameList.filter((_, i) => game.userIdList[i] !== myId);
    return nameList(names, emptyLabel);
}

// The display name for one player in a game, resolved by their stable userId
// through the response's parallel userIdList/usernameList. The one place a board
// page turns a userId (a winner, the current turn, an owner) back into a name —
// so no screen re-scans playerStates for the username it already ships. Falls
// back to the id itself when it isn't one of the game's players (or the game
// hasn't loaded), which is what every caller wants for an unknown reference.
export function nameForUserId(
    game: { userIdList: string[]; usernameList: string[] } | null | undefined,
    userId: string | null | undefined,
): string {
    const index = game && userId ? game.userIdList.indexOf(userId) : -1;
    return index >= 0 ? game!.usernameList[index] : (userId ?? "");
}

// Any user the app has to put a name to — a Clerk user, a profile DTO, a
// friend row. Every field is optional so all of them fit, and every resolver
// below is the answer to one question about this shape.
export interface NamedUser {
    username?: string | null;
    // A guest's join-screen name, for guests minted before it had a field of
    // its own — never a real name. Read only by `chosenName`, and only for a
    // user with no handle.
    firstName?: string | null;
    id?: string | null;
    publicMetadata?: {
        // A guest's Clerk username is the random account id createGuest()
        // minted (docs/account-less-play.md §5), not something anyone chose to
        // be seen under. Every resolver below therefore treats a guest as
        // having no handle at all, rather than showing the account id as one.
        guest?: boolean;
        // The name a player chose to be seen under — ours, not one of Clerk's
        // own attributes. See `chosenName` below for why it isn't `firstName`.
        displayName?: string;
        // Whoever runs the app, for the support tooling under `/admin`
        // (docs/admin-tools.md). Set by hand on a Clerk user, and read here
        // rather than derived from anything, so there is one answer to "may
        // this person use the admin routes?" on both sides of the wire.
        admin?: boolean;
    };
}

// The one place "is this user a guest?" gets asked — clerk.ts's own
// name-resolution helpers (userIdListToUsernameList/Map) reuse this rather
// than re-declaring the same publicMetadata check a second time.
//
// Deliberately narrow: this is the authorisation question (may they host a
// game?), and /api/user/claim clears the flag the moment a guest claims their
// account. "Is that username a real handle?" is a different question with a
// different answer — see below.
export function isGuest(user: NamedUser): boolean {
    return user.publicMetadata?.guest === true;
}

// Whether this user runs the app — the gate on the support tooling under
// `/admin` (docs/admin-tools.md), asked the same way `isGuest` is.
//
// `publicMetadata` is writable only through Clerk's Backend API, so a browser
// can no more grant itself this than it can grant itself `unlocked`. It is
// still only a hint on the client: every `/api/admin/*` route checks it
// server-side for itself (`requireAdmin`), and the screen's own check just
// decides whether to draw the link.
export function isAdmin(user: NamedUser | null | undefined): boolean {
    return user?.publicMetadata?.admin === true;
}

// The shape createGuest() mints a guest's Clerk username under: `guest_` and
// a UUID with its hyphens stripped. Matched here rather than beside the
// minting code because guest.ts is server-only and this question gets asked
// on both sides — and matched by shape rather than by the
// `publicMetadata.guest` flag on purpose. The flag is cleared when a guest
// claims their account, but the account id only became a *real* handle at
// claim time once /api/user/claim started minting one, so a player who
// claimed before that still carries `guest_<uuid>` with no flag on it. It was
// never a handle they chose, and it must never be shown as one.
//
// Narrow enough that a handle somebody actually picked can't trip it: the
// 32 hex digits are the part nobody types on purpose.
const GUEST_PLACEHOLDER_USERNAME = /^guest_[0-9a-f]{32}$/;

export function isGuestPlaceholderUsername(username: string | null | undefined): boolean {
    return !!username && GUEST_PLACEHOLDER_USERNAME.test(username);
}

// The handle a player is publicly known by: their Clerk username, which is
// theirs to choose and what a friend types to invite them. A guest's Clerk
// username is the random account id createGuest() minted rather than
// anything anyone picked (docs/account-less-play.md §5), so a guest has no
// handle to show — every caller here treats "no handle" as "show none",
// never as "show the account id".
export function publicHandle(user: NamedUser | null | undefined): string | null {
    if (!user || isGuest(user)) return null;
    return isGuestPlaceholderUsername(user.username) ? null : (user.username || null);
}

// The name a player chose to be seen under, or null if they never chose one.
//
// It is `publicMetadata.displayName` rather than Clerk's `firstName`, and the
// difference matters: `firstName` is a *first name*. Clerk's own signup form
// asks for one under that label, `fullName` below reads it as half of a real
// name, and a player who set theirs to "Dave the Destroyer" would have their
// profile subtitle read "Dave the Destroyer Smith". Borrowing the field would
// also have published, on deploy, whatever real name every existing player
// gave at signup — something they typed to identify themselves, not to be
// called in front of strangers. So the display name is a field of our own.
//
// Only the server may write it (Clerk's rule for publicMetadata), which is
// why it has a route — `POST /api/user/displayname` — where a handle change
// has none: it is the one name the whole table reads, so it gets validated
// and rate-limited rather than being whatever the browser sent.
export function chosenName(user: NamedUser | null | undefined): string | null {
    const chosen = user?.publicMetadata?.displayName;
    if (typeof chosen === 'string' && chosen.trim()) return chosen.trim();
    // The legacy home of the same thing. A guest minted before display names
    // had a field of their own has their join-screen name in `firstName` —
    // which is a name they typed, not a real one. Gated on having no handle,
    // because that is the only population it can be true of: a registered
    // player's Clerk first name is never reached here and never travels.
    return publicHandle(user) ? null : (user?.firstName?.trim() || null);
}

// The name to use for a user in copy another person reads (push notifications,
// "X is waiting on you"), and the name a player acts under in a game.
//
// The name they chose comes first, and their handle stands in until they
// choose one — so a new player is known by their username without anything
// having to seed a copy of it, and the day they pick a display name it simply
// takes over. That is the whole of the display-name feature
// (docs/dynamic-names.md §1a): a handle is how you are *found*, a display name
// is what you are *called*.
//
// Never falls back to a raw user id unless a caller asks for one — a
// notification saying "user_2abc… is waiting" is worse than one saying
// "Someone is waiting".
export function readableName(user: NamedUser | null | undefined, fallback = "Someone"): string {
    if (!user) return fallback;
    return chosenName(user) || publicHandle(user) || fallback;
}

// The name a signed-in user acts under, with their id as the last resort a
// screen needs and a push notification doesn't. Same resolution as
// readableName, so a screen naming you agrees with the server naming you to
// everyone else — near enough: the server resolves a whole table at once and
// tags a name two players share (clerk.ts's namesFor), which one user in
// isolation can't know about. Nothing compares the two, and nothing should:
// identity comparisons go by userId (docs/dynamic-names.md §3).
export function currentUsername(user: NamedUser | null | undefined): string {
    return readableName(user, user?.id ?? "");
}

// The name to head a screen *about* a person with — their own profile, the
// badge in the top bar, the "you" chip in an invite list. The same name
// everyone else sees them under, since readableName's order flipped; what it
// adds is the null, so a badge shows a silhouette while Clerk is still
// loading rather than an initial taken from the fallback word.
export function personalName(user: NamedUser | null | undefined, fallback = ""): string | null {
    if (!user) return null;
    return readableName(user, fallback) || null;
}

// "Dave (@dave)" for a friends-list row: the name they chose to be seen under,
// and the handle you invite them by — which is the only thing that tells two
// friends called Dave apart. A guest has no handle, so theirs is just the
// name; and a player who has chosen no display name is already known by their
// handle, so it isn't printed twice.
export function displayName(user: NamedUser): string {
    const handle = publicHandle(user);
    const name = readableName(user, "Player");
    return handle && handle !== name ? `${name} (@${handle})` : name;
}

/** The three lines ProfileIdentity heads a profile with. */
export interface ProfileHeading {
    /** Null until we know whose profile this is — the header then shows placeholders. */
    name: string | null;
    /** The handle they chose — null for anyone who has none, a guest included. */
    handle: string | null;
    /** Subtitle when there is no handle: what they are, not what they lack. */
    noHandleLabel?: string;
}

// A profile header — your own or a friend's — from the one user it is about,
// so the two screens that show one can't drift apart on what a guest sees. A
// guest has no handle they chose, so their subtitle says what they are rather
// than what they are missing.
export function profileHeading(user: NamedUser | null | undefined, fallback: string): ProfileHeading {
    return {
        name: personalName(user, fallback),
        handle: publicHandle(user),
        noHandleLabel: user && isGuest(user) ? "Guest account" : undefined,
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

// How a finished game ended, with every id already resolved to a name. Taken
// off the DTO both callers pass in, rather than restated, so it can't drift
// from what a finished game actually carries.
export type FinishedGameOutcome = Pick<ICompletedGame, 'winner' | 'endReason' | 'forfeitedBy'>;

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

// Whether it's this viewer's live turn — the guard every game board needs
// before showing turn actions or wiring up board clicks. Requires `user` to
// have actually loaded rather than just comparing it to `currentTurn`: before
// Clerk's user and the game's data have both arrived, `user?.id` and
// `currentTurn` can both be `undefined`, and a bare `===` reads that as a
// match — briefly flashing the current player's own action button (a "Roll
// the die" button a click on which silently does nothing, since
// useSubmitCommand also refuses to send without a loaded user) before the
// real data lands and it resolves one way or the other.
export function isPlayersTurn(
    isLive: boolean,
    user: { id?: string | null } | null | undefined,
    currentTurn: string | null | undefined,
): boolean {
    return isLive && !!user?.id && user.id === currentTurn;
}

// The seating order as the viewer reads it: their own seat first, then the
// players who follow them, wrapping back round. Rotating (rather than pulling
// the viewer out and prepending) keeps the true turn cycle intact — the rows
// after yours are still the ones who play before it comes back to you — and a
// viewer's own seat never moves, so the list is stable for them between turns.
// A viewer who isn't seated (a spectator, an unresolved id) gets the list as-is.
export function seatOrderFrom(userIdList: string[], viewerId: string | null | undefined): string[] {
    const seat = viewerId ? userIdList.indexOf(viewerId) : -1;
    if (seat <= 0) return userIdList;
    return [...userIdList.slice(seat), ...userIdList.slice(0, seat)];
}
