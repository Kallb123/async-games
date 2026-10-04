'use client'
import React from 'react';
import { EFFECTS, ITEMS, type EffectId, type ItemId } from '@/games/RealmArena/characters';
import { EFFECT_ART, ITEM_ART } from '@/games/RealmArena/art';
import { SpriteImage, SpriteUse } from './RealmArenaTerrain';

// The drawn marks (docs/games/realm-arena.md §20.2, §21.2): each status
// effect's, a sprite of the effects sheet (`EFFECT_ART`), on a figure on the
// board, in a unit's box and the selected character's card, and beside what the
// last action did; and each item's (`ITEM_ART`), wherever it's named.

interface RealmArenaEffectMarksProps {
    /** The board's id, which `RealmArenaTerrainDefs` defined its sprites under. */
    id: string;
    effects: readonly EffectId[];
    /** The middle of the column, in board units. */
    x: number;
    y: number;
    /** How wide each mark is, and how far apart their middles are. */
    size: number;
    step: number;
}

/** A character's effects on the board: a column of marks centred on (`x`, `y`). */
export function RealmArenaEffectMarks({ id, effects, x, y, size, step }: RealmArenaEffectMarksProps) {
    const top = y - (step * (effects.length - 1)) / 2;
    return effects.map((effect, i) => (
        <SpriteUse key={effect} className="ag-ra-figure-mark" id={id} sprite={EFFECT_ART[effect]} x={x} y={top + i * step} size={size} />
    ));
}

/**
 * What's on a character spelled out, each mark with its name: its effects,
 * then the item it carries (§21.1). A unit's box, and the selected
 * character's card.
 */
export function RealmArenaStatusList({ effects = [], item }: { effects?: readonly EffectId[]; item?: ItemId | null }) {
    if (effects.length === 0 && !item) return null;
    return (
        <span className="ag-ra-effects">
            {effects.map(effect => (
                <span key={effect} className="ag-tag ag-tag--quiet">
                    <SpriteImage sprite={EFFECT_ART[effect]} />
                    {EFFECTS[effect].name}
                </span>
            ))}
            {item && (
                <span className="ag-tag ag-tag--quiet" title={`Carrying a ${ITEMS[item].name.toLowerCase()}`}>
                    <SpriteImage sprite={ITEM_ART[item]} />
                    {ITEMS[item].name}
                </span>
            )}
        </span>
    );
}
