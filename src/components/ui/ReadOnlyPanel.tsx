import React from 'react';

interface ReadOnlyPanelProps {
    /** True off the viewer's turn: the panels inside go out of play. */
    readOnly: boolean;
    children: React.ReactNode;
}

/**
 * What a player can look at, but not act on, while they wait for their turn —
 * their hand, the face-up cards, the shared market. A game shows the very
 * panels it shows on your turn rather than growing a second read-only copy of
 * them: this wrapper is what takes them out of play, so a screen wraps its turn
 * sheet once and stops asking whose turn it is.
 *
 * It is always a `fieldset`, never conditionally a bare fragment: `disabled`
 * on one disables every control inside in a single stroke — no tap, no focus,
 * whatever the panels within know about whose turn it is — while leaving the
 * content readable to a screen reader, which `inert` would not. Switching
 * between a fragment and a fieldset would change the element type at this
 * spot in the tree, and React remounts a changed element type from scratch —
 * which used to wipe out a turn sheet's own local state (Dice Cities' just-
 * rolled dice, still worth showing after a roll that auto-passes) in the very
 * same render that took the turn away. Keeping the element stable and only
 * toggling `disabled`/the dimming class is what lets that state survive.
 * Nothing here says whose move it is: the sticky top bar has said so all along.
 */
export default function ReadOnlyPanel({ readOnly, children }: ReadOnlyPanelProps) {
    return (
        <fieldset className={`ag-readonly-panel${readOnly ? ' ag-readonly' : ''}`} disabled={readOnly}>
            {children}
        </fieldset>
    );
}
