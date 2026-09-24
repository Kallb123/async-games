'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';

interface UndoButtonProps {
    /** True while this button's own undo is in flight. */
    pending: boolean;
    onClick: () => void;
    disabled?: boolean;
}

/**
 * The "take back my last move" button every game with undo shows
 * (docs/undo.md §11) — the same light skin, label and pending verb whichever
 * game it is in. It sits as one child of an `.ag-action-grid` row beside the
 * button it shares the row with (End turn, Pass now, Pass), or alone in one.
 */
export default function UndoButton({ pending, onClick, disabled }: UndoButtonProps) {
    return (
        <ActionButton
            className="ag-btn ag-btn--light"
            disabled={disabled}
            pending={pending}
            pendingLabel="Undoing…"
            onClick={onClick}
        >
            ↩ Undo
        </ActionButton>
    );
}
