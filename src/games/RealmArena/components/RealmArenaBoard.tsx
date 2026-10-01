'use client'
import React, { useId } from 'react';
import BoardZoom, { type BoardZoomFocus } from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import type { Battlefield, Square, TerrainLetter } from '@/utils/games/battlefield/terrain';
import { CHARACTERS, type CharacterId } from '@/games/RealmArena/characters';
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
    selected: Fighter | undefined;
    /** Tapping a character selects it, and tapping it again lets it go. */
    onSelect: (fighterId: number) => void;
    /** The viewer placing their squad (`sealed`) in their deployment zone, before the muster goes. */
    placing?: Placing | null;
}

interface Placing {
    zone: readonly Square[];
    /** The index into `sealed` of the character picked up to move, if any. */
    selected: number | null;
    /** A tap on a square of the zone, whoever stands on it. */
    onTap: (square: Square) => void;
}

interface FigureProps {
    field: Battlefield;
    square: Square;
    /** The character it stands as, or null for a fallen one, which is marked ✕. */
    character: CharacterId | null;
    className?: string;
    fill?: string;
    /** Ringed as the one selected. */
    selected?: boolean;
}

/** A character's disc with its mark on it, a little above its square's centre to leave room for the HP bar beneath. */
function Figure({ field, square, character, className = '', fill, selected = false }: FigureProps) {
    const { x, y } = squareCentre(field, square);
    return (
        <>
            {selected && <circle className="ag-ra-selected" cx={x} cy={y - FIGURE_LIFT} r={FIGURE_RADIUS + 1.2} />}
            <circle className={`ag-ra-figure ${className}`} cx={x} cy={y - FIGURE_LIFT} r={FIGURE_RADIUS} fill={fill} />
            <text className="ag-ra-mark" x={x} y={y - FIGURE_LIFT}>{character ? CHARACTER_MARK[character] : '✕'}</text>
        </>
    );
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
export default function RealmArenaBoard({ field, fighters, sealed, seats, colourFor, nameFor, selected, onSelect, placing }: RealmArenaBoardProps) {
    const gridId = useId();
    const width = field.width * CELL;
    const height = field.height * CELL;
    const viewBox = { width, height };

    // A character picked up to place is brought close enough to tap a square beside it.
    const pickedUp = placing?.selected != null ? sealed?.[placing.selected] : undefined;
    const focusSquare = pickedUp?.square ?? selected?.square;
    const focus: BoardZoomFocus | null = focusSquare === undefined ? null
        : { rect: focusOn(field, focusSquare), key: `${pickedUp ? 'pick' : selected?.id}:${focusSquare}` };
    const occupied = new Set(sealed?.map(pick => pick.square));

    const centreSquares = field.objectives[CENTRE] ?? [];
    const centre = centreSquares.length > 0 ? areaRect(field, centreSquares) : null;

    // The fallen first, so anyone standing over a body is drawn on top of it.
    const drawOrder = [...fighters].sort((a, b) => Number(isStanding(a)) - Number(isStanding(b)));
    const figureRects = [...fighters, ...(sealed ?? [])].map(({ square }) => areaRect(field, [square]));

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
                        <path key={layer.letter} className={GROUND_CLASS[layer.letter]} d={layer.d} />
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

                    {sealed?.map((pick, index) => (
                        <g key={`sealed-${index}`} className="ag-ra-sealed">
                            <title>{`${CHARACTERS[pick.character].name} · your squad, sealed until both have mustered`}</title>
                            <Figure field={field} square={pick.square} character={pick.character} selected={placing?.selected === index} />
                        </g>
                    ))}

                    {/* Over the squad being placed, so a tap on a character
                        and a tap on an empty square both land here. */}
                    {placing?.zone.map(square => {
                        const rect = areaRect(field, [square]);
                        const target = placing.selected !== null && !occupied.has(square);
                        return (
                            <rect
                                key={`place-${square}`}
                                className={`ag-ra-place${target ? ' ag-ra-place--target' : ''}`}
                                {...rect}
                                onClick={() => placing.onTap(square)}
                            />
                        );
                    })}

                    {drawOrder.map(fighter => {
                        const { x, y } = squareCentre(field, fighter.square);
                        const character = CHARACTERS[fighter.character];
                        const standing = isStanding(fighter);
                        const status = fighterStatus(fighter);
                        const isSelected = fighter.id === selected?.id;
                        return (
                            <ClickableMapNode
                                key={fighter.id}
                                x={x} y={y - FIGURE_LIFT} radius={FIGURE_RADIUS}
                                isValid
                                isSelected={isSelected}
                                showRing={false}
                                onClick={() => onSelect(fighter.id)}
                                title={[`${character.name} · ${nameFor(fighter.owner)}`, `${fighter.hp}/${character.hp} HP`, ...status].join(' · ')}
                            >
                                <Figure
                                    selected={isSelected}
                                    field={field}
                                    square={fighter.square}
                                    character={standing ? fighter.character : null}
                                    className={`${standing ? '' : 'ag-ra-figure--down'}${fighter.banked > 0 ? ' ag-ra-figure--watch' : ''}`}
                                    fill={standing ? colourFor(fighter.owner) : undefined}
                                />
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

                    {/* The centre's name sits just clear of its dashed edge,
                        small enough to keep off the squares beside it and
                        still legible fitted to a phone. */}
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
