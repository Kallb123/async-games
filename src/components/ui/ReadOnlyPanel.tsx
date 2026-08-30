import React from 'react';

interface ReadOnlyPanelProps {
    /** Whose move it is, for the line above the panel. */
    waitingFor: string;
    children: React.ReactNode;
}

/**
 * What a player can look at, but not act on, while they wait for their turn —
 * their hand, the face-up cards, the shared market. A game shows the very
 * panels it shows on your turn rather than growing a second read-only copy of
 * them: this wrapper is what takes them out of play.
 *
 * It is a `fieldset` because `disabled` on one disables every control inside
 * in a single stroke — no tap, no focus, whatever the panels within know about
 * whose turn it is — while leaving the content readable to a screen reader,
 * which `inert` would not.
 */
export default function ReadOnlyPanel({ waitingFor, children }: ReadOnlyPanelProps) {
    return (
        <fieldset className="ag-readonly" disabled>
            <p className="ag-readonly-note">⏳ {waitingFor}&rsquo;s move — nothing to do here yet.</p>
            {children}
        </fieldset>
    );
}
