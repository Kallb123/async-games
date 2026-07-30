import { useCallback, useEffect, useRef, useState } from "react";
import type { IRecapResponse } from "@/app/api/game/[gameid]/recap/route";
import { fetchWithSessionRetry } from "./fetchWithSessionRetry";

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
    // The game whose recap we've finished fetching. Comparing it against the
    // current gameId gives us `loading` without storing it, which keeps the
    // fetch from having to setState synchronously inside an effect
    // (react-hooks/set-state-in-effect).
    const [loadedFor, setLoadedFor] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    // Signature of the recap the player last dismissed, so a refetch that
    // returns the same content stays hidden instead of reappearing.
    const dismissedSignature = useRef<string>("");

    const fetchRecap = useCallback(() => {
        if (!enabled || !gameId) return () => {};
        let cancelled = false;

        (async () => {
            const res = await fetchWithSessionRetry(`/api/game/${gameId}/recap`, () => cancelled);
            if (cancelled) return;

            // A null response means the fetch itself failed (network error) —
            // leave whatever recap is already showing alone rather than wiping
            // it, matching the original "swallow and stop loading" behaviour.
            if (res) {
                const data: IRecapResponse | null = res.ok ? await res.json() : null;
                setRecap(data);
                // Re-show only when the refetch surfaced turns the player hasn't
                // already dismissed; unchanged content stays hidden.
                if (data?.hasRecap && recapSignature(data) !== dismissedSignature.current) {
                    setDismissed(false);
                }
            }
            setLoadedFor(gameId);
        })();

        return () => {
            cancelled = true;
        };
    }, [gameId, enabled]);

    // A background refetch (see below) leaves `loading` false, so a recap
    // already on screen stays put instead of flickering out and back.
    const loading = enabled && !!gameId && loadedFor !== gameId;

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

    // Re-open the recap on demand (e.g. from the game-options menu) even after
    // it's been dismissed this visit.
    const reshow = useCallback(() => setDismissed(false), []);

    // Sends a reaction for one recap event. Applied optimistically (the picker
    // in TurnRecap immediately swaps to the sent-reaction pill); on failure —
    // most likely a race where the same action already got a reaction — we
    // just refetch to pick up the server's actual state.
    const react = useCallback((eventId: string, reaction: string) => {
        setRecap((prev) => {
            if (!prev?.events) return prev;
            return {
                ...prev,
                events: prev.events.map((event) =>
                    event.id === eventId ? { ...event, reaction } : event
                ),
            };
        });
        fetch(`/api/game/${gameId}/reaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId, reaction }),
        })
            .then((res) => {
                if (!res.ok) fetchRecap();
            })
            .catch(() => fetchRecap());
    }, [gameId, fetchRecap]);

    return {
        recap,
        loading,
        // Only surface once loaded, when there's something to show and the player
        // hasn't dismissed it this visit.
        show: !loading && !dismissed && !!recap?.hasRecap,
        // Whether there's a recap available to replay, regardless of dismissal.
        hasRecap: !loading && !!recap?.hasRecap,
        dismiss,
        reshow,
        react,
    };
}
