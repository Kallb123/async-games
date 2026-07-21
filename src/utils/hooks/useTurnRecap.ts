import { useCallback, useEffect, useState } from "react";
import type { IRecapResponse } from "@/app/api/game/[gameid]/recap/route";

// Fetches the "since you were last here" recap for a game and owns whether it's
// currently on screen. The game page shows the recap when `show` is true, then
// calls `dismiss()` (from the CTA or the back control) to reveal the board.
export function useTurnRecap(gameId: string, enabled: boolean = true) {
    const [recap, setRecap] = useState<IRecapResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!enabled || !gameId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetch(`/api/game/${gameId}/recap`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: IRecapResponse | null) => {
                if (cancelled) return;
                setRecap(data);
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [gameId, enabled]);

    const dismiss = useCallback(() => setDismissed(true), []);

    return {
        recap,
        loading,
        // Only surface once loaded, when there's something to show and the player
        // hasn't dismissed it this visit.
        show: !loading && !dismissed && !!recap?.hasRecap,
        dismiss,
    };
}
