// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import { ruleValuesOf, rulesetOf, type RulesContext } from "./rulesets";
import type { Rect } from "@/utils/ui/mapLabels";
import { isoCentre, ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type IsoView, type Point } from "@/utils/ui/isometric";
import type { IRealmArenaStepOutcome, IRealmArenaStepPart, RealmArenaPartState } from "./apiModels";
import { andList, capitalise, pluralize, possessive } from "@/utils/ui/text";
import type { Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, distance, FACING_COUNT, facingTowards, riseOf, squareAt, TERRAIN, type Battlefield, type Facing, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { EFFECT_IDS, EFFECTS, ITEM_IDS, ITEMS, type AbilityId, type CharacterId, type EffectId, type Item, type ItemId } from "./characters";
import { ABILITY_MARK, CHARACTER_IDS } from "./roster";
import { battlefieldOf } from "./maps";
import { EFFECT_ART, ITEM_ART, type BurstKind, type Missile, type Sprite, type ThrownItem } from "./art";
import { areaDamage, actionPointsOf, CENTRE, SCORED_FOR, squadSight, hasEffect, isStanding, isWarband, maxHpOf, moveAp, pickOf, reachOf, shoots, type BattleState, type Fighter, type MusterPick, type OddsBreakdown, type OddsFactor, type ShotResult, type ToldEvent } from "./rules";

const LETTER_OF = new Map<Terrain, TerrainLetter>(
    (Object.entries(TERRAIN) as [TerrainLetter, Terrain][]).map(([letter, terrain]) => [terrain, letter]),
);

/**
 * The colours of a co-op battle (§29.9), from the viewer's side of it: their
 * own characters in green, a teammate's in blue and every warband's in red, on
 * the board's figures and HP bars alike. The team is the viewer's green as one
 * line on the scoreboard and the result's charts, and the enemy the red. Out
 * of co-op everyone wears their player colour instead.
 */
export const TEAM_COLOUR = "var(--ra-own)";
export const ALLY_COLOUR = "var(--ra-ally)";
/** What the players are called together, as the enemy is by `enemyNameOf`. */
export const TEAM_NAME = "the team";
export const ENEMY_COLOUR = "var(--ra-enemy)";

/** The colour an owner's characters wear in co-op, to `viewerId`: their own, a teammate's or the enemy's. */
export function coopColourOf(viewerId: string, owner: string): string {
    if (isWarband(owner)) return ENEMY_COLOUR;
    return owner === viewerId ? TEAM_COLOUR : ALLY_COLOUR;
}

/**
 * What the enemy's line on the scoreboard says of Hold Out's next wave
 * (§30.3, §30.11), as the wire tells it (`nextWave`) in battle round `round`:
 * when it lands and how many it brings — in fog, the most it could.
 */
export function waveLineOf(nextWave: { round: number; arriving?: number; upTo?: true } | undefined, round: number): string {
    if (!nextWave) return 'final wave landed';
    const when = nextWave.round === round + 1 ? 'wave next round' : `next wave ${nextWave.round}`;
    return nextWave.arriving === undefined ? when : `${when} · ${nextWave.upTo ? 'up to ' : ''}${nextWave.arriving} coming`;
}

/** The letter a square's terrain is drawn with on the map: what the board styles it by. */
export function terrainLetter(field: Battlefield, square: Square): TerrainLetter {
    return LETTER_OF.get(field.tiles[square].terrain) ?? ".";
}

/** The rectangle a set of squares covers, in squares — a deployment zone, or the centre. */
export function areaRect(field: Pick<Battlefield, "width">, squares: readonly Square[]): Rect {
    const coords = squares.map(square => coordsOf(field, square));
    const cols = coords.map(c => c.col), rows = coords.map(c => c.row);
    const col = Math.min(...cols), row = Math.min(...rows);
    return { x: col, y: row, width: Math.max(...cols) - col + 1, height: Math.max(...rows) - row + 1 };
}

/**
 * How many squares either side of a character the view keeps in frame at the
 * least: seven across, which `BoardZoom` brings to its deepest step, where a
 * square is comfortable to tap (§13.1) — what a character picked up to place
 * is framed by, and one selected in battle with nowhere left to move.
 */
const FOCUS_REACH = 3;

/**
 * The region `BoardZoom` brings into view for a selected character, or for
 * every square a step of a review touched, in squares: the squares, and
 * `FOCUS_REACH` either side of them.
 */
export function focusOn(field: Pick<Battlefield, "width">, ...squares: Square[]): Rect {
    return framed(field, squares, FOCUS_REACH);
}

/** The squares, and `margin` squares either side of them. */
function framed(field: Pick<Battlefield, "width">, squares: readonly Square[], margin: number): Rect {
    const { x, y, width, height } = areaRect(field, squares);
    return { x: x - margin, y: y - margin, width: width + margin * 2, height: height + margin * 2 };
}

/** How many squares a caster and its target keep round them (`aimFocus`): room for the target's figure, HP bar and odds standing over its square. */
const AIM_MARGIN = 1.5;

/**
 * The region `BoardZoom` brings into view for a target picked to aim at, in
 * squares: the caster and the target, and `AIM_MARGIN` round them — closer
 * than `focusOn`, since the two of them are all the player is looking at. An
 * action played or reviewed is framed the same way, round whoever acted and
 * whoever it reached (`actionFollow`), so a shot is seen as close as it was
 * aimed.
 */
export function aimFocus(field: Pick<Battlefield, "width">, ...squares: Square[]): Rect {
    return framed(field, squares, AIM_MARGIN);
}

/**
 * How much of a selected character's reach the view keeps in frame, measured
 * out from where it stands in each direction. At full AP a reach runs most of
 * the board's width, so all of it would be the fitted board again; half of it
 * each way still shows the squares near enough to plan around, at a zoom a
 * square can be tapped at.
 */
const REACH_SHOWN = 1 / 2;

/**
 * The region `BoardZoom` brings into view for a selected character, in
 * squares: the near half of where it could move this turn (`REACH_SHOWN`), with `ap`
 * to spend — what it has left on its owner's turn, a full turn's otherwise.
 * Never less than `focusOn` frames round it, so a character with nowhere to
 * go is still brought close.
 */
export function reachFocus(state: BattleState, fighter: Fighter, ap: number): Rect {
    const near = focusOn(state.field, fighter.square);
    const { costs } = reachOf(state, { ...fighter, ap });
    const squares = Array.from(costs.keys()).filter(square => costs[square] !== Infinity);
    if (squares.length === 0) return near;
    const reach = areaRect(state.field, squares);
    const { col, row } = coordsOf(state.field, fighter.square);
    const x = col + 0.5, y = row + 0.5;
    const left = Math.min(near.x, x - (x - reach.x) * REACH_SHOWN);
    const top = Math.min(near.y, y - (y - reach.y) * REACH_SHOWN);
    const right = Math.max(near.x + near.width, x + (reach.x + reach.width - x) * REACH_SHOWN);
    const bottom = Math.max(near.y + near.height, y + (reach.y + reach.height - y) * REACH_SHOWN);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A target picked to aim at, and who is aiming at it: what the board frames close (`aimFocus`). */
export interface AimFollow { aim: { caster: Square; target: Square }; key: string }

/**
 * What the board follows: a target picked to aim at, or squares — a review's
 * step, an action played — just fitted round (`exact`), framed close round
 * whoever acted and whoever it reached (`close`), or, for a walk too long to
 * frame, where it starts, the camera following the walker from there (`track`).
 */
export type BoardFollow = AimFollow | { squares: readonly Square[]; key: string; exact?: boolean; close?: boolean; track?: boolean };

/** How far the battlefield zooms (`BoardZoom`'s `zoomWidth` and `maxWidth`): 84 squares corner to corner fitted to a phone is under ten pixels a square, so the deep step is what makes one tappable — about seven squares across (§13.1). */
export const BOARD_ZOOM = { zoomWidth: 250, maxWidth: 600 } as const;

/**
 * How wide the widest of today's maps lies in the 3D board's frame (`boardFrame`'s
 * `size.width`, a square's side to the unit): the Three Gate Fort, 64 squares by
 * 48, is 64 + 48 corner to corner across a diamond a camera turned 45 degrees
 * sees, a frame 79.2 units wide. The squares `BOARD_ZOOM` leaves at its deepest
 * step on that map are the size a tap needs, so a bigger map is zoomed to match.
 */
const REFERENCE_FRAME_WIDTH = (64 + 48) / Math.SQRT2;

/** How much deeper than `BOARD_ZOOM` the 3D board's deepest step goes: a camera can draw close in without the isometric board's layout cost, and a player wanted a closer look — a third more. */
const DEEP_3D = 5 / 3;

/**
 * `BoardZoom`'s steps for the 3D board, set by the map and not the column: a frame
 * `frameWidth` units across (`boardFrame`'s `size.width`) gets the steps that leave
 * a square the size `BOARD_ZOOM` leaves one on today's widest map, at the middle
 * step and the deepest. Zoom is a width in percent of the column, so the squares
 * stay the same size when both steps grow with the frame. Never less than
 * `BOARD_ZOOM`, and its deepest step goes a third (`DEEP_3D`) further than that,
 * and the two grow together, so the middle step stays below the deepest
 * (`zoomLevels`). The isometric board keeps
 * `BOARD_ZOOM`: its zoomed board is laid out at this width, and a camera's is only
 * an empty spacer to scroll over.
 */
export function boardZoomFor(frameWidth: number): { zoomWidth: number; maxWidth: number } {
    const grown = frameWidth / REFERENCE_FRAME_WIDTH;
    const factor = grown > 1 && Number.isFinite(grown) ? grown : 1;
    return { zoomWidth: Math.round(BOARD_ZOOM.zoomWidth * factor), maxWidth: Math.round(BOARD_ZOOM.maxWidth * factor * DEEP_3D) };
}

/**
 * How tall a figure stands and the HP bar over it, in the isometric board's
 * units, against a square `2 * ISO_HALF_WIDTH` across: the tallest of them (a
 * mage's hat, a staff's head) stands about `FIGURE_TOP` high, with its HP bar
 * just over that — a model drawn taller in art-masters/realmarena/characters
 * wants this raised with it.
 */
export const FIGURE_TOP = 12.5;
/**
 * A figure's body taken as a disc `FIGURE_RADIUS` across, centred `FIGURE_RISE`
 * over the middle of its square's top: what a tap lands on, what its marks sit
 * beside, and what a shot flies to and a blow's text hangs from.
 */
export const FIGURE_RADIUS = 4.5;
export const FIGURE_RISE = 7;
export const HP_BAR_WIDTH = 9;
export const HP_BAR_HEIGHT = 2;
/** How high the HP bar's foot is over the middle of its square. */
export const HP_BAR_RISE = FIGURE_TOP + 0.5;

/** What a figure standing on `ground` (the middle of its square's top) covers, from the top of its HP bar to its feet: what the centre's name keeps off. */
export function figureRectAt(ground: Point): Rect {
    const top = HP_BAR_RISE + HP_BAR_HEIGHT;
    return { x: ground.x - FIGURE_RADIUS, y: ground.y - top, width: FIGURE_RADIUS * 2, height: top };
}

/**
 * What hangs round a figure, in the same units, shared by every way of drawing
 * the board. The rings on the ground round its feet, as fractions of its square's
 * diamond: the one it's picked out by, wide enough to show round its feet,
 * and outside that, still inside the square, the dashed one round one on
 * watch or still sealed.
 */
export const RING_RADIUS = 0.62;
export const MARKER_RADIUS = 0.8;
/**
 * The soft shadow on the ground under a figure, standing or lying: an ellipse
 * `SHADOW_RADIUS` of its square's diamond across (a circle that size on the 3D
 * board's ground), as dark as `SHADOW_ALPHA`. Both boards draw it by these.
 */
export const SHADOW_RADIUS = 0.5;
export const SHADOW_ALPHA = 0.3;
/** The AP pips: a column of dots down the figure's right, clear of the disc and inside its square's width. */
export const AP_PIP_RADIUS = 0.75;
export const AP_PIP_STEP = 1.9;
export const AP_PIP_OFFSET = 5.6;
/**
 * The effect marks (§20.2): a column of badges down the figure's left, where
 * the AP pips never are, clear of the disc and inside its square's width.
 * Three stand within the disc's height.
 */
export const EFFECT_MARK_SIZE = 3;
export const EFFECT_MARK_STEP = 3.1;
export const EFFECT_MARK_OFFSET = 6.2;
/**
 * The item a character carries (§21.1): by its right shoulder, in the AP
 * pips' column above them, so it never covers them, the effect marks or the
 * HP bar over the figure's head.
 */
export const ITEM_MARK_SIZE = 3;
export const ITEM_MARK_OFFSET = { x: AP_PIP_OFFSET, y: -5 };
/**
 * The soft shadow under every mark a figure wears and the one beside a hit's
 * text: how far it falls right (`dx`) and down (`dy`), how far its blur spreads
 * (`blur`, a standard deviation) and how dark it is, in board units. It is
 * `.ag-ra-figure-mark`'s `drop-shadow(0 0.3px 0.4px rgba(0, 0, 0, 0.5))`, which
 * the isometric board draws by — change both.
 */
export const MARK_SHADOW = { dx: 0, dy: 0.3, blur: 0.4, alpha: 0.5 } as const;

/** The ring drawn round a figure's feet: chosen, a candidate for a tap, aimed at, or a watcher a move would set off. */
export type Ring = "selected" | "candidate" | "aimed" | "flagged";

/** The dashed ring round a figure's feet, outside its `Ring`: on watch, or a squad still sealed. */
export type Marker = "watch" | "sealed";

/**
 * The ring round a figure's feet, if any, in the order they win: chosen, then
 * aimed at, then a watcher a move would set off, then a candidate for a tap.
 * `aiming` is the lined-up action's, if there is one.
 */
export function ringOf(id: number, selected: number | undefined, aiming: { aimed: readonly number[]; flagged: readonly number[]; candidates: readonly number[] } | null | undefined): Ring | undefined {
    if (id === selected) return "selected";
    if (aiming?.aimed.includes(id)) return "aimed";
    if (aiming?.flagged.includes(id)) return "flagged";
    if (aiming?.candidates.includes(id)) return "candidate";
    return undefined;
}

/** The kinds of shading the ground takes, bottom to top in the order the boards paint them (`shadedSquares`). */
export type ShadeKind = "fog" | "smoke" | "reach" | "range" | "blast" | "place";

/** One kind of shading and the squares it lies on. */
export interface GroundShade {
    kind: ShadeKind;
    has: (square: Square) => boolean;
    /** For a `reach`: the AP it costs to stop on a square of it, which the shading deepens by. */
    ap?: (square: Square) => number;
}

/**
 * Everything shaded on the ground square by square, in the order a board
 * paints it, bottom first, whichever way the board is drawn: the fog over what
 * the viewer can't see (§27), then the smoke a smoke pot left, under whatever
 * is being aimed (§21.2) — the reach by the AP each square costs, the range, the
 * blast (the area plus the cover it would blast away) — and, over the lot, the
 * squares a character picked up may be placed on: the deployment zone, less
 * where a pick of the sealed squad already stands.
 */
export function shadedSquares({ unseen, smoke, aiming, placing, sealed }: {
    unseen?: ReadonlySet<Square> | null;
    smoke: ReadonlySet<Square>;
    aiming?: { reach: ReadonlyMap<Square, number> | null; range: ReadonlySet<Square> | null; area: readonly Square[] | null; blasts: readonly Square[] | null } | null;
    placing?: { zone: readonly Square[]; selected: number | null } | null;
    sealed?: readonly { square: Square }[] | null;
}): GroundShade[] {
    const shades: GroundShade[] = [];
    if (unseen && unseen.size > 0) shades.push({ kind: "fog", has: square => unseen.has(square) });
    if (smoke.size > 0) shades.push({ kind: "smoke", has: square => smoke.has(square) });
    const reach = aiming?.reach;
    if (reach) shades.push({ kind: "reach", has: square => reach.has(square), ap: square => reach.get(square)! });
    const range = aiming?.range;
    if (range) shades.push({ kind: "range", has: square => range.has(square) });
    const blast = new Set([...aiming?.area ?? [], ...aiming?.blasts ?? []]);
    if (blast.size > 0) shades.push({ kind: "blast", has: square => blast.has(square) });
    if (placing && placing.selected !== null) {
        const free = new Set(placing.zone);
        sealed?.forEach(pick => free.delete(pick.square));
        shades.push({ kind: "place", has: square => free.has(square) });
    }
    return shades;
}

/** A target's chance to hit: a pill wide enough for "100%", worn above its figure's HP bar. */
export const ODDS_WIDTH = 10.5;
export const ODDS_HEIGHT = 4;
export const ODDS_RISE = HP_BAR_RISE + HP_BAR_HEIGHT + ODDS_HEIGHT / 2 + 0.6;
/** A cover shield standing on a square's edge: narrow enough to stay clear of the figure's disc and the HP bar. */
export const SHIELD_WIDTH = 3.6;
export const SHIELD_HEIGHT = 4.6;
/** The path a lined-up move takes: how wide the line is (`.ag-ra-path`'s stroke, which the isometric board draws by — change both), and the radius of the dot where it ends. */
export const PATH_WIDTH = 1.2;
export const PATH_END_RADIUS = 2;
/** The centre's name: its size and weight, and how far clear of the area's edge its baseline stands. */
export const CENTRE_LABEL = { fontSize: 10, fontWeight: 800, gap: 4 } as const;

/** The outline of a cover shield, standing on its point at the origin. `left` is just its left half. */
export function shieldPath(left = false): string {
    const half = SHIELD_WIDTH / 2, shoulder = -SHIELD_HEIGHT * 0.45, belly = -SHIELD_HEIGHT * 0.12;
    return left
        ? `M0 ${-SHIELD_HEIGHT}H${-half}V${shoulder}Q${-half} ${belly} 0 0Z`
        : `M${-half} ${-SHIELD_HEIGHT}H${half}V${shoulder}Q${half} ${belly} 0 0Q${-half} ${belly} ${-half} ${shoulder}Z`;
}

/** Where the board's view goes, in squares, the key that reapplies it, and whether it's zoomed to just fit (`BoardZoomFocus.exact`). */
export interface BoardFocusArea {
    area: Rect;
    key: string;
    exact?: boolean;
}

/**
 * Where the board's view goes, whichever way the board is drawn: a review's
 * step or a target picked from the list (`follow`) ahead of anything else, then
 * a character picked up to place, close enough to tap a square beside it, then
 * the selected one — the near half of its reach (`reach`, `reachFocus`), or
 * the squares round it — and with nothing else, the viewer's own side
 * (`home`). A step is framed just fit round its squares (`exact`) or, for an
 * action, close round whoever acted and whoever it reached (`close`,
 * `aimFocus`). Null for nowhere: the view stays where it is.
 */
export function boardFocus(field: Pick<Battlefield, "width">, { follow, pickedUp, selected, reach, home, refocus = 0 }: {
    follow?: BoardFollow | null;
    pickedUp?: { square: Square } | null;
    selected?: Fighter | null;
    reach?: Rect | null;
    home?: { squares: readonly Square[]; key: string } | null;
    refocus?: number;
}): BoardFocusArea | null {
    if (follow && "aim" in follow) return { area: aimFocus(field, follow.aim.caster, follow.aim.target), key: `follow:${follow.key}`, exact: true };
    if (follow && follow.squares.length > 0) return { area: (follow.close ? aimFocus : focusOn)(field, ...follow.squares), key: `follow:${follow.key}`, exact: follow.exact };
    if (pickedUp) return { area: focusOn(field, pickedUp.square), key: `pick:${pickedUp.square}:${refocus}` };
    if (selected) return { area: reach ?? focusOn(field, selected.square), key: `${selected.id}:${selected.square}:${refocus}`, exact: true };
    if (home && home.squares.length > 0) return { area: focusOn(field, ...home.squares), key: home.key, exact: true };
    return null;
}

/**
 * Where a step of the battle happened, for a review to follow (§17.3 PR 8):
 * every character it changed — moved, hurt, spent AP, took a stance — where
 * it stood before and where it stands now. Comparing the states either side
 * of the step rather than reading the action is what lets a reaction be
 * followed too: the watcher spent its banked AP. AP going *up* is a turn
 * beginning, every one of a side's characters getting a fresh allowance
 * wherever it stands, not anyone doing anything, so it isn't a change.
 */
export function actionSquares(before: readonly Fighter[], after: readonly Fighter[]): Square[] {
    const changed = (was: Fighter, now: Fighter) => was.square !== now.square || was.hp !== now.hp || now.ap < was.ap
        || was.banked !== now.banked || !sameCounts(was.effects, now.effects);
    return after.flatMap(fighter => {
        const was = before.find(one => one.id === fighter.id);
        if (!was || !changed(was, fighter)) return [];
        return was.square === fighter.square ? [fighter.square] : [was.square, fighter.square];
    });
}

/**
 * Where the viewer's own side stands: the squares of its standing characters,
 * which the view falls back on when nothing else says where to look. In co-op
 * (§29) that's the whole team — every owner that isn't a warband — and in a
 * free-for-all the viewer's own squad. Empty when there are none: during the
 * muster nothing is on `fighters` yet, a spectator has no side in a
 * free-for-all, and a squad that has fallen has nobody left to frame. Fog of
 * war never hides a viewer's own side (`viewOf`), so nothing here needs it.
 */
export function friendlySquares(fighters: readonly Fighter[], viewerId: string, coop: boolean): Square[] {
    return fighters
        .filter(fighter => isStanding(fighter) && (coop ? !isWarband(fighter.owner) : fighter.owner === viewerId))
        .map(fighter => fighter.square);
}

/**
 * How much of the battlefield, across or down, squares may span before a
 * review stops following them: past half, framing them is hardly closer than
 * the whole board, and the view is better spent on the viewer's own side.
 */
const SPREAD_LIMIT = 1 / 2;

/** Whether squares are spread over more than `SPREAD_LIMIT` of the battlefield, in either direction. */
export function spreadWide(field: Pick<Battlefield, "width" | "height">, squares: readonly Square[]): boolean {
    if (squares.length === 0) return false;
    const { width, height } = areaRect(field, squares);
    return width > field.width * SPREAD_LIMIT || height > field.height * SPREAD_LIMIT;
}

/**
 * The squares a review frames a move by (§26.2): the whole stretch of it the
 * viewer saw, in order and without repeats — where the character that moved
 * stood before, every square of the paths it was told to have walked, and where
 * it stands after — so a route round a wall stays in frame, where framing just
 * its two ends would leave it. That is every `moved` event of the first mover
 * `events` tell of (an overwatch shot splits one move into several). Where one
 * end is out of the viewer's sight — a mover missing from `before` came into sight on the way, one missing from `after`
 * went out of it — that end is where the path the viewer was told begins or
 * ends instead: the part of the move they saw, which is what the board walks.
 * Null when there's no move, when nothing of it was seen (a move told with no
 * path, from a mover that wasn't in sight at either end), or when it ended
 * where it began — for the caller to follow `actionSquares`.
 */
export function moveFrame(events: readonly ToldEvent[], before: readonly Fighter[], after: readonly Fighter[]): Square[] | null {
    const moves = events.filter((event): event is Extract<ToldEvent, { kind: "moved" }> => event.kind === "moved");
    if (moves.length === 0) return null;
    const mover = moves[0].fighter;
    const seen = moves.filter(move => move.fighter === mover).flatMap(move => move.path);
    const start = before.find(fighter => fighter.id === mover)?.square ?? seen[0];
    const end = after.find(fighter => fighter.id === mover)?.square ?? seen.at(-1);
    if (start === undefined || end === undefined || start === end) return null;
    // Where it ended stays last, however often the route crossed it on the way.
    return [...new Set([start, ...seen].filter(square => square !== end)), end];
}

/**
 * The squares an action's events name: where each character they name —
 * whoever acted, whoever it reached, whoever downed or found whom — stood as
 * the action found it (or as it left it, for one that only came into sight),
 * and where a fireball, a throw or a Demolish landed. A score names a player,
 * not a square, so it adds none.
 */
export function toldSquares(events: readonly ToldEvent[], before: readonly Fighter[], after: readonly Fighter[]): Square[] {
    const where = (id: number) => (before.find(fighter => fighter.id === id) ?? after.find(fighter => fighter.id === id))?.square;
    const squares = events.flatMap((event): (Square | undefined)[] => {
        if (event.kind === "scored") return [];
        const named = [event.fighter, ...("target" in event ? [event.target] : []), ...("targets" in event ? event.targets : []), ...("by" in event ? [event.by] : [])];
        return [...named.map(where), ...("at" in event ? [event.at] : [])];
    });
    return [...new Set(squares.filter((square): square is Square => square !== undefined))];
}

/** Where the view goes for an action: the squares, framed exactly — `close`, as a target picked to aim at is (`aimFocus`), rather than with `focusOn`'s room round them. */
export interface ActionFollow {
    squares: Square[];
    key: string;
    exact?: true;
    close?: true;
    /**
     * The move is too long to frame (`TRACK_SPAN`): `squares` is only where it
     * starts, and the view follows the walker from there rather than zooming
     * out to fit the whole of it.
     */
    track?: true;
}

/**
 * How far apart, in squares across plus squares down (`areaRect`'s width and
 * height added, which is what sets how wide a region looks on the isometric
 * board), a move's frame may spread before the view follows the walker instead
 * of zooming out to fit all of it. A character moves up to eight points an AP
 * (a diagonal step costs one and a half), so one AP spans at most about twelve
 * — a scout running on the diagonal — and a detour round a wall a little more:
 * that is framed, as close as the move allows. A dash of three or four AP is a
 * third of a 48-square battlefield and more, and spans twenty and over (a
 * knight, at four points an AP, only gets there on four), so fitting it in one
 * frame would show most of the board, too far out to see a figure walk.
 * Sixteen sits between the two.
 */
const TRACK_SPAN = 16;

/**
 * Where the view goes for a step of the battle, whoever took it: the stretch a
 * move covered (`moveFrame`), the whole path of it framed exactly — or, if it
 * is spread over more than `TRACK_SPAN`, only where it starts, with `track` set
 * for the view to follow the walker from there; with `still` (reduced motion,
 * when nothing walks and the figure simply appears where it ended) only where
 * it ended is shown instead. Failing that whoever acted and
 * whoever it reached (`toldSquares`), framed exactly and close, as a target
 * picked to aim at is — so a heal three squares off is seen three squares
 * across, not snapped out to a zoom step that shows twenty, and two shots from
 * the same archer at the same soldier are framed alike — unless they are spread
 * over too much of the battlefield to be worth framing (`spreadWide`), as
 * burning ticking on characters all over it can be. Only a step told
 * nothing that places it falls back on every character it changed
 * (`actionSquares`), as deep as they all still fit, unless they are spread
 * over too much of the battlefield to be worth framing (`spreadWide`): what
 * changed also catches what a turn starting resets, which is no part of the
 * action. Null where there is nothing to follow, for the caller to rest the
 * view somewhere of its own. `key` is the one the view glides again for.
 */
export function actionFollow(field: Pick<Battlefield, "width" | "height">, events: readonly ToldEvent[], before: readonly Fighter[], after: readonly Fighter[], key: string, still = false): ActionFollow | null {
    const frame = moveFrame(events, before, after);
    if (frame) {
        const { width, height } = areaRect(field, frame);
        if (width + height <= TRACK_SPAN) return { squares: frame, key, exact: true };
        return still ? { squares: [frame[frame.length - 1]], key, exact: true } : { squares: [frame[0]], key, exact: true, track: true };
    }
    const told = toldSquares(events, before, after);
    if (told.length > 0) return spreadWide(field, told) ? null : { squares: told, key, exact: true, close: true };
    const touched = actionSquares(before, after);
    return touched.length > 0 && !spreadWide(field, touched) ? { squares: touched, key } : null;
}

function sameCounts(a: Fighter["effects"], b: Fighter["effects"]): boolean {
    return EFFECT_IDS.every(id => a[id] === b[id]);
}

/**
 * The effects on a character, in `EFFECT_IDS` order: what the board marks its
 * figure with and its box spells out (§20.2). None on one that's down, which
 * loses every effect.
 */
export function effectsOn(fighter: Fighter): EffectId[] {
    return isStanding(fighter) ? EFFECT_IDS.filter(effect => hasEffect(fighter, effect)) : [];
}

/** A character on watch, in words — "On watch (4 AP banked)" — or undefined when it isn't. */
export function watchStatus(fighter: Fighter): string | undefined {
    return isStanding(fighter) && fighter.banked > 0 ? `On watch (${fighter.banked} AP banked)` : undefined;
}

/**
 * What a character is doing, what's been done to it and what it carries, in
 * words: the figure's tooltip, which can't show the marks. The watch, its
 * effects, then its item.
 */
export function fighterStatus(fighter: Fighter): string[] {
    if (!isStanding(fighter)) return ["Down"];
    const watch = watchStatus(fighter);
    return [
        ...(watch ? [watch] : []),
        ...effectsOn(fighter).map(effect => EFFECTS[effect]!.name),
        ...(fighter.item ? [`Carrying a ${ITEMS[fighter.item].name.toLowerCase()}`] : []),
    ];
}

export { canAct } from "./rules";

/** A character's AP as pips, one of `ACTION_POINTS` each, lit while unspent: the board and the units strip draw the same row. */
export function apPips(fighter: Fighter): boolean[] {
    return Array.from({ length: Math.max(fighter.maxAp ?? actionPointsOf(fighter), fighter.ap) }, (_, i) => i < fighter.ap);
}

/**
 * Which way the board draws a figure facing: the way it last stepped, or —
 * before it has moved, and for a squad still being placed — towards the
 * middle of the map, where the battle is fought over.
 */
export function facingOf(field: Pick<Battlefield, "width" | "height">, { square, facing }: { square: Square; facing?: Facing }): Facing {
    // Read back from a Mixed path, so only trusted to be one of the facings.
    if (Number.isInteger(facing) && facing! >= 0 && facing! < FACING_COUNT) return facing!;
    return facingTowards(field, square, squareAt(field, Math.floor(field.width / 2), Math.floor(field.height / 2)) ?? square);
}

/** How full a character's HP bar is, 0–1 — or would be, were it to lose `lost` HP (gain, if negative), never below empty or past full. */
export function hpFraction(fighter: Fighter, lost = 0): number {
    return Math.min(1, Math.max(0, fighter.hp - lost) / maxHpOf(fighter));
}

/** One line of the "why" behind a chance to hit: what moved it, and by how much. */
export interface OddsLine {
    label: string;
    /** What qualifies it: why a cover penalty is doubled. */
    note?: string;
    /** Percentage points, signed: below zero takes the chance down. */
    amount: number;
}

/** How a factor reads in the player's language. */
function oddsLineOf(factor: OddsFactor, context?: RulesContext): OddsLine {
    const { EFFECTS, ABILITIES, RULES } = rulesetOf(context);
    const { amount } = factor;
    switch (factor.kind) {
        case "cover": {
            const doubled = factor.doubled === "hunkered" ? "doubled: hunkered down"
                : factor.doubled === "far" ? `doubled: far shot, over ${RULES.FAR_SHOT_DISTANCE} squares` : undefined;
            return { label: factor.shield ? (factor.cover === "half" ? `${ABILITIES[factor.ability ?? "shieldWall"]!.name} (counts as half cover)` : `Temporary ${factor.cover} cover`) : `${capitalise(factor.cover)} cover`, note: doubled, amount };
        }
        case "highGround": return { label: "High ground", amount };
        case "effect": return { label: `Target is ${EFFECTS[factor.effect]!.state}`, amount };
        case "smoke": return { label: "Target in smoke", amount };
        case "aimedShot": return { label: ABILITIES.aimedShot.name, amount };
        case "overwatch": return { label: "Overwatch", amount };
    }
}

/**
 * The lines behind a chance to hit, for the turn sheet's "?": what it starts
 * at (`baseLabel` — the weapon's accuracy, or melee's) and each thing that
 * moved it, in the order `oddsBreakdown` applied them, plus a line for the
 * 0–100 hold when `raw` ran past it. The sum is rules.ts's; this only words it.
 */
export function oddsLines(odds: OddsBreakdown, baseLabel: string, context?: RulesContext): OddsLine[] {
    const lines = [{ label: baseLabel, amount: odds.base }, ...odds.factors.map(factor => oddsLineOf(factor, context))];
    return odds.raw === odds.chance ? lines : [...lines, { label: "Held between 0% and 100%", amount: odds.chance - odds.raw }];
}

/** Why an ability can't be used yet — "Used", "Used this turn", "Back in 2 turns" — or undefined when it's ready. */
export function abilityWait(fighter: Fighter, id: AbilityId): string | undefined {
    if (fighter.spent.includes(id)) return "Used";
    if (fighter.usedThisTurn?.includes(id)) return "Used this turn";
    const cooldown = fighter.cooldowns[id] ?? 0;
    return cooldown > 0 ? `Back in ${pluralize(cooldown, "turn")}` : undefined;
}

// ─── Mustering (§17.3 PR 6) ─────────────────────────────────────────────────

/** How many of each character a squad holds — what the muster's steppers read. */
export type SquadCounts = Record<CharacterId, number>;

/** How many of each item a squad bought (§21.1), to hand out while it's placed — what the muster's item steppers read. */
export type ItemCounts = Record<ItemId, number>;

function countsOf<K extends string>(kinds: readonly K[], list: readonly K[]): Record<K, number> {
    const counts = Object.fromEntries(kinds.map(id => [id, 0])) as Record<K, number>;
    for (const kind of list) counts[kind]++;
    return counts;
}

function listOf<K extends string>(kinds: readonly K[], counts: Record<K, number>): K[] {
    return kinds.flatMap(id => Array<K>(counts[id]).fill(id));
}

export const squadCounts = (squad: readonly CharacterId[]): SquadCounts => countsOf(CHARACTER_IDS, squad);

/** The squad a set of counts makes, in the muster's order. */
export const squadOf = (counts: SquadCounts): CharacterId[] => listOf(CHARACTER_IDS, counts);

/** No items bought: where a muster starts, as the ready-made squad carries none. */
export const NO_ITEMS: ItemCounts = countsOf(ITEM_IDS, []);

/** The items a set of counts buys, one entry each, in the muster's order. */
export const itemsOf = (counts: ItemCounts): ItemId[] => listOf(ITEM_IDS, counts);

/**
 * A placed squad carrying the items bought, handed down it one each in order:
 * what placing starts from, so every item bought is carried before the player
 * moves one. Any the squad has no hands for are left out — the muster refuses
 * more items than characters before it gets here.
 */
export function handOut(picks: readonly MusterPick[], items: ItemCounts): MusterPick[] {
    const bought = itemsOf(items);
    return picks.map((pick, i) => pickOf({ ...pick, item: bought[i] }));
}

/**
 * Gives the character at `selected` one of the items the squad carries: it
 * takes it from whoever else of the squad has it, and hands them what it
 * carried in exchange, or nothing. Every item bought stays carried, so the
 * points spent choosing the squad never change while it's placed. An item
 * nobody else carries changes nothing.
 */
export function handItem(picks: MusterPick[], selected: number, item: ItemId): MusterPick[] {
    const from = picks.findIndex((pick, i) => i !== selected && pick.item === item);
    if (from < 0 || picks[selected].item === item) return picks;
    const mine = picks[selected].item;
    return picks.map((pick, i) => i === selected ? pickOf({ ...pick, item }) : i === from ? pickOf({ ...pick, item: mine }) : pick);
}

/** A squad being placed: where each pick stands, and the one picked up to move, if any. */
export interface Placement {
    picks: MusterPick[];
    selected: number | null;
}

/**
 * A tap on a square of the deployment zone while placing a squad. A tap on a
 * character picks it up, and a second tap on it puts it back down. With one
 * picked up, a tap on an empty square of the zone moves it there, and a tap on
 * another character swaps the two.
 */
export function placeTap({ picks, selected }: Placement, square: Square, zone: readonly Square[]): Placement {
    const there = picks.findIndex(pick => pick.square === square);
    if (selected === null) return { picks, selected: there >= 0 ? there : null };
    if (there === selected) return { picks, selected: null };
    const from = picks[selected].square;
    if (there >= 0) {
        return { picks: picks.map((pick, i) => i === selected ? { ...pick, square } : i === there ? { ...pick, square: from } : pick), selected: null };
    }
    if (!zone.includes(square)) return { picks, selected };
    return { picks: picks.map((pick, i) => i === selected ? { ...pick, square } : pick), selected: null };
}

// ─── Taking a turn (§17.3 PR 7) ─────────────────────────────────────────────

/**
 * The tap-to-move shading (§13.2): every square a character could stop on,
 * and the AP it would cost to get there. Where it stands isn't shaded.
 */
export function reachShading(fighter: Fighter, reach: Reach, sneaking: boolean, context?: RulesContext): ReadonlyMap<Square, number> {
    const shading = new Map<Square, number>();
    reach.costs.forEach((cost, square) => {
        if (square !== reach.from && cost !== Infinity) shading.set(square, moveAp(fighter, cost, sneaking, context));
    });
    return shading;
}

/**
 * Every square a player's squad can't see, in fog of war (§27): what the board
 * dims. Null in a battle without fog, where nothing is.
 */
export function unseenSquares(state: BattleState, player: string): ReadonlySet<Square> | null {
    if (!state.fog) return null;
    const seen = squadSight(state, player);
    return new Set(state.field.tiles.flatMap((_, square) => seen(square) ? [] : [square]));
}

/**
 * Whether a player's squad sees the whole of the centre (§13.7): always
 * without fog. In fog of war (§27), an empty centre the squad can't wholly
 * see may not be empty at all, so the screens that say who holds it ask.
 */
export function centreInSight(state: BattleState, player: string): boolean {
    if (!state.fog) return true;
    const seen = squadSight(state, player);
    return (state.field.objectives[CENTRE] ?? []).every(seen);
}

/** A character's name, numbered where its owner has more than one of it: "Man-at-arms 2". */
export function fighterName(fighters: readonly Fighter[], fighter: Fighter, context?: RulesContext): string {
    // The enemy's warbands go by one name (§29.6), so they're numbered as one.
    const squad = fighters.filter(one => one.owner === fighter.owner || (isWarband(one.owner) && isWarband(fighter.owner)));
    const index = squad.findIndex(one => one.id === fighter.id);
    return index < 0 ? rulesetOf(context).CHARACTERS[fighter.character].name : numberedName(squad, index, context);
}

/** The name of one of a squad — fought with, or still being placed — numbered where it has more than one of it. */
export function numberedName(squad: readonly { character: CharacterId }[], index: number, context?: RulesContext): string {
    const { character } = squad[index];
    const name = rulesetOf(context).CHARACTERS[character].name;
    if (squad.filter(one => one.character === character).length === 1) return name;
    return `${name} ${squad.slice(0, index).filter(one => one.character === character).length + 1}`;
}

/**
 * Whose a character is, from where the viewer sits: "your Knight", "Bob's
 * Archer" — or, for one the viewer has no word of, in fog of war (§27) or
 * gone with a dropped player's squad, "a character out of sight".
 */
export function whoseName(fighters: readonly Fighter[], id: number, viewerId: string, nameFor: (userId: string) => string, context?: RulesContext): string {
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character out of sight";
    const name = fighterName(fighters, fighter, context);
    return fighter.owner === viewerId ? `your ${name}` : `${possessive(nameFor(fighter.owner))} ${name}`;
}

/** How a line is led: by a glyph, or by the drawn mark of the effect or item it's about. */
type LineLead = { icon: string; mark?: never } | { mark: Sprite; icon?: never };

/**
 * One line of what an action did, as the board shows it coming back, led by a
 * glyph or by the drawn mark of the effect or item it's about. A shot carries
 * the roll it was decided by.
 *
 * The results panel reads it as a `title` over a `sub`; the board's caption
 * reads the same line as one `sentence`, which has to stand on its own with
 * nothing beside it ("Alice's Archer hit your Knight for 3"). `event` is the
 * index of the event it tells, which is how a caption cue (`CaptionCue`) finds
 * its words.
 */
export type EventLine = {
    title: string;
    sub?: string;
    /** The 1–100 roll a shot was decided by: absent from an event a review told without it. */
    roll?: number;
    /** The whole line as a sentence of its own: capitalised, with no full stop. */
    sentence: string;
    /** The index, in the events it was made from, of the event it tells. */
    event: number;
} & LineLead;

/** A line before it is given the event it tells; with no `sentence` of its own, its title says it. */
type LineDraft = { title: string; sub?: string; roll?: number; sentence?: string } & LineLead;

/** Who a blow or a landing caught, as a run of prose: "nobody", "your Knight and Bob's Archer". */
const caught = (names: readonly string[]) => names.length === 0 ? "nobody" : andList(names);

/**
 * The index of the first move among `events`. A move broken up by the
 * reactions it set off is told once, at its first segment, in the lines
 * (`eventLines`) and the captions (`battleCues`) alike.
 */
function firstMoveOf(events: readonly ToldEvent[]): number {
    return events.findIndex(event => event.kind === "moved");
}

/** The roll a shot or a strike was decided by, as a line leads with it: nothing for an event a review told without it. */
const rollOf = (event: ToldEvent): { roll?: number } => "roll" in event && typeof event.roll === "number" ? { roll: event.roll } : {};

/**
 * What an action did, in order, in the viewer's words (§17.3 PR 7). A move
 * broken up by the reactions it set off is told once. `fighters` names
 * everyone the viewer can see after the action, which without fog of war is
 * everyone it touched; in fog (§27), one that shot from out of sight is "a
 * character out of sight" (`whoseName`). Takes a review's events, which come
 * without a shot's roll, as well as an action's own.
 */
export function eventLines(events: readonly ToldEvent[], fighters: readonly Fighter[], viewerId: string, nameFor: (userId: string) => string, context?: RulesContext): EventLine[] {
    const { ABILITIES, EFFECTS, ITEMS } = rulesetOf(context);
    const name = (id: number) => whoseName(fighters, id, viewerId, nameFor, context);
    const Name = (id: number) => capitalise(name(id));
    /** Whose a thing is, led by the owner's name: "Alice's Mage's". */
    const Owner = (id: number) => possessive(Name(id));
    const firstMove = firstMoveOf(events);
    const draft = (event: ToldEvent, index: number): LineDraft[] => {
        switch (event.kind) {
            case "ability": return [{ icon: "✦", title: `${Name(event.fighter)} used ${ABILITIES[event.ability]!.name}` }];
            case "moved":
                return index === firstMove ? [{ icon: "👣", title: `${Name(event.fighter)} ${event.via ? `moved with ${ABILITIES[event.via]!.name}` : event.sneaking ? "sneaked" : "moved"}` }] : [];
            case "shot": {
                const title = event.result === "miss" ? "Miss" : `${event.result === "hit" ? "Hit" : "Graze"} for ${event.damage}`;
                const who = `${Name(event.fighter)}${event.reaction ? " on overwatch" : event.via ? `'s ${ABILITIES[event.via]!.name}` : ""}`;
                const verb = event.result === "miss" ? "missed" : event.result === "hit" ? "hit" : "grazed";
                return [{
                    icon: "🎯",
                    title,
                    sub: `${who} at ${name(event.target)} · ${event.chance}% to hit`,
                    ...rollOf(event),
                    sentence: `${who} ${verb} ${name(event.target)}${event.result === "miss" ? "" : ` for ${event.damage}`}`,
                }];
            }
            case "struck": {
                if (event.via) {
                    const title = `${ABILITIES[event.via]!.name}: ${name(event.target)} took ${event.damage}`;
                    return [{ icon: ABILITY_MARK, title, sentence: `${Name(event.fighter)}'s ${ABILITIES[event.via]!.name} hit ${name(event.target)} for ${event.damage}` }];
                }
                // Under the balance rules a strike rolls, like a shot: a miss is told as one, with the odds and the roll.
                const title = event.missed ? "Miss" : `${Name(event.fighter)} struck ${name(event.target)} for ${event.damage}`;
                const sentence = event.missed ? `${Name(event.fighter)} struck at ${name(event.target)} and missed` : title;
                const odds = event.chance === undefined ? undefined : `${event.chance}% to hit`;
                const sub = [event.reaction ? "On guard" : undefined, odds].filter(Boolean).join(" · ") || undefined;
                return [{
                    icon: "⚔️", title, sub,
                    ...rollOf(event),
                    sentence: event.reaction ? `${sentence} on guard` : sentence,
                }];
            }
            case "fireball":
            case "iceBall":
            case "dynamite": {
                const names = event.targets.map(name);
                const { name: ability } = ABILITIES[event.kind]!;
                return [{
                    icon: AREA_BLAST[event.kind].icon,
                    title: `${ability}: ${event.targets.length === 0 ? "nobody hit" : names.join(", ")}`,
                    sub: event.damages ? event.targets.map(id => `${name(id)}: ${areaDamage(event, id)} damage`).join(" · ") : `${event.damage} damage each`,
                    sentence: `${Owner(event.fighter)} ${ability.toLowerCase()} hit ${caught(names)}${event.targets.length > 0 && event.damage > 0 && !event.damages ? ` for ${event.damage} each` : ""}`,
                }];
            }
            case "downed":
                return [{ icon: "✕", title: `${Name(event.fighter)} is down` }];
            case "healed": {
                const amount = event.hp > 0 ? ` for ${event.hp}` : "";
                const title = `${Name(event.target)} ${event.via === "purify" ? "purified" : "healed"}${amount}`;
                const itself = event.fighter === event.target;
                const whom = itself ? "itself" : name(event.target);
                const sentence = event.via === "draught" ? `${Name(event.fighter)} ${itself ? "drank a healing draught" : `gave ${whom} a healing draught`}${amount}`
                    : `${Name(event.fighter)} ${event.via === "purify" ? "purified" : "healed"} ${whom}${amount}`;
                return [{
                    ...(event.via === "draught" ? { mark: ITEM_ART.healingDraught, sub: ITEMS.healingDraught.name }
                        : { icon: "✚", ...(event.via === "purify" ? { sub: ABILITIES.purify.name } : {}) }),
                    title,
                    sentence,
                }];
            }
            case "thrown": {
                const { name: item } = ITEMS[event.item];
                if (event.item === "smokePot") return [{ mark: ITEM_ART.smokePot, title: `${Name(event.fighter)} threw a smoke pot` }];
                const names = event.targets.map(name);
                return [{
                    mark: ITEM_ART[event.item],
                    title: `${item}: ${event.targets.length === 0 ? "nobody hit" : names.join(", ")}`,
                    ...(event.damage > 0 ? { sub: `${event.damage} damage each` } : {}),
                    sentence: `${Owner(event.fighter)} ${item.toLowerCase()} ${event.targets.length > 0 && event.damage === 0 ? "caught" : "hit"} ${caught(names)}${event.targets.length > 0 && event.damage > 0 && !event.damages ? ` for ${event.damage} each` : ""}`,
                }];
            }
            case "blasted":
                return [{ icon: "💥", title: `${capitalise(pluralize(event.squares.length, "square"))} of low cover blasted away`, sub: "Open ground now" }];
            case "demolished":
            case "burst": {
                const names = event.targets.map(name);
                return [{
                    icon: "💥",
                    title: `${event.kind === "burst" ? `${Name(event.fighter)} burst` : ABILITIES.demolish.name}: ${event.targets.length === 0 ? "nobody hit" : names.join(", ")}`,
                    ...(event.targets.length > 0 ? { sub: `${event.damage} damage each` } : {}),
                    sentence: `${Name(event.fighter)} ${event.kind === "burst" ? "burst" : `used ${ABILITIES.demolish.name}`} and hit ${caught(names)}${event.targets.length > 0 ? ` for ${event.damage} each` : ""}`,
                }];
            }
            case "marked":
                return [{ icon: "◎", title: `${Name(event.fighter)} used ${ABILITIES.huntersMark.name} on ${name(event.target)}` }];
            case "raised":
                return [{ icon: "✚", title: `${Name(event.target)} is back up at ${event.hp} HP`, sentence: `${Name(event.fighter)} raised ${name(event.target)} to ${event.hp} HP` }];
            case "hunkered":
                return [{ mark: EFFECT_ART.hunkered, title: `${Name(event.fighter)} hunkered down` }];
            case "shieldWall":
                return [{ mark: EFFECT_ART.shieldWall, title: `${Name(event.fighter)} raised a shield wall` }];
            case "watching":
                return [{ icon: "👁", title: `${Name(event.fighter)} is on watch`, sub: `${event.banked} AP banked` }];
            case "spotted":
                return [{ icon: "👁", title: `${Name(event.fighter)} found ${name(event.by)} in its way`, sub: "Out of sight until then · went round" }];
            case "effect":
                return [{ mark: EFFECT_ART[event.effect], title: `${Name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect]!.state}` }];
            case "burned":
                return [{ mark: EFFECT_ART[event.effect ?? "burning"], title: event.effect ? `${Name(event.fighter)} took ${event.damage} damage from ${EFFECTS[event.effect]!.name}` : `${Name(event.fighter)} burned for ${event.damage}` }];
            case "scored":
                return [{ icon: "★", title: `${event.player === viewerId ? "You" : nameFor(event.player)} scored ${event.points}`, sub: capitalise(SCORED_FOR[event.reason]) }];
        }
    };
    return events.flatMap((event, index) => draft(event, index).map((line): EventLine => ({ ...line, sentence: line.sentence ?? line.title, event: index })));
}

// ─── Battle visuals (§26) ───────────────────────────────────────────────────

/** How a piece of hit text is coloured (§26.1): damage, a graze, a miss, a heal, or a word of its own — an effect, a knock-out. */
export type HitTone = "hit" | "graze" | "miss" | "heal" | "word";

/** When a cue starts and how long it lasts, in milliseconds from the moment the action starts playing. */
export interface Timed {
    start: number;
    length: number;
}

/** When the last of a run of timed things is over: 0 for none. */
export function endOf(timed: readonly Timed[]): number {
    return Math.max(0, ...timed.map(({ start, length }) => start + length));
}

/** Hit text over a figure (§26.1). */
export interface TextCue extends Timed {
    kind: "text";
    /** Who it happened to. */
    fighter: number;
    /**
     * Where it stood when it happened, which a move can leave behind: an
     * overwatch shot is taken where the mover had got to, not where it stopped.
     */
    square: Square;
    /** The big text: "−3", "+4", "Miss", "Down", an effect's name on its own, or what a character is doing: "Overwatch". */
    value: string;
    /** The small text under it: "Graze", or the effect it put on. */
    label?: string;
    /** The effect whose mark stands beside it: burning's, as it does its damage, or a stance's as it takes it. */
    mark?: EffectId;
    tone: HitTone;
    /**
     * What it did to the fighter's HP as it lands: less for a blow, more for a
     * heal, 0 for a miss. Absent on a word that changes no HP. The board steps
     * the HP bar by it, so a bar never drops before its blow lands.
     */
    hpChange?: number;
    /**
     * Which line over the head it stands on, when something else is still
     * showing there: 0, or absent, is the usual place, and each lane is one
     * line higher. A knock-out's "Down" starts while the blow that caused it is
     * still rising, and burning's damage and a blow on the same figure do the
     * same, so none of them is drawn on top of another.
     */
    lane?: number;
    /**
     * Where the blow it tells came from, for the knock the target takes as it
     * lands: the shooter's or striker's square, or where a fireball or a flask
     * came down, or a Bloater burst. Absent on anything that isn't a blow —
     * burning, a heal, a word.
     */
    from?: Square;
}

/** Something flying from one square to another (§26.1). */
export interface FlightCue extends Timed {
    kind: "flight";
    missile: Missile;
    /** Where it's shot or thrown from, and the square it's aimed at: a figure's for a shot, the ground's for a throw. */
    from: Square;
    to: Square;
    /**
     * How it ends: stuck in the target, glancing off it, flying past it, or
     * coming down on the square it was aimed at, where its burst takes over.
     */
    result: ShotResult | "landed";
    /** How long after its start it gets there: a shot goes on after, for the rest of its `length`. */
    land: number;
}

/** Something going off where it landed (§26.1): over its square, or the 3×3 round it. */
export interface BurstCue extends Timed {
    kind: "burst";
    burst: BurstKind;
    at: Square;
    /** How many squares it spreads each way from `at`: 1 for a 3×3. */
    radius: 0 | 1;
}

/** A melee strike: a short slash over the target (§26.1). */
export interface SlashCue extends Timed {
    kind: "slash";
    square: Square;
    /** Who strikes, and the square it strikes from: it lunges at `square` as the slash crosses it. */
    striker: number;
    from: Square;
}

/**
 * A character the action downs, standing as it was until the blow that
 * downed it lands, and then fading (§26.1): `start` is when the blow lands.
 */
export interface FallCue extends Timed {
    kind: "fall";
    /** As the action found it, standing where it fell. */
    fighter: Fighter;
    /**
     * When it gets there, for one downed partway through a move: it stands on
     * the square it fell on only once its walk has reached it. Absent for one
     * that never moved, which stands there from the start.
     */
    arrives?: number;
}

/**
 * A character walking its told path (§26.1), square by square: `path` is
 * exactly what the viewer was told — in fog of war, only the squares of it
 * they could see — and `length` is the whole walk's time, each leg of it
 * `legWeight` walk steps long (a diagonal one longer, a climb longer still). It
 * stands on the path's first square until `start`, and between walks of the
 * same move (an overwatch shot splits one) on the last square of the one
 * before. `fighter` is as it looked: as the action found it, or — for one that
 * came into sight on the way — as it stands after. The board shares `length`
 * out between the legs itself, by how far each looks on screen.
 */
export interface WalkCue extends Timed {
    kind: "walk";
    fighter: Fighter;
    path: readonly Square[];
    /** How it goes, when not on foot: absent for a walk. */
    motion?: WalkMotion;
}

/**
 * How a character an ability moves goes (§34): jumping in one arc to where a
 * Leap lands, pushed back by a Shove without a step, pulled along by a Beckon
 * without a step, or darting away from Shoot + Dodge's shot.
 */
export type WalkMotion = "leap" | "pushed" | "pulled" | "dash";

/** Which motion each ability that moves someone plays its move with. */
const MOTION_OF: Readonly<Partial<Record<AbilityId, WalkMotion>>> = { leap: "leap", shove: "pushed", beckon: "pulled", shootDodge: "dash" };

/**
 * How many walk steps a move in each motion takes for each it would take on
 * foot: a dart is quicker than walking it, and a push or a pull a little
 * slower, so a single square of it is still seen. A leap is timed by how far
 * it goes instead (`LEAP_STEPS`), since it crosses no legs.
 */
const MOTION_PACE: Readonly<Record<Exclude<WalkMotion, "leap">, number>> = { pushed: 1.4, pulled: 1.2, dash: 0.7 };

/** How many walk steps a Leap hangs in the air: `base`, and `perSquare` for each square it jumps. */
const LEAP_STEPS = { base: 2, perSquare: 0.5 };

/**
 * Low cover blasted away (§22), standing until the burst that did it fades:
 * the board draws it from the battlefield as the action found it, and from
 * `start` it fades off the scorched ground under it.
 */
export interface ScorchCue extends Timed {
    kind: "scorch";
    squares: readonly Square[];
}

/**
 * What the board's caption says, from the moment the event at `event` starts
 * to play: an index into the events the cues were built from, whose
 * `EventLine` has the words. It lasts until the next caption starts, and the
 * last one until the rest of the playback is over, so a caption never makes a
 * playback longer (`endOf` is the same with or without them). An event that
 * drew nothing has none, and neither has a later segment of a broken-up move,
 * which `eventLines` doesn't tell either: the caption before it stands.
 */
export interface CaptionCue extends Timed {
    kind: "caption";
    event: number;
}

/** One thing the board plays as an action comes back. */
export type BattleCue = TextCue | FlightCue | BurstCue | SlashCue | FallCue | ScorchCue | WalkCue | CaptionCue;

/** How long a piece of hit text takes to rise and fade (§26.1), when nothing needs it shortened. */
export const HIT_TEXT_MS = 1000;
/** From one thing an action did landing to the next: long enough to see each land before the next, when nothing needs it shortened. */
const CUE_STEP_MS = 450;
/**
 * How long a character takes to cross a square on a walk (§26.1), a straight
 * step of it: quick enough that a long move — a warband's runs go twelve to
 * twenty-six squares — is over in two or three seconds, slow enough that each
 * square can be followed. A long action walks quicker (`MIN_WALK_STEP_MS`).
 */
export const WALK_STEP_MS = 110;
/** How long a straight step is on screen, in board units: the length a walk step is measured in. */
const STRAIGHT = Math.hypot(ISO_HALF_WIDTH, ISO_HALF_HEIGHT);
/**
 * How many walk steps a diagonal leg takes. On screen a straight step is about
 * 11 units long and a diagonal one 20 or 10 by how the view is turned — 15 on
 * average — so a diagonal leg takes 1.34 steps, and the timeline never depends
 * on which way the player has turned the board.
 */
export const DIAGONAL_LEG = (ISO_HALF_WIDTH + ISO_HALF_HEIGHT) / STRAIGHT;
/** How many walk steps each quarter of height climbed or dropped adds to a leg: a full wall, four quarters, costs a whole step more. */
export const CLIMB_LEG = 0.25;
/**
 * The longest any one action plays for, however much it set off (§26.1), not
 * counting the view's glide to it, which the board waits out before it starts
 * the clock. Four and a half seconds: the longest run, twenty-six squares, is 2.75 seconds on
 * its own, and a shot after it takes another 1.5 until its text has risen. An
 * action that would run over it is squeezed to fit, a little at a time and in
 * order (`battleCues`): the walks quicker, then the gaps between landings
 * shorter, then the text — and the flights never.
 */
export const PLAYBACK_MS = 4500;
/**
 * How long a missile takes to get there (§26.1): `base` and `perSquare` for
 * every square it flies, up to `max`. An arrow quickly, a bolt quicker, a
 * fireball or a throw on a higher, slower arc, and a long shot takes longer
 * than a short one.
 */
export const FLIGHT_PACE: Readonly<Record<Missile, { base: number; perSquare: number; max: number }>> = {
    arrow: { base: 180, perSquare: 14, max: 650 },
    bolt: { base: 120, perSquare: 9, max: 420 },
    acid: { base: 220, perSquare: 16, max: 650 },
    fireball: { base: 300, perSquare: 20, max: 800 },
    fireFlask: { base: 300, perSquare: 20, max: 800 },
    thunderFlask: { base: 300, perSquare: 20, max: 800 },
    smokePot: { base: 300, perSquare: 20, max: 800 },
    dynamite: { base: 300, perSquare: 20, max: 800 },
    poisonArrow: { base: 180, perSquare: 14, max: 650 },
    iceShard: { base: 260, perSquare: 18, max: 700 },
    lightning: { base: 90, perSquare: 6, max: 300 },
};
/** How long a shot goes on once it's there: an arrow stuck in a figure, or one glancing off or flying past. */
const SHOT_AFTER_MS = 350;
/** How long a burst takes to flash and fade. */
const BURST_MS = 700;
/** How far through its burst blasted cover starts to go: as the burst fades, and gone with it. */
const SCORCH_AT = 0.6;
/** How long a strike's slash takes to cross its target, and the hit lands as it does. */
const SLASH_MS = 250;
/** How long a downed character takes to fade once its blow has landed. */
const FALL_MS = 400;
/**
 * How far an action that runs over `PLAYBACK_MS` may be squeezed before it is
 * simply shortened to fit, each in turn: a straight walk step down to 70ms, the
 * gap between landings down to 200ms (`laneTexts` keeps text that now overlaps
 * readable), then the text down to 800ms. A flight is never squeezed.
 */
const MIN_WALK_STEP_MS = 70;
const MIN_CUE_STEP_MS = 200;
const MIN_TEXT_MS = 800;

/**
 * How long a missile is in the air from one square to the next (§26.1): by the
 * straight line between them, in squares, from its `FLIGHT_PACE` — never less
 * than its base, never more than its longest.
 */
export function flightMs(field: Pick<Battlefield, "width">, missile: Missile, from: Square, to: Square): number {
    const { base, perSquare, max } = FLIGHT_PACE[missile];
    const a = coordsOf(field, from), b = coordsOf(field, to);
    return Math.round(Math.min(max, base + perSquare * Math.hypot(a.col - b.col, a.row - b.row)));
}

/**
 * How many walk steps one leg of a walk takes (§26.1): one for a straight step,
 * `DIAGONAL_LEG` for a diagonal one, and `CLIMB_LEG` more for each quarter of
 * height between the tops of the two squares, up or down.
 */
export function legWeight(field: Battlefield, from: Square, to: Square): number {
    const a = coordsOf(field, from), b = coordsOf(field, to);
    const diagonal = a.col !== b.col && a.row !== b.row;
    // A square the map doesn't have (a battle read against another map) has no height to climb.
    const climb = field.tiles[from] && field.tiles[to] ? Math.abs(riseOf(field, to, from)) : 0;
    return (diagonal ? DIAGONAL_LEG : 1) + CLIMB_LEG * climb;
}

/**
 * How long a leg of a walk is on screen as the view draws it, plus what its
 * climb costs (`CLIMB_LEG` of a straight step for each quarter of height): what
 * a walk's time is shared out over its legs by (`walkerAt`), so a walker moves
 * at an even pace. The same prices `legWeight` puts on a leg, but measured as
 * this view draws it rather than turned every way at once.
 */
export function legLengthOn(view: IsoView): (from: Square, to: Square) => number {
    return (from, to) => {
        const a = isoCentre(view, from), b = isoCentre(view, to);
        return Math.hypot(b.x - a.x, b.y - a.y) + CLIMB_LEG * STRAIGHT * Math.abs(view.heights[to] - view.heights[from]);
    };
}

/** What each character that shoots something other than an arrow shoots (§26.1): the Mage's bolt, the Spitter's acid. */
const SHOT_MISSILE: Readonly<Partial<Record<CharacterId, Missile>>> = { mage: "bolt", spitter: "acid" };

/** What a shot by an ability flies, where it isn't its shooter's usual (§34): Poison Arrow's green arrow, Thunder's lightning. */
const SHOT_VIA_MISSILE: Readonly<Partial<Record<AbilityId, Missile>>> = { poisonArrow: "poisonArrow", thunder: "lightning" };

/** The glow each blessing puts down under whoever takes it (§34): Taunt's, Blessing's and Focus's light, and Ward's ring. */
const BUFF_BURST: Readonly<Partial<Record<EffectId, BurstKind>>> = { braced: "aura", blessed: "aura", focused: "aura", warded: "ward" };

/**
 * How each ability that lands on a 3×3 shows (§26.1, §33.2): the glyph its
 * lines and rows lead with, what flies, and what it bursts into.
 */
export const AREA_BLAST: Readonly<Record<"fireball" | "dynamite" | "iceBall", { icon: string; missile: Missile; burst: BurstKind }>> = {
    iceBall: { icon: "❄️", missile: "iceShard", burst: "frost" },
    fireball: { icon: "🔥", missile: "fireball", burst: "fire" },
    dynamite: { icon: "🧨", missile: "dynamite", burst: "blast" },
};

/** What each thrown item bursts into (§26.1), and over how much. */
const THROWN_BURST: Readonly<Record<ThrownItem, BurstKind>> = { fireFlask: "fire", thunderFlask: "thunder", smokePot: "smoke" };

/**
 * What a character says it is doing as it does it, over its own head (§26.1):
 * the words the log has for it, short enough to read in a glance at the board
 * — a stance, a watch, a reaction.
 */
const STANCE_WORD: Readonly<Record<"hunkered" | "shieldWall", string>> = { hunkered: "Hunker down", shieldWall: "Shield wall" };
/**
 * A watch is told by the weapon the watcher keeps — "Overwatch" for a ranged
 * one, "On guard" for a melee one — and what it sets off by what it does: an
 * overwatch shot is "Overwatch" again, a guard's blow "Guard".
 */
const OVERWATCH_WORD = "Overwatch";
const ON_GUARD_WORD = "On guard";
const GUARD_WORD = "Guard";

/** Damage as the board shows it, with a real minus sign. */
const minus = (damage: number) => `−${damage}`;

/**
 * Gives each piece of hit text the lowest lane over its fighter that no other
 * text on that fighter is using while it shows (§26.1): a text that starts
 * while an earlier one is still rising stands a line above it, and one that
 * starts after the last has gone is back in the usual place. Texts that start
 * together on one fighter stand on lanes of their own; texts on different
 * fighters never share one.
 */
function laneTexts(cues: readonly BattleCue[]) {
    const placed = new Map<number, TextCue[]>();
    const texts = cues.filter((cue): cue is TextCue => cue.kind === "text");
    // The sort is stable, so texts told at the same moment keep the order they were told in.
    for (const cue of [...texts].sort((a, b) => a.start - b.start)) {
        const showing = placed.get(cue.fighter) ?? [];
        const taken = new Set(showing.filter(other => other.start < cue.start + cue.length && cue.start < other.start + other.length).map(other => other.lane ?? 0));
        let lane = 0;
        while (taken.has(lane)) lane++;
        if (lane > 0) cue.lane = lane;
        placed.set(cue.fighter, [...showing, cue]);
    }
}

/**
 * Gives each caption its length: to the start of the next, and the last to the
 * end of everything else. Captions are told in the order of their events, which
 * is also the order they start in (`timeline` sees to it), so none is ever
 * cut short by one that began earlier.
 */
function closeCaptions(cues: readonly BattleCue[]): BattleCue[] {
    const end = endOf(cues.filter(cue => cue.kind !== "caption"));
    const captions = cues.filter((cue): cue is CaptionCue => cue.kind === "caption");
    return cues.map(cue => {
        if (cue.kind !== "caption") return cue;
        const next = captions[captions.indexOf(cue) + 1];
        return { ...cue, length: Math.max(0, (next ? next.start : end) - cue.start) };
    });
}

/**
 * The caption the board shows `ms` into a playback: the latest one that has
 * started by then, or null before the first. Outside a playback the board asks
 * with `Infinity`, which is the last caption — what the action ended on.
 */
export function captionAt(cues: readonly BattleCue[], ms: number): CaptionCue | null {
    let latest: CaptionCue | null = null;
    for (const cue of cues) {
        if (cue.kind === "caption" && cue.start <= ms && (!latest || cue.start >= latest.start)) latest = cue;
    }
    return latest;
}

/** Every timing in a cue, scaled: the last resort of fitting an action in, when squeezing its paces has not been enough. */
function scaled(cue: BattleCue, scale: number): BattleCue {
    const by = (ms: number) => Math.round(ms * scale);
    const timed = { ...cue, start: by(cue.start), length: by(cue.length) };
    // A flight's arc is drawn by how far through it is, so it never lands in no time.
    if (timed.kind === "flight") return { ...timed, land: Math.max(1, by(timed.land)) };
    return timed.kind === "fall" && timed.arrives !== undefined ? { ...timed, arrives: by(timed.arrives) } : timed;
}

/** How `battleCues` builds a timeline. */
export interface BattleCueOptions extends RulesContext {
    /**
     * For a player who has asked for less motion: the board draws no walker
     * and no flight, so none of them takes any time. A walk is still told, but
     * takes none; a shot's text rises the moment its turn comes, with nothing
     * flying ahead of it.
     */
    still?: boolean;
}

/** The paces an action's timeline is built at: what squeezing it to fit `PLAYBACK_MS` turns down. */
interface Pace {
    /** A straight step of a walk. */
    walkStepMs: number;
    /** The least from one thing landing to the next. */
    cueStepMs: number;
    /** How long a piece of hit text shows. */
    textMs: number;
}

/** What nothing has to be squeezed for is played at. */
const EASY_PACE: Pace = { walkStepMs: WALK_STEP_MS, cueStepMs: CUE_STEP_MS, textMs: HIT_TEXT_MS };

/** The paces to squeeze, in the order an action that runs over gives them up, each with the least it goes down to. */
const SQUEEZES = [["walkStepMs", MIN_WALK_STEP_MS], ["cueStepMs", MIN_CUE_STEP_MS], ["textMs", MIN_TEXT_MS]] as const;

/** The largest whole number from `floor` to `ceiling` that `fits`, by halving; `fits` only gets harder as the number grows, and `floor` is the answer when nothing fits. */
function largestFit(floor: number, ceiling: number, fits: (ms: number) => boolean): number {
    let low = floor, high = ceiling;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(middle)) low = middle;
        else high = middle - 1;
    }
    return low;
}

