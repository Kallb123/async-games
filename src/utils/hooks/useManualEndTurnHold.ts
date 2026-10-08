import { useCallback, useState } from "react";
import { UNDO_WINDOW_MS } from "@/utils/games/undo";

export interface ManualEndTurnHold {
    /**
     * The deadline the ten-second hold is counting toward: the server's own
     * (`gs.autoEndTurnAt`) when it set one, else this hook's local one, else null.
     * Hand it to `useUndoHold` / `UndoHold`.
     */
    holdDeadline: string | null;
    /**
     * What the End turn button does: send at once with a hold already open
     * ("Pass now") or with nothing to take back, else open the hold and send
     * nothing. `send` is the game's end-turn command.
     */
    endTurn: (send: () => void) => void;
    /** Drops the local hold — after a command lands (the next state decides what is left to hold). */
    clear: () => void;
}

/**
 * What a tap on End turn does (§5): open a hold only when a move can still be
 * taken back and none is open yet; a hold already counting down, or nothing to
 * take back, sends at once.
 */
export function endTurnTapPlan(holdDeadline: string | null, canUndo: boolean): "hold" | "send" {
    return holdDeadline === null && canUndo ? "hold" : "send";
}

/** The deadline a hold opened at `nowMs` counts toward. */
export function manualHoldDeadline(nowMs: number): string {
    return new Date(nowMs + UNDO_WINDOW_MS).toISOString();
}

/**
 * docs/undo.md §5's "Why a manual End turn waits too": tapping End turn while
 * a move can still be taken back starts the same ten-second hold a held move
 * would have, client-side, instead of sending. Shared by every game whose End
 * turn is the player's own tap — Settlements & Cities, Fires Out.
 *
 * The local hold lives only as long as `canUndo` does. A resync that takes the
 * undoable move away, or a turn that has moved on, leaves nothing to hold for —
 * and a deadline left behind would fire the next End turn the instant a later
 * move made `canUndo` true again.
 *
 * `serverDeadline` is the game's `autoEndTurnAt` when it has one; it wins, so
 * a game with both kinds of ending shows one countdown.
 */
export function useManualEndTurnHold(canUndo: boolean, serverDeadline: string | null = null): ManualEndTurnHold {
    const [localDeadline, setLocalDeadline] = useState<string | null>(null);
    // Adjusting state while rendering (not in an effect) so a stale deadline is
    // never painted, let alone fired on.
    if (localDeadline !== null && !canUndo) setLocalDeadline(null);

    const holdDeadline = serverDeadline ?? localDeadline;
    const endTurn = useCallback((send: () => void) => {
        if (endTurnTapPlan(holdDeadline, canUndo) === "hold") {
            setLocalDeadline(manualHoldDeadline(Date.now()));
            return;
        }
        send();
    }, [holdDeadline, canUndo]);
    const clear = useCallback(() => setLocalDeadline(null), []);

    return { holdDeadline, endTurn, clear };
}
