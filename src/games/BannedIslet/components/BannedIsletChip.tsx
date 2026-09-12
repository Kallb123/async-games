import React from 'react';

interface BannedIsletChipProps {
    /** The figure at the head of the chip — §17: a silhouette, never a colour. */
    glyph: string;
    /** What it is, in the player's language: a card's name, or a tile's. */
    label: string;
    /** The dim word after the label — what happened to the tile this chip names. */
    note?: string;
    /** Tapping rings the tile on the board. Omit for a chip with nowhere to point. */
    onTap?: () => void;
    /** Whether the thing this chip names is the one currently ringed on the board. */
    highlighted?: boolean;
}

/**
 * One named chip: a figure and a name, sized to its label. Shared by the hand
 * panels (a treasure card) and the flood discard (a tile that has been under
 * water), which both just need "what is this" rendered compactly — the same
 * job, and the same markup, `OutbreakCardChip` does for its two panels.
 */
export default function BannedIsletChip({ glyph, label, note, onTap, highlighted = false }: BannedIsletChipProps) {
    const classes = ['ag-hand-card', 'ag-hand-card--named'];
    if (onTap) classes.push('ag-hand-card--tappable');
    if (onTap && highlighted) classes.push('ag-hand-card--highlighted');
    const title = note ? `${label} · ${note}` : label;

    return (
        <div
            className={classes.join(' ')}
            title={title}
            onClick={onTap}
            role={onTap ? 'button' : undefined}
            tabIndex={onTap ? 0 : undefined}
            onKeyDown={onTap ? (e) => { if (e.key === 'Enter') onTap(); } : undefined}
        >
            <span className="ag-hand-card-emoji" aria-hidden="true">{glyph}</span>
            <span className="ag-hand-card-name">{label}</span>
        </div>
    );
}
