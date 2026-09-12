import React from 'react';

export interface BuildRowProps {
    /** The boxed glyph at the head of the row. Omitted leaves the row flush left. */
    icon?: React.ReactNode;
    /** What the row does, in the player's language. */
    name: React.ReactNode;
    /** The small line under it: what it costs, what it needs, where it goes. */
    cost?: React.ReactNode;
    /** The trailing chip — the verb, a count of targets, or a `PendingTag` while the command is in flight. */
    tag: React.ReactNode;
    /** Draws the tag as a greyed-out reason rather than an invitation. */
    tagMuted?: boolean;
    disabled?: boolean;
    /** This row is the one currently armed, waiting on a tap on the board. */
    active?: boolean;
    /** This row's own command is in flight. */
    pending?: boolean;
    onClick: () => void;
}

/**
 * One row of an action sheet: an icon, a name over what it costs, and a
 * trailing tag — the shape every turn sheet in the app builds its choices out
 * of, whether tapping the row arms the board for a tap, fires a command
 * outright, or picks a card out of a list.
 *
 * It lives here because it was written four times before it was written once:
 * Fires Out factored a local copy of it after a caveman review, and the third
 * game to want it is the signal AGENTS.md asks us to act on. Wrap a run of
 * them in a plain `.ag-build-list`, which is left to the caller — sheets
 * interleave other controls (a toggle, a hint) between their rows.
 */
export default function BuildRow({ icon, name, cost, tag, tagMuted, disabled, active, pending, onClick }: BuildRowProps) {
    return (
        <button
            type="button"
            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}${active ? ' ag-build-row--active' : ''}${pending ? ' ag-pending-skin' : ''}`}
            disabled={disabled}
            onClick={onClick}
        >
            {icon && <span className="ag-icon-box">{icon}</span>}
            <span className="ag-build-main">
                <span className="ag-build-name">{name}</span>
                {cost != null && <span className="ag-build-cost">{cost}</span>}
            </span>
            <span className={`ag-build-tag${tagMuted ? ' ag-build-tag--muted' : ''}`}>{tag}</span>
        </button>
    );
}
