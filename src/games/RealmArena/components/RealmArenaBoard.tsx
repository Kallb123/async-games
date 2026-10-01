'use client'
import React, { useId } from 'react';
import BoardZoom, { type BoardZoomFocus } from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import type { Rect } from '@/utils/ui/mapLabels';
import type { Battlefield, TerrainLetter } from '@/utils/games/battlefield/terrain';
import { CHARACTERS } from '@/games/RealmArena/characters';
import { CENTRE, isStanding, type Fighter, type MusterPick } from '@/games/RealmArena/rules';
import { areaRect, CELL, CHARACTER_MARK, fighterStatus, focusOn, groundLayers, squareCentre } from '@/games/RealmArena/ui';

/** Each terrain's fill, by the letter the map draws it with — the `--ra-*` tokens in ag-theme.css. */
const GROUND_CLASS: Readonly<Record<TerrainLetter, string>> = {
    '.': 'ag-ra-ground--open',
    ',': 'ag-ra-ground--rubble',
    'o': 'ag-ra-ground--lowwall',
    'T': 'ag-ra-ground--trees',
    '#': 'ag-ra-ground--wall',
    's': 'ag-ra-ground--stair',
    '^': 'ag-ra-ground--tower',
};

/** A figure's disc, in board units: it fills most of its square, leaving room for the HP bar beneath. */
const FIGURE_RADIUS = 3.6;
const FIGURE_LIFT = 0.8;
const HP_BAR_WIDTH = 7;
const HP_BAR_HEIGHT = 1.3;

interface RealmArenaBoardProps {
    field: Battlefield;
    /** Everyone on the battlefield, standing or fallen. */
    fighters: readonly Fighter[];
    /** The viewer's own sealed squad, while the muster lasts: drawn where they stand, but not yet on the battlefield. */
    sealed?: readonly MusterPick[] | null;
    /** The players in seat order, so each deployment zone wears the colour of the squad that musters in it. */
    seats: readonly string[];
    colourFor: (userId: string) => string;
    nameFor: (userId: string) => string;
    selectedId: number | null;
    /** Tapping a character selects it, and tapping it again lets it go. */
    onSelect?: (fighterId: number) => void;
}

/**
 * The battlefield (docs/games/realm-arena.md §13.1, §17.3 PR 5): the ground as
 * one layer, and an SVG layer over it for the deployment zones, the centre and
 * every character with its HP.
 *
 * The ground is one path per kind of terrain (`groundLayers`) rather than a
 * shape per square, and the squares' grid one pattern-filled rectangle over
 * it, so a board of 1,728 squares is a dozen elements before anyone stands on
 * it. PR 9's art replaces the paths without touching anything drawn above.
 *
 * At a phone's width a square is about ten pixels — fine for reading the
 * battle, far too small to tap — so `BoardZoom`'s deepest step brings about
 * ten squares across the column, and selecting a character brings the view to
 * it.
 */
