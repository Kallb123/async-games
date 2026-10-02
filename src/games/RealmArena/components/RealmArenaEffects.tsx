'use client'
import React from 'react';
import { EFFECTS, type EffectId } from '@/games/RealmArena/characters';
import { EFFECT_ART } from '@/games/RealmArena/art';
import { spriteId, SpriteImage } from './RealmArenaTerrain';

// The status effects' marks (docs/games/realm-arena.md §20.2), each a sprite
// of the effects sheet (`EFFECT_ART`): on a figure on the board, in a unit's
// box and the selected character's card, and beside what the last action did.

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
        <use key={effect} className="ag-ra-effect-mark" href={`#${spriteId(id, EFFECT_ART[effect])}`} x={x - size / 2} y={top + i * step - size / 2} width={size} height={size} />
    ));
}

/**
 * One effect's mark in the page: its name is whatever it stands beside.
 * `boxed`, it leads a list row in the row's icon box, as a glyph would.
 */
export function RealmArenaEffectIcon({ effect, boxed = false }: { effect: EffectId; boxed?: boolean }) {
    const icon = <SpriteImage sprite={EFFECT_ART[effect]} className={`ag-ra-effect-icon${boxed ? ' ag-ra-effect-icon--boxed' : ''}`} />;
    return boxed ? <span className="ag-icon-box" aria-hidden="true">{icon}</span> : icon;
}

/** A character's effects spelled out, each mark with its name: a unit's box, and the selected character's card. */
export function RealmArenaEffectList({ effects }: { effects: readonly EffectId[] }) {
    if (effects.length === 0) return null;
    return (
        <span className="ag-ra-effects">
            {effects.map(effect => (
                <span key={effect} className="ag-tag ag-tag--quiet">
                    <RealmArenaEffectIcon effect={effect} />
                    {EFFECTS[effect].name}
                </span>
            ))}
        </span>
    );
}
