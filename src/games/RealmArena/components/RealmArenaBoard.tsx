'use client'
import React, { useId, useMemo } from 'react';
import BoardZoom, { type BoardZoomFocus } from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import type { Battlefield, Square, TerrainLetter } from '@/utils/games/battlefield/terrain';
import { CHARACTERS, type CharacterId } from '@/games/RealmArena/characters';
import { ACTION_POINTS, CENTRE, isStanding, type Fighter, type MusterPick } from '@/games/RealmArena/rules';
import { apPips, areaRect, CELL, type AttackOption, CHARACTER_MARK, fighterStatus, focusOn, groundLayers, hpFraction, pathPoints, reachFocus, squareAtPoint, squareCentre, type RunLayer } from '@/games/RealmArena/ui';

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
/**
 * The AP pips: a column of dots down the figure's right. The offset clears the
 * disc (`FIGURE_RADIUS`) and keeps the dots inside the figure's 10-unit square;
 * the step fits four of them beside the disc.
 */
const AP_PIP_RADIUS = 0.6;
const AP_PIP_STEP = 1.55;
const AP_PIP_OFFSET = 4.35;
/**
 * A target's chance to hit: a pill wide enough for "100%", worn as a badge
 * across the top of its figure and kept inside its own square, so it never
 * covers a neighbour's HP bar or runs off the top of the board.
 */
const ODDS_WIDTH = 8.4;
const ODDS_HEIGHT = 3.2;
const ODDS_RISE = CELL / 2 - ODDS_HEIGHT / 2;

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
    /** The viewer lining up the selected character's next action, on their battle turn. */
    aiming?: Aiming | null;
    /** Bumped to bring the view back to the selected character though it hasn't changed: a tap on its box under the board. */
    refocus?: number;
    /** The player whose turn it is in battle: their characters show the AP they have left. */
    acting?: string | null;
    /** A review's step (§17.3 PR 8): the squares it touched, brought into view whenever `key` changes. */
    follow?: { squares: readonly Square[]; key: string } | null;
    /** The selected character's chance to hit each enemy in reach, floated above each one. */
    odds?: readonly AttackOption[] | null;
    /** Floats over the foot of the board, outside the zoom, so it stays put as the board pans: the selected character's targets. */
    overlay?: React.ReactNode;
}

/** What the board shows of an action being lined up (§17.3 PR 7), and where a tap on it goes. */
interface Aiming {
    /** The selected character's reach, one layer for each AP it costs to stop there. */
    reach: readonly RunLayer<number>[] | null;
    /** Every square an armed weapon or ability could land on from where the character stands, as one path. */
    range: string | null;
    /** The path a lined-up move takes. */
    path: readonly Square[] | null;
    /** The 3×3 a lined-up fireball hits. */
    area: readonly Square[] | null;
    /** Who a tap could aim at. */
    candidates: readonly number[];
    /** Who is aimed at. */
    aimed: readonly number[];
    /** The watchers a lined-up move would set off. */
    flagged: readonly number[];
    /** A tap on a square of the board, anywhere no character stands. */
    onSquare: (square: Square) => void;
}

/** The ring drawn round a figure: chosen, a candidate for a tap, aimed at, or a watcher a move would set off. */
type Ring = 'selected' | 'candidate' | 'aimed' | 'flagged';

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
    ring?: Ring;
}

/** A character's disc with its mark on it, a little above its square's centre to leave room for the HP bar beneath. */
function Figure({ field, square, character, className = '', fill, ring }: FigureProps) {
    const { x, y } = squareCentre(field, square);
    return (
        <>
            {ring && <circle className={`ag-ra-ring ag-ra-ring--${ring}`} cx={x} cy={y - FIGURE_LIFT} r={FIGURE_RADIUS + 1.2} />}
            <circle className={`ag-ra-figure ${className}`} cx={x} cy={y - FIGURE_LIFT} r={FIGURE_RADIUS} fill={fill} />
            <text className="ag-ra-mark" x={x} y={y - FIGURE_LIFT}>{character ? CHARACTER_MARK[character] : '✕'}</text>
        </>
    );
}

/** A character's AP left this turn as a column of pips centred on `y` — the same pips the units strip shows. */
function ApPips({ x, y, fighter }: { x: number; y: number; fighter: Fighter }) {
    const pips = apPips(fighter);
    const top = y - (AP_PIP_STEP * (pips.length - 1)) / 2;
    return pips.map((on, i) => (
        <circle key={i} className={`ag-ra-ap${on ? ' ag-ra-ap--on' : ''}`} cx={x} cy={top + i * AP_PIP_STEP} r={AP_PIP_RADIUS} />
    ));
}

