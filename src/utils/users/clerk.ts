import { clerkClient } from "@clerk/nextjs";

export async function userIdListToUsernameList(userIdList: string[]): Promise<string[]> {
    const users = await clerkClient.users.getUserList({userId: userIdList});
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

export async function usernameListToUserIdList(usernameList: string[]): Promise<string[]> {
    const users = await clerkClient.users.getUserList({username: usernameList});
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
