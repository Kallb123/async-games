'use client'
import React from 'react';
import { GameMeta } from '@/utils/ui/games';

/** The bounds and copy this hint needs — a `GameMeta` satisfies it. */
type PartySizeMeta = Pick<GameMeta, "name" | "players" | "minPlayers" | "maxPlayers">;

interface PartySizeHintProps {
    meta: PartySizeMeta;
    /** Everyone who'll be playing — the invitees, the open seats and the host. */
    total: number;
}

/** True when this party can't legally start the game. */
function partySizeOutOfRange(total: number, min: number, max: number): boolean {
    return total < min || total > max;
}

/**
 * The 400 statusText a lobby route sends when a party is out of range —
 * `null` when it's fine. Shared so "look up the bounds, check the size,
 * phrase the rejection" isn't copy-pasted into every route that can change a
 * lobby's seat count.
 */
export function partySizeErrorMessage(meta: PartySizeMeta, total: number): string | null {
    return partySizeOutOfRange(total, meta.minPlayers, meta.maxPlayers)
        ? `${meta.name} supports ${meta.players}`
        : null;
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
