import { clerkClient, User } from "@clerk/nextjs/server";
import { chosenName, isGuest, publicHandle, readableName, UNKNOWN_PLAYER_NAME } from "@/utils/ui/players";
import { profileImageUrl } from "@/utils/ui/avatar";
import { sameName } from "@/utils/users/sameName";
import { MIN_USERNAME_LENGTH, slugifyUsername } from "@/utils/users/username";

// Shown for a userId Clerk can't resolve (a deleted account, most likely
// today) instead of silently dropping it. Every caller below zips this
// result back up against the userId list it was given by position, so a
// dropped entry would shift every name after it onto the wrong seat.
//
// Declared alongside the other name resolvers in ui/players, so that code which
// can't import this server-only module — the history token resolver, which
// reaches client bundles through useTurnNavigation — falls back to the same
// string. Import it from there.

// The invite-only gate (docs/account-less-play.md §5/§8): a user can sign in
// without being allowed to use the app yet. Every route that lets someone
// create content — today just `/api/users`, and lobby creation from this
// commit on — needs this check server-side; it is not implied by being
// signed in. A guest (`publicMetadata.guest === true`, §5/§12) is authorised
// the moment they exist — the unlock gate is for the real account that vouches
// for them, not for the guest — so this accepts the same second clause
// `useIsAuthorised` does client-side.
export function isUnlockedUser(user: User | null | undefined): boolean {
    return user?.publicMetadata.unlocked === true || user?.publicMetadata.guest === true;
}

// The gate belongs on lobby/game creation, not on joining one (§8): an
// unlocked host vouches for everyone holding their code. isUnlockedUser also
// passes a guest — correct for the general app-access gate, which a guest
// must clear the moment they exist — but a guest is exactly the account with
// nobody vouching for them, so every route that starts a new game (a lobby,
// or a direct invite) rejects them explicitly with this on top.
export function canHostGame(user: User | null | undefined): boolean {
    return !!user && !isGuest(user) && isUnlockedUser(user);
}

const CLERK_USER_PAGE_SIZE = 100;

// Clerk's `GET /users` answers with ten users when nothing asks for more —
// a *default*, not a cap, and the one that bites is the filtered lookup:
// `getUserList({ userId: [...30 ids] })` looks like "fetch these thirty" and
// returns the first ten of them. Everything downstream then resolves the
// other twenty to UNKNOWN_PLAYER_NAME, so a dashboard busy enough to name
// more than ten people started calling most of them "Unknown player".
//
// So every filtered lookup goes out a page at a time with an explicit limit,
// and asks for as many pages as the filter has entries. Chunking rather than
// one big limit because the filter travels in the query string: a few hundred
// ids in one URL is the other way this falls over.
async function usersByFilter(
    values: string[],
    filter: (chunk: string[]) => { userId: string[] } | { username: string[] }
): Promise<User[]> {
    // Clerk treats an empty filter as *no* filter — `getUserList({ username: [] })`
    // hands back the whole instance rather than nothing. Answered here, once,
    // rather than coming back as somebody else's users: a lobby of nothing but
    // open seats asked for zero usernames, got the entire user list, and failed
    // its "did every name resolve?" check by 404ing the host's own lobby.
    if (values.length === 0) return [];

    const client = await clerkClient();
    const chunks: string[][] = [];
    for (let i = 0; i < values.length; i += CLERK_USER_PAGE_SIZE) {
        chunks.push(values.slice(i, i + CLERK_USER_PAGE_SIZE));
    }

    const pages = await Promise.all(chunks.map(chunk =>
        client.users.getUserList({ ...filter(chunk), limit: CLERK_USER_PAGE_SIZE })
    ));
    return pages.flatMap(page => page.data);
}

export function usersByUsername(usernameList: string[]): Promise<User[]> {
    return usersByFilter(usernameList, username => ({ username }));
}