/** Each thing an action did, timed at `pace`, before its text is laned or any of it is shortened to fit. */
function timeline(field: Battlefield, events: readonly ToldEvent[], before: readonly Fighter[], after: readonly Fighter[], options: BattleCueOptions, pace: Pace): BattleCue[] {
    const { ABILITIES, EFFECTS, ITEMS } = rulesetOf(options);
    const { still = false } = options;
    const as = new Map(before.map(fighter => [fighter.id, fighter]));
    const afterAs = new Map(after.map(fighter => [fighter.id, fighter]));
    /** When each character's last walk so far ends: a character downed on the way is on its square only from then. */
    const walked = new Map<number, number>();
    const at = new Map(before.map(fighter => [fighter.id, fighter.square]));
    const cues: BattleCue[] = [];
    /** How long a missile is in the air from a character to a square: not at all, for a player who sees none. */
    const flightOf = (fighter: number, to: Square | undefined, missile: Missile) => {
        const from = at.get(fighter);
        return still || from === undefined || to === undefined ? 0 : flightMs(field, missile, from, to);
    };
    /** The latest text on each character: where an effect's name goes under the number that came with it. */
    const latest = new Map<number, TextCue>();
    /** When the last thing landed. */
    let landed: number | null = null;
    /** Who the last fireball or flask came down on, and when: a flask that only stuns names its effect there. */
    let landing: { start: number; targets: readonly number[] } | null = null;
    /**
     * When the next thing lands, `lead` after it sets off: no sooner than the
     * last one landed, and far enough after it to be seen on its own.
     */
    const beat = (lead = 0) => {
        landed = landed === null ? lead : landed + Math.max(pace.cueStepMs, lead);
        return landed;
    };
    const text = (fighter: number, when: number, value: string, tone: HitTone, extra: Pick<TextCue, "label" | "mark" | "hpChange" | "from"> = {}) => {
        const square = at.get(fighter);
        if (square === undefined) return;
        const cue: TextCue = { kind: "text", fighter, square, value, tone, ...extra, start: when, length: pace.textMs };
        cues.push(cue);
        latest.set(fighter, cue);
    };
    /**
     * What a character is doing, over it — a stance, a watch, a reaction. Not
     * the latest text on it: it names no blow, so a fall never starts by it
     * and an effect never lands under it.
     */
    const say = (fighter: number, when: number, value: string, mark?: EffectId) => {
        const square = at.get(fighter);
        if (square !== undefined) cues.push({ kind: "text", fighter, square, value, tone: "word", ...(mark ? { mark } : {}), start: when, length: pace.textMs });
    };
    /**
     * A character walking `path`, starting as the last thing landed: so a shot
     * told before it has landed first, and one told after it flies once it's
     * over, as the next thing to land.
     */
    const walk = (fighter: number, path: readonly Square[], motion?: WalkMotion) => {
        const walker = as.get(fighter) ?? afterAs.get(fighter);
        if (!walker || path.length < 2) return;
        const start = landed ?? 0;
        const steps = motion === "leap" ? LEAP_STEPS.base + LEAP_STEPS.perSquare * distance(field, path[0], path[path.length - 1])
            : path.slice(1).reduce((total, square, i) => total + legWeight(field, path[i], square), 0) * (motion ? MOTION_PACE[motion] : 1);
        const length = still ? 0 : Math.round(steps * pace.walkStepMs);
        cues.push({ kind: "walk", fighter: walker, path, start, length, ...(motion ? { motion } : {}) });
        // A walk that takes no time lands nothing: the next thing to land is the first.
        if (length > 0) landed = start + length;
        walked.set(fighter, start + length);
    };
    /** Something flying from a character to a square, in the `flight` that `flightOf` told, landing at `land`. */
    const fly = (fighter: number, to: Square | undefined, missile: Missile, result: FlightCue["result"], land: number, flight: number, after = 0) =>
        flyFrom(at.get(fighter), to, missile, result, land, flight, after);
    /** The same from a square: a bounce flies on from where the arrow struck. */
    const flyFrom = (from: Square | undefined, to: Square | undefined, missile: Missile, result: FlightCue["result"], land: number, flight: number, after = 0) => {
        if (from === undefined || to === undefined) return;
        // A flight is drawn by how far through it is, so even one that takes no time lasts a moment.
        if (still) cues.push({ kind: "flight", missile, from, to, result, start: land, land: 1, length: 1 });
        else cues.push({ kind: "flight", missile, from, to, result, start: land - flight, land: flight, length: flight + after });
    };
    /** A burst over `at` from `start`: the 3×3 round it at `radius` 1. */
    const burst = (kind: BurstKind, at: Square | undefined, start: number, radius: 0 | 1 = 0) => {
        if (at !== undefined) cues.push({ kind: "burst", burst: kind, at, radius, start, length: BURST_MS });
    };
    /** Where the last shot struck: a Bouncing Arrow's bounce flies on from there. */
    let shotAt: Square | undefined;
    /** When a run of blows that land together — a Leap's landing, a Shove's collision — lands. */
    let together = null as { via: AbilityId; start: number } | null;

    /** Where eventLines tells a move: a broken-up one is told once, so its later segments have no caption. */
    const firstMove = firstMoveOf(events);
    /** When the last caption turned. */
    let captionStart = 0;
    for (const [index, event] of events.entries()) {
        const drawn = cues.length;
        switch (event.kind) {
            case "moved": {
                const motion = event.via && MOTION_OF[event.via];
                walk(event.fighter, event.path, motion);
                const arrived = walked.get(event.fighter) ?? landed ?? 0;
                // A Leap comes down in a cloud of dust, and everyone beside it is hit as it does (`struck`, `via`).
                if (motion === "leap" && event.path.length > 1) {
                    burst("slam", event.path.at(-1), arrived, 1);
                    together = { via: "leap", start: arrived };
                } else if (motion === "pushed") together = { via: "shove", start: arrived };
                // A move told with no path went out of the viewer's sight (§27): lost there, not left where it was last seen.
                const end = event.path.at(-1);
                if (end !== undefined) at.set(event.fighter, end);
                else at.delete(event.fighter);
                break;
            }
            case "spotted":
                text(event.fighter, beat(), "Spotted", "word");
                break;
            case "shot": {
                // The Mage's bolt, the Spitter's acid; anyone else who shoots has a bow.
                const shooter = as.get(event.fighter)?.character;
                const missile = (event.via && SHOT_VIA_MISSILE[event.via]) ?? (shooter && SHOT_MISSILE[shooter]) ?? "arrow";
                const to = at.get(event.target);
                const flight = flightOf(event.fighter, to, missile);
                const land = beat(flight);
                shotAt = to;
                // Thunder cracks where it strikes.
                if (event.via === "thunder" && event.result !== "miss") burst("thunder", to, land);
                // An overwatch shot says so as it's loosed, so the camera's pan to the watcher says why.
                if (event.reaction) say(event.fighter, land - flight, OVERWATCH_WORD);
                fly(event.fighter, to, missile, event.result, land, flight, SHOT_AFTER_MS);
                text(event.target, land, event.result === "miss" ? "Miss" : minus(event.damage), event.result,
                    { hpChange: event.result === "miss" ? 0 : -event.damage, ...(event.result === "graze" ? { label: "Graze" } : {}), from: at.get(event.fighter) });
                break;
            }
            case "struck": {
                if (event.via === "bouncingArrow") {
                    // The arrow flies on from the first target, never missing (§34.6).
                    const to = at.get(event.target);
                    const flight = still || shotAt === undefined || to === undefined ? 0 : flightMs(field, "arrow", shotAt, to);
                    const land = beat(flight);
                    flyFrom(shotAt, to, "arrow", "hit", land, flight, SHOT_AFTER_MS);
                    text(event.target, land, minus(event.damage), "hit", { hpChange: -event.damage, from: shotAt });
                    break;
                }
                if (event.via === "leap" || event.via === "shove") {
                    // Everyone a Leap lands beside, or a Shove's collision, is hit at once, as it comes down or stops.
                    if (together?.via !== event.via) together = { via: event.via, start: beat() };
                    const { start } = together;
                    landed = Math.max(landed ?? 0, start);
                    // A collision throws up dust where the pushed one stopped: the first blow of it is on them.
                    const previous = events[index - 1];
                    if (event.via === "shove" && !(previous?.kind === "struck" && previous.via === "shove")) burst("slam", at.get(event.target), start);
                    text(event.target, start, minus(event.damage), "hit", { hpChange: -event.damage, from: at.get(event.fighter) });
                    break;
                }
                const land = beat(SLASH_MS);
                const square = at.get(event.target);
                if (event.reaction) say(event.fighter, land - SLASH_MS, GUARD_WORD);
                const from = at.get(event.fighter);
                if (square !== undefined && from !== undefined) cues.push({ kind: "slash", square, striker: event.fighter, from, start: land - SLASH_MS, length: 2 * SLASH_MS });
                if (event.missed) text(event.target, land, "Miss", "miss", { hpChange: 0, from });
                else text(event.target, land, minus(event.damage), "hit", { hpChange: -event.damage, from });
                break;
            }
            case "burned":
                text(event.fighter, beat(), minus(event.damage), "hit", { mark: event.effect ?? "burning", hpChange: -event.damage });
                break;
            case "ability": {
                const when = beat();
                say(event.fighter, when, ABILITIES[event.ability]!.name);
                burst("aura", at.get(event.fighter), when);
                break;
            }
            case "hunkered":
            case "shieldWall":
                say(event.fighter, beat(), STANCE_WORD[event.kind], event.kind);
                break;
            case "watching": {
                // Every character a turn ends on watch is told at once, so they say so together.
                const fighter = as.get(event.fighter);
                const when = events[index - 1]?.kind === "watching" && landed !== null ? landed : beat();
                if (fighter) say(event.fighter, when, shoots(fighter, options) ? OVERWATCH_WORD : ON_GUARD_WORD);
                break;
            }
            case "fireball":
            case "iceBall":
            case "dynamite":
            case "thrown": {
                const item = event.kind === "thrown" ? event.item : null;
                const blast = event.kind === "thrown" ? undefined : AREA_BLAST[event.kind];
                // A draught is never thrown: it's drunk, and told as a heal.
                if (item === "healingDraught") break;
                const missile: Missile = item ?? blast!.missile;
                const flight = flightOf(event.fighter, event.at, missile);
                const land = beat(flight);
                fly(event.fighter, event.at, missile, "landed", land, flight);
                // A fireball or dynamite spreads over the 3×3, and so does a flask made to.
                const radius = item && !(ITEMS[item] as Item).area ? 0 : 1;
                burst(item ? THROWN_BURST[item] : blast!.burst, event.at, land, radius);
                landing = { start: land, targets: event.targets };
                if (event.damage > 0) event.targets.forEach(target => text(target, land, minus(areaDamage(event, target)), "hit", { hpChange: -areaDamage(event, target), from: event.at }));
                break;
            }
            case "demolished":
            case "burst": {
                // A blow at the cover, or the Bloater's splash over the 3×3
                // round it: everyone it caught is hit at once as it lands.
                let land: number, from: Square | undefined;
                if (event.kind === "demolished") {
                    land = beat(SLASH_MS);
                    from = at.get(event.fighter);
                    if (from !== undefined) cues.push({ kind: "slash", square: event.at, striker: event.fighter, from, start: land - SLASH_MS, length: 2 * SLASH_MS });
                } else {
                    land = beat();
                    from = at.get(event.fighter);
                    burst("acid", from, land, 1);
                }
                landing = { start: land, targets: event.targets };
                event.targets.forEach(target => text(target, land, minus(areaDamage(event, target)), "hit", { hpChange: -areaDamage(event, target), from }));
                break;
            }
            case "blasted":
                cues.push({ kind: "scorch", squares: event.squares, start: (landing?.start ?? 0) + Math.round(BURST_MS * SCORCH_AT), length: Math.round(BURST_MS * (1 - SCORCH_AT)) });
                break;
            case "healed":
                text(event.target, beat(), event.hp > 0 ? `+${event.hp}` : "Cured", "heal", { hpChange: event.hp });
                break;
            case "raised":
                text(event.target, beat(), `+${event.hp}`, "heal", { label: "Raised", hpChange: event.hp });
                break;
            case "downed": {
                // It stands as it was until the blow that downed it lands, then fades.
                const blow = latest.get(event.fighter);
                const fighter = as.get(event.fighter);
                const square = at.get(event.fighter);
                const land = beat();
                if (fighter && square !== undefined) cues.push({ kind: "fall", fighter: { ...fighter, square }, start: blow?.start ?? land, length: FALL_MS, arrives: walked.get(event.fighter) });
                text(event.fighter, land, "Down", "word");
                break;
            }
            case "effect": {
                const cue = latest.get(event.fighter);
                if (event.change === "cleared") {
                    if (cue?.tone === "heal" && !cue.label && cue.value !== "Cured") cue.label = "Cured";
                    break;
                }
                const { name } = EFFECTS[event.effect]!;
                if (cue && (cue.tone === "hit" || cue.tone === "graze") && !cue.label && !cue.mark) cue.label = name;
                else if (landing?.targets.includes(event.fighter)) text(event.fighter, landing.start, name, "word");
                else {
                    // A blessing on several at once — a Taunt, a Blessing — comes down on all of them together.
                    const previous = events[index - 1];
                    const when = previous?.kind === "effect" && previous.effect === event.effect && previous.change !== "cleared" && landed !== null ? landed : beat();
                    text(event.fighter, when, name, "word");
                    const glow = BUFF_BURST[event.effect];
                    if (glow) burst(glow, at.get(event.fighter), when);
                }
                break;
            }
        }
        // The caption turns to an event as the first of its cues starts, never before the last caption did, so they read in the order things happened.
        const added = cues.slice(drawn);
        if (added.length > 0 && (event.kind !== "moved" || index === firstMove)) {
            captionStart = Math.max(captionStart, Math.min(...added.map(cue => cue.start)));
            cues.push({ kind: "caption", event: index, start: captionStart, length: 0 });
        }
    }

    return closeCaptions(cues);
}

