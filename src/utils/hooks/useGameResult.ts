import { useEffect, useState } from "react";
import type { IGameResultResponse } from "@/app/api/gameresult/[gameId]/route";

// Fetches one finished game's full GameResult (including game-specific
// stats). Shared by the recent-form popup and the full result page - same
// data, different amount of chrome around it.
export function useGameResult(gameId: string | null) {
    const [result, setResult] = useState<IGameResultResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!gameId) {
            setResult(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        fetch(`/api/gameresult/${gameId}`)
            .then(response => {
                if (!response.ok) throw new Error(response.statusText || "Failed to load game result");
                return response.json();
            })
            .then(data => {
                if (data && data.success) setResult(data.result);
            })
            .catch(err => setError(err.message ?? "Failed to load game result"))
            .finally(() => setIsLoading(false));
    }, [gameId]);

    return { result, isLoading, error };
}