// A handle derived from `name` that no current Clerk user holds — slugged to
// Clerk's charset, padded to its minimum length, and suffixed with a number
// when the base slug is already taken. Best-effort against a concurrent claim
// of the same handle (Clerk still enforces uniqueness on the write itself), so
// an ordinary claim lands a clean handle instead of failing on the first
// collision. Falls back to "player" when a name has no usable characters at all
// (e.g. a non-Latin script the slug charset can't represent).
export async function availableUsernameFrom(name: string): Promise<string> {
    let base = slugifyUsername(name) || "player";
    while (base.length < MIN_USERNAME_LENGTH) base += "0";

    for (let suffix = 0; suffix < 100; suffix++) {
        const candidate = suffix === 0 ? base : `${base}${suffix}`;
        const existing = await usersByUsername([candidate]);
        if (!existing.some(user => user.username?.toLowerCase() === candidate.toLowerCase())) {
            return candidate;
        }
    }
    // A hundred people already share this slug — vanishingly unlikely, but take
    // a unique fallback rather than loop or hand back a known-taken handle.
    return `${base}${Date.now()}`;
}

export function usersById(userIdList: string[]): Promise<User[]> {
    return usersByFilter(userIdList, userId => ({ userId }));
}

// Belt and braces against a paging bug turning into an unbounded loop.
const CLERK_USER_MAX_PAGES = 100;

// Pages through every Clerk user, calling `visit` for each — the shared shape
// behind every `/api/cron/*` sweep that has to look at the whole instance
// rather than a known id list (staledevices, staleguests). Returns how many
// users it visited, which every caller reports back as its own `scanned`.
//
// A `visit` that throws is logged and skipped rather than ending the sweep.
// These run over every user in the instance, so without this one user whose
// Clerk write 429s or whose metadata is malformed stops every user after them
// from being swept at all — and a user who fails consistently starves the tail
// of the list forever, since the next run walks the same order.
export async function forEachClerkUser(visit: (user: User) => Promise<void>): Promise<number> {
    const client = await clerkClient();
    let scanned = 0;

    for (let page = 0; page < CLERK_USER_MAX_PAGES; page++) {
        const { data: users } = await client.users.getUserList({
            limit: CLERK_USER_PAGE_SIZE,
            offset: page * CLERK_USER_PAGE_SIZE,
        });
        if (!users.length) {
            break;
        }
        scanned += users.length;

        for (const user of users) {
            try {
                await visit(user);
            } catch (error) {
                console.error(`Sweep failed for user ${user.id}`, error);
            }
        }

        if (users.length < CLERK_USER_PAGE_SIZE) {
            break;
        }
    }

    return scanned;
}

// Shown for a user Clerk still has but who has no name of any kind to show.
export const NO_NAME_PLAYER_NAME = "No username";

// The one place a single looked-up user becomes a name, so no resolver below
// re-derives it — including what to show when the lookup found nobody, which
// is the half that used to get re-pasted. `readableName` owns the preference
// order itself (the display name they chose, then the handle they are invited
// by — never the random account id createGuest() minted for a guest), so this
// is the same answer the client gets for the same user.
//
// It is the answer for *one* user, which is why almost nothing calls it
// directly: a name is only ambiguous next to the other names on screen, so
// `namesFor` below is what every resolver actually goes through.
function nameOf(user: User | undefined): string {
    return user ? readableName(user, NO_NAME_PLAYER_NAME) : UNKNOWN_PLAYER_NAME;
}

