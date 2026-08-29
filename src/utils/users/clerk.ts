import { clerkClient, User } from "@clerk/nextjs/server";
import { isGuest, readableName } from "@/utils/ui/players";
import { profileImageUrl } from "@/utils/ui/avatar";

// Shown for a userId Clerk can't resolve (a deleted account, most likely
// today) instead of silently dropping it. Every caller below zips this
// result back up against the userId list it was given by position, so a
// dropped entry would shift every name after it onto the wrong seat.
export const UNKNOWN_PLAYER_NAME = "Unknown player";

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

// Clerk handles are letters/digits/underscore only, with a minimum length; a
// name a player typed can be anything, so a derived handle is slugged to that
// charset and padded before it can be offered as one.
const MIN_USERNAME_LENGTH = 4;
const MAX_USERNAME_LENGTH = 64;

function slugifyUsername(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, MAX_USERNAME_LENGTH);
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

// The one place every resolver below turns a looked-up user into a name, so
// they can't drift apart — including what to show when the lookup found
// nobody, which is the half that used to get re-pasted. `readableName` owns
// the preference order itself (including inverting it for a guest, whose
// Clerk username is the random account id createGuest() minted rather than
// anything they chose), so the server and the client resolve the same user to
// the same string — which matters, because a screen compares the name it
// resolves for you against the usernameList this builds.
function nameOf(user: User | undefined): string {
    return user ? readableName(user, NO_NAME_PLAYER_NAME) : UNKNOWN_PLAYER_NAME;
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

    return {
        name(userId) {
            if (!userId) return "";
            return nameOf(byId.get(userId));
        },
        imageUrl(userId) {
            const user = byId.get(userId);
            return user ? profileImageUrl(user) : null;
        }
    };
}

export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const users = await usersById(userIdList);
    return userIdList.map(userId => nameOf(users.find(u => u.id === userId)));
}

export async function userIdListToUsernameMap(userIdList: string[]): Promise<Map<string, string>> {
    const users = await usersById(userIdList);
    const usernameMap: Map<string, string> = new Map;
    userIdList.forEach(userId => {
        usernameMap.set(userId, nameOf(users.find(u => u.id === userId)));
    });
    return usernameMap;
}

// Same lookup as userIdListToUsernameMap, but as the plain { [userId]: username }
// object the replay engine (buildTimeline/buildEventFeed/buildAllEvents) takes.
export async function userIdListToUserIdNameMap(userIdList: string[]): Promise<{ [key: string]: string }> {
    const usernameMap = await userIdListToUsernameMap(userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    usernameMap.forEach((username, id) => { userIdNameMap[id] = username; });
    return userIdNameMap;
}

// Same { [userId]: username } shape as userIdListToUserIdNameMap, but built from
// users a route has already fetched — routes that notify players hold the Clerk
// user list already, so this saves a second round trip to Clerk.
export function userListToUserIdNameMap(users: User[]): { [key: string]: string } {
    const userIdNameMap: { [key: string]: string } = {};
    users.forEach(user => { userIdNameMap[user.id] = nameOf(user); });
    return userIdNameMap;
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
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
    // Mirrors Clerk's own shape, so the DTO satisfies NamedUser and a screen
    // resolves a name from it through the same players.ts helpers it uses on
    // a Clerk user. A guest's username is the random account id createGuest()
    // minted, so "is this a guest?" is not something a screen can work out
    // from the rest of the fields.
    publicMetadata: { guest: boolean };
}

// The one Clerk-user-to-client projection, so a screen naming a player from
// one route's payload can't get a different answer from another's — the
// friends list and the profile screen were two copies, and only one of them
// knew about guests.
export function toUserDto(user: User): UserDto {
    return {
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: profileImageUrl(user),
        publicMetadata: { guest: isGuest(user) },
    };
}
