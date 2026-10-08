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
 * docs/undo.md §5's "Why a manual End turn waits too": tapping End turn while
 * a move can still be taken back starts the same ten-second hold a held move
 * would have, client-side, instead of sending. Shared by every game whose End
 * turn is the player's own tap — Settlements & Cities, Fires Out.
 *
 * Once tapped, the hold runs to the end of the player's turn whatever happens
 * to `canUndo` meanwhile: the player asked for the turn to end, and a
 * teammate's out-of-turn play that moves the undo anchor shouldn't swallow the
 * tap. It is dropped when the turn is no longer theirs (`myTurn` false), so a
 * deadline left behind can never fire on a later turn.
 *
 * `serverDeadline` is the game's `autoEndTurnAt` when it has one; it wins, so
 * a game with both kinds of ending shows one countdown.
 */
export function useManualEndTurnHold(canUndo: boolean, myTurn: boolean, serverDeadline: string | null = null): ManualEndTurnHold {
    const [localDeadline, setLocalDeadline] = useState<string | null>(null);
    // Adjusting state while rendering (not in an effect) so a stale deadline is
    // never painted, let alone fired on.
    if (localDeadline !== null && !myTurn) setLocalDeadline(null);

    const holdDeadline = serverDeadline ?? localDeadline;
    const endTurn = useCallback((send: () => void) => {
        if (holdDeadline === null && canUndo) {
            setLocalDeadline(new Date(Date.now() + UNDO_WINDOW_MS).toISOString());
            return;
        }
        send();
    }, [holdDeadline, canUndo]);
    const clear = useCallback(() => setLocalDeadline(null), []);

    return { holdDeadline, endTurn, clear };
}
