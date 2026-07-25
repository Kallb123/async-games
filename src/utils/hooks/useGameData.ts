import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSessionRetry } from "./fetchWithSessionRetry";

/**
 * Fetches a game's current state from `/api/game/[gameid]`, shared by every
 * game screen. Retries once on a 401 (transient session-cookie refresh race,
 * see fetchWithSessionRetry) before redirecting home on genuine failures
 * (404 game not found, or a 401 that persists after the retry).
 */
export function useGameData<T>(gameId: string) {
    const [gameData, setGameData] = useState({} as T);
    const router = useRouter();
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const getGameData = useCallback(async (): Promise<void> => {
        const res = await fetchWithSessionRetry(`/api/game/${gameId}`, () => !mountedRef.current);
        if (!mountedRef.current) return;

        if (!res || !res.ok) {
            console.error(`Failed to load game ${gameId}: ${res?.status ?? "network error"}`);
            router.push('/');
            return;
        }

        const data = await res.json();
        if (data && mountedRef.current) setGameData(data.gameData);
    }, [gameId, router]);

    return { gameData, setGameData, getGameData };
}