/**
 * What an action did, as the board plays it (§26.2): a timed cue for each
 * thing that happened, one after another in the order of the events, each
 * starting as the last one lands.
 *
 * A shot flies from the shooter to its target — an arrow, or the Mage's
 * bolt — and its hit text rises as it gets there: stuck in the target on a
 * hit, glancing off on a graze, flying past on a miss. How long it flies is
 * `flightMs`: the farther the target, the longer. A strike slashes
 * across its target. A fireball or a thrown flask flies to the square it was
 * aimed at and bursts there, and everyone it hit is hit at once, with the
 * effect it puts on under each number. A knock-out's "Down" follows its
 * damage, and the character it downed stands until that damage lands. Low
 * cover the burst blasted away goes as the burst fades.
 *
 * `field` is the battlefield it is played on, which says how far each flight
 * goes and how steep each leg of a walk is. `before` is everyone as the action
 * found them, which says where each cue stands: a move carries its mover
 * along, so an overwatch shot flies to where the mover had got to. A move
 * walks its told path (`WalkCue`), each leg a `legWeight` of `WALK_STEP_MS`,
 * starting as the last thing landed — so an overwatch shot
 * fired part-way through flies once the first leg has walked, at the square
 * the mover stopped on, and the rest of the move walks after the shot lands.
 * `after` is everyone as the action left them: the look of a mover who wasn't
 * in `before` because it came into sight on the way. A move told with a path
 * of fewer than two squares, or of a character in neither, plays nothing.
 * A stance, a watch and a reaction say what the character is doing, in
 * words over it ("Hunker down", "Shield wall", "Overwatch", "On guard", "Guard") — as
 * it's taken, or, for an overwatch shot or a guard's blow, as it's loosed —
 * since the view pans to them and the log is out of sight; scores play
 * nothing of their own.
 *
 * However much happened, it all fits in `PLAYBACK_MS`. An action that runs
 * over is squeezed in order, only as far as it has to be: its walks get
 * quicker, down to 70ms a step; then the gaps between one thing landing and
 * the next shorter, down to 200ms; then its text, down to 800ms. A flight is
 * never shortened. Only one that still runs over, with all that done, is
 * scaled down whole. Text that would stand on other text still showing over
 * the same character stands a line higher (`TextCue.lane`), worked out after
 * the squeezing. With `still`, every walk and flight takes no time.
 */