/**
 * The names for a whole set of users at once, keyed by id. Every resolver
 * below goes through this rather than naming users one at a time, because a
 * set is the only level at which "two players called Dave" is visible at all.
 *
 * A display name is free text, and since it became the name everyone sees
 * (docs/dynamic-names.md §5.1) two players at one table really can both be
 * Dave — leaving a seat list, a turn banner and every history line naming
 * either of them. So where a name repeats within the set, each copy is tagged
 * with the handle behind it — "Dave (@dave)", "Dave (@daveb)" — the one thing
 * about them Clerk guarantees differs. A name nobody shares is left alone,
 * which is almost always.
 *
 * Nobody in a colliding group keeps the bare name. A player who has no handle
 * to be tagged with — a guest, whose Clerk username is the account id
 * createGuest() minted and would be worse to show than the collision, or a
 * player who claimed a guest account before handles were minted — gets a
 * number instead, assigned in userId order so it is the same on every request.
 * Leaving one of them bare was the first version of this, and it had the tell
 * exactly backwards: the player who could not be tagged read as the "real"
 * one, which is precisely the wrong answer when they are the one who renamed
 * themselves to match somebody else.
 *
 * Hands back the lookup rather than the map so the "Clerk didn't know this id"
 * answer stays here with the rest of the naming rules, instead of every caller
 * re-adding the same fallback.
 */
function namesFor(users: User[]): (userId: string) => string {
    // One entry per id, so a user who appears twice in the list is one player
    // rather than a collision with themselves.
    const seats = [...new Map(users.map(user => [user.id, user])).values()]
        .map(user => ({ id: user.id, name: nameOf(user), handle: publicHandle(user) }));

    const uses = new Map<string, number>();
    seats.forEach(({ name }) => uses.set(sameName(name), (uses.get(sameName(name)) ?? 0) + 1));

    // Assigned in userId order rather than in the order Clerk happened to
    // return, so a numbered player keeps their number between requests instead
    // of swapping it with the other Dave every time the list is rebuilt.
    const tags = new Map<string, string>();
    const numbered = new Map<string, number>();
    for (const { id, name, handle } of [...seats].sort((a, b) => a.id.localeCompare(b.id))) {
        const key = sameName(name);
        if ((uses.get(key) ?? 0) < 2) continue;
        if (handle) {
            tags.set(id, `${name} (@${handle})`);
            continue;
        }
        const nth = (numbered.get(key) ?? 0) + 1;
        numbered.set(key, nth);
        tags.set(id, `${name} (${nth})`);
    }

    const names = new Map(seats.map(({ id, name }) => [id, tags.get(id) ?? name]));
    // nameOf's own answer for a user Clerk didn't hand back, so "we don't know
    // this id" stays worded in exactly one place.
    return userId => names.get(userId) ?? nameOf(undefined);
}

/**
 * Every name and picture one screen needs, resolved in a single Clerk call.
 *
 * The list resolvers below are per-item: a screen showing eight games and three
 * invitations used to make twenty-odd round trips to Clerk to render one page,
 * because each game and each invitation resolved its own players. A directory
 * is built once from the union of every id on the screen, and the builders read
 * it instead of asking.
 */
export interface UserDirectory {
    /** Display name for an id. Empty string for no id at all (an unfinished
     *  game has no winner), UNKNOWN_PLAYER_NAME for one Clerk doesn't know. */
    name(userId: string | null | undefined): string;
    /** Their picture, or null if they have never set one (see profileImageUrl). */
    imageUrl(userId: string): string | null;
}

export async function buildUserDirectory(userIds: (string | null | undefined)[]): Promise<UserDirectory> {
    const wanted = [...new Set(userIds.filter((id): id is string => !!id))];
    const users = await usersById(wanted);
    const byId = new Map(users.map(user => [user.id, user]));
    // Resolved against the whole screen's worth of ids, so two players called
    // Dave are told apart wherever they turn up together — in one game's seat
    // list, or in two rows of the same list of games.
    const nameFor = namesFor(users);

    return {
        name(userId) {
            if (!userId) return "";
            return nameFor(userId);
        },
        imageUrl(userId) {
            const user = byId.get(userId);
            return user ? profileImageUrl(user) : null;
        }
    };
}

// The one Clerk trip behind every list-shaped name lookup below. The three
// that follow are the same names in a different container, so they go through
// this rather than each making their own round trip and re-deriving the names.
export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const nameFor = namesFor(await usersById(userIdList));
    return userIdList.map(nameFor);
}

