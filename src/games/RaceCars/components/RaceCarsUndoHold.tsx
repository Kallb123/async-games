'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { useUndoHold } from '@/utils/hooks/useUndoHold';
import { RaceCarsEndTurn, RaceCarsUndo } from '@/utils/apiModels/GameLogic';
import { UNDO_WINDOW_MS } from '@/games/RaceCars/board';

interface RaceCarsUndoHoldProps {
    /** `gs.autoEndTurnAt` — set once a leg that ended the turn is held open for its own undo window (docs/undo.md §5). */
    holdDeadline: string | null;
    /** `gs.canUndo` — true whenever the viewer has a move or tow they can still take back. */
    canUndo: boolean;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so only the tapped button shows as processing. */
    pendingTarget: string | null;
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
 * The Undo / Pass now pair, shared by the turn sheet (`RaceCarsActions`) and
 * the end-of-move reveal (`RaceCarsEndMoveScreen`) — a hold counts down
 * whichever screen the driver is actually looking at rather than only the
 * one that opened it, so this reads `holdDeadline`/`canUndo` straight off the
 * live `gs` both screens already have instead of going stale until the
 * driver dismisses back to the board.
 *
 * Two shapes: a countdown with both buttons once a hold is open, or Undo
 * alone for the mid-sequence case (a move that earned a tow, undoable before
 * the tow is decided, with nothing yet to end the turn on).
 */
export default function RaceCarsUndoHold({ holdDeadline, canUndo, submitCommand, pendingTarget, nested = false }: RaceCarsUndoHoldProps) {
    const { countdown, fillPct } = useUndoHold(
        holdDeadline,
        UNDO_WINDOW_MS,
        () => submitCommand(new RaceCarsEndTurn(), undefined, 'endTurn'),
    );

    if (holdDeadline === null && !canUndo) return null;

    const grid = (
        <div className="ag-action-grid">
            {holdDeadline !== null && (
                <ActionButton
                    className="ag-btn ag-btn--success ag-btn--countdown"
                    style={{ padding: '14px 0', fontSize: 15, '--ag-countdown-fill': `${fillPct}%` } as React.CSSProperties}
                    pending={pendingTarget === 'endTurn'}
                    pendingLabel="Finishing…"
                    onClick={() => submitCommand(new RaceCarsEndTurn(), undefined, 'endTurn')}
                >
                    Pass now
                </ActionButton>
            )}
            {canUndo && (
                <ActionButton
                    className="ag-btn ag-btn--light"
                    pending={pendingTarget === 'undo'}
                    pendingLabel="Undoing…"
                    onClick={() => submitCommand(new RaceCarsUndo(), undefined, 'undo')}
                >
                    ↩ Undo
                </ActionButton>
            )}
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