export function battleCues(field: Battlefield, events: readonly ToldEvent[], before: readonly Fighter[], after: readonly Fighter[] = [], options: BattleCueOptions = {}): BattleCue[] {
    const build = (pace: Pace) => timeline(field, events, before, after, options, pace);
    let pace = EASY_PACE;
    let cues = build(pace);
    for (const [key, floor] of SQUEEZES) {
        if (endOf(cues) > PLAYBACK_MS) {
            const previous = pace;
            pace = { ...previous, [key]: largestFit(floor, previous[key], ms => endOf(build({ ...previous, [key]: ms })) <= PLAYBACK_MS) };
            cues = build(pace);
        }
    }
    // Every cue is told, so each text can find the others over its fighter; lane only the one that plays.
    laneTexts(cues);
    const end = endOf(cues);
    // Squeezed as far as it goes and still too long: scaling keeps what overlaps.
    return end <= PLAYBACK_MS ? cues : closeCaptions(cues.map(cue => scaled(cue, PLAYBACK_MS / end)));
}

/**
 * How long a review rests after the board says a step's (or part's) cues have
 * played, before the view moves on to the next: a beat to take the last of it
 * in. The page waits for the board to say it has played; it doesn't guess.
 */
export const STEP_BEAT_MS = 500;
/**
 * How long a review step or part with nothing to play rests, in place of
 * waiting for the board: a move that walks nowhere, or a step that happened
 * out of sight, still gives the view's glide to it time to land.
 */
