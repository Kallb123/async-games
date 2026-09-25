'use client'
import React from 'react';
import UndoHold from '@/components/ui/UndoHold';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
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
    /** See `UndoHold`'s own `nested`. */
    nested?: boolean;
}

/**
 * `UndoHold` wired to Race Cars' own two commands, shared by the turn sheet
 * (`RaceCarsActions`) and the end-of-move reveal (`RaceCarsEndMoveScreen`) — a
 * hold counts down whichever screen the driver is actually looking at rather
 * than only the one that opened it.
 */
export default function RaceCarsUndoHold({ holdDeadline, canUndo, submitCommand, pendingTarget, nested = false }: RaceCarsUndoHoldProps) {
    return (
        <UndoHold
            holdDeadline={holdDeadline}
            windowMs={UNDO_WINDOW_MS}
            canUndo={canUndo}
            onEndTurn={() => submitCommand(new RaceCarsEndTurn(), undefined, 'endTurn')}
            onUndo={() => submitCommand(new RaceCarsUndo(), undefined, 'undo')}
            endTurnPending={pendingTarget === 'endTurn'}
            undoPending={pendingTarget === 'undo'}
            nested={nested}
        />
    );
}
