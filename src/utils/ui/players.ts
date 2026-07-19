import { IGameResponse } from "@/utils/apiModels/GameDataApi";

// Human-readable summary of who you're playing against, excluding yourself.
export function opponents(game: IGameResponse, me: string | null | undefined, emptyLabel = "solo"): string {
    const others = game.usernameList.filter(u => u !== me);
    if (others.length === 0) return emptyLabel;
    if (others.length === 1) return others[0];
    if (others.length === 2) return `${others[0]} & ${others[1]}`;
    return `${others[0]} & ${others.length - 1} others`;
}