export const STEP_MIN_MS = 1200;

/** The part of a board a review's cues and its follow-zoom read as it stood before a step or part. */
export type BoardBefore = Pick<RealmArenaPartState, "fighters" | "blasted">;

/** One stretch of a review step, played on its own (§26.2): the whole of an ordinary step, or one part of a co-op End turn. */
export interface ReviewPart {
    /** What it told, which `moveFrame` frames a move by. */
    events: readonly ToldEvent[];
    /** Which part of a co-op End turn it is; absent on an ordinary step. */
    kind?: IRealmArenaStepPart["kind"];
    /** The battlefield it is played and drawn on: the map with what was blasted before it cleared. */
    field: Battlefield;
    /** What the board plays for it. */
    cues: BattleCue[];
    /** The board as the part found it: where its cues stand, and what the follow-zoom compares against. */
    before: BoardBefore;
    /** The board after it, drawn in place of the snapshot's; absent on the last part, whose board is the snapshot's own. */
    state?: RealmArenaPartState;
}

/**
 * The parts a review plays a step in, one after another. A step with no parts
 * of its own is a single one, so a caller needn't tell the two apart. Each
 * part starts from the board the one before it left (the step's own start for
 * the first), which is how its cues find where everyone stood. `after` is the
 * board the step's last part leaves, which the others carry in `state`: what
 * a move into sight is drawn as, and the end of the move a review frames.
 * `mapId` is the map it is fought on: each part is played on it as the part
 * found it, with what had been blasted by then cleared (`ReviewPart.field`),
 * which times its flights and walks (`battleCues`). `options` is how each part's cues are built:
 * `still` for a player who sees no walk or flight.
 */
