import { useEffect } from "react";
import { useNow } from "@/utils/hooks/useNow";
import { countdownFillPercent, secondsUntil } from "@/utils/games/TurnTimer";

export interface UndoHoldCountdown {
    /** Seconds left until `deadline`, or null with no hold open (or before hydration). */
    countdown: number | null;
    /** How much of `windowMs` has run, 0–100, for a countdown button's fill. 0 with no hold open. */
    fillPct: number;
}

/**
 * The clock behind docs/undo.md §5's ten-second hold, shared by every screen
 * that has to show one counting down — Settlements & Cities' turn sheet and
 * Race Cars' turn sheet *and* its end-of-move reveal all read the same
 * `deadline` off the live game state, so whichever of them is on screen when
 * the window closes is the one that fires the hand-off; none of them can go
 * stale just because the player is looking at a different screen than the one
 * that opened the hold.
 *
 * Ticks toward `deadline` and calls `onExpire` once it passes — re-read every
 * tick rather than scheduled once, so a deadline that moves or clears (an
 * Undo landing, a fresh hold opening) is picked up on the very next tick
 * rather than argued with. `onExpire` should wrap a `submitCommand` whose own
 * in-flight guard already makes a repeat call between ticks harmless — see
 * `useSubmitCommand` — so it does not need to be debounced here.
 */
export function useUndoHold(deadline: string | null, windowMs: number, onExpire: () => void): UndoHoldCountdown {
    const now = useNow(deadline !== null);
    useEffect(() => {
        if (deadline === null || now === null) return;
        if (now < new Date(deadline).getTime()) return;
        onExpire();
    }, [now, deadline, onExpire]);

    return {
        countdown: deadline !== null ? secondsUntil(deadline, now) : null,
        fillPct: deadline !== null ? countdownFillPercent(deadline, now, windowMs) : 0,
    };
}
