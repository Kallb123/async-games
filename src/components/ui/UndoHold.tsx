'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import UndoButton from '@/components/ui/UndoButton';
import { useUndoHold } from '@/utils/hooks/useUndoHold';

interface UndoHoldProps {
    /** `gs.autoEndTurnAt` — set while a move that ended the turn is held open for its own undo window (docs/undo.md §5). */
    holdDeadline: string | null;
    /** How long the hold runs, for the countdown button's fill — the game's `UNDO_WINDOW_MS`. */
    windowMs: number;
    /** `gs.canUndo` — true whenever the viewer has a move they can still take back. */
    canUndo: boolean;
    /** Sends the game's end-turn command: "Pass now", and the countdown running out. */
    onEndTurn: () => void;
    onUndo: () => void;
    endTurnPending: boolean;
    undoPending: boolean;
    /**
     * True when the caller already sits inside its own `.ag-actionsheet` (or
     * equivalent padded panel) — skips this component's own copy so the two
     * don't double up their padding, and adds a small top margin instead of
     * relying on the panel's own to separate it from what came before.
     * Defaults to false: a standalone `.ag-actionsheet` of its own, the shape
     * the full-panel hold uses.
     */
    nested?: boolean;
}

/**
 * The Pass now / Undo pair a held turn shows (docs/undo.md §5), with the
 * countdown under it and the hand-off sent by itself when that runs out. Reads
 * the deadline straight off the live game state, so whichever screen is up
 * when the window closes is the one that fires it.
 *
 * Two shapes: a countdown with both buttons once a hold is open, or Undo
 * alone for a move that can be taken back with nothing yet to end the turn on
 * (a Race Cars move that earned a tow).
 */
export default function UndoHold({
    holdDeadline, windowMs, canUndo, onEndTurn, onUndo, endTurnPending, undoPending, nested = false,
}: UndoHoldProps) {
    const { countdown, fillPct } = useUndoHold(holdDeadline, windowMs, onEndTurn);

    if (holdDeadline === null && !canUndo) return null;

    const grid = (
        <div className="ag-action-grid">
            {holdDeadline !== null && (
                <ActionButton
                    className="ag-btn ag-btn--success ag-btn--countdown"
                    style={{ padding: '14px 0', fontSize: 15, '--ag-countdown-fill': `${fillPct}%` } as React.CSSProperties}
                    pending={endTurnPending}
                    pendingLabel="Finishing…"
                    onClick={onEndTurn}
                >
                    Pass now
                </ActionButton>
            )}
            {canUndo && <UndoButton pending={undoPending} onClick={onUndo} />}
        </div>
    );
    const hint = countdown !== null ? <p className="ag-hint">Turn passes in {countdown}s</p> : null;

    if (nested) {
        return <div style={{ marginTop: 10 }}>{grid}{hint}</div>;
    }

    return (
        <div className="ag-actionsheet">
            {grid}
            {hint}
        </div>
    );
}
