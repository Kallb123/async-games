import { describe, expect, it } from "vitest";
import { patchHistoryReaction } from "./useHistoryReactions";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { IGameType } from "@/utils/apiModels/gameCommand";

/** A `setGameData`-shaped stand-in that just applies the updater to a held value, like React's own setState does for the functional-update form. */
function fakeSetGameData<T extends IGameDataResponse>(initial: T | null) {
    let value = initial;
    const setGameData = (update: T | null | ((prev: T | null) => T | null)) => {
        value = typeof update === "function" ? (update as (prev: T | null) => T | null)(value) : update;
    };
    return { setGameData, get: () => value };
}

/** Only `gameState.history` matters to patchHistoryReaction — the rest of a real IGameType is irrelevant here. */
const STUB_GAME_TYPE = {} as IGameType;

function gameData(history: { commandId?: string; reactions?: { reaction: string; actorId: string; actorUsername: string }[] }[]): IGameDataResponse {
    return {
        gameType: STUB_GAME_TYPE,
        usernameList: [],
        userIdList: [],
        turnTimer: "",
        currentTurn: "",
        gameState: { turnOrder: [], history: history.map((entry) => ({ text: "", ...entry })) },
        complete: false,
        winner: "",
    };
}

describe("patchHistoryReaction", () => {
    it("adds the reaction to the live history line with that commandId", () => {
        const { setGameData, get } = fakeSetGameData(gameData([
            { commandId: "cmd-1" },
            { commandId: "cmd-2" },
        ]));

        patchHistoryReaction(setGameData, "cmd-2", "user_a", "😱");

        // This is the regression this guards: a reaction sent from the recap
        // screen (which reads its own separate `recap` state, not `gameData`)
        // has to land here too, or the turn-history log — which reads
        // `gameData.gameState.history` — stays missing it until something
        // else happens to refetch the game.
        expect(get()?.gameState.history).toEqual([
            { text: "", commandId: "cmd-1" },
            { text: "", commandId: "cmd-2", reactions: [{ reaction: "😱", actorId: "user_a", actorUsername: "" }] },
        ]);
    });

    it("leaves every other line untouched", () => {
        const untouched = { text: "", commandId: "cmd-1", reactions: [{ reaction: "Nice!", actorId: "user_b", actorUsername: "Bob" }] };
        const { setGameData, get } = fakeSetGameData(gameData([untouched, { commandId: "cmd-2" }]));

        patchHistoryReaction(setGameData, "cmd-2", "user_a", "🤔");

        expect(get()?.gameState.history[0]).toEqual(untouched);
    });

    it("is a no-op when the game hasn't loaded yet", () => {
        const { setGameData, get } = fakeSetGameData<IGameDataResponse>(null);

        patchHistoryReaction(setGameData, "cmd-1", "user_a", "😬");

        expect(get()).toBeNull();
    });

    it("is a no-op when no line carries that commandId", () => {
        const { setGameData, get } = fakeSetGameData(gameData([{ commandId: "cmd-1" }]));

        patchHistoryReaction(setGameData, "cmd-missing", "user_a", "😬");

        expect(get()?.gameState.history).toEqual([{ text: "", commandId: "cmd-1" }]);
    });
});
