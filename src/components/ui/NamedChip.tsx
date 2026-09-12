import React from 'react';

interface NamedChipProps {
    /**
     * The small mark at the head of the chip, in whatever way this game tells
     * its cards apart: a colour dot (Outbreak's diseases) or a figure (Banned
     * Islet's treasures, whose §17 accessibility rule forbids a colour).
     */
    indicator: React.ReactNode;
    /** What this is, in the player's language. */
    label: string;
    /** The hover/long-press title. Defaults to the label; pass one when there is more to say than fits. */
    title?: string;
    /** Tapping it points at the thing it names on the board. Omit for a chip with nowhere to point. */
    onTap?: () => void;
    /** Whether the thing this chip names is the one currently ringed on the board. */
    highlighted?: boolean;
}

/**
 * One named card-sized chip: a mark, a name, sized to its label — the shape
 * every "what card/tile is this" list in the app is built from, whether it is
 * a hand, a discard pile or a forecast.
 *
 * It lives here because it was written twice: Outbreak's `OutbreakCardChip`
 * for its hands and its infection discard, and again for Banned Islet's hands
 * and its flood discard. What was duplicated was never the mark — a dot and a
 * glyph are the two games' real difference — but the chrome around it: the
 * class assembly, and the tappable wiring that has to remember `role`,
 * `tabIndex` and the Enter key every time. A second copy of that is the case
 * AGENTS.md calls a defect, so the games pass their own mark into this and
 * keep nothing else.
 */
export default function NamedChip({ indicator, label, title, onTap, highlighted = false }: NamedChipProps) {
    const classes = ['ag-hand-card', 'ag-hand-card--named'];
    if (onTap) classes.push('ag-hand-card--tappable');
    if (onTap && highlighted) classes.push('ag-hand-card--highlighted');

    return (
        <div
            className={classes.join(' ')}
            title={title ?? label}
            onClick={onTap}
            role={onTap ? 'button' : undefined}
            tabIndex={onTap ? 0 : undefined}
            onKeyDown={onTap ? (e) => { if (e.key === 'Enter') onTap(); } : undefined}
        >
            {indicator}
            <span className="ag-hand-card-name">{label}</span>
        </div>
    );
}
