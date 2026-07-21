import { useCallback, useEffect, useRef, useState } from "react";
import type { IRecapResponse } from "@/app/api/game/[gameid]/recap/route";

// A stable signature of a recap's contents, so we can tell whether a refetch
// surfaced something new. Two recaps with the same events are "the same" and a
// recap the player already dismissed shouldn't pop back up unchanged.
function recapSignature(recap: IRecapResponse | null): string {
    if (!recap?.hasRecap || !recap.events) return "";
    return recap.events.map((event) => event.id).join(",");
}

// Fetches the "since you were last here" recap for a game and owns whether it's
// currently on screen. The game page shows the recap when `show` is true, then
// calls `dismiss()` (from the CTA or the back control) to reveal the board.
//
// The recap is fetched on load and again whenever the app comes back into focus
// (a visibility change to visible). Coming back to a backgrounded tab is exactly
// when opponents may have moved, so we refetch and — if the recap now covers new
// turns the player hasn't seen — surface it again.
export function useTurnRecap(gameId: string, enabled: boolean = true) {
    const [recap, setRecap] = useState<IRecapResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    // Signature of the recap the player last dismissed, so a refetch that
    // returns the same content stays hidden instead of reappearing.
    const dismissedSignature = useRef<string>("");

    const fetchRecap = useCallback(() => {
        if (!enabled || !gameId) {
            setLoading(false);
            return () => {};
        }
        let cancelled = false;
        setLoading(true);
        fetch(`/api/game/${gameId}/recap`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: IRecapResponse | null) => {
                if (cancelled) return;
                setRecap(data);
                setLoading(false);
                // Re-show only when the refetch surfaced turns the player hasn't
                // already dismissed; unchanged content stays hidden.
                if (data?.hasRecap && recapSignature(data) !== dismissedSignature.current) {
                    setDismissed(false);
                }
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [gameId, enabled]);

    useEffect(() => fetchRecap(), [fetchRecap]);

    // Refetch when the tab/app returns to the foreground — the moment opponents'
    // moves made while we were away become worth showing.
    useEffect(() => {
        if (!enabled || !gameId) return;
        let cleanupFetch: () => void = () => {};
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                cleanupFetch();
                cleanupFetch = fetchRecap();
            }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            cleanupFetch();
        };
    }, [gameId, enabled, fetchRecap]);

    const dismiss = useCallback(() => {
        dismissedSignature.current = recapSignature(recap);
        setDismissed(true);
    }, [recap]);

    return {
        recap,
        loading,
        // Only surface once loaded, when there's something to show and the player
        // hasn't dismissed it this visit.
        show: !loading && !dismissed && !!recap?.hasRecap,
        dismiss,
    };
}
