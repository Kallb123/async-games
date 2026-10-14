'use client'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import BoardZoom, { useBoardCentre, type BoardZoomFocus, type BoardZoomPivot } from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import { coverBySide, SIDE_STEPS, type Side } from '@/utils/games/battlefield/cover';
import { facingTowards, type Battlefield, type Facing, type Square, type TerrainLetter } from '@/utils/games/battlefield/terrain';
import { isoArea, isoBlock, isoBounds, isoCentre, isoCorner, isoDepth, isoGridLines, isoGroundAt, isoPoint, isoPoints, isoRuns, isoSlab, isoSquareAt, isoView, ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type IsoBlock, type IsoRotation, type IsoView, type Point } from '@/utils/ui/isometric';
import { RealmArenaTerrainArt, RealmArenaTerrainDefs, spriteId, SpriteUse } from '@/games/RealmArena/components/RealmArenaTerrain';
import { RealmArenaEffectMarks } from '@/games/RealmArena/components/RealmArenaEffects';
import RealmArenaFx from '@/games/RealmArena/components/RealmArenaFx';
import type { Rect } from '@/utils/ui/mapLabels';
import { useSvgId } from '@/utils/hooks/useSvgId';
import { useStoredValue } from '@/utils/hooks/useStoredValue';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';
import { PlaybackProvider, setAttributes, translation, usePlaybackFrame, usePlaybackRef, usePlaybackValue } from '@/utils/hooks/usePlayback';
import { CHARACTER_ART, facingCell, ITEM_ART, SMOKE_ART, spriteBox, TERRAIN_ART, type CharacterPose } from '@/games/RealmArena/art';
import { CHARACTERS, ITEMS, type CharacterId, type ItemId } from '@/games/RealmArena/characters';
import { ACTION_POINTS, CENTRE, isStanding, isWarband, maxHpOf, smokeSquares, type BattleState, type Fighter, type FogGhost, type MusterPick, type ToldEvent } from '@/games/RealmArena/rules';
import type { AttackOption } from '@/games/RealmArena/tactics';
import { apPips, areaRect, captionAt, eventLines, type BattleCue, type CaptionCue, type FallCue, type FxPoints, type ScorchCue, type Shove, type Timed, type WalkCue, effectsOn, facingOf, fadeInAt, fadeOutAt, fighterStatus, boardFocus, endOf, hpFraction, legLengthOn, progressOf, reachFocus, shakeAt, shakesOf, shovesOf, shoveAt, terrainLetter, toldAt, toldOf, walkerAt, walkCameraAt, legPoint, walkLift, walkSquares, type Told } from '@/games/RealmArena/ui';

/** How deep the ground is drawn under the map's front edges, in quarters. */
const SLAB_DEPTH = 3;
/**
 * The least the board's height may be as a fraction of its width: an
 * isometric map is twice as wide as it's tall, which fitted to a phone would
 * leave a strip of a frame to pan around in once zoomed. Raised from 0.62 for
 * a little more battlefield on a phone; much more and the controls under it
 * fall off the first screen.
 */
const MIN_ASPECT = 0.7;

/**
 * A figure stands on its square as its character's art (`CHARACTER_ART`),
 * facing the way it last stepped, over a shadow; fallen, it lies there. Its
 * body is taken as a disc `FIGURE_RADIUS` across, `FIGURE_RISE` above the
 * middle of the square's top — what a tap lands on, what its marks sit
 * beside and what a shot flies to — and the tallest of them (a mage's hat, a
 * staff's head) stands about `FIGURE_TOP` high, with its HP bar just over
 * that: a model drawn taller in art-masters/realmarena/characters wants this
 * raised with it. Everything here is in board units, against a square
 * `2 * ISO_HALF_WIDTH` across.
 */
const FIGURE_RADIUS = 4.5;
const FIGURE_RISE = 7;
const FIGURE_TOP = 12.5;
const HP_BAR_WIDTH = 9;
const HP_BAR_HEIGHT = 2;
/** How high the HP bar's foot is over the middle of its square. */
const HP_BAR_RISE = FIGURE_TOP + 0.5;
/**
 * The rings on the ground round a figure's feet, as fractions of its square's
 * diamond: the one it's picked out by, wide enough to show round its feet,
 * and outside that, still inside the square, the dashed one round one on
 * watch or still sealed.
 */
const RING_RADIUS = 0.62;
const MARKER_RADIUS = 0.8;
/** The AP pips: a column of dots down the figure's right, clear of the disc and inside its square's width. */
const AP_PIP_RADIUS = 0.75;
const AP_PIP_STEP = 1.9;
const AP_PIP_OFFSET = 5.6;
/**
 * The effect marks (§20.2): a column of badges down the figure's left, where
 * the AP pips never are, clear of the disc and inside its square's width.
 * Three stand within the disc's height.
 */
const EFFECT_MARK_SIZE = 3;
const EFFECT_MARK_STEP = 3.1;
const EFFECT_MARK_OFFSET = 6.2;
/**
 * The item a character carries (§21.1): by its right shoulder, in the AP
 * pips' column above them, so it never covers them, the effect marks or the
 * HP bar over the figure's head.
 */
const ITEM_MARK_SIZE = 3;
const ITEM_MARK_OFFSET = { x: AP_PIP_OFFSET, y: -5 };
/** A puff of a smoke pot's cloud: a square across, its foot just in front of the square's middle. */
const SMOKE_SIZE = 2 * ISO_HALF_WIDTH;
/** A target's chance to hit: a pill wide enough for "100%", worn above its figure's HP bar. */
const ODDS_WIDTH = 10.5;
const ODDS_HEIGHT = 4;
const ODDS_RISE = HP_BAR_RISE + HP_BAR_HEIGHT + ODDS_HEIGHT / 2 + 0.6;
/** A cover shield standing on a square's edge: narrow enough to stay clear of the figure's disc and the HP bar. */
const SHIELD_WIDTH = 3.6;
const SHIELD_HEIGHT = 4.6;
/** How far below its disc's middle a figure is looked for, to tell whether something in front hides it: most of the way to the disc's foot. */
const FOOT_PROBE = FIGURE_RADIUS * 0.6;
/** Room over the back of the map for a figure standing there, and the odds above it. */
const HEADROOM = ODDS_RISE + ODDS_HEIGHT / 2 + 1;
/** How the battlefield is laid out on the board, at whichever turn it's viewed from. */
const VIEW = { base: SLAB_DEPTH, headroom: HEADROOM, minAspect: MIN_ASPECT };

/** A target picked to aim at, and who is aiming at it: what `follow` frames close (`aimFocus`). */
export interface AimFollow { aim: { caster: Square; target: Square }; key: string }

