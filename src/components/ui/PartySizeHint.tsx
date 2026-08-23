'use client'
import React from 'react';
import { GameMeta } from '@/utils/ui/games';

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
 * The 400 statusText a lobby route sends when a party is out of range —
 * `null` when it's fine. Shared so "look up the bounds, check the size,
 * phrase the rejection" isn't copy-pasted into every route that can change a
 * lobby's seat count.
 */
export function partySizeErrorMessage(
    meta: Pick<GameMeta, "name" | "players" | "minPlayers" | "maxPlayers">,
    total: number
): string | null {
    return partySizeOutOfRange(total, meta.minPlayers, meta.maxPlayers)
        ? `${meta.name} supports ${meta.players}`
        : null;
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
