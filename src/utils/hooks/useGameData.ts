import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// A tab returning to the foreground can fire its refetch (see usePushEvents'
// refreshOnVisible) before Clerk has finished refreshing the session cookie
// that expired while backgrounded, so the request briefly 401s even though
// the user is still signed in. One short retry clears that race without
// bouncing the player back to the homepage.
const AUTH_RETRY_DELAY_MS = 1000;

/**
 * Fetches a game's current state from `/api/game/[gameid]`, shared by every
 * game screen. Retries once on a 401 (transient session-cookie refresh race)
 * before redirecting home on genuine failures (404 game not found, or a 401
 * that persists after the retry).
 */
export function useGameData<T>(gameId: string) {
    const [gameData, setGameData] = useState({} as T);
    const router = useRouter();
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const fetchGame = useCallback(async (isRetry: boolean): Promise<void> => {
        let res: Response;
        try {
            res = await fetch(`/api/game/${gameId}`);
        } catch (error) {
            if (!mountedRef.current) return;
            console.error(error);
            router.push('/');
            return;
        }

        if (res.status === 401 && !isRetry) {
            await new Promise(resolve => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
            if (!mountedRef.current) return;
            return fetchGame(true);
        }
        if (!mountedRef.current) return;

        if (!res.ok) {
            console.error(`Failed to load game ${gameId}: ${res.status}`);
            router.push('/');
            return;
        }

        const data = await res.json();
        if (data && mountedRef.current) setGameData(data.gameData);
    }, [gameId, router]);

    const getGameData = useCallback(() => fetchGame(false), [fetchGame]);

    return { gameData, setGameData, getGameData };
}
