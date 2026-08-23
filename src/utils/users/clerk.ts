import { clerkClient, User } from "@clerk/nextjs/server";
import { readableName } from "@/utils/ui/players";
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
// signed in.
export function isUnlockedUser(user: User | null | undefined): boolean {
    return user?.publicMetadata.unlocked === true;
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

export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const users = await usersById(userIdList);
    return userIdList.map(userId => {
        const user = users.find(u => u.id === userId);
        return user ? (user.username ?? "No username") : UNKNOWN_PLAYER_NAME;
    });
}

export async function userIdListToUsernameMap(userIdList: string[]): Promise<Map<string, string>> {
    const users = await usersById(userIdList);
    const usernameMap: Map<string, string> = new Map;
    userIdList.forEach(userId => {
        const user = users.find(u => u.id === userId);
        usernameMap.set(userId, user ? (user.username ?? "No username") : UNKNOWN_PLAYER_NAME);
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
