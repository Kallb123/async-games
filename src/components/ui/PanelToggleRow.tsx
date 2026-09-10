import React from 'react';

interface PanelToggleRowProps {
    /** What the panel is — matches the title `PanelHead` shows once it's open. */
    title: string;
    /** Opens the panel. The top-bar toggle that shows this row does the same. */
    onOpen: () => void;
}

/**
 * The closed-state stand-in for a `PanelHead`: a title-only row at the foot of
 * the board, in the same spot the chat thread or the turn-history log opens.
 * Without it a closed panel leaves nothing down there at all, so a game with a
 * tall board reads as having no chat or history unless a player already knows
 * to look for the top-bar toggle. Tapping the row opens the panel, whose own
 * `PanelHead` — title, subtitle and ✕ — takes over this spot in its place.
 */
export default function PanelToggleRow({ title, onOpen }: PanelToggleRowProps) {
    return (
        <button type="button" className="ag-log ag-panel-toggle-row" onClick={onOpen}>
            <span className="ag-hand-title">{title}</span>
            <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span>
        </button>
    );
}
