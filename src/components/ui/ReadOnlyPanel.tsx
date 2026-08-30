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
 * It is a `fieldset` because `disabled` on one disables every control inside in
 * a single stroke — no tap, no focus, whatever the panels within know about
 * whose turn it is — while leaving the content readable to a screen reader,
 * which `inert` would not. Nothing here says whose move it is: the sticky top
 * bar has said so all along.
 */
export default function ReadOnlyPanel({ readOnly, children }: ReadOnlyPanelProps) {
    if (!readOnly) return <>{children}</>;
    return <fieldset className="ag-readonly" disabled>{children}</fieldset>;
}
