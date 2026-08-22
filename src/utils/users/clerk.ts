import { clerkClient, User } from "@clerk/nextjs/server";
import { readableName } from "@/utils/ui/players";
import { profileImageUrl } from "@/utils/ui/avatar";

export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const { data: users } = await (await clerkClient()).users.getUserList({userId: userIdList});
    const usernameList: string[] = [];
    userIdList.forEach(userId => {
        const user = users.find(u => u.id === userId);
        if (!user) {
            return;
        }
        usernameList.push(user.username ?? "No username");
    });
    return usernameList;
}

export async function userIdListToUsernameMap(userIdList: string[]): Promise<Map<string, string>> {
    const { data: users } = await (await clerkClient()).users.getUserList({userId: userIdList});
    const usernameMap: Map<string, string> = new Map;
    userIdList.forEach(userId => {
        const user = users.find(u => u.id === userId);
        if (!user) {
            return;
        }
        usernameMap.set(userId, user.username ?? "No username");
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
    // An empty userId filter is not a filter — Clerk would hand back its whole
    // user list, so answer the "nobody to look up" case here.
    if (userIdList.length === 0) return new Map;
    const { data: users } = await (await clerkClient()).users.getUserList({userId: userIdList});
    return new Map(users.map(user => [user.id, profileImageUrl(user)]));
}

export async function usernameListToUserIdList(usernameList: string[]): Promise<string[]> {
    const { data: users } = await (await clerkClient()).users.getUserList({username: usernameList});
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