interface RealmArenaBoardProps {
    field: Battlefield;
    /** Everyone on the battlefield, standing or fallen — in fog of war, everyone the viewer can see. */
    fighters: readonly Fighter[];
    /** Stale enemy sightings, drawn in the fog without controls or live statistics. */
    fogGhosts?: readonly FogGhost[];
    /** In fog of war, every square the viewer's squad can't see, dimmed (§27); null without it, or once the battle is over. */
    unseen?: ReadonlySet<Square> | null;
    /** Smoke clouds the viewer can see whose throwers it can't, by the square each landed on (§27). */
    clouds?: readonly Square[];
    /** The battle's sides (§29.6), so a selected character's reach passes through its allies as the rules' does. */
    sides?: BattleState["sides"];
    /** The viewer's own sealed squad, while the muster lasts: drawn where they stand, but not yet on the battlefield. */
    sealed?: readonly MusterPick[] | null;
    /**
     * Whose each deployment zone is, in the map's order — the players in seat
     * order, then in co-op the warbands (§29.2) — so each zone, and every
     * figure of the squad that musters in it, wears its owner's colour.
     */
    owners: readonly string[];
    /** Hold Out's next wave lands next round (§30.11): the warbands' zones, where it will stand, are lit. */
    waveDue?: boolean;
    /** The map's centre is drawn, with its name: not in Hold Out, where holding it decides nothing (§30). */
    showCentre?: boolean;
    /** The signed-in viewer, whose preferred turn of the board this browser remembers. */
    viewerId: string;
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
    /**
     * Squares brought into view whenever `key` changes: a review's step
     * (§17.3 PR 8), or — `aim` — a target picked from the turn sheet's list,
     * framed close with whoever is aiming at it (`aimFocus`). `exact` zooms to
     * just fit the squares, rather than to the deepest step they fit at: a
     * move's whole path, which is often a dozen squares across. `close`
     * frames them as tight as `aim` does: an action's caster and whoever it
     * reached (`actionFollow`). `track` is a walk too long to frame: the
     * squares are only where it starts, and `WalkCamera` follows the walker
     * from there.
     */
    follow?: { squares: readonly Square[]; key: string; exact?: boolean; close?: boolean; track?: boolean } | AimFollow | null;
    /**
     * Where the view rests when nothing else says where to look — the
     * viewer's own side, as the board opens and whenever a selection, a pick
     * or a review step lets go of it: just fit round `squares`, again
     * whenever `key` changes. No squares, no focus: the board stays as it is.
     */
    home?: { squares: readonly Square[]; key: string } | null;
    /** The selected character's chance to hit each enemy in reach, floated above each one. */
    odds?: readonly AttackOption[] | null;
    /** The square a lined-up move ends on, to show the cover its sides give there: a shield on each side that covers (`CoverShields`). */
    coverAt?: Square | null;
    /** Floats over the foot of the board, outside the zoom, so it stays put as the board pans: the selected character's targets. A playback's caption takes its place while it plays. */
    overlay?: React.ReactNode;
    /**
     * What an action did, played over the figures (§26): a new `key` starts it
     * over. A pill at the foot of the frame says in words what is happening,
     * event by event, as it plays, and rests on the last when it is over.
     */
    playback?: Playback | null;
    /**
     * The playback with this `key` has played to its end: told once each, as
     * its clock gets there — after the glide to it and any hold on the way, however
     * long they took. The page moves on by it, not by a guess at how long the
     * glide takes.
     */
    onPlayed?: (key: string) => void;
    /**
     * A review step that happened out of the viewer's sight (`isUnplaced`),
     * as a key — the step's, so each one's mark fades in afresh: a big
     * half-transparent "?" over the middle of the board's frame, outside the
     * zoom so it stays put as the board pans. Null when there's nothing to say.
     */
    unplaced?: string | null;
}

/** What the board plays. */
export interface Playback {
    key: string;
    cues: readonly BattleCue[];
    /** What the cues were built from, which the caption at the foot of the frame tells in words as each lands. */
    events: readonly ToldEvent[];
    /** The battlefield as the action found it: what cover it blasted away is drawn from until it goes. */
    field: Battlefield;
    /** Everyone as the action found them: what a figure's HP bar and marks show until the cues that changed them land. */
    before: readonly Fighter[];
}

/** What the board shows of an action being lined up (§17.3 PR 7), and where a tap on it goes. */
interface Aiming {
    /** The selected character's reach: the AP it costs to stop on each square of it. */
    reach: ReadonlyMap<Square, number> | null;
    /** Every square an armed weapon or ability could land on from where the character stands. */
    range: ReadonlySet<Square> | null;
    /** The path a lined-up move takes. */
    path: readonly Square[] | null;
    /** The 3×3 a lined-up fireball hits, or the square a lined-up throw lands on. */
    area: readonly Square[] | null;
    /** The low cover a lined-up fireball or fire flask would blast away (§22), shaded as the blast is. */
    blasts: readonly Square[] | null;
    /** Who a tap could aim at. */
    candidates: readonly number[];
    /** Who is aimed at. */
    aimed: readonly number[];
    /** What the action lined up would do to the HP of each character it touches (less, or more for a heal), flashed on their HP bars. */
    hpChange: ReadonlyMap<number, number>;
    /** The watchers a lined-up move would set off. */
    flagged: readonly number[];
    /** A tap on a square of the board, anywhere no character stands. */
    onSquare: (square: Square) => void;
}

/** The ring drawn round a figure's feet: chosen, a candidate for a tap, aimed at, or a watcher a move would set off. */
type Ring = 'selected' | 'candidate' | 'aimed' | 'flagged';

/** The dashed ring round a figure's feet, outside its `Ring`: on watch, or a squad still sealed. */
type Marker = 'watch' | 'sealed';

/** Which way a figure — a fighter, or a pick still sealed — is drawn facing (`facingOf`). */
type FacingFor = (figure: { square: Square; facing?: Facing }) => Facing;

/** The filter a player's characters are tinted with (`tintId`), or undefined for one not seated. */
type TintFor = (userId: string) => string | undefined;

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

