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

// Clerk treats an empty filter as *no* filter: `getUserList({ username: [] })`
// hands back the whole instance rather than nothing. Every lookup below goes
// through these two so "nobody to look up" is answered here instead of coming
// back as somebody else's users — a lobby of nothing but open seats asked for
// zero usernames and got the entire user list, which then failed its
// "did every name resolve?" check and 404'd the host's own lobby.
export async function usersByUsername(usernameList: string[]): Promise<User[]> {
    if (usernameList.length === 0) return [];
    const { data } = await (await clerkClient()).users.getUserList({username: usernameList});
    return data;
}

export async function usersById(userIdList: string[]): Promise<User[]> {
    if (userIdList.length === 0) return [];
    const { data } = await (await clerkClient()).users.getUserList({userId: userIdList});
    return data;
}

const CLERK_USER_PAGE_SIZE = 100;
// Belt and braces against a paging bug turning into an unbounded loop.
const CLERK_USER_MAX_PAGES = 100;

// Pages through every Clerk user, calling `visit` for each — the shared shape
// behind every `/api/cron/*` sweep that has to look at the whole instance
// rather than a known id list (staledevices, staleguests). Returns how many
// users it visited, which every caller reports back as its own `scanned`.
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
            await visit(user);
        }

        if (users.length < CLERK_USER_PAGE_SIZE) {
            break;
        }
    }

    return scanned;
}

// A guest's Clerk username is the random account id createGuest() minted
// (docs/account-less-play.md §5), not something anyone chose to be seen
// under — their firstName carries the name they actually typed at the
// lobby's join screen (step 14), so name resolution inverts the usual
// username-first preference for them.
function displayHandle(user: User): string | null {
    return isGuest(user) ? user.firstName : user.username;
}

// The one place every resolver below turns a looked-up user into a name, so
// they can't drift apart — including what to show when the lookup found
// nobody, which is the half that used to get re-pasted.
function nameOf(user: User | undefined): string {
    return user ? (displayHandle(user) ?? "No username") : UNKNOWN_PLAYER_NAME;
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
    users.forEach(user => { userIdNameMap[user.id] = readableName(user, "No username"); });
    return userIdNameMap;
}

// Profile pictures for a set of users, keyed by user id — null for anyone who
// has never set one (see profileImageUrl). For routes that show people the
// current user isn't necessarily friends with, e.g. who reacted to their move.
export async function userIdListToImageMap(userIdList: string[]): Promise<Map<string, string | null>> {
    const users = await usersById(userIdList);
    return new Map(users.map(user => [user.id, profileImageUrl(user)]));
}

export async function usernameListToUserIdList(usernameList: string[]): Promise<string[]> {
    const users = await usersByUsername(usernameList);
    const userIdList: string[] = [];
    usernameList.forEach(username => {
        const user = users.find(u => u.username === username);
        if (!user) {
            return;
        }
        userIdList.push(user.id);
    });
    return userIdList;
}
