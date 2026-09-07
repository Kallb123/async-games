import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";

/**
 * Sends a reaction on one line of the live turn-history log and reflects it
 * locally right away — the log's own twin of useTurnRecap's `react`, keyed by
 * `commandId` (what a history line carries) rather than `eventId` (what a
 * recap event carries); the reaction route accepts either. Applied
 * optimistically first, so the pill appears the instant it's tapped rather
 * than after a round trip, then reconciled with a real `getGameData` refetch
 * once the request settles either way — the log otherwise had nothing to make
 * it refetch on its own (no new command, no push, and polling is off while
 * it's this player's own turn), so a sent reaction stayed missing from the
 * panel until something else happened to refresh it.
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

        setGameData((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                gameState: {
                    ...prev.gameState,
                    history: prev.gameState.history.map((entry) => entry.commandId === commandId
                        ? { ...entry, reactions: [...(entry.reactions ?? []), { reaction, actorId: viewerId, actorUsername: "" }] }
                        : entry),
                },
            };
        });

        fetch(`/api/game/${gameId}/reaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commandId, reaction }),
        })
            .then(() => getGameData())
            .catch(() => getGameData());
    }, [gameId, viewerId, setGameData, getGameData]);
}