/** Where the battle visuals go on a square (§26): its ground, a figure's disc there, and the top of that disc. */
function fxPoints(view: IsoView, square: Square): FxPoints {
    const body = discCentre(view, square);
    return { ground: isoCentre(view, square), body, head: { x: body.x, y: body.y - FIGURE_RADIUS } };
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

/** What a figure covers, from the top of its HP bar to its feet: what the centre's name keeps off. */
function figureRect(view: IsoView, square: Square): Rect {
    const { x, y } = isoCentre(view, square);
    const top = HP_BAR_RISE + HP_BAR_HEIGHT;
    return { x: x - FIGURE_RADIUS, y: y - top, width: FIGURE_RADIUS * 2, height: top };
}

/**
 * The id the owner's colour is laid on under, for each seat: a filter that
 * multiplies the characters' team art — grey, and shaded — by it.
 */
const tintId = (artId: string, seat: number) => `${artId}-tint-${seat}`;

/** The filters `tintId` names, one a seat: each player's colour, laid over their characters. */
function TintDefs({ artId, colours }: { artId: string; colours: readonly string[] }) {
    return (
        <defs>
            {colours.map((colour, seat) => (
                <filter key={seat} id={tintId(artId, seat)} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                    <feFlood style={{ floodColor: colour }} result="tint" />
                    <feComposite in="SourceGraphic" in2="tint" operator="arithmetic" k1={1} k2={0} k3={0} k4={0} />
                </filter>
            ))}
        </defs>
    );
}

interface FigureProps {
    /** The board's id, which its art is defined under. */
    artId: string;
    view: IsoView;
    square: Square;
    character: CharacterId;
    /** Which way it faces on the grid: the board's turn picks the art for it. */
    facing: Facing;
    pose?: CharacterPose;
    /** The item it carries, marked by its shoulder. */
    item?: ItemId | null;
    className?: string;
    /** The filter its owner's colour is laid on with (`tintId`): left grey without one. */
    tint?: string;
    ring?: Ring;
    marker?: Marker;
    /** Drawn over whatever hides it, rather than standing on its square: no shadow. */
    ghost?: boolean;
    /**
     * The group the figure — and the item it carries — stands in, for the
     * playback's frame loop to move off its square by setting its `transform`
     * (`usePlaybackFrame`): a bob in its step, a knock from a blow, a lunge. Its
     * shadow, rings and the tap on it stay where they are. Without one, nothing
     * moves it.
     */
    moving?: React.Ref<SVGGElement>;
}

/** A character standing or lying on its square, facing its way, in its owner's colour, over its shadow and rings, with the item it carries. */
function Figure({ artId, view, square, character, facing, pose = 'standing', item, className = '', tint, ring, marker, ghost = false, moving }: FigureProps) {
    const feet = isoCentre(view, square);
    const { x, y } = discCentre(view, square);
    const art = CHARACTER_ART[character][pose];
    const cell = facingCell(facing, view.rotation);
    const box = spriteBox(art.body[cell]);
    const groundRing = (className: string, radius: number) => (
        <ellipse className={className} cx={feet.x} cy={feet.y} rx={ISO_HALF_WIDTH * radius} ry={ISO_HALF_HEIGHT * radius} />
    );
    const body = (
        <>
            <g className={`ag-ra-figure ${className}`} transform={`translate(${feet.x} ${feet.y - ISO_HALF_HEIGHT})`}>
                <use href={`#${spriteId(artId, art.body[cell])}`} {...box} />
                {tint && <use href={`#${spriteId(artId, art.team[cell])}`} {...box} filter={`url(#${tint})`} />}
            </g>
            {item && (
                <SpriteUse className="ag-ra-figure-mark" id={artId} sprite={ITEM_ART[item]} x={x + ITEM_MARK_OFFSET.x} y={y + ITEM_MARK_OFFSET.y} size={ITEM_MARK_SIZE} />
            )}
        </>
    );
    return (
        <>
            {!ghost && <ellipse className="ag-ra-shadow" cx={feet.x} cy={feet.y} rx={ISO_HALF_WIDTH / 2} ry={ISO_HALF_HEIGHT / 2} />}
            {marker && groundRing(`ag-ra-marker ag-ra-marker--${marker}`, MARKER_RADIUS)}
            {ring && groundRing(`ag-ra-ring ag-ra-ring--${ring}`, RING_RADIUS)}
            {/* `spriteBox` places a sprite from its square's back corner, half a diamond above the middle. */}
            {moving ? <g ref={moving}>{body}</g> : body}
            {/* The art is a whole cell, mostly see-through: only the body is tapped, so a tap above a figure reaches the square or the figure behind it. */}
            <circle className="ag-ra-figure-hit" cx={x} cy={y} r={FIGURE_RADIUS} />
        </>
    );
}

/** The top-left corner of the HP bar over the figure standing on the square whose middle is (`x`, `y`). */
const hpBarCorner = (x: number, y: number): Point => ({ x: x - HP_BAR_WIDTH / 2, y: y - HP_BAR_RISE - HP_BAR_HEIGHT });

/**
 * A standing figure's HP bar, over the figure standing on the square whose
 * middle is (`x`, `y`), in its owner's colour, as its figure is. Given what the
 * action being played told of the figure (`told`), the fill's width, and the
 * pale chip of the HP a blow has just taken off past the end of it while it
 * drains away, are set a frame at a time from the playback's clock
 * (`toldAt`) — so they are no props of the rects they draw.
 */
function HpBar({ x, y, fighter, colour, told }: { x: number; y: number; fighter: Fighter; colour: string; told?: Told }) {
    const corner = hpBarCorner(x, y);
    // The fill and the chip each read `toldAt` for themselves: cheap, and it
    // keeps each draw to its own element.
    const fill = usePlaybackRef<SVGRectElement>((rect, ms) => {
        if (!told) return;
        setAttributes(rect, { width: HP_BAR_WIDTH * hpFraction(toldAt(told, fighter, ms).drawn) });
    });
    const chip = usePlaybackRef<SVGRectElement>((rect, ms) => {
        if (!told) return;
        const { drawn, chip: level } = toldAt(told, fighter, ms);
        const width = HP_BAR_WIDTH * hpFraction(drawn);
        const lagging = level === undefined ? 0 : HP_BAR_WIDTH * hpFraction(drawn, drawn.hp - level) - width;
        setAttributes(rect, { x: corner.x + width, width: Math.max(0, lagging) });
    });
    return (
        <>
            <rect className="ag-ra-hp" x={corner.x} y={corner.y} width={HP_BAR_WIDTH} height={HP_BAR_HEIGHT} />
            <rect ref={fill} className="ag-ra-hp-fill" style={{ fill: colour }} x={corner.x} y={corner.y} width={told ? undefined : HP_BAR_WIDTH * hpFraction(fighter)} height={HP_BAR_HEIGHT} />
            {told && <rect ref={chip} className="ag-ra-hp-chip" y={corner.y} height={HP_BAR_HEIGHT} />}
            {/* A dark edge round the whole bar, over what's in it, so it reads on grass, stone or a figure alike. */}
            <rect className="ag-ra-hp-edge" x={corner.x} y={corner.y} width={HP_BAR_WIDTH} height={HP_BAR_HEIGHT} />
        </>
    );
}

/**
 * The `change` an action lined up on a standing figure would make to its HP,
 * laid over the end of its bar — black over what a blow would take off, never
 * past empty, and white beyond it for what a heal would give back, never past
 * full — or nothing for no change. The board draws these over everything, in
 * one flashing group (`ag-ra-pulse--hp`).
 */
function HpChange({ view, fighter, change }: { view: IsoView; fighter: Fighter; change: number }) {
    const { x, y } = isoCentre(view, fighter.square);
    const corner = hpBarCorner(x, y);
    const after = HP_BAR_WIDTH * hpFraction(fighter, -change);
    const now = HP_BAR_WIDTH * hpFraction(fighter);
    if (now === after) return null;
    return (
        <rect
            className={now > after ? 'ag-ra-hp-loss' : 'ag-ra-hp-gain'}
            x={corner.x + Math.min(now, after)} y={corner.y} width={Math.abs(now - after)} height={HP_BAR_HEIGHT}
        />
    );
}

/**
 * A group for a figure to stand in (`Figure`'s `moving`), knocked or lunging
 * by `shoves` (`shoveAt`) a frame at a time as the playback runs: the ref to
 * hand it.
 */
function useShoved(view: IsoView, shoves: readonly Shove[]): React.RefObject<SVGGElement | null> {
    return usePlaybackRef<SVGGElement>((group, ms) => {
        setAttributes(group, { transform: translation(shoveAt(shoves, ms, square => isoCentre(view, square))) });
    });
}

/**
 * Something that comes or goes during the action being played (§26.1), faded a
 * frame at a time on the playback's clock: `frame` says how much of it is there
 * `ms` in — an opacity, or null while it isn't drawn at all — and it is hidden
 * for null or an opacity of nothing, and drawn at that opacity otherwise. By
 * default it goes: a character the action downed, cover it blasted, there as it
 * was until its cue starts, then easing out and gone (`fadeOutAt`). Given
 * `fadeInAt` it comes: a downed character lying where it fell, unseen until its
 * blow lands and then easing in quicker at first, so it and the standing figure
 * it replaces never leave a gap to see through. Set as the `opacity` and
 * `visibility` attributes rather than by keyframes: a keyframed fade here, in
 * the middle of the board's depth order, would have the browser lift it and
 * everything drawn in front of it into layers of their own for as long as the
 * playback lasts — which a phone pays for in flashes and stutter.
 */
function CueFade({ cue, frame = fadeOutAt, className, children }: { cue: Timed; frame?: (cue: Timed, ms: number) => number | null; className?: string; children: React.ReactNode }) {
    const group = usePlaybackRef<SVGGElement>((element, ms) => {
        const opacity = frame(cue, ms);
        const shown = opacity !== null && opacity > 0;
        setAttributes(element, { visibility: shown ? null : 'hidden', opacity: shown && opacity < 1 ? opacity : null });
    });
    return <g ref={group} className={className}>{children}</g>;
}

/**
 * A character the action being played downed, standing as it was until the
 * blow lands and then fading (§26.1), over its fallen figure: so a shot has
 * something to hit. Knocked by the blow that downs it, as it would be standing.
 * Drawn without its marks, and not to be tapped.
 */
function Falling({ artId, view, cue, shoves, facing, tintFor, colourFor }: { artId: string; view: IsoView; cue: FallCue; shoves: readonly Shove[]; facing: Facing; tintFor: TintFor; colourFor: (owner: string) => string }) {
    const { fighter } = cue;
    const { x, y } = isoCentre(view, fighter.square);
    const moving = useShoved(view, shoves);
    return (
        <CueFade cue={cue} className="ag-ra-falling">
            <Figure artId={artId} view={view} square={fighter.square} character={fighter.character} facing={facing} tint={tintFor(fighter.owner)} moving={moving} ghost />
            <HpBar x={x} y={y} fighter={fighter} colour={colourFor(fighter.owner)} />
        </CueFade>
    );
}

/** Where a walker is `ms` in, and the square of its path it is nearest (`walkerAt`): one reading of it a frame, shared by every slot of its path (`onePerFrame`). */
type Walker = (ms: number) => ReturnType<typeof walkerAt>;

/** `read`, remembering its last answer: asked again for the same time, it gives that back rather than working it out again. */
function onePerFrame<T>(read: (ms: number) => T): (ms: number) => T {
    let at = Number.NaN;
    let last: T;
    return ms => {
        if (ms !== at) {
            last = read(ms);
            at = ms;
        }
        return last;
    };
}

/**
 * A character walking the path the action being played told (§26.1), in the
 * depth slot of the square it is nearest (`WalkerSlot`, one for each square of
 * the path, `walkerAt`'s `at`): its figure, over its shadow and with its HP
 * bar, slid along the leg it is on a frame at a time — turned to face each
 * step, rising and falling with the ground, bobbing a little in each step and
 * hopping a change of height, the figure alone, so its bar and shadow stay
 * steady. Only the slot it is nearest draws it, so it is hidden by exactly what
 * stands in front of that square — a tower it has gone behind, not the front of
 * its whole path — and gone once its last walk is over, which is when its
 * resting figure (`Arriving`) appears where the path ends. Drawn without its
 * marks, and not to be tapped.
 *
 * A slot draws the walker itself while it is the current one, and nothing
 * otherwise, rather than the walker moving between slots by `createPortal`:
 * which slot is current is a value that changes once a half-leg
 * (`usePlaybackValue`), so only the two slots it passes between render, and no
 * ref is read to find where to draw.
 */
function WalkerSlot({ artId, view, field, fighter, walker, slot, tintFor, colourFor }: { artId: string; view: IsoView; field: Battlefield; fighter: Fighter; walker: Walker; slot: number; tintFor: TintFor; colourFor: (owner: string) => string }) {
    const leg = usePlaybackValue(ms => {
        const now = walker(ms);
        return now && now.at === slot ? `${now.from}>${now.to}` : null;
    });
    if (leg === null) return null;
    const [from, to] = leg.split('>').map(Number);
    return <WalkingFigure artId={artId} view={view} field={field} fighter={fighter} walker={walker} from={from} to={to} tintFor={tintFor} colourFor={colourFor} />;
}

/** A walker on one leg, from `from` to `to`: slid and lifted a frame at a time (`WalkerSlot`). */
function WalkingFigure({ artId, view, field, fighter, walker, from, to, tintFor, colourFor }: { artId: string; view: IsoView; field: Battlefield; fighter: Fighter; walker: Walker; from: Square; to: Square; tintFor: TintFor; colourFor: (owner: string) => string }) {
    const feet = isoCentre(view, from);
    // Drawn from wherever the walker is each frame, not from the leg this was
    // rendered for: the render that turns it to its next leg lands a frame or
    // two after it gets there, and a walker held at the corner till then — the
    // camera following it on — would jerk back and catch up at every one.
    const slide = usePlaybackRef<SVGGElement>((group, ms) => {
        const now = walker(ms);
        if (!now) return;
        const at = legPoint(view, now);
        setAttributes(group, { transform: translation({ x: at.x - feet.x, y: at.y - feet.y }) });
    });
    const lift = usePlaybackRef<SVGGElement>((group, ms) => {
        const now = walker(ms);
        if (now) setAttributes(group, { transform: translation({ x: 0, y: walkLift(now, square => view.heights[square]) }) });
    });
    return (
        <g ref={slide} className="ag-ra-walker">
            <Figure artId={artId} view={view} square={from} character={fighter.character} facing={facingTowards(field, from, to)} item={fighter.item} tint={tintFor(fighter.owner)} moving={lift} />
            <HpBar x={feet.x} y={feet.y} fighter={fighter} colour={colourFor(fighter.owner)} />
        </g>
    );
}

/** What waits out a walk, hidden until `at` ms into the playback: a walker's resting figure, standing where its path ends. It shows with one render when the time comes, not by keyframes. */
function Arriving({ at, children }: { at: number; children: React.ReactNode }) {
    const arrived = usePlaybackValue(ms => ms >= at);
    return <g visibility={arrived ? undefined : 'hidden'}>{children}</g>;
}

/** A puff of a smoke pot's cloud over a square, its foot on the square's top. */
function SmokePuff({ artId, view, square }: { artId: string; view: IsoView; square: Square }) {
    const { x, y } = isoCentre(view, square);
    return <SpriteUse className="ag-ra-smoke-puff" id={artId} sprite={SMOKE_ART} x={x} y={y + ISO_HALF_HEIGHT - SMOKE_SIZE / 2} size={SMOKE_SIZE} />;
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

/** The outline of a shield, standing on its point at the origin. `left` is just its left half. */
function shieldPath(left = false): string {
    const half = SHIELD_WIDTH / 2, shoulder = -SHIELD_HEIGHT * 0.45, belly = -SHIELD_HEIGHT * 0.12;
    return left
        ? `M0 ${-SHIELD_HEIGHT}H${-half}V${shoulder}Q${-half} ${belly} 0 0Z`
        : `M${-half} ${-SHIELD_HEIGHT}H${half}V${shoulder}Q${half} ${belly} 0 0Q${-half} ${belly} ${-half} ${shoulder}Z`;
}

/**
 * The cover a square gives whoever stands on it, XCOM style: a full shield on
 * each side that gives full cover, a half-filled one on each that gives half,
 * and nothing on an open side. Each stands on the middle of its side's edge
 * at the square's height, and `isoPoint` turns that edge to wherever the view
 * has it, so the shields keep to the same sides of the ground at every turn.
 */
function CoverShields({ view, field, square }: { view: IsoView; field: Battlefield; square: Square }) {
    const sides = coverBySide(field, square);
    const col = square % view.width + 0.5, row = Math.floor(square / view.width) + 0.5;
    return (
        <g className="ag-ra-cover">
            {(Object.keys(SIDE_STEPS) as Side[]).map(side => {
                const cover = sides[side];
                if (cover === 'none') return null;
                const { x, y } = isoPoint(view, col + SIDE_STEPS[side].col / 2, row + SIDE_STEPS[side].row / 2, view.heights[square]);
                return (
                    <g key={side} transform={`translate(${x} ${y})`}>
                        <path className="ag-ra-cover-shield" d={shieldPath()} />
                        <path className="ag-ra-cover-fill" d={shieldPath(cover === 'half')} />
                    </g>
                );
            })}
        </g>
    );
}

/** Runs of the flat squares that share a key: everything raised is drawn square by square instead, in depth order. */
function flatRuns<K>(view: IsoView, keyOf: (square: Square) => K | undefined) {
    return isoRuns(view, square => view.heights[square] === 0 ? keyOf(square) : undefined);
}

/** A square's art, where it stands: its terrain, and the square's back corner on its ground. */
interface SquareArt {
    square: Square;
    letter: TerrainLetter;
    corner: Point;
}

/** A raised square, as the board lays it out once a battlefield. */
interface RaisedBlock extends SquareArt {
    depth: number;
    /** Its top, at its full height: what it's shaded on. */
    top: string;
    /** The ground it stands on, where a map raises that off the slab: drawn as a block of its own under the art. */
    plinth: IsoBlock | null;
}

/** `view` with each square at the ground its terrain stands on in `field`: where a raised square's plinth is drawn from. */
function plinthsOf(view: IsoView, field: Battlefield): IsoView {
    return { ...view, heights: field.tiles.map(tile => tile.elevation - tile.terrain.height) };
}

/** A raised square of `field`, as `view` draws it at `field`'s heights. */
function raisedBlock(view: IsoView, plinths: IsoView, field: Battlefield, square: Square): RaisedBlock {
    const base = plinths.heights[square];
    return {
        square,
        depth: isoDepth(view, square),
        letter: terrainLetter(field, square),
        top: isoBlock(view, square).top,
        corner: isoCorner(view, square, base),
        plinth: base > 0 ? isoBlock(plinths, square) : null,
    };
}

/** A raised square: the ground under it, the art standing on that, and whatever its top is shaded with. */
function RaisedSquare({ id, block, shades }: { id: string; block: RaisedBlock; shades: readonly Shade[] }) {
    const { plinth } = block;
    return (
        <g className="ag-ra-block">
            {plinth && (
                <g className="ag-ra-ground--open">
                    {plinth.left.map((slice, index) => <polygon key={`l${index}`} className="ag-ra-side ag-ra-side--left" points={slice} />)}
                    {plinth.right.map((slice, index) => <polygon key={`r${index}`} className="ag-ra-side ag-ra-side--right" points={slice} />)}
                    <polygon className="ag-ra-top" points={plinth.top} />
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
    /** The board's id, which its art is defined under. */
    artId: string;
    view: IsoView;
    fighter: Fighter;
    ring: Ring | undefined;
    selected: boolean;
    /** It's its owner's turn in battle, so it shows the AP it has left. */
    acting: boolean;
    /** Its owner's colour, which its HP bar is drawn in. */
    colour: string;
    facingFor: FacingFor;
    tintFor: TintFor;
    nameFor: (userId: string) => string;
    onSelect: (fighterId: number) => void;
    /**
     * The fighter its HP bar, effect marks, watch ring and item are drawn from,
     * where that isn't how it stands now: an action being played hasn't told
     * the blow that changed them yet (`ToldFighterNode`). Where it is and what
     * it's called stay `fighter`'s.
     */
    drawn?: Fighter;
    /** What the action tells of it, where its HP bar is drawn a frame at a time from that rather than from `drawn` (`HpBar`). */
    told?: Told;
    /** The group its figure is knocked or lunging in (`Figure`'s `moving`): its bar and marks stay put. */
    moving?: React.Ref<SVGGElement>;
}

/** A character on the battlefield, standing or fallen: its figure, HP bar, watch and effects and AP, and the tap that selects it. */
function FighterNode({ artId, view, fighter, ring, selected, acting, colour, facingFor, tintFor, nameFor, onSelect, drawn = fighter, told, moving }: FighterNodeProps) {
    const { x, y } = discCentre(view, fighter.square);
    const feet = isoCentre(view, fighter.square);
    const character = CHARACTERS[fighter.character];
    const standing = isStanding(fighter);
    const watching = standing && drawn.banked > 0;
    return (
        <ClickableMapNode
            x={x} y={y} radius={FIGURE_RADIUS}
            isValid
            isSelected={selected}
            showRing={false}
            onClick={() => onSelect(fighter.id)}
            title={[`${character.name} · ${nameFor(fighter.owner)}`, `${fighter.hp}/${maxHpOf(fighter)} HP`, ...fighterStatus(fighter)].join(' · ')}
        >
            <Figure
                ring={ring}
                marker={watching ? 'watch' : undefined}
                view={view}
                square={fighter.square}
                character={fighter.character}
                facing={facingFor(fighter)}
                pose={standing ? 'standing' : 'fallen'}
                artId={artId}
                item={standing ? drawn.item : null}
                className={standing ? '' : 'ag-ra-figure--down'}
                tint={tintFor(fighter.owner)}
                moving={moving}
            />
            {standing && <HpBar x={feet.x} y={feet.y} fighter={drawn} colour={colour} told={told} />}
            <RealmArenaEffectMarks id={artId} effects={standing ? effectsOn(drawn) : []} watching={watching} x={x - EFFECT_MARK_OFFSET} y={y} size={EFFECT_MARK_SIZE} step={EFFECT_MARK_STEP} />
            {standing && acting && <ApPips x={x + AP_PIP_OFFSET} y={y} fighter={fighter} />}
        </ClickableMapNode>
    );
}

/**
 * A resting character an action being played changes the bar, marks or item of
 * (`toldOf`): its marks and item are as the action found them until the cue
 * that changed them lands, which takes one render when it does
 * (`usePlaybackValue`); its HP bar's fill and chip are drawn a frame at a time
 * from the playback's clock (`HpBar`'s `told`), and its figure is knocked by
 * the blows it takes and lunges as it strikes (`useShoved`).
 */
function ToldFighterNode({ told, ...props }: FighterNodeProps & { told: Told }) {
    const marked = usePlaybackValue(ms => ms >= told.marksAt);
    const moving = useShoved(props.view, told.shoves);
    const { fighter } = props;
    const { effects, banked, item } = told.before;
    return <FighterNode {...props} drawn={marked ? fighter : { ...fighter, effects, banked, item }} told={told} moving={moving} />;
}

/**
 * The shake of the battlefield (§26.1) as a fireball or a thunder flask
 * lands, drawn a frame at a time on the playback's clock: it moves both groups
 * it is given — the board's contents and the overlay's, so the flights and the
 * text shake with the ground — by the shake's offset, and puts them back when
 * it is over or unmounted. It draws nothing itself, and is keyed by its
 * playback.
 */
function ShakeClock({ cues, board, fx }: { cues: readonly BattleCue[]; board: React.RefObject<SVGGElement | null>; fx: React.RefObject<SVGGElement | null> }) {
    usePlaybackFrame(ms => {
        const transform = translation(shakeAt(cues, ms));
        if (board.current) setAttributes(board.current, { transform });
        if (fx.current) setAttributes(fx.current, { transform });
    });
    useLayoutEffect(() => {
        const groups = [board.current, fx.current];
        return () => groups.forEach(group => group?.removeAttribute('transform'));
    }, [board, fx]);
    return null;
}

/**
 * The camera of a walk too long to frame (`follow.track`): keeps the walker in
 * the middle of the frame as it goes, on the playback's own clock, from where
 * the view framed the walk's start to where it ends. It moves the view by
 * `BoardZoom`'s `useBoardCentre`, which gives way the moment the player grabs
 * the board, so a player who pans or pinches stops it, and lets go of the
 * view once the walk is over. It draws nothing, and is keyed by its playback.
 */
function WalkCamera({ view, walks }: { view: IsoView; walks: readonly WalkCue[] }) {
    const centre = useBoardCentre();
    const end = endOf(walks);
    // Let go once the walk is over, so the board is scrolled where the walk left it —
    // and on going away, should a new playback or a hold come first, while the board stays.
    usePlaybackFrame(ms => centre?.(ms < end ? walkCameraAt(walks, view, ms) : null));
    useEffect(() => () => centre?.(null), [centre]);
    return null;
}

/** The viewer's own turn of the battlefield (`IsoRotation`), as this browser remembers it, and the way to turn it: every way of drawing the board shares it. */
export function useBoardRotation(viewerId: string): [IsoRotation, (rotation: IsoRotation) => void] {
    const [stored, store] = useStoredValue(`realmarena-board-rotation-${viewerId}`);
    const rotation = stored === '1' || stored === '2' || stored === '3' ? Number(stored) as IsoRotation : 0;
    return [rotation, next => store(String(next))];
}

/** The buttons that turn the battlefield's view a quarter either way, in the frame's top corner: every way of drawing the board wears them. */
export function TurnButtons({ onTurn }: { onTurn: (by: 1 | 3) => void }) {
    return (
        <div className="ag-board-tag ag-ra-turn" role="group" aria-label="Turn the view">
            <button type="button" onClick={() => onTurn(3)} aria-label="Turn the view anticlockwise" title="Turn anticlockwise">↺</button>
            <button type="button" onClick={() => onTurn(1)} aria-label="Turn the view clockwise" title="Turn clockwise">↻</button>
        </div>
    );
}

/** The view turned a quarter at a time, and how it got there: what the board keeps its place across. */
interface Turned {
    from: IsoRotation;
    /** How many times it's been turned, so each turn is its own pivot. */
    turns: number;
}

/**
 * Where the thing under a point of the board as it was drawn is drawn now:
 * the square under it, if any, at the point's same offset from its middle —
 * so a tower top stays in view as the tower comes round — or else the ground.
 */
function turnedPoint(from: IsoView, to: IsoView, { x, y }: Point): Point {
    const square = isoSquareAt(from, x, y);
    if (square !== undefined) {
        const was = isoCentre(from, square), now = isoCentre(to, square);
        return { x: now.x + x - was.x, y: now.y + y - was.y };
    }
    const { col, row } = isoGroundAt(from, x, y);
    return isoPoint(to, col, row, 0);
}

/** One thing the board draws in depth order, back to front: a raised square, or a figure standing on one. */
interface DepthItem {
    depth: number;
    node: React.ReactNode;
}

/** How much of the foot of the frame a playback's caption takes, with its gap from the edge, in pixels: kept clear by the view framing the action (`BoardZoomFocus.inset`). */
const CAPTION_INSET = 44;

/**
 * What the playback is doing, in a sentence, as each event lands: the pill at
 * the foot of the frame (`.ag-ra-caption`), which is outside the zoom so it
 * stays put as the board pans. An event the action's lines pass over (a move
 * broken by an overwatch shot is told once) says nothing of its own, so the
 * last sentence stays up until one that does. It keeps the final one when the
 * clock has run out — a review step rests showing what happened — and renders
 * only when the sentence changes (`usePlaybackValue`). Keyed by the playback
 * where it is mounted, so a new one starts from nothing rather than from the
 * last one's closing line. `fighters` is the board after the action, which is
 * what `eventLines` names everyone from.
 */
function PlaybackCaption({ playback, fighters, viewerId, nameFor }: { playback: Playback; fighters: readonly Fighter[]; viewerId: string; nameFor: (userId: string) => string }) {
    const { cues, sentences } = useMemo(() => {
        const sentences = new Map(eventLines(playback.events, fighters, viewerId, nameFor).map(line => [line.event, line.sentence]));
        return { cues: playback.cues.filter((cue): cue is CaptionCue => cue.kind === 'caption' && sentences.has(cue.event)), sentences };
    }, [playback.events, playback.cues, fighters, viewerId, nameFor]);
    const sentence = usePlaybackValue(ms => {
        const cue = captionAt(cues, ms);
        return cue ? sentences.get(cue.event) ?? null : null;
    });
    return (
        <div className="ag-ra-caption" role="status" aria-live="polite">
            {sentence && <span key={sentence}>{sentence}</span>}
        </div>
    );
}

/**
 * The cover the action being played blasted away (§26.1), standing on each
 * square as it did — drawn from the battlefield as the action found it — until
 * the burst fades, then fading off the scorched ground under it.
 */
function blasting(artId: string, view: IsoView, playback: Playback, cue: ScorchCue): DepthItem[] {
    const before = playback.field;
    const was: IsoView = { ...view, heights: before.tiles.map(tile => tile.elevation) };
    const plinths = plinthsOf(view, before);
    return cue.squares.map(square => {
        const block = raisedBlock(was, plinths, before, square);
        return {
            depth: block.depth,
            node: (
                <CueFade key={`blast-${playback.key}-${square}`} cue={cue} className="ag-ra-blasting">
                    <RaisedSquare id={artId} block={block} shades={[]} />
                </CueFade>
            ),
        };
    });
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
 * the heights the rules play. Low cover blasted away (§22) arrives as
 * scorched ground in `field` itself, flat, and is drawn over the grass, a
 * square at a time.
 *
 * In fog of war (§27) `fighters` is only who the viewer can see, and every
 * square their squad can't see is dimmed (`unseen`), raised or flat, under
 * anything else shaded there.
 *
 * Every standing figure wears its status effects (§20) as a column of marks
 * down its left, drawn from their own sheet (`EFFECT_ART`), whoever's
 * turn it is: effects are public (§20.2). Its AP pips, on its owner's turn,
 * run down its right.
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
 * view to the near half of where it could move — as deep as that still fits
 * (`reachFocus`) — and a target picked from the list brings it in close on the
 * caster and the target (`aimFocus`).
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
 * Stepping through a review (`follow`), the view goes to each step: for a
 * move, just fit round the whole path seen (`follow.exact`) — or, for a walk
 * too long to frame, round where it starts, the camera then following the
 * walker (`follow.track`, `WalkCamera`); for anything else, just fit and close
 * round whoever acted and whoever it reached (`follow.close`), as a target
 * picked to aim at is.
 * With nothing selected, picked up or followed, it rests on `home`: just fit
 * round the viewer's own side, which is also how the board opens.
 *
 * What an action did plays over the figures (`playback`, §26) on one clock
 * (`PlaybackProvider`, docs/isometric-animations.md §4): the viewer's own as
 * it comes back, and each step of a review. Everything that moves reads that
 * clock a frame at a time and writes its own SVG attributes, with no render a
 * frame (`usePlaybackFrame`), and what changes now and then renders once when
 * it does (`usePlaybackValue`). It stands still while the view glides to the
 * action (`held`), and tells the page once it has played to its end
 * (`onPlayed`). What flies and bursts over the figures — the shots and the
 * throws, their bursts, the slashes and the hit text — is `RealmArenaFx`, in a
 * second SVG stacked over the board's (`.ag-ra-fx-layer`), where nothing can be
 * tapped. What is hidden by walls stays in the board, in its depth order: anyone
 * the action downed stands where it fell until the blow lands, then fades
 * (`Falling`); cover it blasted away fades (`CueFade`). A move walks: the
 * character is drawn along the path it was told, turned to face each step, in
 * the depth slot of the square it is nearest (`WalkerSlot`), while its resting
 * figure waits out the walk (`Arriving`) — and, with reduced motion, is simply
 * where it ended up. Everyone else keeps their HP bar, marks and item as the
 * action found them until the cue that changed them lands (`ToldFighterNode`),
 * and anyone downed lies unseen until its blow. A fireball or a thunder flask
 * shakes the board and the effects over it together (`ShakeClock`). Outside
 * the zoom, so it stays put as the board pans, a pill at the foot of the frame
 * says what is happening as each event lands (`PlaybackCaption`), and rests on
 * the last once it is over; it gives way to the targets overlay when that shows.
 *
 * The view turns a quarter either way from the buttons in the frame's corner,
 * so a player can see round the far side of a tower or a wall: the same
 * isometric board, the grid turned before it's drawn (`IsoRotation`), so
 * nothing outside the drawing knows. The turn is the viewer's own — it lives
 * here and nowhere else — and whatever was in the middle of the frame is still
 * there after it (`BoardZoom`'s `pivot`).
 */
export default function RealmArenaBoard({ field, fighters, fogGhosts = [], unseen, clouds, sides, sealed, owners, waveDue = false, showCentre = true, viewerId, colourFor, nameFor, selected, onSelect, placing, aiming, acting, refocus = 0, follow, home, odds, coverAt, overlay, playback, onPlayed, unplaced }: RealmArenaBoardProps) {
    const [rotation, storeRotation] = useBoardRotation(viewerId);
    const [turned, setTurned] = useState<Turned>({ from: rotation, turns: 0 });
    const turn = (by: 1 | 3) => {
        setTurned(({ turns }) => ({ from: rotation, turns: turns + 1 }));
        storeRotation(((rotation + by) % 4) as IsoRotation);
    };

    // The ground changes only when cover is blasted away, so it's laid out once a battlefield, and again each turn of the view.
    const ground = useMemo(() => {
        const view = isoView(
            { width: field.width, height: field.height, heights: field.tiles.map(tile => tile.elevation) },
            { ...VIEW, rotation },
        );
        // The ground each square's terrain stands on, laid out on the same
        // board: where it's raised, it's a block of its own under the art.
        const plinths = plinthsOf(view, field);
        return {
            view,
            slab: isoSlab(view),
            lines: isoGridLines(view),
            // Flat squares with art of their own — scorched ground — lying on the grass.
            flat: view.heights.flatMap((height, square): SquareArt[] => {
                const letter = terrainLetter(field, square);
                return height === 0 && TERRAIN_ART[letter].length > 0 ? [{ square, letter, corner: isoCorner(view, square, 0) }] : [];
            }),
            blocks: view.heights.flatMap((height, square) => height === 0 ? [] : [raisedBlock(view, plinths, field, square)]),
        };
    }, [field, rotation]);
    const { view } = ground;
    // Nothing walks or flies with reduced motion: a character is simply where it ended up.
    const still = usePrefersReducedMotion();
    // Only the turn's own pivot needs the view it turned from, and only once.
    const pivot: BoardZoomPivot | null = turned.turns === 0 ? null : {
        key: String(turned.turns),
        at: point => turnedPoint(isoView(view, { ...VIEW, rotation: turned.from }), view, point),
    };
    const { width, height } = view.size;
    const artId = useSvgId('ra');
    // The two groups a shake moves (`ShakeClock`): the board's contents, and the effects over them.
    const shakeBoard = useRef<SVGGElement>(null);
    const shakeFx = useRef<SVGGElement>(null);
    const facingFor: FacingFor = figure => facingOf(field, figure);
    // Each squad's characters wear its owner's colour; anyone else keeps the art's grey.
    const tintFor: TintFor = userId => {
        const seat = owners.indexOf(userId);
        return seat < 0 ? undefined : tintId(artId, seat);
    };

    // A character selected in battle brings the near half of where it could move into
    // view, rather than just the squares round it — zoomed exactly to that,
    // since a full turn's reach is too wide for any step but the fit. A search
    // over the whole map, so only redone when the selection or the board moves.
    const reachRect = useMemo(
        () => selected && isStanding(selected) ? reachFocus({ field, fighters, sides }, selected, acting === selected.owner ? selected.ap : ACTION_POINTS) : null,
        [field, fighters, sides, selected, acting],
    );

    // A character picked up to place is brought close enough to tap a square beside it.
    const pickedUp = placing?.selected != null ? sealed?.[placing.selected] : undefined;
    // A review follows its steps, as Race Cars follows a roll, ahead of anything selected.
    const area = boardFocus(field, { follow, pickedUp, selected, reach: reachRect, home, refocus });
    let focus: BoardZoomFocus | null = area && { rect: isoBounds(view, area.area), key: area.key, exact: area.exact };

    // While an action plays, its caption floats over the foot of the frame
    // (`PlaybackCaption`), so the view frames it clear of that strip.
    if (focus && playback) focus = { ...focus, inset: CAPTION_INSET };

    // What the board plays waits for the view to get there: an action plays
    // only once the glide to it has landed, so nothing happens while the
    // board is still moving (`held`, which stands the playback's clock still).
    const [landed, setLanded] = useState<string | null>(null);
    const held = !!playback && !!focus && landed !== focus.key;

    const centreSquares = showCentre ? field.objectives[CENTRE] ?? [] : [];
    const centre = centreSquares.length > 0 ? areaRect(field, centreSquares) : null;

    // Everything shaded square by square, in the order it's painted: the fog
    // over what the viewer can't see (§27), then the smoke a smoke pot left,
    // under whatever is being aimed (§21.2).
    const smoke = smokeSquares({ field, fighters, clouds });
    const shades: Shade[] = [];
    if (unseen && unseen.size > 0) shades.push(square => unseen.has(square) ? 'ag-ra-fog' : undefined);
    if (smoke.size > 0) shades.push(square => smoke.has(square) ? 'ag-ra-smoke' : undefined);
    const reach = aiming?.reach;
    if (reach) shades.push(square => reach.has(square) ? `ag-ra-reach ag-ra-reach--${reach.get(square)}` : undefined);
    const range = aiming?.range;
    if (range) shades.push(square => range.has(square) ? 'ag-ra-range' : undefined);
    const blast = new Set([...aiming?.area ?? [], ...aiming?.blasts ?? []]);
    if (blast.size > 0) shades.push(square => blast.has(square) ? 'ag-ra-blast' : undefined);
    if (placing && placing.selected !== null) {
        // Somewhere to put the character picked up: anywhere in the zone nobody stands.
        const free = new Set(placing.zone);
        sealed?.forEach(pick => free.delete(pick.square));
        shades.push(square => free.has(square) ? 'ag-ra-place' : undefined);
    }
    const flatShades = shades.flatMap(shade => flatRuns(view, shade));

    const zones = field.deploymentAreas.flatMap((areas, seat) => {
        const owner = owners[seat];
        const wave = waveDue && owner !== undefined && isWarband(owner);
        const style = { '--ra-seat': owner ? colourFor(owner) : 'var(--ag-ink-softer)' } as React.CSSProperties;
        return areas.map(({ col, row, width, height }, part) => ({ key: `${seat}-${part}`, points: isoArea(view, { x: col, y: row, width, height }), wave, style }));
    });
    const waves = zones.filter(zone => zone.wave);
    const hpChanges = aiming ? fighters.flatMap(fighter => {
        const change = aiming.hpChange.get(fighter.id);
        return change && isStanding(fighter) ? [{ fighter, change }] : [];
    }) : [];

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

    fogGhosts.forEach(ghost => items.push({
        depth: isoDepth(view, ghost.square) + 0.45,
        node: (
            <g key={`fog-ghost-${ghost.id}`} className="ag-ra-fog-ghost">
                <title>{`${CHARACTERS[ghost.character].name} · ${nameFor(ghost.owner)} · last seen here`}</title>
                <Figure artId={artId} view={view} square={ghost.square} character={ghost.character} facing={facingFor(ghost)} tint={tintFor(ghost.owner)} ghost />
            </g>
        ),
    }));

    // The cloud stands over the ground and anything on it, under the figure on the square.
    smoke.forEach(square => items.push({
        depth: isoDepth(view, square) + 0.4,
        node: <SmokePuff key={`smoke-${square}`} artId={artId} view={view} square={square} />,
    }));

    sealed?.forEach((pick, index) => items.push({
        depth: isoDepth(view, pick.square) + 0.5,
        node: (
            <g
                key={`sealed-${index}`}
                className={`ag-ra-sealed${placing ? ' ag-ra-sealed--placing' : ''}`}
                onClick={placing ? () => placing.onTap(pick.square) : undefined}
            >
                <title>{`${CHARACTERS[pick.character].name}${pick.item ? ` with a ${ITEMS[pick.item].name.toLowerCase()}` : ''} · your squad, sealed until every player has mustered`}</title>
                <Figure
                    artId={artId} view={view} square={pick.square} character={pick.character} facing={facingFor(pick)} item={pick.item}
                    marker="sealed" ring={placing?.selected === index ? 'selected' : undefined}
                />
            </g>
        ),
    }));

    // Whoever the action being played walks is drawn walking (`WalkerSlot`), and
    // its resting figure — the whole of it, marks and all — stays hidden until
    // its last walk is over (`Arriving`).
    const walking = new Map<number, WalkCue[]>();
    if (playback && !still) for (const cue of playback.cues) {
        if (cue.kind === 'walk') walking.set(cue.fighter.id, [...walking.get(cue.fighter.id) ?? [], cue]);
    }
    // A walk too long to frame is followed (`WalkCamera`): the first walker the
    // action walks, once the view has landed where it starts and the clock runs.
    const tracked = follow && !('aim' in follow) && follow.track && playback && !held ? walking.values().next().value : undefined;
    const arrival = (fighterId: number): number | undefined => {
        const walks = walking.get(fighterId);
        return walks && endOf(walks);
    };
    // A walker has a depth slot for every square of its path, at that square's
    // depth, and draws in the one it is nearest (`WalkerSlot`), so it is hidden
    // by exactly what stands in front of the square it is crossing.
    const legLength = legLengthOn(view);
    // Every slot of a walker asks where it is each frame, so it is worked out once a frame, not once a slot.
    walking.forEach((walks, id) => {
        const walker = onePerFrame(ms => walkerAt(walks, ms, legLength));
        walkSquares(walks).forEach((square, slot) => items.push({
            depth: isoDepth(view, square) + 0.6,
            node: <WalkerSlot key={`walk-${playback?.key}-${id}-${slot}`} artId={artId} view={view} field={field} fighter={walks[0].fighter} walker={walker} slot={slot} tintFor={tintFor} colourFor={colourFor} />,
        }));
    });
    // Anyone the action downs lies unseen until its blow lands, so its fallen
    // figure never shows round the standing one (`Falling`) before the shot flies.
    const falls = new Map<number, FallCue>();
    const found = new Map<number, Fighter>();
    if (playback) {
        for (const cue of playback.cues) if (cue.kind === 'fall') falls.set(cue.fighter.id, cue);
        for (const fighter of playback.before) found.set(fighter.id, fighter);
    }
    for (const fighter of fighters) {
        const arrives = arrival(fighter.id);
        const props: FighterNodeProps = {
            artId, view, fighter,
            ring: ringOf(fighter),
            selected: fighter.id === selected?.id,
            acting: fighter.owner === acting,
            colour: colourFor(fighter.owner),
            facingFor, tintFor, nameFor, onSelect,
        };
        // Its bar, marks and item are as the action found them until the cue that changed them lands.
        const told = playback ? toldOf(playback.cues, found.get(fighter.id), fighter, still) : null;
        const node = told
            ? <ToldFighterNode key={`${fighter.id}-${playback?.key}`} {...props} told={told} />
            : <FighterNode key={fighter.id} {...props} />;
        // Hidden until its walk is over, and for one downed, its blow lands: the later of the two.
        const fall = falls.get(fighter.id);
        const appears = Math.max(arrives ?? 0, fall?.start ?? 0);
        let shown = node;
        if (fall && !still) shown = <CueFade key={`rise-${fighter.id}-${playback?.key}`} cue={{ start: appears, length: fall.length }} frame={fadeInAt}>{node}</CueFade>;
        else if (fall || arrives !== undefined) shown = <Arriving key={`${fighter.id}-${playback?.key}`} at={appears}>{node}</Arriving>;
        items.push({
            // Anyone standing over a body is drawn on top of it.
            depth: isoDepth(view, fighter.square) + (isStanding(fighter) ? 0.6 : 0.5),
            node: shown,
        });
    }
    // Anyone the action being played downed stands over its fallen figure
    // until the blow lands, and the cover it blasted stands over its
    // scorched ground until the burst fades: both as the action found them.
    if (playback) for (const cue of playback.cues) {
        // A fighter downed partway through a move falls facing the way it had stepped, as it lies now.
        // One downed partway through a move stands on its square only once it has walked there.
        if (cue.kind === 'fall') {
            const falling = <Falling key={`fall-${playback.key}-${cue.fighter.id}`} artId={artId} view={view} cue={cue} shoves={shovesOf(playback.cues, cue.fighter.id, still)} facing={facingFor(fighters.find(one => one.id === cue.fighter.id) ?? cue.fighter)} tintFor={tintFor} colourFor={colourFor} />;
            items.push({
                depth: isoDepth(view, cue.fighter.square) + 0.6,
                node: cue.arrives === undefined || still ? falling : <Arriving key={`fall-${playback.key}-${cue.fighter.id}`} at={cue.arrives}>{falling}</Arriving>,
            });
        }
        if (cue.kind === 'scorch') items.push(...blasting(artId, view, playback, cue));
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
            <PlaybackProvider playKey={playback?.key ?? null} end={playback ? endOf(playback.cues) : 0} held={held} onEnd={onPlayed}>
                {/* 84 squares corner to corner fitted to a phone is under ten
                    pixels a square, so the deep step is what makes one
                    tappable: about seven squares across (§13.1). */}
                <BoardZoom zoomWidth={250} maxWidth={600} viewBox={view.size} focus={focus} onFocused={setLanded} pivot={pivot}>
                    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The ${field.name}`}>
                        <g ref={shakeBoard}>
                            <g className="ag-ra-ground--earth">
                                <polygon className="ag-ra-side ag-ra-side--left" points={ground.slab.left} />
                                <polygon className="ag-ra-side ag-ra-side--right" points={ground.slab.right} />
                            </g>
                            <RealmArenaTerrainDefs id={artId} origin={isoPoint(view, 0, 0, 0)} />
                            <TintDefs artId={artId} colours={owners.map(colourFor)} />
                            <polygon className="ag-ra-top ag-ra-ground--open" points={ground.slab.top} />
                            <polygon points={ground.slab.top} fill={`url(#${artId}-grass)`} />
                            {ground.flat.map(art => <RealmArenaTerrainArt key={`flat-${art.square}`} id={artId} {...art} />)}
                            <path className="ag-ra-grid" d={ground.lines} />

                            {/* A zone drawn in parts — a warband on more than one edge (§30.9) — is outlined part by part. */}
                            {zones.map(zone => (
                                <polygon
                                    key={zone.key}
                                    className={`ag-ra-deployment${zone.wave ? ' ag-ra-deployment--wave' : ''}`}
                                    points={zone.points}
                                    style={zone.style}
                                />
                            ))}
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
                                            <Figure artId={artId} view={view} square={fighter.square} character={fighter.character} facing={facingFor(fighter)} tint={tintFor(fighter.owner)} ghost />
                                        </g>
                                    </ClickableMapNode>
                                );
                            })}

                            {/* Over every figure, so a neighbour never hides one. */}
                            {coverAt != null && <CoverShields view={view} field={field} square={coverAt} />}
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

                            {/* The pulses — the wave's zones breathing over their lit
                                ground, and the HP a lined-up action would change — one
                                group of each, after everything else, so the layer the
                                browser makes of a pulse lifts nothing else with it
                                (`.ag-ra-pulse`). */}
                            {waves.length > 0 && (
                                <g className="ag-ra-pulse ag-ra-pulse--wave">
                                    {waves.map(zone => <polygon key={zone.key} className="ag-ra-wave" points={zone.points} style={zone.style} />)}
                                </g>
                            )}
                            {hpChanges.length > 0 && (
                                <g className="ag-ra-pulse ag-ra-pulse--hp">
                                    {hpChanges.map(({ fighter, change }) => <HpChange key={fighter.id} view={view} fighter={fighter} change={change} />)}
                                </g>
                            )}
                        </g>
                    </svg>
                    {tracked && <WalkCamera key={playback?.key} view={view} walks={tracked} />}
                    {/* What the last action did, flying, bursting and rising off the figures it happened to, over everything and the shake with it, on a layer of its own: its frames repaint this SVG and not the board's, whose sprites at the deeper zoom steps are hundreds under every rectangle a moving arrow dirties. It follows the board's own SVG so `BoardZoom` measures that one (`.ag-ra-fx-layer`). */}
                    <svg viewBox={`0 0 ${width} ${height}`} className="ag-ra-fx-layer" aria-hidden="true">
                        <g ref={shakeFx}>
                            {playback && <RealmArenaFx key={playback.key} id={artId} cues={playback.cues} at={square => fxPoints(view, square)} />}
                        </g>
                        {playback && !still && shakesOf(playback.cues).length > 0 && <ShakeClock key={playback.key} cues={playback.cues} board={shakeBoard} fx={shakeFx} />}
                    </svg>
                </BoardZoom>
                {/* Turning the view: beside BoardZoom rather than in it, since
                    turning is this board's own, in the top corner opposite the
                    zoom pill. */}
                <TurnButtons onTurn={turn} />
                {/* Over the foot of the frame, out of the zoom: while an action plays,
                    what is happening in words; otherwise the targets, which want the
                    same spot while a character is selected. */}
                {playback ? <PlaybackCaption key={playback.key} playback={playback} fighters={fighters} viewerId={viewerId} nameFor={nameFor} /> : overlay}
            </PlaybackProvider>
            {/* Something happened, but not anywhere the viewer can see: a
                question mark over the frame, not the board, so it stays in the
                middle as the board pans and zooms. The layer fades in and out
                as a step comes and goes; the mark in it, keyed by the step,
                settles in afresh for each. */}
            {unplaced !== undefined && (
                <div className={`ag-ra-unplaced${unplaced ? ' ag-ra-unplaced--on' : ''}`} aria-hidden="true">
                    <span key={unplaced ?? undefined}>?</span>
                </div>
            )}
        </div>
    );
}