export default function RealmArenaBoard({ field, fighters, sealed, seats, colourFor, nameFor, selectedId, onSelect }: RealmArenaBoardProps) {
    const gridId = useId();
    const width = field.width * CELL;
    const height = field.height * CELL;
    const viewBox = { width, height };

    const selected = fighters.find(fighter => fighter.id === selectedId);
    const focus: BoardZoomFocus | null = selected
        ? { rect: focusOn(field, selected.square), key: `${selected.id}:${selected.square}` }
        : null;

    const centreSquares = field.objectives[CENTRE] ?? [];
    const centre = centreSquares.length > 0 ? areaRect(field, centreSquares) : null;

    // The fallen first, so anyone standing over a body is drawn on top of it.
    const drawOrder = [...fighters].sort((a, b) => Number(isStanding(a)) - Number(isStanding(b)));
    const figureRects: Rect[] = [...fighters, ...(sealed ?? [])].map(({ square }) => {
        const { x, y } = squareCentre(field, square);
        return { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL };
    });

    return (
        <div className="ag-board-frame ag-realmarena-frame">
            {/* 36 columns fitted to a phone is ~10px a square, so the deep step
                is what makes one tappable: about ten squares across (§13.1). */}
            <BoardZoom zoomWidth={180} maxWidth={360} viewBox={viewBox} focus={focus}>
                <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The ${field.name}`}>
                    <defs>
                        <pattern id={gridId} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                            <path className="ag-ra-grid" d={`M${CELL} 0V${CELL}H0`} />
                        </pattern>
                    </defs>

                    {groundLayers(field).map(layer => (
                        <path key={layer.letter} className={`ag-ra-ground ${GROUND_CLASS[layer.letter]}`} d={layer.d} />
                    ))}
                    <rect width={width} height={height} fill={`url(#${gridId})`} pointerEvents="none" />

                    {field.deployments.map((squares, seat) => {
                        const rect = areaRect(field, squares);
                        const owner = seats[seat];
                        return (
                            <rect
                                key={seat}
                                className="ag-ra-deployment"
                                {...rect}
                                style={{ '--ra-seat': owner ? colourFor(owner) : 'var(--ag-ink-softer)' } as React.CSSProperties}
                            />
                        );
                    })}

                    {centre && <rect className="ag-ra-centre" {...centre} />}

                    {sealed?.map((pick, index) => {
                        const { x, y } = squareCentre(field, pick.square);
                        return (
                            <g key={`sealed-${index}`} className="ag-ra-sealed">
                                <title>{`${CHARACTERS[pick.character].name} · your squad, sealed until both have mustered`}</title>
                                <circle className="ag-ra-figure" cx={x} cy={y} r={FIGURE_RADIUS} />
                                <text className="ag-ra-mark" x={x} y={y}>{CHARACTER_MARK[pick.character]}</text>
                            </g>
                        );
                    })}

                    {drawOrder.map(fighter => {
                        const { x, y } = squareCentre(field, fighter.square);
                        const character = CHARACTERS[fighter.character];
                        const standing = isStanding(fighter);
                        const status = fighterStatus(fighter);
                        const discY = y - FIGURE_LIFT;
                        return (
                            <ClickableMapNode
                                key={fighter.id}
                                x={x} y={discY} radius={FIGURE_RADIUS}
                                isValid={!!onSelect}
                                isSelected={fighter.id === selectedId}
                                showRing={false}
                                onClick={onSelect ? () => onSelect(fighter.id) : undefined}
                                title={[`${character.name} · ${nameFor(fighter.owner)}`, `${fighter.hp}/${character.hp} HP`, ...status].join(' · ')}
                            >
                                {fighter.id === selectedId && <circle className="ag-ra-selected" cx={x} cy={discY} r={FIGURE_RADIUS + 1.2} />}
                                <circle
                                    className={`ag-ra-figure${standing ? '' : ' ag-ra-figure--down'}${fighter.banked > 0 ? ' ag-ra-figure--watch' : ''}`}
                                    cx={x} cy={discY} r={FIGURE_RADIUS}
                                    fill={standing ? colourFor(fighter.owner) : undefined}
                                />
                                <text className="ag-ra-mark" x={x} y={discY}>{standing ? CHARACTER_MARK[fighter.character] : '✕'}</text>
                                {standing && (
                                    <>
                                        <rect className="ag-ra-hp" x={x - HP_BAR_WIDTH / 2} y={y + FIGURE_RADIUS - 0.2} width={HP_BAR_WIDTH} height={HP_BAR_HEIGHT} />
                                        <rect
                                            className="ag-ra-hp-fill"
                                            x={x - HP_BAR_WIDTH / 2} y={y + FIGURE_RADIUS - 0.2}
                                            width={HP_BAR_WIDTH * Math.min(1, fighter.hp / character.hp)} height={HP_BAR_HEIGHT}
                                        />
                                    </>
                                )}
                            </ClickableMapNode>
                        );
                    })}

                    {centre && (
                        <MapLabelLayer
                            labels={[{ key: CENTRE, x: centre.x + centre.width / 2, y: centre.y + centre.height / 2, text: 'Centre', radius: centre.height / 2 }]}
                            obstacles={figureRects}
                            width={width} height={height}
                            offset={centre.height / 2 + 4}
                            fontSize={6}
                            fontWeight={800}
                        />
                    )}
                </svg>
            </BoardZoom>
        </div>
    );
}
