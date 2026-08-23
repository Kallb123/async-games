import { useCallback, useState } from "react";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { isGuest } from "@/utils/ui/players";
import { recordGuestMoved } from "@/utils/hooks/useGuestMoved";

interface SubmittingUser {
    id: string;
    username?: string | null;
    firstName?: string | null;
    publicMetadata?: { guest?: boolean };
}

/**
 * The shape every game screen passes down to its actions/board components.
 * `target` names the control or board spot the command came from so exactly
 * that thing can wear the pending skin while the command is in flight.
 */
export type SubmitCommand = (
    command: IGameCommand,
    callback?: (r: ICommandResponse) => void,
    target?: string,
) => Promise<void>;

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
 *
 * `pendingTarget` is the `target` of the in-flight command (null when idle),
 * which is how ActionButton and the boards know which single control or spot
 * to show as processing rather than lighting up the whole screen.
 */
export function useSubmitCommand<T>(
    gameId: uuidString,
    user: SubmittingUser | null | undefined,
    setGameData: (data: T) => void,
    getGameData: () => Promise<void>,
) {
    const [submitting, setSubmitting] = useState(false);
    const [pendingTarget, setPendingTarget] = useState<string | null>(null);

    const submitCommand = useCallback<SubmitCommand>(async (
        command: IGameCommand,
        callback?: (r: ICommandResponse) => void,
        target?: string,
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
        setPendingTarget(target ?? null);
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
            // The claim-account offer's whole trigger (docs/account-less-play.md
            // step 16) — shared by every game through this one hook rather than
            // each board page marking it separately.
            if (isGuest(user)) {
                recordGuestMoved();
            }
        } catch (err) {
            console.error('submitCommand failed', err);
            await getGameData();
        } finally {
            setSubmitting(false);
            setPendingTarget(null);
        }
    }, [submitting, user, gameId, setGameData, getGameData]);

    return { submitCommand, submitting, pendingTarget };
}
