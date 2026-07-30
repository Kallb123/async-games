import { useEffect, useState } from "react";
import type { IGameResultResponse } from "@/app/api/gameresult/[gameId]/route";

// What one completed fetch left behind, tagged with the game it was for so a
// result belonging to a previous gameId is never mistaken for the current one.
interface FetchedResult {
    gameId: string;
    result?: IGameResultResponse;
    error?: string;
}

// Fetches one finished game's full GameResult (including game-specific
// stats). Shared by the recent-form popup and the full result page - same
// data, different amount of chrome around it.
export function useGameResult(gameId: string | null) {
    const [fetched, setFetched] = useState<FetchedResult | null>(null);

    useEffect(() => {
        if (!gameId) return;
        let cancelled = false;
        fetch(`/api/gameresult/${gameId}`)
            .then(response => {
                if (!response.ok) throw new Error(response.statusText || "Failed to load game result");
                return response.json();
            })
            .then(data => {
                if (!cancelled) setFetched({ gameId, result: data?.success ? data.result : undefined });
            })
            .catch(err => {
                if (!cancelled) setFetched({ gameId, error: err.message ?? "Failed to load game result" });
            });
        return () => { cancelled = true; };
    }, [gameId]);

    // Loading and error are derived rather than stored: setting them from inside
    // the effect would be a synchronous setState in an effect body
    // (react-hooks/set-state-in-effect), and deriving them also means a new
    // gameId reads as loading immediately instead of briefly showing the
    // previous game's result.
    const current = fetched?.gameId === gameId ? fetched : null;

    return {
        result: current?.result ?? null,
        isLoading: gameId !== null && current === null,
        error: current?.error ?? null,
    };
}