export function reviewParts(mapId: string, outcome: IRealmArenaStepOutcome | undefined, before: BoardBefore, after: readonly Fighter[] = [], options: BattleCueOptions = {}): ReviewPart[] {
    const told: (Omit<IRealmArenaStepPart, "kind"> & Partial<Pick<IRealmArenaStepPart, "kind">>)[] = outcome?.parts?.length ? outcome.parts : [{ events: outcome?.events ?? [] }];
    let from = before;
    return told.map(part => {
        const field = battlefieldOf(mapId, from.blasted);
        const cues = battleCues(field, part.events, from.fighters, part.state?.fighters ?? after, options);
        const played: ReviewPart = { kind: part.kind, events: part.events, field, cues, before: from, state: part.state };
        if (part.state) from = { fighters: part.state.fighters, blasted: part.state.blasted };
        return played;
    });
}

/**
 * Whether a review step or part, as it's shown, happened somewhere the board
 * can't point to (§26.2): it is followed — not the turn handing on, which
 * moves everyone's AP and no one in particular — something was told of it
 * other than a score (points are bookkeeping, not an action somewhere), and
 * none of it can be placed on the viewer's board: no move to frame, no
 * character it changed, no cue to play. In fog of war that is an enemy's
 * action out of sight that still cost something the viewer was told of. A
 * step that touched squares spread wide is placed — just wide — so it isn't one.
 * `after` is the board the part left, as `actionSquares` reads it.
 */
export function isUnplaced(part: Pick<ReviewPart, "events" | "cues" | "before">, after: readonly Fighter[], followed: boolean): boolean {
    if (!followed || part.cues.length > 0 || !part.events.some(event => event.kind !== "scored")) return false;
    return !moveFrame(part.events, part.before.fighters, after) && actionSquares(part.before.fighters, after).length === 0;
}

/**
 * Whether the view follows a part of a step: everything but the turn handing
 * on, which moves everyone's AP and no one in particular. A part of a co-op
 * End turn says which it is (`kind`); a step with no parts is the hand-off
 * when the turn went to someone else (`handedOn`).
 */
export function isFollowedPart(part: Pick<ReviewPart, "kind">, handedOn: boolean): boolean {
    return part.kind ? part.kind !== "handOff" : !handedOn;
}

/**
 * Where the view goes for a part of a step, in a review or as the viewer's own
 * End turn plays live: the part's action when it is followed and can be
 * pointed to, else the viewer's own side (`friendly`), just fit. `after` is
 * the board the part left; `key` is the part's own, so the view glides again
 * for each.
 */
export function partFollow(part: Pick<ReviewPart, "kind" | "events" | "before" | "field">, after: readonly Fighter[], friendly: Square[], handedOn: boolean, key: string, still = false): ActionFollow | null {
    return (isFollowedPart(part, handedOn) ? actionFollow(part.field, part.events, part.before.fighters, after, key, still) : null)
        ?? (friendly.length > 0 ? { squares: friendly, key, exact: true } : null);
}

/** A battle's state with what one part of a step left in place of the snapshot's own (every field of it, so one the part leaves out — an enemy not yet seen — is left out). */
export function withPartState<T extends RealmArenaPartState>(state: T, part: RealmArenaPartState | undefined): T {
    if (!part) return state;
    const { fighters, ghosts, clouds, blasted, scores, enemy } = part;
    return { ...state, fighters, ghosts, clouds, blasted, scores, enemy };
}

