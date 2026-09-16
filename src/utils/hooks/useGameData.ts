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
 * `loading` is true whenever a fetch is in flight — the first one and every
 * later refresh — which is what the shell's top-bar loading bar renders from.
 * It is deliberately not the `isLoading`/`isRefreshing` pair `useRefreshableData`
 * draws for the dashboard: a board never swaps itself out for a skeleton, so
 * the only thing either flag would drive here is that one bar.
 *
 * Retries once on a 401 (transient session-cookie refresh race, see
 * fetchWithSessionRetry) before bailing on genuine failures: a 404 (no
 * such live game — it may still have a finished GameResult) sends the user
 * to that game's result page instead, which enforces its own view
 * permission; any other failure (a 401 that persists after the retry, or a
 * network error) redirects home.
 */
export function useGameData<T extends IGameDataResponse>(gameId: string) {
    // Null until the first response lands, rather than `{} as T`. The cast was
    // a lie the compiler then enforced everywhere downstream: every screen
    // reads `gameData.specificGameState.…` on its very first render, when the
    // object is empty, and the type said that was safe. Every board already
    // optional-chains its way around it — this makes the type agree with the
    // code, so a new screen that forgets is a compile error rather than a
    // blank board and a thrown render.
    const [gameData, setGameData] = useState<T | null>(null);
    // True from mount rather than from the dispatch of the first fetch, so the
    // gap between the viewer being authorised and the effect below firing isn't
    // a blink of "idle" in the middle of the first load. It is only ever cleared
    // in `getGameData`'s `finally`, which is why what the hook *returns* is
    // gated on `isAuthorised` below.
    const [loading, setLoading] = useState(true);
    const { isAuthorised, user } = useIsAuthorised();
    const router = useRouter();
    const mountedRef = useRef(true);
    // A count, not a flag: a push-driven refresh and the ten-second poll can
    // overlap, and the first to finish must not clear the bar while the second
    // is still out.
    const inFlightRef = useRef(0);
    // Whether a fetch has ever finished. `loading` already starts true, so the
    // very first fetch has nothing to raise — and raising it from the effect
    // that kicks that fetch off is the cascading render
    // `react-hooks/set-state-in-effect` exists to stop. `useRefreshableData`
    // gates its own `setIsRefreshing` on the same ref for the same reason.
    const loadedRef = useRef(false);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const getGameData = useCallback(async (): Promise<void> => {
        inFlightRef.current += 1;
        if (loadedRef.current) setLoading(true);
        try {
            const res = await fetchWithSessionRetry(`/api/game/${gameId}`, () => !mountedRef.current);
            if (!mountedRef.current) return;

            if (!res || !res.ok) {
                console.error(`Failed to load game ${gameId}: ${res?.status ?? "network error"}`);
                router.push(res?.status === 404 ? `/games/result/${gameId}` : '/');
                return;
            }

            // Guarded for the same reason useRefreshableData guards its own parse:
            // a 200 that isn't JSON (a proxy's error page, a truncated body) throws
            // here, and this runs inside an effect with nothing to catch it.
            // Keeping the last good state beats blanking the board.
            let data: { gameData?: T } | null = null;
            try {
                data = await res.json();
            } catch (error) {
                console.error(`Failed to parse game ${gameId}`, error);
                return;
            }
            if (data?.gameData && mountedRef.current) setGameData(data.gameData);
        } finally {
            // In a `finally` so a thrown fetch (an unreachable network) clears
            // the bar too, rather than leaving it pulsing for the rest of the
            // session.
            inFlightRef.current -= 1;
            loadedRef.current = true;
            if (inFlightRef.current === 0 && mountedRef.current) setLoading(false);
        }
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

    return {
        gameData,
        setGameData,
        getGameData,
        // Gated on `isAuthorised` — the condition on the only thing that ever
        // clears the flag. Clerk's script not loading at all (a blocker, an
        // outage, an offline first paint) leaves `isAuthorised` false forever,
        // and `useAuthGuard` deliberately doesn't redirect for it; without this
        // the bar would pulse for the life of the tab with nothing in flight.
        loading: loading && isAuthorised,
    };
}
