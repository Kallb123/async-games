import { IGameResponse } from "@/utils/apiModels/GameDataApi";

// Human-readable summary of who you're playing against, excluding yourself.
export function opponents(game: IGameResponse, me: string | null | undefined, emptyLabel = "solo"): string {
    const others = game.usernameList.filter(u => u !== me);
    if (others.length === 0) return emptyLabel;
    if (others.length === 1) return others[0];
    if (others.length === 2) return `${others[0]} & ${others[1]}`;
    return `${others[0]} & ${others.length - 1} others`;
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
