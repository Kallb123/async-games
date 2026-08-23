'use client'
import React from 'react';
import { partySizeErrorMessage, PartySizeMeta } from '@/utils/ui/games';

interface PartySizeHintProps {
    meta: PartySizeMeta;
    /** Everyone who'll be playing — the invitees, the open seats and the host. */
    total: number;
}

/**
 * The live "Party size 3 · supports 2–5 players" line under a game's invite
 * list, which turns into a warning once the party is too big or too small.
 * Shared by every setup screen that has a player-count limit.
 */
export default function PartySizeHint({ meta, total }: PartySizeHintProps) {
    const error = partySizeErrorMessage(meta, total);
    return (
        <p className="ag-hint" style={error ? { color: "var(--ag-terracotta)", fontWeight: 700 } : undefined}>
            {error
                ? `⚠ Party size ${total} · ${error}.`
                : `Party size ${total} · supports ${meta.players}.`}
        </p>
    );
}
