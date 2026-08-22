'use client'
import React from 'react';

interface PartySizeHintProps {
    /** Everyone who'll be playing — the invitees plus the sender. */
    total: number;
    min: number;
    max: number;
    /** Named in the warning, e.g. "Train Time supports 2–5 players." */
    gameName: string;
}

/** True when this party can't legally start the game. */
export function partySizeOutOfRange(total: number, min: number, max: number): boolean {
    return total < min || total > max;
}

/**
 * The live "Party size 3 · supports 2–5 players" line under a game's invite
 * list, which turns into a warning once the party is too big or too small.
 * Shared by every setup screen that has a player-count limit.
 */
export default function PartySizeHint({ total, min, max, gameName }: PartySizeHintProps) {
    const outOfRange = partySizeOutOfRange(total, min, max);
    return (
        <p className="ag-hint" style={outOfRange ? { color: "var(--ag-terracotta)", fontWeight: 700 } : undefined}>
            {outOfRange
                ? `⚠ Party size ${total} · ${gameName} supports ${min}–${max} players.`
                : `Party size ${total} · supports ${min}–${max} players.`}
        </p>
    );
}