/**
 * What the review dock says of the part of a step it is playing, for a step
 * with more than one: the player's own End turn, each of the warband's actions
 * it was told of ("the Renegades' action 2 of 5"), and the turn passing on.
 * Read from each part's kind, not its place: in fog of war a part the viewer
 * was told nothing of is left out, so the first or last may be the enemy's.
 */
export function partLabel(parts: readonly Pick<ReviewPart, "kind">[], index: number, enemyName: string): string | undefined {
    const kind = parts[index]?.kind;
    if (kind === "ended") return "ending the turn";
    if (kind === "handOff") return "the turn passes on";
    if (kind !== "enemy") return undefined;
    const actions = parts.filter(part => part.kind === "enemy").length;
    const nth = parts.slice(0, index + 1).filter(part => part.kind === "enemy").length;
    return `${possessive(enemyName)} action ${nth} of ${actions}`;
}

// ─── An HP bar through an action (§26.1) ────────────────────────────────────

/** How long an HP bar's fill takes to move to a new value, and how long the pale chip of what it lost then takes to drain. */
export const HP_TWEEN_MS = 250;
export const HP_CHIP_MS = 300;

/** The HP an action's cue took a fighter to as it lands (`to`), `at` ms into the playback. */
export interface HpStep {
    at: number;
    to: number;
}

/**
 * What an action being played tells of one fighter whose bar, marks or item it
 * changes: the fighter as the action found it (`before`), the HP its blows and
 * heals take it through, when its first cue lands (`marksAt`, when its marks
 * stop being `before`'s), how long its fill takes to move and its chip to
 * drain (`tweenMs` and `chipMs`, both 0 with reduced motion, when the bar
 * jumps and leaves no chip), the knocks it takes and the lunges it makes
 * (`shoves`, none with reduced motion), and when the last of it is over
 * (`until`). A striker whose own bar and marks don't change is told all the
 * same, for its lunge.
 */
export interface Told {
    before: Fighter;
    steps: readonly HpStep[];
    marksAt: number;
    tweenMs: number;
    chipMs: number;
    shoves: readonly Shove[];
    until: number;
}

/**
 * What the action being played tells of `fighter`, or null if it changes
 * nothing a figure draws — it has no cue on it, it wasn't there when the action
 * started, it's down (no bar, no marks) or it ends as it began, and doesn't
 * strike either. Each of its HP cues steps its bar by the cue's `hpChange`, and
 * the last ends it on its real HP, so the bar is right even if the cues' sums
 * aren't. With `still` the bar jumps at its cue, no chip drains and nothing is
 * knocked or lunged.
 */
export function toldOf(cues: readonly BattleCue[], before: Fighter | undefined, fighter: Fighter, still: boolean): Told | null {
    if (!before || !isStanding(fighter)) return null;
    const texts = cues.filter((cue): cue is TextCue => cue.kind === "text" && cue.fighter === fighter.id);
    const shoves = shovesOf(cues, fighter.id, still);
    if (texts.length === 0 && shoves.length === 0) return null;
    const max = maxHpOf(fighter);
    const blows = texts.filter(cue => cue.hpChange !== undefined).sort((a, b) => a.start - b.start);
    let level = before.hp;
    const steps = blows.map((cue, index): HpStep => {
        level = Math.min(max, Math.max(0, level + (cue.hpChange ?? 0)));
        return { at: cue.start, to: index === blows.length - 1 ? fighter.hp : level };
    });
    const marksDiffer = effectsOn(before).join() !== effectsOn(fighter).join() || before.banked !== fighter.banked || before.item !== fighter.item;
    if (!marksDiffer && steps.every(step => step.to === before.hp) && shoves.length === 0) return null;
    const marksAt = texts.length > 0 ? Math.min(...texts.map(cue => cue.start)) : 0;
    const tweenMs = still ? 0 : HP_TWEEN_MS, chipMs = still ? 0 : HP_CHIP_MS;
    const last = steps[steps.length - 1];
    const until = Math.max(marksAt, last ? last.at + tweenMs + chipMs : 0, endOf(shoves));
    return { before, steps, marksAt, tweenMs, chipMs, shoves, until };
}

/**
 * Where a value that starts at `from` and moves to each of `steps` is `ms` into
 * the playback: each step begins `delay` after its cue and takes `tween` to get
 * there, from wherever the one before had got to — so a second blow landing
 * mid-tween carries on from there rather than jumping. With no `tween` it
 * jumps.
 */
export function stepped(from: number, steps: readonly HpStep[], delay: number, tween: number, ms: number): number {
    let value = from;
    for (const [index, step] of steps.entries()) {
        const begins = step.at + delay;
        if (ms < begins) break;
        // A step is only carried as far as the next one's cue, once that has landed.
        const next = steps[index + 1];
        const time = next && ms >= next.at + delay ? next.at + delay : ms;
        const across = tween > 0 ? Math.min(1, (time - begins) / tween) : 1;
        value += (step.to - value) * across;
    }
    return value;
}

/**
 * A fighter `ms` into the playback as its figure shows it: its bar at the HP
 * its cues have taken it to — the fill tweened to it, and with the pale chip of
 * what it lost draining after — and its marks and item as the action found them
 * until its first cue lands. With reduced motion the bar jumps at its cue.
 */
export function toldAt({ before, steps, marksAt, tweenMs, chipMs }: Told, fighter: Fighter, ms: number): { drawn: Fighter; chip: number | undefined } {
    const marks = ms >= marksAt ? fighter : before;
    const fill = steps.length > 0 ? stepped(before.hp, steps, 0, tweenMs, ms) : fighter.hp;
    const chip = chipMs === 0 || steps.length === 0 ? undefined : stepped(before.hp, steps, tweenMs, chipMs, ms);
    return { drawn: { ...fighter, hp: fill, effects: marks.effects, banked: marks.banked, item: marks.item }, chip };
}

// ─── A walk on screen (§5, walk pace and motion) ────────────────────────────

/**
 * The least a leg of a walk counts for when its length is shared out, so a
 * walk of legs that measure nothing — squares drawn on top of each other —
 * still divides rather than dividing by nothing.
 */
const MIN_LEG_LENGTH = 0.01;
/** How far a walker's feet leave the ground at the top of a step up or down, in board units: it hops a change of height rather than sliding up it. */
export const WALK_HOP = 3;
/** How far a walker rises at the middle of every step, in board units: the bob of someone on foot. */
export const WALK_BOB = 0.6;
/** How high a Leap's arc rises at its middle, in board units, above the line between where it left and where it lands. */
export const LEAP_LIFT = 14;

/** Where a walker is on its way: the square it is leaving, the one it is heading for and how far over the leg between their middles it has got. */
export interface WalkerLeg {
    from: Square;
    to: Square;
    across: number;
    /** How it goes, when not on foot (`WalkCue.motion`). */
    motion?: WalkMotion;
}

/**
 * How far along a walk — as a share of the whole of it — someone has got a
 * share `time` of the way through it: speeding up over the first leg's share
 * of the time, slowing down over the last leg's, and steady between. A walk of
 * one or two legs has no steady part, and is a plain ease in and out. The
 * position is continuous where the speed changes, and gets to 1 at 1.
 */
export function walkEase(time: number, first: number, last: number): number {
    const t = Math.min(1, Math.max(0, time));
    const rampIn = Math.min(0.5, first), rampOut = Math.min(0.5, last);
    const speed = 1 / (1 - (rampIn + rampOut) / 2);
    if (t < rampIn) return speed * t * t / (2 * rampIn);
    if (t > 1 - rampOut) return 1 - speed * (1 - t) * (1 - t) / (2 * rampOut);
    return speed * (rampIn / 2 + t - rampIn);
}

/**
 * Every square of a character's walks, one after another: each walk's path in
 * order, and where one walk ends on the square the next starts from, that
 * square twice. A square's place in this list is its depth slot on the board
 * (`walkerAt`'s `at`), so a walker is hidden by whatever stands in front of the
 * square it is crossing.
 */
export function walkSquares(walks: readonly WalkCue[]): Square[] {
    return walks.flatMap(walk => walk.path);
}

/**
 * Where a character walking `walks` (its own, in order) is `ms` into the
 * playback: the square of its path it is leaving, the one it is heading for,
 * and how far over the way between them it has got — or null once its last
 * walk is over. A walk's `length` is shared out over its legs by how long each
 * is (`legLength`, on screen), so it moves at an even pace whatever the legs'
 * lengths, easing in over the first leg and out over the last (`walkEase`).
 * Before a walk starts it stands where the path begins; between two it stands
 * where the first left off. `at` is the place in `walkSquares(walks)` of the
 * square it is nearest: the one it is leaving for the first half of a leg, and
 * the one it is heading for from the middle on.
 */
export function walkerAt(walks: readonly WalkCue[], ms: number, legLength: (from: Square, to: Square) => number): (WalkerLeg & { at: number }) | null {
    const last = walks[walks.length - 1];
    if (ms >= last.start + last.length) return null;
    let walk = walks[0], first = 0, before = 0;
    for (const one of walks) {
        if (ms >= one.start) { walk = one; first = before; }
        before += one.path.length;
    }
    const { path } = walk;
    const motion = walk.motion ? { motion: walk.motion } : {};
    if (path.length < 2) return { from: path[0], to: path[0], across: 0, at: first, ...motion };
    const lengths = path.slice(1).map((square, leg) => Math.max(MIN_LEG_LENGTH, legLength(path[leg], square)));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const time = (ms - walk.start) / Math.max(1, walk.length);
    const gone = walkEase(time, lengths[0] / total, lengths[lengths.length - 1] / total) * total;
    let leg = 0, passed = 0;
    while (leg < lengths.length - 1 && gone >= passed + lengths[leg]) passed += lengths[leg++];
    const across = Math.min(1, Math.max(0, (gone - passed) / lengths[leg]));
    return { from: path[leg], to: path[leg + 1], across, at: first + (across < 0.5 ? leg : leg + 1), ...motion };
}

/** Where on the ground over a leg a walker is (board units): between the centres of its two squares, as far over as it has got — without the bob or the hop (`walkLift`). */
export function legPoint(view: IsoView, { from, to, across }: WalkerLeg): Point {
    const a = isoCentre(view, from), b = isoCentre(view, to);
    return { x: a.x + (b.x - a.x) * across, y: a.y + (b.y - a.y) * across };
}

/**
 * The point on the ground under a walker `ms` into the playback (`walkerAt`,
 * by the view's lengths; `legPoint`): once its last walk is over, the centre
 * of the last square of the last walk's path, and before the first starts the
 * centre of that path's first. `walks` is never empty, as `walkerAt` assumes.
 */
export function walkerGroundAt(walks: readonly WalkCue[], view: IsoView, ms: number): Point {
    const leg = walkerAt(walks, ms, legLengthOn(view));
    return leg ? legPoint(view, leg) : isoCentre(view, walks[walks.length - 1].path.at(-1)!);
}

/**
 * How far either side of the moment a camera following a walker looks at
 * where it is (`walkCameraAt`). A path over the grid zig-zags — a straight step
 * and a diagonal one go different ways on screen — and a camera locked to the
 * walker would jerk the whole board round every corner, nine times a second;
 * averaged over a sixth of a second either side, it glides along the way the
 * walker is going instead, and the walker weaves a little about the middle
 * of the frame, as it would on a board standing still.
 */
const CAMERA_EASE_MS = 160;
/** How many moments, either side of the one it's at, `walkCameraAt` averages. */
const CAMERA_SAMPLES = 4;

/**
 * Where on the board a camera following a walker keeps in the middle, `ms`
 * into the playback: where the walker is on the ground (`walkerGroundAt`),
 * averaged over up to `CAMERA_EASE_MS` either side, the moments nearest
 * weighing most. On a stretch walked straight and steadily that is where the
 * walker is; round a corner it cuts inside. Towards either end of the walk it
 * looks less far either side, so it is exactly where the walk starts as it
 * starts and where it ends as it ends — no lag to make up once it has stopped.
 */
export function walkCameraAt(walks: readonly WalkCue[], view: IsoView, ms: number): Point {
    const reach = Math.min(CAMERA_EASE_MS, Math.max(0, Math.min(ms - walks[0].start, endOf(walks) - ms)));
    let x = 0, y = 0, weights = 0;
    for (let k = -CAMERA_SAMPLES; k <= CAMERA_SAMPLES; k++) {
        const weight = CAMERA_SAMPLES + 1 - Math.abs(k);
        const at = walkerGroundAt(walks, view, ms + k * reach / CAMERA_SAMPLES);
        x += at.x * weight;
        y += at.y * weight;
        weights += weight;
    }
    return { x: x / weights, y: y / weights };
}

/**
 * How far a walker is lifted off the ground over a leg (board units, up
 * negative): the bob of every step, and over a leg whose two ends stand at
 * different heights (`heightOf`) a hop on top of it, both peaking mid-way and
 * back on the ground at either end. A Leap is one arc, `LEAP_LIFT` high; one
 * pushed or pulled takes no step, so it doesn't bob.
 */
export function walkLift({ from, to, across, motion }: WalkerLeg, heightOf: (square: Square) => number): number {
    if (motion === "leap") return -LEAP_LIFT * Math.sin(Math.PI * across);
    const hop = heightOf(from) !== heightOf(to) ? WALK_HOP : 0;
    const bob = motion === "pushed" || motion === "pulled" ? 0 : WALK_BOB;
    return -(hop + bob) * Math.sin(Math.PI * across);
}

/** Which way a walker faces over a leg: the way it goes, or — pushed back by a Shove — the way it was pushed from, staggering backwards. */
export function walkFacing(field: Battlefield, { from, to, motion }: Pick<WalkerLeg, "from" | "to" | "motion">): Facing {
    return motion === "pushed" ? facingTowards(field, to, from) : facingTowards(field, from, to);
}

// ─── Impact (§5) ────────────────────────────────────────────────────────────

/** How long a blow's knock on its target takes to go and come back. */
export const IMPACT_MS = 120;
/** How long the hit text of a blow that lands (a hit or a graze) takes to pop as it appears, from its cue's start. */
export const POP_MS = 120;
/** How far a blow knocks its target off its square, in board units, away from where it came from. */
export const KNOCK = 1.5;
/** How far a melee striker lunges at its target through its slash, in board units. */
export const LUNGE = 2.5;
/** How long the whole battlefield shakes as a fireball, dynamite or a thunder flask lands. */
export const SHAKE_MS = 150;
/** How far the battlefield is shaken at the start of it, in board units: it dies away to nothing. */
export const SHAKE = 2;
/** How many times the shake swings to and fro over its length. */
const SHAKE_SWINGS = 2;
/** The missiles whose landing shakes the battlefield: the ones that explode. */
const SHAKING_MISSILES: ReadonlySet<Missile> = new Set<Missile>(["fireball", "thunderFlask", "dynamite", "iceShard", "lightning"]);

/**
 * A figure pushed off its square and back over a stretch of the playback: the
 * way from `from` to `to` is the way it goes, `reach` board units out at the
 * middle of it. A target is knocked from where its blow came from to where it
 * stands; a striker lunges from where it stands to where it strikes.
 */
export interface Shove extends Timed {
    from: Square;
    to: Square;
    reach: number;
}

