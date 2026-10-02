'use client'
import React, { useId, useMemo } from 'react';
import BoardZoom, { type BoardZoomFocus } from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import { coordsOf, type Battlefield, type Square, type TerrainLetter } from '@/utils/games/battlefield/terrain';
import { isoArea, isoBlock, isoBounds, isoCentre, isoDepth, isoGridLines, isoPoint, isoPoints, isoRuns, isoSlab, isoSquareAt, isoView, ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type IsoBlock, type IsoView, type Point } from '@/utils/ui/isometric';
import { RealmArenaTerrainArt, RealmArenaTerrainDefs } from '@/games/RealmArena/components/RealmArenaTerrain';
import type { Rect } from '@/utils/ui/mapLabels';
import { CHARACTERS, type CharacterId } from '@/games/RealmArena/characters';
import { ACTION_POINTS, CENTRE, isStanding, type Fighter, type MusterPick } from '@/games/RealmArena/rules';
import { apPips, areaRect, type AttackOption, CHARACTER_MARK, fighterStatus, focusOn, hpFraction, reachFocus, terrainLetter } from '@/games/RealmArena/ui';

/** How deep the ground is drawn under the map's front edges, in quarters. */
const SLAB_DEPTH = 3;
/**
 * The least the board's height may be as a fraction of its width: an
 * isometric map is twice as wide as it's tall, which fitted to a phone would
 * leave a strip of a frame to pan around in once zoomed.
 */
const MIN_ASPECT = 0.62;

/**
 * A figure stands on its square as a disc held upright, `FIGURE_RISE` above
 * the middle of the square's top, over a shadow the shape of the square, with
 * its HP bar under the disc. Everything here is in board units, against a
 * square `2 * ISO_HALF_WIDTH` across.
 */
const FIGURE_RADIUS = 4.5;
const FIGURE_RISE = 7;
const HP_BAR_WIDTH = 9;
const HP_BAR_HEIGHT = 1.5;
/** The AP pips: a column of dots down the figure's right, clear of the disc and inside its square's width. */
const AP_PIP_RADIUS = 0.75;
const AP_PIP_STEP = 1.9;
const AP_PIP_OFFSET = 5.6;
/** A target's chance to hit: a pill wide enough for "100%", worn above its figure's disc. */
const ODDS_WIDTH = 10.5;
const ODDS_HEIGHT = 4;
const ODDS_RISE = FIGURE_RISE + FIGURE_RADIUS + ODDS_HEIGHT / 2 + 0.6;
/** How far below its disc's middle a figure is looked for, to tell whether something in front hides it: most of the way to the disc's foot. */
const FOOT_PROBE = FIGURE_RADIUS * 0.6;
/** Room over the back of the map for a figure standing there, and the odds above it. */
const HEADROOM = ODDS_RISE + ODDS_HEIGHT / 2 + 1;

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
    /** The selected character's reach: the AP it costs to stop on each square of it. */
    reach: ReadonlyMap<Square, number> | null;
    /** Every square an armed weapon or ability could land on from where the character stands. */
    range: ReadonlySet<Square> | null;
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
    /** A tap on a square of the board, whoever stands on it. */
    onTap: (square: Square) => void;
}

/** What a square is shaded with — its reach, a range, a blast — as the class it's drawn with, or undefined for nothing. */
type Shade = (square: Square) => string | undefined;

/** Where a figure's disc is centred: `FIGURE_RISE` over the middle of its square's top. */
function discCentre(view: IsoView, square: Square): Point {
    const { x, y } = isoCentre(view, square);
    return { x, y: y - FIGURE_RISE };
}

/**
 * Whether something in front of a figure covers its disc: the front-most
 * square drawn under the disc's middle or its foot is nearer the viewer than
 * the square the figure stands on.
 */
function hidden(view: IsoView, square: Square): boolean {
    const { x, y } = discCentre(view, square);
    const depth = isoDepth(view, square);
    return [y, y + FOOT_PROBE].some(at => {
        const front = isoSquareAt(view, x, at);
        return front !== undefined && isoDepth(view, front) > depth;
    });
}

/** What a figure covers, from the top of its disc to its feet: what the centre's name keeps off. */
function figureRect(view: IsoView, square: Square): Rect {
    const { x, y } = discCentre(view, square);
    return { x: x - FIGURE_RADIUS, y: y - FIGURE_RADIUS, width: FIGURE_RADIUS * 2, height: FIGURE_RADIUS + FIGURE_RISE };
}

