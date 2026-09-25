// A game as `/api/game/[gameid]` sends it, for the client tests that only read
// a few of its fields — a hook's poll condition, the count a command carries,
// a history line's reactions. Everything else is stubbed.

import type { IGameDataResponse, IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";
import type { IGameType } from "@/utils/apiModels/GameLogic";

/** A two-seat board, "me" and "them"; `url` is the game it claims to be. */
export function testBoard(
    url: string,
    { currentTurn = "me", complete = false, commandCount = 0, history = [] }: {
        currentTurn?: string;
        complete?: boolean;
        commandCount?: number;
        history?: IHistoryEntryResponse[];
    } = {},
): IGameDataResponse {
    return {
        gameType: { url } as IGameType,
        usernameList: [],
        userIdList: ["me", "them"],
        turnTimer: "",
        currentTurn,
        gameState: { turnOrder: ["me", "them"], history, commandCount },
        complete,
        winner: "",
    };
}