/** A target's chance to hit, as a badge across the top of its figure. */
function Odds({ field, square, chance }: { field: Battlefield; square: Square; chance: number }) {
    const { x, y } = squareCentre(field, square);
    return (
        <g className="ag-ra-odds">
            <rect x={x - ODDS_WIDTH / 2} y={y - ODDS_RISE - ODDS_HEIGHT / 2} width={ODDS_WIDTH} height={ODDS_HEIGHT} rx={ODDS_HEIGHT / 2} />
            <text x={x} y={y - ODDS_RISE}>{chance}%</text>
        </g>
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
 * most of where it could move — as deep as that still fits (`reachFocus`).
 *
 * On the viewer's battle turn (`aiming`, §17.3 PR 7) it shades the selected
 * character's reach by the AP each square costs, draws the path a lined-up
 * move takes, the range of a weapon or ability armed to aim — every square it
 * could land on, whether or not anyone stands there — and the area a fireball
 * hits, and rings who can be aimed at, who is, and every watcher a move would
 * set off. With one of the viewer's own selected, each enemy it could hit
 * wears its chance to (`odds`), read from the end of a lined-up move. A tap
 * anywhere no character stands goes to `aiming.onSquare`; a tap on a character
 * still goes to `onSelect`, and the screen decides whether that aims or selects.
 *
 * Stepping through a review (`follow`), the view goes to each step: every
 * character it moved or touched, zoomed as deep as they all still fit.
 */
export default function RealmArenaBoard({ field, fighters, sealed, seats, colourFor, nameFor, selected, onSelect, placing, aiming, acting, refocus = 0, follow, odds, overlay }: RealmArenaBoardProps) {
    const gridId = useId();
    const width = field.width * CELL;
    const height = field.height * CELL;
    const viewBox = { width, height };

    // A character selected in battle brings most of where it could move into
    // view, rather than just the squares round it — zoomed exactly to that,
    // since a full turn's reach is too wide for any step but the fit. A search
    // over the whole map, so only redone when the selection or the board moves.
    const reachRect = useMemo(
        () => selected && isStanding(selected) ? reachFocus({ field, fighters }, selected, acting === selected.owner ? selected.ap : ACTION_POINTS) : null,
        [field, fighters, selected, acting],
    );

    // A character picked up to place is brought close enough to tap a square beside it.
    const pickedUp = placing?.selected != null ? sealed?.[placing.selected] : undefined;
    // A review follows its steps, as Race Cars follows a roll, ahead of anything selected.
    let focus: BoardZoomFocus | null = null;
    if (follow && follow.squares.length > 0) focus = { rect: focusOn(field, ...follow.squares), key: `follow:${follow.key}` };
    else if (pickedUp) focus = { rect: focusOn(field, pickedUp.square), key: `pick:${pickedUp.square}:${refocus}` };
    else if (selected) focus = { rect: reachRect ?? focusOn(field, selected.square), key: `${selected.id}:${selected.square}:${refocus}`, exact: true };
    const occupied = new Set(sealed?.map(pick => pick.square));

    const centreSquares = field.objectives[CENTRE] ?? [];
    const centre = centreSquares.length > 0 ? areaRect(field, centreSquares) : null;

    // The fallen first, so anyone standing over a body is drawn on top of it.
    const drawOrder = [...fighters].sort((a, b) => Number(isStanding(a)) - Number(isStanding(b)));
    const figureRects = [...fighters, ...(sealed ?? [])].map(({ square }) => areaRect(field, [square]));
    const ringOf = (fighter: Fighter): Ring | undefined => {
        if (fighter.id === selected?.id) return 'selected';
        if (aiming?.aimed.includes(fighter.id)) return 'aimed';
        if (aiming?.flagged.includes(fighter.id)) return 'flagged';
        if (aiming?.candidates.includes(fighter.id)) return 'candidate';
        return undefined;
    };
    const pathEnd = aiming?.path ? squareCentre(field, aiming.path[aiming.path.length - 1]) : null;
    // A tap's point on the board, mapped through the SVG's own transform so
    // it lands on the right square at any zoom.
    const tapSquare = (event: React.MouseEvent<SVGRectElement>) => {
        const svg = event.currentTarget.ownerSVGElement;
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm || !aiming) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        const square = squareAtPoint(field, point.x, point.y);
        if (square !== undefined) aiming.onSquare(square);
    };

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

                    {aiming?.reach?.map(layer => (
                        <path key={layer.key} className={`ag-ra-reach ag-ra-reach--${layer.key}`} d={layer.d} />
                    ))}
                    {aiming?.range && <path className="ag-ra-range" d={aiming.range} />}
                    {aiming?.area && <rect className="ag-ra-blast" {...areaRect(field, aiming.area)} />}
                    {aiming && <rect className="ag-ra-tap" width={width} height={height} onClick={tapSquare} />}
                    {aiming?.path && pathEnd && (
                        <>
                            <polyline className="ag-ra-path" points={pathPoints(field, aiming.path)} />
                            <circle className="ag-ra-path-end" cx={pathEnd.x} cy={pathEnd.y} r={1.6} />
                        </>
                    )}

                    {sealed?.map((pick, index) => (
                        <g key={`sealed-${index}`} className="ag-ra-sealed">
                            <title>{`${CHARACTERS[pick.character].name} · your squad, sealed until both have mustered`}</title>
                            <Figure field={field} square={pick.square} character={pick.character} ring={placing?.selected === index ? 'selected' : undefined} />
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
                                    ring={ringOf(fighter)}
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
                                            width={HP_BAR_WIDTH * hpFraction(fighter)} height={HP_BAR_HEIGHT}
                                        />
                                    </>
                                )}
                                {standing && fighter.owner === acting && <ApPips x={x + AP_PIP_OFFSET} y={y - FIGURE_LIFT} fighter={fighter} />}
                            </ClickableMapNode>
                        );
                    })}

                    {/* Over every figure, so a neighbour never hides one. */}
                    {odds?.map(({ target, chance }) => <Odds key={target.id} field={field} square={target.square} chance={chance} />)}

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
            {overlay}
        </div>
    );
}
