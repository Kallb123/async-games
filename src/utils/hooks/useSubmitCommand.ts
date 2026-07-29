import { useCallback, useState } from "react";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { uuidString } from "@/utils/apiModels/GameDataApi";

interface SubmittingUser {
    id: string;
    username?: string | null;
    firstName?: string | null;
}

/**
 * Submits a game command to /api/game/command, shared by every game screen.
 * Guards against a double-tap or slow-network double-submit firing two
 * commands for the same turn before the first response lands — without this,
 * two in-flight requests can each read the same pre-move game state and race
 * to save, desyncing turn bookkeeping from what actually got applied (see
 * optimisticConcurrency in GameData.ts, which turns the losing save into a
 * 409 instead of a silent overwrite). While a command is in flight, further
 * submitCommand calls are ignored. On any rejected/failed command, resyncs
 * with the server via getGameData() instead of invoking the callback with
 * stale or placeholder data.
 */
export function useSubmitCommand<T>(
    gameId: uuidString,
    user: SubmittingUser | null | undefined,
    setGameData: (data: T) => void,
    getGameData: () => Promise<void>,
) {
    const [submitting, setSubmitting] = useState(false);

    const submitCommand = useCallback(async (
        command: IGameCommand,
        callback?: (r: ICommandResponse) => void,
    ) => {
        if (submitting) return;
        if (!user) {
            console.error("Unable to send command whilst not logged in");
            return;
        }
        command.gameId = gameId;
        command.senderId = user.id;
        command.senderUsername = user.username || user.firstName || user.id;
        setSubmitting(true);
        try {
            const res = await fetch('/api/game/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(command),
            });
            const data: ICommandResponse | null = res.ok ? await res.json() : null;
            if (!data?.gameData) {
                await getGameData();
                return;
            }
            setGameData(data.gameData as T);
            callback?.(data);
        } catch (err) {
            console.error('submitCommand failed', err);
            await getGameData();
        } finally {
            setSubmitting(false);
        }
    }, [submitting, user, gameId, setGameData, getGameData]);

    return { submitCommand, submitting };
}
