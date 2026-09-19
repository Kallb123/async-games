'use client'
import React from 'react';
import { partySizeErrorMessage, partySizeRange, PartySizeMeta } from '@/utils/ui/games';

interface PartySizeHintProps {
    meta: PartySizeMeta;
    /** Everyone who'll be playing — the invitees, the open seats and the host. */
    total: number;
    /**
     * Skip the row's own `.ag-section` padding, for the one caller (the
     * lobby's "Start now" panel) that already renders this inside a padded
     * container alongside other content. Every setup screen leaves this off,
     * so it lines up with the seats and turn-timer rows above it.
     */
    bare?: boolean;
}

/**
 * The live "Party size 3 · supports 2–5 players" line under a game's invite
 * list, which turns into a warning once the party is too big or too small.
 * Shared by every setup screen that has a player-count limit.
 */
export default function PartySizeHint({ meta, total, bare }: PartySizeHintProps) {
    const error = partySizeErrorMessage(meta, total);
    const hint = (
        <p className="ag-hint" style={error ? { color: "var(--ag-terracotta)", fontWeight: 700 } : undefined}>
            {error
                ? `⚠ Party size ${total} · ${error}.`
                : `Party size ${total} · supports ${partySizeRange(meta)}.`}
        </p>
    );
    return bare ? hint : <div className="ag-section">{hint}</div>;
}
