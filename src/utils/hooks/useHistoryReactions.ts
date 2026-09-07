import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import { addReaction } from "@/utils/reactions";

/**
 * Applies one reaction to the live history line with this `commandId`, in
 * local state — the one merge both `useHistoryReactions` (reacting from the
 * log itself) and `useTurnRecap` (reacting from the recap screen, which reads
 * `gameData` for nothing else but still needs the log to pick the reaction up
 * without a refetch) need, against the *same* `gameData` a game page already
 * holds. A no-op if the game hasn't loaded yet or carries no such line —
 * reacting from the recap screen names a command by looking it up in the
 * recap's own event list, not this state, so the two can only ever disagree
 * if the game reloaded out from under the screen mid-tap, which the fallback
 * getGameData refetch after every send (see below) covers regardless.
 */
export function patchHistoryReaction<T extends IGameDataResponse>(
    setGameData: Dispatch<SetStateAction<T | null>>,
    commandId: string,
    actorId: string,
    reaction: string,
) {
    setGameData((prev) => {
        if (!prev) return prev;
        return {
            ...prev,
            gameState: {
                ...prev.gameState,
                history: prev.gameState.history.map((entry) => entry.commandId === commandId
                    ? { ...entry, reactions: addReaction(entry.reactions, actorId, reaction) }
                    : entry),
            },
        };
    });
}

/**
 * Sends a reaction on one line of the live turn-history log and reflects it
 * locally right away, keyed by `commandId` (what a history line carries)
 * rather than `eventId` (what a recap event carries); the reaction route
 * accepts either. Applied optimistically first, so the pill appears the
 * instant it's tapped rather than after a round trip, then reconciled with a
 * real `getGameData` refetch once the request settles either way — the log
 * otherwise had nothing to make it refetch on its own (no new command, no
 * push, and polling is off while it's this player's own turn), so a sent
 * reaction stayed missing from the panel until something else happened to
 * refresh it.
 *
 * Only meaningful against the *live* history (`gameData.gameState.history`,
 * what `setGameData`/`getGameData` own): a past turn reconstructed for
 * "review moves" or a hypothetical planned one isn't stored, so a caller
 * viewing one of those should pass no `onReact` to `MatchHistory` rather than
 * wire this in — reacting to a line that was never really played would 404.
 */
export function useHistoryReactions<T extends IGameDataResponse>(
    gameId: string,
    viewerId: string | undefined,
    setGameData: Dispatch<SetStateAction<T | null>>,
    getGameData: () => void | Promise<void>,
) {
    return useCallback((commandId: string, reaction: string) => {
        if (!viewerId) return;

        patchHistoryReaction(setGameData, commandId, viewerId, reaction);

        fetch(`/api/game/${gameId}/reaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commandId, reaction }),
        })
            .then(() => getGameData())
            .catch(() => getGameData());
    }, [gameId, viewerId, setGameData, getGameData]);
}
