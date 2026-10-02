'use client'
import React from 'react';
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, isoColumnOutline, type Point } from '@/utils/ui/isometric';
import { ART_SHEETS, CLIPS, SPRITES, grassOf, spriteBox, TERRAIN_ART, variantOf, type ArtLayer, type Sprite } from '@/games/RealmArena/art';
import type { TerrainLetter } from '@/utils/games/battlefield/terrain';

/** The grass pattern's tile: six diagonals each way, the period `grassOf` repeats on. */
const GRASS_TILE = { width: 6 * ISO_HALF_WIDTH, height: 6 * ISO_HALF_HEIGHT };

const spriteId = (id: string, sprite: Sprite) => `${id}-sprite-${SPRITES.indexOf(sprite)}`;
const clipId = (id: string, low: number, high: number) => `${id}-clip-${low}-${high}`;

/**
 * Everything the terrain art refers to, defined once a board: each sprite as
 * a symbol cropping its sheet, the grass as a pattern laid from the map's back
 * corner, and the outlines a cut-down layer is clipped to. `id` keeps the
 * board's ids its own.
 */
export function RealmArenaTerrainDefs({ id, origin }: { id: string; origin: Point }) {
    // Every square whose diamond falls on the pattern's tile, by the corner
    // it's drawn from; one cut by the tile's edge is drawn whole on the far
    // side too, since the next repeat carries on with the same grass.
    const grass: { col: number; row: number }[] = [];
    for (let diagonal = -2; diagonal <= 6; diagonal++) {
        for (let across = -2; across <= 7; across++) {
            if ((diagonal + across) % 2 !== 0) continue;
            grass.push({ col: (diagonal + across) / 2, row: (diagonal - across) / 2 });
        }
    }
    return (
        <defs>
            {SPRITES.map(sprite => {
                const sheet = ART_SHEETS[sprite.sheet];
                return (
                    <symbol key={spriteId(id, sprite)} id={spriteId(id, sprite)} viewBox={`${sprite.x} ${sprite.y} ${sprite.width} ${sprite.height}`}>
                        <image href={sheet.href} width={sheet.width} height={sheet.height} />
                    </symbol>
                );
            })}
            <pattern id={`${id}-grass`} patternUnits="userSpaceOnUse" x={origin.x} y={origin.y} width={GRASS_TILE.width} height={GRASS_TILE.height}>
                {grass.map(({ col, row }) => {
                    const box = spriteBox(grassOf(col, row), { sprites: [], at: 0 });
                    const x = (col - row) * ISO_HALF_WIDTH, y = (col + row) * ISO_HALF_HEIGHT;
                    return <use key={`${col}:${row}`} href={`#${spriteId(id, grassOf(col, row))}`} x={x + box.x} y={y + box.y} width={box.width} height={box.height} />;
                })}
            </pattern>
            {CLIPS.map(([low, high]) => (
                <clipPath key={clipId(id, low, high)} id={clipId(id, low, high)}>
                    <polygon points={isoColumnOutline(low, high)} />
                </clipPath>
            ))}
        </defs>
    );
}

/** One layer of a square's art: its sprite, cut down if the layer says so. */
function Layer({ id, layer, square }: { id: string; layer: ArtLayer; square: number }) {
    const sprite = layer.sprites[variantOf(square, layer.sprites.length)];
    const box = spriteBox(sprite, layer);
    const clip = layer.clip === undefined ? undefined : `url(#${clipId(id, layer.at, layer.at + layer.clip)})`;
    return (
        <g clipPath={clip}>
            <use href={`#${spriteId(id, sprite)}`} {...box} />
        </g>
    );
}

/** What stands on a square, drawn from its tile art, with the square's back corner at `corner` — on its ground. */
export function RealmArenaTerrainArt({ id, letter, square, corner }: { id: string; letter: TerrainLetter; square: number; corner: Point }) {
    const layers = TERRAIN_ART[letter];
    if (layers.length === 0) return null;
    return (
        <g className="ag-ra-art" transform={`translate(${corner.x} ${corner.y})`}>
            {layers.map((layer, index) => <Layer key={index} id={id} layer={layer} square={square} />)}
        </g>
    );
}