/**
 * Every push the action being played gives fighter `id`: the knock of each
 * blow that takes HP off it — a text cue with a `from` and a negative
 * `hpChange` — over `IMPACT_MS` from the moment it lands, and the lunge of
 * each melee strike it makes, over the whole slash. None with reduced motion.
 */
export function shovesOf(cues: readonly BattleCue[], id: number, still: boolean): Shove[] {
    if (still) return [];
    return cues.flatMap((cue): Shove[] => {
        if (cue.kind === "text" && cue.fighter === id && cue.from !== undefined && (cue.hpChange ?? 0) < 0) {
            return [{ start: cue.start, length: IMPACT_MS, from: cue.from, to: cue.square, reach: KNOCK }];
        }
        if (cue.kind === "slash" && cue.striker === id) return [{ start: cue.start, length: cue.length, from: cue.from, to: cue.square, reach: LUNGE }];
        return [];
    });
}

/**
 * How far off its square a figure is pushed `ms` into the playback, as a
 * board offset: out along the way of each push and back, peaking mid-way, and
 * nothing outside its window. `project` says where a square is on screen,
 * which is why the way depends on how the view is turned; a push between two
 * squares drawn on the same spot goes straight up.
 */
export function shoveAt(shoves: readonly Shove[], ms: number, project: (square: Square) => Point): Point {
    let x = 0, y = 0;
    for (const { start, length, from, to, reach } of shoves) {
        const across = (ms - start) / Math.max(1, length);
        if (across < 0 || across > 1) continue;
        const a = project(from), b = project(to);
        const dx = b.x - a.x, dy = b.y - a.y, away = Math.hypot(dx, dy);
        const push = reach * Math.sin(Math.PI * across);
        x += away > 0 ? dx / away * push : 0;
        y += away > 0 ? dy / away * push : -push;
    }
    return { x, y };
}

/** When each shake of the battlefield is: `SHAKE_MS` from the moment each missile that explodes lands. */
export function shakesOf(cues: readonly BattleCue[]): Timed[] {
    return cues.flatMap((cue): Timed[] => cue.kind === "flight" && SHAKING_MISSILES.has(cue.missile) ? [{ start: cue.start + cue.land, length: SHAKE_MS }]
        // A Leap coming down, or a Shove's collision, lands with a thud.
        : cue.kind === "burst" && cue.burst === "slam" ? [{ start: cue.start, length: SHAKE_MS }] : []);
}

/**
 * How far the whole battlefield is shaken `ms` into the playback, as a board
 * offset: a quick wobble as a fireball or a thunder flask lands (`start +
 * land` of its flight, `shakesOf`), swinging `SHAKE_SWINGS` times and dying away to
 * nothing over `SHAKE_MS`. Still outside any shake.
 */
export function shakeAt(cues: readonly BattleCue[], ms: number): Point {
    let x = 0, y = 0;
    for (const { start, length } of shakesOf(cues)) {
        const across = (ms - start) / length;
        if (across < 0 || across >= 1) continue;
        const swing = SHAKE * (1 - across) * Math.sin(2 * Math.PI * SHAKE_SWINGS * across);
        x += swing;
        // Quicker and shallower up and down, so it rattles rather than slides.
        y += swing * 0.5 * Math.cos(2 * Math.PI * SHAKE_SWINGS * across * 1.5);
    }
    return { x, y };
}

// ─── Flights and keyframes on the clock (§4) ────────────────────────────────

/** Where on a square the visuals go: its ground, the middle of a figure standing there, and the top of that figure. */
export interface FxPoints {
    ground: Point;
    body: Point;
    head: Point;
}

/** Where the visuals go on a square whose ground is at `ground`: a figure's disc (`FIGURE_RISE` over it), and the top of that disc. */
export function fxPointsAt(ground: Point): FxPoints {
    const body = { x: ground.x, y: ground.y - FIGURE_RISE };
    return { ground, body, head: { x: body.x, y: body.y - FIGURE_RADIUS } };
}

/**
 * How high each missile's arc rises (§26.1), as a share of how far it goes (up
 * to `MAX_ARC`): an arrow on a shallow arc, a bolt in a straight line, a gobbet
 * of acid on a lob, a fireball or a throw on a high one.
 */
export const FLIGHT_ARC: Readonly<Record<Missile, number>> = {
    arrow: 0.1,
    bolt: 0,
    fireball: 0.3,
    fireFlask: 0.3,
    thunderFlask: 0.3,
    smokePot: 0.3,
    acid: 0.2,
    dynamite: 0.3,
    poisonArrow: 0.1,
    iceShard: 0.25,
    lightning: 0,
};
/**
 * How each missile is drawn (§26.1), in board units: how big it is. A flask, a
 * pot or a stick of dynamite tumbles end over end; anything else points the way
 * it goes. (How high its arc rises is `FLIGHT_ARC`, with the rest of where it is.)
 */
export const FLIGHT: Readonly<Record<Missile, { size: number; tumbles?: true }>> = {
    arrow: { size: 12 },
    bolt: { size: 10 },
    fireball: { size: 14 },
    fireFlask: { size: 7, tumbles: true },
    thunderFlask: { size: 7, tumbles: true },
    smokePot: { size: 7, tumbles: true },
    acid: { size: 10 },
    dynamite: { size: 9, tumbles: true },
    poisonArrow: { size: 12 },
    iceShard: { size: 12 },
    lightning: { size: 14 },
};
/** How fast a flask or a pot turns over, in degrees a millisecond. */
export const TUMBLE = 0.9;
/**
 * The highest any arc peaks above the straight line, in board units: three
 * squares' depth on screen. Without it a lob across the map would rise by a
 * share of the whole map, out of a close frame.
 */
const MAX_ARC = 3 * 2 * ISO_HALF_HEIGHT;
/** How far a graze turns a shot, in degrees, and how fast it glances on, as a share of the speed it flew at. */
const GLANCE_TURN = 40;
const GLANCE_RUN = 0.5;
/** How far over the head a miss goes, so it flies past the figure rather than through it, in board units. */
const MISS_CLEAR = 3;
/** How much bigger a bolt flares where it hits as it fades. */
const BOLT_FLARE = 1.5;

/** A missile at one moment: where it is, which way it points in degrees, how clearly it is seen and how big it is drawn. */
export interface FlightFrame {
    point: Point;
    heading: number;
    opacity: number;
    scale: number;
}

/** A point `u` along the curve from `a` through `c` to `b`, and the way it's heading there in degrees — carried on past `b` for `u` over 1. */
function along(a: Point, c: Point, b: Point, u: number): { point: Point; heading: number } {
    const v = 1 - u;
    const point = { x: v * v * a.x + 2 * u * v * c.x + u * u * b.x, y: v * v * a.y + 2 * u * v * c.y + u * u * b.y };
    const dx = 2 * v * (c.x - a.x) + 2 * u * (b.x - c.x), dy = 2 * v * (c.y - a.y) + 2 * u * (b.y - c.y);
    return { point, heading: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** How much of a shot is left once it's there, `ms` into its cue: all of it as it arrives, none by the end of the cue. */
function fade(ms: number, cue: FlightCue): number {
    return Math.max(0, 1 - (ms - cue.land) / Math.max(1, cue.length - cue.land));
}

/**
 * Where a missile is `ms` into the playback, which way it points and how
 * clearly it's seen, or null before its cue starts and once it is gone. It
 * flies an arc from `from` to its target (`at` says where a square's ground,
 * body and head are), and then, with time left: an arrow stays stuck there and
 * fades; a bolt flares and fades; a graze glances off, turned upward; and a
 * miss, aimed just over the head, flies on past and comes down beyond. A shot
 * that landed on the ground (a throw) ends at the target square's ground.
 */
export function flightAt(cue: FlightCue, at: (square: Square) => FxPoints, ms: number): FlightFrame | null {
    const into = ms - cue.start;
    if (into < 0 || into > cue.length) return null;
    const from = at(cue.from).body;
    const target = at(cue.to);
    const to = cue.result === "landed" ? target.ground
        : cue.result === "miss" ? { x: target.head.x, y: target.head.y - MISS_CLEAR }
        : target.body;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    // A quadratic arc peaks at half the control point's rise.
    const rise = 2 * Math.min(FLIGHT_ARC[cue.missile] * distance, MAX_ARC);
    const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - rise };
    const flying = into <= cue.land;
    const u = into / cue.land;
    if (flying || cue.result === "miss") {
        const { point, heading } = along(from, control, to, u);
        return { point, heading, opacity: flying ? 1 : fade(into, cue), scale: 1 };
    }
    const end = along(from, control, to, 1);
    const after = fade(into, cue);
    if (cue.result === "graze") {
        // Turned up, whichever way it was going.
        const heading = end.heading + (Math.cos(end.heading * Math.PI / 180) >= 0 ? -GLANCE_TURN : GLANCE_TURN);
        const run = GLANCE_RUN * (u - 1) * distance;
        const turned = heading * Math.PI / 180;
        return { point: { x: end.point.x + run * Math.cos(turned), y: end.point.y + run * Math.sin(turned) }, heading, opacity: after, scale: 1 };
    }
    return { ...end, opacity: after, scale: cue.missile === "bolt" ? 1 + BOLT_FLARE * (1 - after) : 1 };
}

/**
 * CSS's `ease-out` — the curve `cubic-bezier(0, 0, 0.58, 1)` — at `t` of the
 * way through an interval, found by bisection on the curve's x. It starts at
 * full speed and settles, which is how the hit text, the burst and the slash
 * have always moved between their keyframes.
 */
function easeOut(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const x = (s: number) => 3 * (1 - s) * s * s * 0.58 + s * s * s;
    let low = 0, high = 1;
    for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2;
        if (x(middle) < t) low = middle; else high = middle;
    }
    const s = (low + high) / 2;
    return 3 * (1 - s) * s * s + s * s * s;
}

/** One stop of a keyframed value: `at` is how far through the cue it is, 0 to 1. */
type Keyframe = readonly [at: number, value: number];

/**
 * A value `progress` of the way through a cue, between keyframes listed in
 * order of `at`: eased out over each pair, as a CSS animation with `ease-out`
 * eases between the stops it names, and held at the first before it and at the
 * last after it.
 */
function keyframed(frames: readonly Keyframe[], progress: number): number {
    const next = frames.findIndex(([at]) => progress < at);
    if (next === 0) return frames[0][1];
    if (next < 0) return frames[frames.length - 1][1];
    const [fromAt, from] = frames[next - 1], [toAt, to] = frames[next];
    return from + (to - from) * easeOut((progress - fromAt) / (toAt - fromAt));
}

/** How far through its cue the playback is `ms` in: 0 before it starts, 1 once it is over. A cue of no length counts as one of a millisecond. */
export function progressOf(cue: Timed, ms: number): number {
    return Math.min(1, Math.max(0, (ms - cue.start) / Math.max(1, cue.length)));
}

/** What is left of something that goes during its cue (cover blasted, a downed figure's standing pose): all of it before, none after, going slowly at first. */
export function fadeOutAt(cue: Timed, ms: number): number {
    const progress = progressOf(cue, ms);
    return 1 - progress * progress;
}

/**
 * How much of something that appears during its cue is there (a downed figure
 * lying where it fell), or null before the cue starts, when it isn't drawn at
 * all. Quicker at first than `fadeOutAt` is slower, so it and the standing pose
 * it replaces never leave a gap to see through.
 */
export function fadeInAt(cue: Timed, ms: number): number | null {
    if (ms < cue.start) return null;
    const left = 1 - progressOf(cue, ms);
    return 1 - left * left;
}

/** The hit text, in board units: the number's middle above the point it's hung from, the label under it, and a mark beside the number. */
export const HIT_VALUE_RISE = 4;
export const HIT_LABEL_DROP = 3.6;
export const HIT_MARK_SIZE = 3.4;
/**
 * The room between the end of the big text and the mark beside it, in board
 * units: clear of the text's outline (half its 1.3 stroke) with a little air.
 * The mark goes after the text as it is drawn, so a word — "Hunker down" — is
 * cleared as surely as a number.
 */
export const HIT_MARK_GAP = 1.2;
/**
 * How much higher each lane of hit text stands (`TextCue.lane`): clear of the
 * number and the label under it on the lane below, with room for that one to
 * rise as it fades.
 */
export const HIT_LANE_RISE = 9;
/** A strike's slash, across the figure it lands on, in board units. */
export const SLASH_SIZE = 14;
/** A puff of a smoke pot's cloud: a square across, in board units, its foot just in front of the square's middle. */
export const SMOKE_SIZE = 2 * ISO_HALF_WIDTH;

/** How hit text rises, in board units (down positive): settling in from just below, then floating away. */
const HIT_SETTLE = 1.5;
const HIT_LIFT = -6;
/** How much bigger the hit text of a blow that lands starts, before it pops down to its size. */
const POP_SCALE = 1.25;

/** Hit text at one moment: how clearly it is seen, how far it has risen from where it is drawn (down positive, board units) and how big it is. */
export interface HitTextFrame {
    opacity: number;
    rise: number;
    scale: number;
}

/**
 * Hit text `ms` into the playback: in over the first 15% of its cue and out
 * over the last 35%, rising from just below its place to six units above it;
 * and, for a hit or a graze, popping from 1.25 times its size down to its own
 * over `POP_MS` from the cue's start. With `still` it doesn't rise or pop: it
 * appears where it happened, and fades. Unseen before and after.
 */
export function hitTextAt(cue: TextCue, ms: number, still: boolean): HitTextFrame {
    const progress = progressOf(cue, ms);
    const pops = !still && (cue.tone === "hit" || cue.tone === "graze");
    return {
        opacity: keyframed([[0, 0], [0.15, 1], [0.65, 1], [1, 0]], progress),
        rise: still ? 0 : keyframed([[0, HIT_SETTLE], [0.15, 0], [1, HIT_LIFT]], progress),
        scale: pops ? keyframed([[0, POP_SCALE], [1, 1]], progressOf({ start: cue.start, length: POP_MS }, ms)) : 1,
    };
}

/** A burst at one moment: how clearly it is seen and how big it is, as a share of its full size. */
export interface BurstFrame {
    opacity: number;
    scale: number;
}

/** A burst `ms` into the playback: flaring up from a third of its size to its full size over the first fifth, then fading as it swells a little. Unseen before and after. */
export function burstAt(cue: Timed, ms: number): BurstFrame {
    const progress = progressOf(cue, ms);
    return {
        opacity: keyframed([[0, 0], [0.2, 1], [0.6, 0.85], [1, 0]], progress),
        scale: keyframed([[0, 0.35], [0.2, 1], [1, 1.08]], progress),
    };
}

/** A slash at one moment: how clearly it is seen, how big it is and how far it has moved from the middle of its target (board units). */
export interface SlashFrame {
    opacity: number;
    scale: number;
    dx: number;
    dy: number;
}

/** A slash `ms` into the playback: wiped across its target from the upper right to the lower left, fading in over the first 30% and out after. Unseen before and after. */
export function slashAt(cue: Timed, ms: number): SlashFrame {
    const progress = progressOf(cue, ms);
    return {
        opacity: keyframed([[0, 0], [0.3, 1], [1, 0]], progress),
        scale: keyframed([[0, 0.7], [1, 1.05]], progress),
        dx: keyframed([[0, 2], [1, -2]], progress),
        dy: keyframed([[0, -2], [1, 2]], progress),
    };
}
