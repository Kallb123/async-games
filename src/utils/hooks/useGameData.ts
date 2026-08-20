import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSessionRetry } from "./fetchWithSessionRetry";
import { useIsAuthorised } from "./useAuthGuard";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "./usePushEvents";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";

/**
 * Fetches a game's current state from `/api/game/[gameid]`, shared by every
 * game screen. Loads once the viewer is signed in and unlocked (the screen
 * itself owns the redirect via `useAuthGuard`) and re-fetches whenever the
 * turn advances or the tab returns to the foreground — the game-screen twin
 * of `useRefreshableData`, which does the same for the dashboard lists.
 *
 * While an opponent could be moving, it also polls (see `pollWhileWatching`):
 * a player watching the board is the one case no push covers, since the tab
 * never goes away to come back.
 *
 * Retries once on a 401 (transient session-cookie refresh race, see
 * fetchWithSessionRetry) before bailing on genuine failures: a 404 (no
 * such live game — it may still have a finished GameResult) sends the user
 * to that game's result page instead, which enforces its own view
 * permission; any other failure (a 401 that persists after the retry, or a
 * network error) redirects home.
 */
export function useGameData<T extends IGameDataResponse>(gameId: string) {
    const [gameData, setGameData] = useState({} as T);
    const { isAuthorised, user } = useIsAuthorised();
    const router = useRouter();
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const getGameData = useCallback(async (): Promise<void> => {
        const res = await fetchWithSessionRetry(`/api/game/${gameId}`, () => !mountedRef.current);
        if (!mountedRef.current) return;

        if (!res || !res.ok) {
            console.error(`Failed to load game ${gameId}: ${res?.status ?? "network error"}`);
            router.push(res?.status === 404 ? `/games/result/${gameId}` : '/');
            return;
        }

        const data = await res.json();
        if (data && mountedRef.current) setGameData(data.gameData);
    }, [gameId, router]);

    useEffect(() => {
        if (isAuthorised) {
            getGameData();
        }
    }, [isAuthorised, getGameData]);

    // Poll only while there is something that could change under us: the game
    // is live and the turn belongs to somebody else. On the viewer's own turn
    // nothing can move until they act, so polling then would be pure noise —
    // and `YourTurn` already pushes the moment the turn comes back to them.
    // `currentTurn` is empty until the first fetch lands, and on a finished
    // game.
    const waitingOnOpponent = !!gameData?.currentTurn
        && !gameData.complete
        && gameData.currentTurn !== user?.id;

    usePushEvents(TURN_ADVANCED_EVENTS, getGameData, {
        refreshOnVisible: true,
        pollWhileWatching: waitingOnOpponent,
    });

    return { gameData, setGameData, getGameData };
}