interface FigureProps {
    view: IsoView;
    square: Square;
    /** The character it stands as, or null for a fallen one, which is marked ✕. */
    character: CharacterId | null;
    className?: string;
    fill?: string;
    ring?: Ring;
    /** Drawn over whatever hides it, rather than standing on its square: no shadow. */
    ghost?: boolean;
}

/** A character's disc with its mark on it, stood upright over its shadow on its square. */
function Figure({ view, square, character, className = '', fill, ring, ghost = false }: FigureProps) {
    const feet = isoCentre(view, square);
    const { x, y } = discCentre(view, square);
    return (
        <>
            {!ghost && <ellipse className="ag-ra-shadow" cx={feet.x} cy={feet.y} rx={ISO_HALF_WIDTH / 2} ry={ISO_HALF_HEIGHT / 2} />}
            {ring && <circle className={`ag-ra-ring ag-ra-ring--${ring}`} cx={x} cy={y} r={FIGURE_RADIUS + 1.2} />}
            <circle className={`ag-ra-figure ${className}`} cx={x} cy={y} r={FIGURE_RADIUS} fill={fill} />
            <text className="ag-ra-mark" x={x} y={y}>{character ? CHARACTER_MARK[character] : '✕'}</text>
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

/** A target's chance to hit, as a badge over its figure. */
function Odds({ view, square, chance }: { view: IsoView; square: Square; chance: number }) {
    const { x, y } = isoCentre(view, square);
    return (
        <g className="ag-ra-odds">
            <rect x={x - ODDS_WIDTH / 2} y={y - ODDS_RISE - ODDS_HEIGHT / 2} width={ODDS_WIDTH} height={ODDS_HEIGHT} rx={ODDS_HEIGHT / 2} />
            <text x={x} y={y - ODDS_RISE}>{chance}%</text>
        </g>
    );
}

/** Runs of the flat squares that share a key: everything raised is drawn square by square instead, in depth order. */
function flatRuns<K>(view: IsoView, keyOf: (square: Square) => K | undefined) {
    return isoRuns(view, square => view.heights[square] === 0 ? keyOf(square) : undefined);
}

/** A raised square, as the board lays it out once a battlefield. */
interface RaisedBlock {
    square: Square;
    depth: number;
    letter: TerrainLetter;
    /** Its top, at its full height: what it's shaded on. */
    top: string;
    /** The square's back corner on its ground, where its art stands. */
    corner: Point;
    /** The ground it stands on, where a map raises that off the slab: drawn as a block of its own under the art. */
    ground: IsoBlock | null;
}

/** A raised square: the ground under it, the art standing on that, and whatever its top is shaded with. */
function RaisedSquare({ id, block, shades }: { id: string; block: RaisedBlock; shades: readonly Shade[] }) {
    const { ground } = block;
    return (
        <g className="ag-ra-block">
            {ground && (
                <g className="ag-ra-ground--open">
                    {ground.left.map((slice, index) => <polygon key={`l${index}`} className="ag-ra-side ag-ra-side--left" points={slice} />)}
                    {ground.right.map((slice, index) => <polygon key={`r${index}`} className="ag-ra-side ag-ra-side--right" points={slice} />)}
                    <polygon className="ag-ra-top" points={ground.top} />
                </g>
            )}
            <RealmArenaTerrainArt id={id} letter={block.letter} square={block.square} corner={block.corner} />
            {shades.map((shade, index) => {
                const className = shade(block.square);
                return className && <polygon key={index} className={className} points={block.top} />;
            })}
        </g>
    );
}

interface FighterNodeProps {
    view: IsoView;
    fighter: Fighter;
    ring: Ring | undefined;
    selected: boolean;
    /** It's its owner's turn in battle, so it shows the AP it has left. */
    acting: boolean;
    colourFor: (userId: string) => string;
    nameFor: (userId: string) => string;
    onSelect: (fighterId: number) => void;
}

/** A character on the battlefield, standing or fallen: its figure, HP bar and AP, and the tap that selects it. */
function FighterNode({ view, fighter, ring, selected, acting, colourFor, nameFor, onSelect }: FighterNodeProps) {
    const { x, y } = discCentre(view, fighter.square);
    const character = CHARACTERS[fighter.character];
    const standing = isStanding(fighter);
    return (
        <ClickableMapNode
            x={x} y={y} radius={FIGURE_RADIUS}
            isValid
            isSelected={selected}
            showRing={false}
            onClick={() => onSelect(fighter.id)}
            title={[`${character.name} · ${nameFor(fighter.owner)}`, `${fighter.hp}/${character.hp} HP`, ...fighterStatus(fighter)].join(' · ')}
        >
            <Figure
                ring={ring}
                view={view}
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
            {standing && acting && <ApPips x={x + AP_PIP_OFFSET} y={y} fighter={fighter} />}
        </ClickableMapNode>
    );
}

/** One thing the board draws in depth order, back to front: a raised square, or a figure standing on one. */
interface DepthItem {
    depth: number;
    node: React.ReactNode;
}

/**
 * The battlefield (docs/games/realm-arena.md §13.1, §17.3 PR 5), drawn
 * isometrically: each square a diamond, raised to its tile's elevation, so
 * the walls, the trees and the towers stand up off the ground at the heights
 * the rules play (§25) and a character on a tower top stands up there with
 * it. The
 * geometry is `src/utils/ui/isometric.ts`'s; this decides what goes on it.
 *
 * The terrain is tile art (`art.ts`, drawn by `RealmArenaTerrain`): grass laid
 * over the whole map as one pattern, and on every raised square the sprites
 * its terrain is drawn with — battlements, rubble, a tree — standing on it at
 * the heights the rules play.
 *
 * It's painted back to front. First the ground: the slab the map stands on,
 * the grass over it, the lines between the squares, and everything shaded on
 * the ground — deployment zones, the centre, the reach, a range, a blast —
 * merged into a path per kind.
 * Nothing on the ground can hide anything, so all of that goes first, and a
 * board of 1,728 squares is a few dozen elements before anything stands up.
 * Then every raised square and every figure, in depth order (`isoDepth`), so
 * a wall hides whoever is behind it and anyone in front of it stands over
 * it; a raised square's own shading is drawn on its top as it goes. Last, what
 * is never hidden: a lined-up path, the odds, and the centre's name.
 *
 * At a phone's width a square is under ten pixels across — fine for reading
 * the battle, far too small to tap — so `BoardZoom`'s deepest step brings
 * about seven squares across the column, and selecting a character brings the
 * view to most of where it could move — as deep as that still fits
 * (`reachFocus`).
 *
 * On the viewer's battle turn (`aiming`, §17.3 PR 7) it shades the selected
 * character's reach by the AP each square costs, draws the path a lined-up
 * move takes, the range of a weapon or ability armed to aim — every square it
 * could land on, whether or not anyone stands there — and the area a fireball
 * hits, and rings who can be aimed at, who is, and every watcher a move would
 * set off. With one of the viewer's own selected, each enemy it could hit
 * wears its chance to (`odds`), read from the end of a lined-up move. A tap
 * anywhere no character stands goes to `aiming.onSquare` — the front-most
 * square drawn under it (`isoSquareAt`), so a tap on a wall's face is the
 * wall, not the ground it hides — and a tap on a character still goes to
 * `onSelect`, and the screen decides whether that aims or selects.
 *
 * Placing a squad (`placing`), a tap on a square or on a character of the
 * squad both go to `placing.onTap`, with the square tapped.
 *
 * Stepping through a review (`follow`), the view goes to each step: every
 * character it moved or touched, zoomed as deep as they all still fit.
 */
export default function RealmArenaBoard({ field, fighters, sealed, seats, colourFor, nameFor, selected, onSelect, placing, aiming, acting, refocus = 0, follow, odds, overlay }: RealmArenaBoardProps) {
    // The ground doesn't change during a match, so it's laid out once a battlefield.
    const ground = useMemo(() => {
        const view = isoView(
            { width: field.width, height: field.height, heights: field.tiles.map(tile => tile.elevation) },
            { base: SLAB_DEPTH, headroom: HEADROOM, minAspect: MIN_ASPECT },
        );
        // The ground each square's terrain stands on, laid out on the same
        // board: where it's raised, it's a block of its own under the art.
        const groundView: IsoView = { ...view, heights: field.tiles.map(tile => tile.elevation - tile.terrain.height) };
        return {
            view,
            slab: isoSlab(view),
            lines: isoGridLines(view),
            blocks: view.heights.flatMap((height, square): RaisedBlock[] => {
                if (height === 0) return [];
                const { col, row } = coordsOf(field, square);
                const ground = groundView.heights[square];
                return [{
                    square,
                    depth: isoDepth(view, square),
                    letter: terrainLetter(field, square),
                    top: isoBlock(view, square).top,
                    corner: isoPoint(view, col, row, ground),
                    ground: ground > 0 ? isoBlock(groundView, square) : null,
                }];
            }),
        };
    }, [field]);
    const { view } = ground;
    const { width, height } = view.size;
    // useId's own characters aren't all safe inside url(#…).
    const artId = `ra-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

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
    if (follow && follow.squares.length > 0) focus = { rect: isoBounds(view, focusOn(field, ...follow.squares)), key: `follow:${follow.key}` };
    else if (pickedUp) focus = { rect: isoBounds(view, focusOn(field, pickedUp.square)), key: `pick:${pickedUp.square}:${refocus}` };
    else if (selected) focus = { rect: isoBounds(view, reachRect ?? focusOn(field, selected.square)), key: `${selected.id}:${selected.square}:${refocus}`, exact: true };

    const centreSquares = field.objectives[CENTRE] ?? [];
    const centre = centreSquares.length > 0 ? areaRect(field, centreSquares) : null;

    // Everything shaded square by square, in the order it's painted.
    const shades: Shade[] = [];
    const reach = aiming?.reach;
    if (reach) shades.push(square => reach.has(square) ? `ag-ra-reach ag-ra-reach--${reach.get(square)}` : undefined);
    const range = aiming?.range;
    if (range) shades.push(square => range.has(square) ? 'ag-ra-range' : undefined);
    const blast = new Set(aiming?.area);
    if (blast.size > 0) shades.push(square => blast.has(square) ? 'ag-ra-blast' : undefined);
    if (placing && placing.selected !== null) {
        // Somewhere to put the character picked up: anywhere in the zone nobody stands.
        const free = new Set(placing.zone);
        sealed?.forEach(pick => free.delete(pick.square));
        shades.push(square => free.has(square) ? 'ag-ra-place' : undefined);
    }
    const flatShades = shades.flatMap(shade => flatRuns(view, shade));

    const ringOf = (fighter: Fighter): Ring | undefined => {
        if (fighter.id === selected?.id) return 'selected';
        if (aiming?.aimed.includes(fighter.id)) return 'aimed';
        if (aiming?.flagged.includes(fighter.id)) return 'flagged';
        if (aiming?.candidates.includes(fighter.id)) return 'candidate';
        return undefined;
    };

    const items: DepthItem[] = ground.blocks.map(block => ({
        depth: block.depth,
        node: <RaisedSquare key={`block-${block.square}`} id={artId} block={block} shades={shades} />,
    }));

    sealed?.forEach((pick, index) => items.push({
        depth: isoDepth(view, pick.square) + 0.5,
        node: (
            <g
                key={`sealed-${index}`}
                className={`ag-ra-sealed${placing ? ' ag-ra-sealed--placing' : ''}`}
                onClick={placing ? () => placing.onTap(pick.square) : undefined}
            >
                <title>{`${CHARACTERS[pick.character].name} · your squad, sealed until every player has mustered`}</title>
                <Figure view={view} square={pick.square} character={pick.character} ring={placing?.selected === index ? 'selected' : undefined} />
            </g>
        ),
    }));

    for (const fighter of fighters) {
        items.push({
            // Anyone standing over a body is drawn on top of it.
            depth: isoDepth(view, fighter.square) + (isStanding(fighter) ? 0.6 : 0.5),
            node: (
                <FighterNode
                    key={fighter.id}
                    view={view}
                    fighter={fighter}
                    ring={ringOf(fighter)}
                    selected={fighter.id === selected?.id}
                    acting={fighter.owner === acting}
                    colourFor={colourFor}
                    nameFor={nameFor}
                    onSelect={onSelect}
                />
            ),
        });
    }
    items.sort((a, b) => a.depth - b.depth);

    const onTapSquare = placing?.onTap ?? aiming?.onSquare;
    // A tap's point on the board, mapped through the SVG's own transform so
    // it lands on the right square at any zoom.
    const tapSquare = (event: React.MouseEvent<SVGRectElement>) => {
        const ctm = event.currentTarget.ownerSVGElement?.getScreenCTM();
        if (!ctm || !onTapSquare) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        const square = isoSquareAt(view, point.x, point.y);
        if (square !== undefined) onTapSquare(square);
    };
    const path = aiming?.path?.map(square => isoCentre(view, square));
    const pathEnd = path?.[path.length - 1];
    // Who something in front hides: a scan of the board per figure, so only redone when someone moves.
    const ghosts = useMemo(() => fighters.filter(fighter => isStanding(fighter) && hidden(view, fighter.square)), [view, fighters]);
    const figureRects = [...fighters, ...(sealed ?? [])].map(({ square }) => figureRect(view, square));

    return (
        <div className="ag-board-frame ag-realmarena-frame">
            {/* 84 squares corner to corner fitted to a phone is under ten
                pixels a square, so the deep step is what makes one
                tappable: about seven squares across (§13.1). */}
            <BoardZoom zoomWidth={250} maxWidth={600} viewBox={view.size} focus={focus}>
                <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The ${field.name}`}>
                    <g className="ag-ra-ground--earth">
                        <polygon className="ag-ra-side ag-ra-side--left" points={ground.slab.left} />
                        <polygon className="ag-ra-side ag-ra-side--right" points={ground.slab.right} />
                    </g>
                    <RealmArenaTerrainDefs id={artId} origin={isoPoint(view, 0, 0, 0)} />
                    <polygon className="ag-ra-top ag-ra-ground--open" points={ground.slab.top} />
                    <polygon points={ground.slab.top} fill={`url(#${artId}-grass)`} />
                    <path className="ag-ra-grid" d={ground.lines} />

                    {field.deployments.map((squares, seat) => {
                        const owner = seats[seat];
                        return (
                            <polygon
                                key={seat}
                                className="ag-ra-deployment"
                                points={isoArea(view, areaRect(field, squares))}
                                style={{ '--ra-seat': owner ? colourFor(owner) : 'var(--ag-ink-softer)' } as React.CSSProperties}
                            />
                        );
                    })}
                    {centre && <polygon className="ag-ra-centre" points={isoArea(view, centre)} />}
                    {flatShades.map(run => <path key={run.key} className={run.key} d={run.d} />)}

                    {/* Under everything that stands up, so a tap on a
                        character goes to the character; the terrain lets a
                        tap through to it. */}
                    {onTapSquare && <rect className="ag-ra-tap" width={width} height={height} onClick={tapSquare} />}

                    {items.map(item => item.node)}

                    {path && pathEnd && (
                        <>
                            <polyline className="ag-ra-path" points={isoPoints(path)} />
                            <circle className="ag-ra-path-end" cx={pathEnd.x} cy={pathEnd.y} r={2} />
                        </>
                    )}

                    {/* A standing character something in front hides, drawn
                        again faintly over it, so it's still there to see and
                        to tap. */}
                    {ghosts.map(fighter => {
                        const { x, y } = discCentre(view, fighter.square);
                        return (
                            <ClickableMapNode
                                key={`ghost-${fighter.id}`}
                                x={x} y={y} radius={FIGURE_RADIUS}
                                isValid
                                showRing={false}
                                onClick={() => onSelect(fighter.id)}
                                title={`${CHARACTERS[fighter.character].name} · ${nameFor(fighter.owner)} · out of sight`}
                            >
                                <g className="ag-ra-ghost">
                                    <Figure view={view} square={fighter.square} character={fighter.character} fill={colourFor(fighter.owner)} ghost />
                                </g>
                            </ClickableMapNode>
                        );
                    })}

                    {/* Over every figure, so a neighbour never hides one. */}
                    {odds?.map(({ target, chance }) => <Odds key={target.id} view={view} square={target.square} chance={chance} />)}

                    {/* The centre's name sits just clear of its dashed edge,
                        big enough to read fitted to a phone. */}
                    {centre && (
                        <MapLabelLayer
                            labels={[{
                                key: CENTRE,
                                ...isoPoint(view, centre.x + centre.width / 2, centre.y + centre.height / 2, 0),
                                text: 'Centre',
                                radius: (centre.width + centre.height) * ISO_HALF_HEIGHT / 2,
                            }]}
                            obstacles={figureRects}
                            width={width} height={height}
                            offset={(centre.width + centre.height) * ISO_HALF_HEIGHT / 2 + 4}
                            fontSize={10}
                            fontWeight={800}
                        />
                    )}
                </svg>
            </BoardZoom>
            {overlay}
        </div>
    );
}