// The same names without the collision tags — for the one caller comparing
// them against a name a player is *about to type*, where "Dave" has to read as
// taken even when the two Daves already at the table are showing as
// "Dave (@dave)" and "Dave (@daveb)". A different rule, not a different
// container, which is why it doesn't go through the list resolver above.
export async function userIdListToUntaggedNameList(userIdList: string[]): Promise<string[]> {
    const users = await usersById(userIdList);
    return userIdList.map(userId => nameOf(users.find(user => user.id === userId)));
}

export async function userIdListToUsernameMap(userIdList: string[]): Promise<Map<string, string>> {
    const usernameList = await userIdListToUsernameList(userIdList);
    return new Map(userIdList.map((userId, i) => [userId, usernameList[i]]));
}

// Same lookup as userIdListToUsernameMap, but as the plain { [userId]: username }
// object the replay engine (buildTimeline/buildEventFeed/buildAllEvents) takes.
export async function userIdListToUserIdNameMap(userIdList: string[]): Promise<{ [key: string]: string }> {
    return Object.fromEntries(await userIdListToUsernameMap(userIdList));
}

// Both shapes every CreateDataResponse needs, from one Clerk lookup: the
// usernameList it sends, and the { [userId]: username } map it resolves its
// board state and history tokens with. Every game built both by hand from the
// same list and zipped them back up by index.
export async function userIdListToNamesAndMap(userIdList: string[]): Promise<{
    usernameList: string[],
    userIdNameMap: { [key: string]: string }
}> {
    const usernameList = await userIdListToUsernameList(userIdList);
    return {
        usernameList,
        userIdNameMap: Object.fromEntries(userIdList.map((userId, i) => [userId, usernameList[i]])),
    };
}

// Same { [userId]: username } shape as userIdListToUserIdNameMap, but built from
// users a route has already fetched — routes that notify players hold the Clerk
// user list already, so this saves a second round trip to Clerk.
export function userListToUserIdNameMap(users: User[]): { [key: string]: string } {
    const nameFor = namesFor(users);
    return Object.fromEntries(users.map(user => [user.id, nameFor(user.id)]));
}

// Profile pictures for a set of users, keyed by user id — null for anyone who
// has never set one (see profileImageUrl). For routes that show people the
// current user isn't necessarily friends with, e.g. who reacted to their move.
export async function userIdListToImageMap(userIdList: string[]): Promise<Map<string, string | null>> {
    const users = await usersById(userIdList);
    return new Map(users.map(user => [user.id, profileImageUrl(user)]));
}

/** A user as a screen receives one: enough to name them and picture them. */
export interface UserDto {
    userId: string;
    username: string | null;
    imageUrl: string | null;
    // Mirrors Clerk's own shape, so the DTO satisfies NamedUser and a screen
    // resolves a name from it through the same players.ts helpers it uses on
    // a Clerk user. A guest's username is the random account id createGuest()
    // minted, so "is this a guest?" is not something a screen can work out
    // from the rest of the fields — and the display name they chose is ours
    // rather than one of Clerk's attributes, so it has to travel too.
    publicMetadata: { guest: boolean; displayName?: string };
}

// The one Clerk-user-to-client projection, so a screen naming a player from
// one route's payload can't get a different answer from another's — the
// friends list and the profile screen were two copies, and only one of them
// knew about guests.
//
// It carries no real name. Clerk's firstName/lastName reached other players
// through this until display names landed, and nothing needs them now: a
// player is their display name and their handle, and a name they gave to sign
// up is not something to hand to everyone they play against.
export function toUserDto(user: User): UserDto {
    return {
        userId: user.id,
        username: user.username,
        imageUrl: profileImageUrl(user),
        // chosenName rather than the raw metadata: it also answers for a guest
        // minted before display names had a field, whose name is still in the
        // Clerk `firstName` this DTO no longer carries.
        publicMetadata: { guest: isGuest(user), displayName: chosenName(user) ?? undefined },
    };
}
