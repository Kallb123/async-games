import { clerkClient } from "@clerk/nextjs/server";

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
