'use client'
import React from 'react';
import type { Square } from '@/utils/games/battlefield/terrain';
import type { Point } from '@/utils/ui/isometric';
import { EFFECT_ART } from '@/games/RealmArena/art';
import type { BattleCue } from '@/games/RealmArena/ui';
import { SpriteUse } from './RealmArenaTerrain';

/** The hit text, in board units: the number's middle above the point it's given, the label under it, and a mark beside the number. */
const VALUE_RISE = 4;
const LABEL_DROP = 3.6;
const MARK_SIZE = 3.4;
const MARK_OFFSET = 5.4;

interface RealmArenaFxProps {
    /** The board's id, which its art is defined under: for a cue's mark. */
    id: string;
    cues: readonly BattleCue[];
    /** Where a cue on a square rises from: the top of a figure's disc there, at the square's height and the view's turn. */
    over: (square: Square) => Point;
    /** Once everything has played, so a playback nobody needs any more can go. */
    onDone?: () => void;
}

/**
 * What an action did, played over the battlefield (docs/games/realm-arena.md
 * §26): drawn in the board's own SVG, above the figures, so it zooms, pans and
 * turns with the board. Each piece of hit text rises off where it happened and
 * fades, on CSS keyframes (`ag-ra-hit`) timed by its cue: `battleCues` worked
 * out when each starts and how long it lasts. Nothing here can be tapped, so
 * the board goes on working underneath while it plays.
 *
 * Keyed by its playback, so the next one starts it over and cuts this one short.
 */
export default function RealmArenaFx({ id, cues, over, onDone }: RealmArenaFxProps) {
    const ends = cues.map(cue => cue.start + cue.length);
    const last = ends.indexOf(Math.max(...ends));
    return (
        <g className="ag-ra-fx" aria-hidden="true">
            {cues.map((cue, index) => {
                const { x, y } = over(cue.square);
                return (
                    <g
                        key={index}
                        className={`ag-ra-hit ag-ra-hit--${cue.tone}`}
                        style={{ animationDelay: `${cue.start}ms`, animationDuration: `${cue.length}ms` }}
                        onAnimationEnd={index === last ? onDone : undefined}
                    >
                        <text className="ag-ra-hit-value" x={x} y={y - VALUE_RISE}>{cue.value}</text>
                        {cue.label && <text className="ag-ra-hit-label" x={x} y={y - VALUE_RISE + LABEL_DROP}>{cue.label}</text>}
                        {cue.mark && <SpriteUse className="ag-ra-figure-mark" id={id} sprite={EFFECT_ART[cue.mark]} x={x + MARK_OFFSET} y={y - VALUE_RISE} size={MARK_SIZE} />}
                    </g>
                );
            })}
        </g>
    );
}
