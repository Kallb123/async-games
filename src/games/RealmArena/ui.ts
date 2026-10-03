// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import type { Rect } from "@/utils/ui/mapLabels";
import { capitalise, pluralize } from "@/utils/ui/text";
import type { Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, TERRAIN, type Battlefield, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { CHARACTERS, EFFECT_IDS, EFFECTS, ITEMS, type AbilityId, type CharacterId, type EffectId, type Item, type Weapon } from "./characters";
import { EFFECT_ART, ITEM_ART, type BurstKind, type Missile, type Sprite, type ThrownItem } from "./art";
import { ACTION_POINTS, check, fighterById, hasEffect, inRange, isStanding, moveAp, nextTo, reachOf, reactionsTo, shotOdds, weaponReaches, type BattleEvent, type BattleState, type Fighter, type MusterPick, type ShotOdds, type ShotResult, type ToldEvent } from "./rules";

/**
 * The placeholder figure each character stands as until PR 9's marked figures
 * (docs/games/realm-arena.md §17.3): one glyph, drawn on a disc in its owner's
 * colour, so two of the six never read alike at a glance.
 */
export const CHARACTER_MARK: Readonly<Record<CharacterId, string>> = {
    manAtArms: "🗡️",
    knight: "🛡️",
    archer: "🏹",
    scout: "👟",
    mage: "🔥",
    cleric: "✚",
};

const LETTER_OF = new Map<Terrain, TerrainLetter>(
    (Object.entries(TERRAIN) as [TerrainLetter, Terrain][]).map(([letter, terrain]) => [terrain, letter]),
);

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
    const { x, y, width, height } = areaRect(field, squares);
    return { x: x - FOCUS_REACH, y: y - FOCUS_REACH, width: width + FOCUS_REACH * 2, height: height + FOCUS_REACH * 2 };
}

/**
 * How much of a selected character's reach the view keeps in frame, measured
 * out from where it stands in each direction. At full AP a reach runs most of
 * the board's width, so all of it would be the fitted board again; two thirds
 * of it each way still shows the bulk of where it could go — the squares near
 * enough to plan around — at a zoom a square can be tapped at.
 */
const REACH_SHOWN = 2 / 3;

/**
 * The region `BoardZoom` brings into view for a selected character, in
 * squares: most of where it could move this turn (`REACH_SHOWN`), with `ap`
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

/**
 * Where a step of the battle happened, for a review to follow (§17.3 PR 8):
 * every character it changed — moved, hurt, spent AP, took a stance — where
 * it stood before and where it stands now. Comparing the states either side
 * of the step rather than reading the action is what lets a reaction be
 * followed too: the watcher spent its banked AP.
 */
export function actionSquares(before: readonly Fighter[], after: readonly Fighter[]): Square[] {
    const changed = (was: Fighter, now: Fighter) => was.square !== now.square || was.hp !== now.hp || was.ap !== now.ap
        || was.banked !== now.banked || !sameCounts(was.effects, now.effects);
    return after.flatMap(fighter => {
        const was = before.find(one => one.id === fighter.id);
        if (!was || !changed(was, fighter)) return [];
        return was.square === fighter.square ? [fighter.square] : [was.square, fighter.square];
    });
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
        ...effectsOn(fighter).map(effect => EFFECTS[effect].name),
        ...(fighter.item ? [`Carrying a ${ITEMS[fighter.item].name.toLowerCase()}`] : []),
    ];
}

/** A character with AP left to spend on its owner's turn: what the units strip counts as ready. */
export function canAct(fighter: Fighter): boolean {
    return isStanding(fighter) && fighter.ap > 0;
}

/** A character's AP as pips, one of `ACTION_POINTS` each, lit while unspent: the board and the units strip draw the same row. */
export function apPips(fighter: Fighter): boolean[] {
    return Array.from({ length: ACTION_POINTS }, (_, i) => i < fighter.ap);
}

/** How full a character's HP bar is, 0–1. */
export function hpFraction(fighter: Fighter): number {
    return Math.min(1, fighter.hp / CHARACTERS[fighter.character].hp);
}

/** A weapon in one line: "80% · range 20 · 3 damage". */
export function weaponLine(weapon: Weapon): string {
    return weapon.kind === "melee"
        ? `Melee · ${weapon.damage} damage`
        : `${weapon.accuracy}% · range ${weapon.range} · ${weapon.damage} damage`;
}

/** Why an ability can't be used yet — "Used", "Back in 2 turns" — or undefined when it's ready. */
export function abilityWait(fighter: Fighter, id: AbilityId): string | undefined {
    if (fighter.spent.includes(id)) return "Used";
    const cooldown = fighter.cooldowns[id] ?? 0;
    return cooldown > 0 ? `Back in ${pluralize(cooldown, "turn")}` : undefined;
}

// ─── Mustering (§17.3 PR 6) ─────────────────────────────────────────────────

/** The six characters in the order the muster lists them: §13.6's table's. */
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** How many of each character a squad holds — what the muster's steppers read. */
export type SquadCounts = Record<CharacterId, number>;

export function squadCounts(squad: readonly CharacterId[]): SquadCounts {
    const counts = Object.fromEntries(CHARACTER_IDS.map(id => [id, 0])) as SquadCounts;
    for (const character of squad) counts[character]++;
    return counts;
}

/** The squad a set of counts makes, in the muster's order. */
export function squadOf(counts: SquadCounts): CharacterId[] {
    return CHARACTER_IDS.flatMap(id => Array<CharacterId>(counts[id]).fill(id));
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
export function reachShading(fighter: Fighter, reach: Reach, sneaking: boolean): ReadonlyMap<Square, number> {
    const shading = new Map<Square, number>();
    reach.costs.forEach((cost, square) => {
        if (square !== reach.from && cost !== Infinity) shading.set(square, moveAp(fighter, cost, sneaking));
    });
    return shading;
}

/**
 * What decides where an aimed action can land: the character's weapon, the
 * squares next to it (a heal, a raise, a healing draught), or — a number — how
 * far something aimed at a square reaches (a fireball, a thrown item).
 */
export type RangeKind = "weapon" | "nextTo" | number;

/**
 * An aimed action's range from where a character stands: every square it
 * could be lined up on, were someone there to aim at. A weapon, a
 * heal or a raise is aimed at a character, so only a square one could stand on
 * counts; a fireball or a throw can land on any square it can see in range.
 * Where the character stands isn't drawn. Read from the rules `check` itself
 * asks, so the shading and what the server allows can't drift apart.
 */
export function rangeSquares(state: BattleState, fighter: Fighter, kind: RangeKind): ReadonlySet<Square> {
    const { field } = state;
    const reaches = (square: Square): boolean => {
        if (square === fighter.square) return false;
        if (typeof kind === "number") return inRange(field, fighter.square, square, kind);
        if (!field.tiles[square].terrain.standable) return false;
        return kind === "weapon" ? weaponReaches(state, fighter, square) : nextTo(field, fighter.square, square);
    };
    return new Set(field.tiles.flatMap((_, square) => reaches(square) ? [square] : []));
}

/** A character's name, numbered where its owner has two of it: "Man-at-arms 2". */
export function fighterName(fighters: readonly Fighter[], fighter: Fighter): string {
    const name = CHARACTERS[fighter.character].name;
    const same = fighters.filter(one => one.owner === fighter.owner && one.character === fighter.character);
    return same.length > 1 ? `${name} ${same.findIndex(one => one.id === fighter.id) + 1}` : name;
}

/** Whose a character is, from where the viewer sits: "your Knight", "Bob's Archer". */
export function whoseName(fighters: readonly Fighter[], id: number, viewerId: string, nameFor: (userId: string) => string): string {
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character";
    const name = fighterName(fighters, fighter);
    return fighter.owner === viewerId ? `your ${name}` : `${nameFor(fighter.owner)}'s ${name}`;
}

/** The actions aimed at one character. */
export type TargetKind = "attack" | "aimedShot" | "heal" | "raise" | "draught";

/** The characters an action could be aimed at now, by the server's own `check`. */
export function targetsOf(state: BattleState, player: string, fighter: Fighter, kind: TargetKind): number[] {
    return state.fighters
        .filter(one => !("refused" in check(state, player, { kind, fighter: fighter.id, target: one.id })))
        .map(one => one.id);
}

/** The battle as it would stand with one character moved to another square: what a previewed move is read against. */
export function standingAt(state: BattleState, fighter: Fighter, square: Square): { battle: BattleState; moved: Fighter } {
    const moved = { ...fighter, square };
    return { battle: { field: state.field, fighters: state.fighters.map(one => one.id === fighter.id ? moved : one) }, moved };
}

/** One enemy a character's weapon could hit, and its chance to: a strike always hits. */
export interface AttackOption {
    target: Fighter;
    /** Percent to hit, 0–100. */
    chance: number;
}

/**
 * Every enemy a character's main weapon could hit from a square — where it
 * stands, or where a previewed move would take it — likeliest first. Who is
 * in reach is the server's own `check`, read as if it had the AP to attack:
 * what's in reach is a matter of where it stands, not what it has left.
 */
export function attackOptions(state: BattleState, fighter: Fighter, square: Square = fighter.square): AttackOption[] {
    const { battle, moved } = standingAt(state, { ...fighter, ap: ACTION_POINTS }, square);
    return targetsOf(battle, fighter.owner, moved, "attack").flatMap(id => {
        const target = fighterById(battle, id);
        return target ? [{ target, chance: shotOdds(battle, moved, target)?.chance ?? 100 }] : [];
    }).sort((a, b) => b.chance - a.chance);
}

/** One reaction a move would set off, and what it would do to the mover (§13.4). */
export interface ReactionPreview {
    watcher: Fighter;
    kind: "overwatch" | "guard";
    /** An overwatch shot's odds against the mover on the square it comes at. */
    odds?: ShotOdds;
    /** What it does on a hit; a guard always hits. */
    damage: number;
}

/**
 * Every reaction a move along this path would set off, in the order they'd
 * come, with the odds of each overwatch shot at the mover from the square
 * it's on when the shot comes. Like `reactionsTo`, it assumes the mover
 * survives them all.
 */
export function reactionPreviews(state: BattleState, mover: Fighter, path: readonly Square[]): ReactionPreview[] {
    return reactionsTo(state, mover, path).flatMap(({ watcher: id, step }): ReactionPreview[] => {
        const watcher = fighterById(state, id);
        if (!watcher) return [];
        const weapon = CHARACTERS[watcher.character].weapon;
        if (weapon.kind === "melee") return [{ watcher, kind: "guard", damage: weapon.damage }];
        const { battle: there, moved } = standingAt(state, mover, path[step]);
        const odds = shotOdds(there, watcher, moved, "overwatch");
        return [{ watcher, kind: "overwatch", odds, damage: odds?.damage ?? weapon.damage }];
    });
}

/**
 * One line of what an action did, as the board shows it coming back, led by a
 * glyph or by the drawn mark of the effect or item it's about. A shot carries
 * the roll it was decided by.
 */
export type EventLine = {
    title: string;
    sub?: string;
    /** The 1–100 roll a shot was decided by. */
    roll?: number;
} & ({ icon: string; mark?: never } | { mark: Sprite; icon?: never });

/**
 * What an action did, in order, in the viewer's words (§17.3 PR 7). A move
 * broken up by the reactions it set off is told once. `fighters` names
 * everyone: nobody leaves the battlefield, so the state after the action
 * names everyone the action touched.
 */
export function eventLines(events: readonly BattleEvent[], fighters: readonly Fighter[], viewerId: string, nameFor: (userId: string) => string): EventLine[] {
    const name = (id: number) => whoseName(fighters, id, viewerId, nameFor);
    const Name = (id: number) => capitalise(name(id));
    const firstMove = events.findIndex(event => event.kind === "moved");
    return events.flatMap((event, index): EventLine[] => {
        switch (event.kind) {
            case "moved":
                return index === firstMove ? [{ icon: "👣", title: `${Name(event.fighter)} ${event.sneaking ? "sneaked" : "moved"}` }] : [];
            case "shot": {
                const title = event.result === "miss" ? "Miss" : `${event.result === "hit" ? "Hit" : "Graze"} for ${event.damage}`;
                const who = `${Name(event.fighter)}${event.reaction ? " on overwatch" : ""} at ${name(event.target)}`;
                return [{ icon: "🎯", title, sub: `${who} · ${event.chance}% to hit`, roll: event.roll }];
            }
            case "struck":
                return [{ icon: "⚔️", title: `${Name(event.fighter)} struck ${name(event.target)} for ${event.damage}`, sub: event.reaction ? "On guard" : undefined }];
            case "fireball":
                return [{ icon: "🔥", title: `Fireball: ${event.targets.length === 0 ? "nobody hit" : event.targets.map(name).join(", ")}`, sub: `${event.damage} damage each` }];
            case "downed":
                return [{ icon: "✕", title: `${Name(event.fighter)} is down` }];
            case "healed":
                return [{
                    ...(event.draught ? { mark: ITEM_ART.healingDraught, sub: ITEMS.healingDraught.name } : { icon: "✚" }),
                    title: `${Name(event.target)} healed${event.hp > 0 ? ` for ${event.hp}` : ""}`,
                }];
            case "thrown": {
                const { name: item } = ITEMS[event.item];
                if (event.item === "smokePot") return [{ mark: ITEM_ART.smokePot, title: `${Name(event.fighter)} threw a smoke pot` }];
                return [{
                    mark: ITEM_ART[event.item],
                    title: `${item}: ${event.targets.length === 0 ? "nobody hit" : event.targets.map(name).join(", ")}`,
                    ...(event.damage > 0 ? { sub: `${event.damage} damage each` } : {}),
                }];
            }
            case "blasted":
                return [{ icon: "💥", title: `${capitalise(pluralize(event.squares.length, "square"))} of low cover blasted away`, sub: "Open ground now" }];
            case "raised":
                return [{ icon: "✚", title: `${Name(event.target)} is back up at ${event.hp} HP` }];
            case "hunkered":
                return [{ mark: EFFECT_ART.hunkered, title: `${Name(event.fighter)} hunkered down` }];
            case "shieldWall":
                return [{ mark: EFFECT_ART.shieldWall, title: `${Name(event.fighter)} raised a shield wall` }];
            case "watching":
                return [{ icon: "👁", title: `${Name(event.fighter)} is on watch`, sub: `${event.banked} AP banked` }];
            case "effect":
                return [{ mark: EFFECT_ART[event.effect], title: `${Name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect].state}` }];
            case "burned":
                return [{ mark: EFFECT_ART.burning, title: `${Name(event.fighter)} burned for ${event.damage}` }];
            case "scored":
                return [{ icon: "★", title: `${event.player === viewerId ? "You" : nameFor(event.player)} scored ${event.points}`, sub: event.reason === "centre" ? "Holding the centre" : "The knock-out" }];
        }
    });
}

// ─── Battle visuals (§26) ───────────────────────────────────────────────────

/** How a piece of hit text is coloured (§26.1): damage, a graze, a miss, a heal, or a word of its own — an effect, a knock-out. */
export type HitTone = "hit" | "graze" | "miss" | "heal" | "word";

/** When a cue starts and how long it lasts, in milliseconds from the moment the action starts playing. */
interface Timed {
    start: number;
    length: number;
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
    /** The big text: "−3", "+4", "Miss", "Down", or an effect's name on its own. */
    value: string;
    /** The small text under it: "Graze", or the effect it put on. */
    label?: string;
    /** The effect whose mark stands beside it: burning's, as it does its damage. */
    mark?: EffectId;
    tone: HitTone;
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
}

/**
 * A character the action downs, standing as it was until the blow that
 * downed it lands, and then fading (§26.1): `start` is when the blow lands.
 */
export interface FallCue extends Timed {
    kind: "fall";
    /** As the action found it, standing where it fell. */
    fighter: Fighter;
}

/**
 * Low cover blasted away (§22), standing until the burst that did it fades:
 * the board draws it from the battlefield as the action found it, and from
 * `start` it fades off the scorched ground under it.
 */
export interface ScorchCue extends Timed {
    kind: "scorch";
    squares: readonly Square[];
}

/** One thing the board plays as an action comes back. */
export type BattleCue = TextCue | FlightCue | BurstCue | SlashCue | FallCue | ScorchCue;

/** How long a piece of hit text takes to rise and fade (§26.1). */
export const HIT_TEXT_MS = 1000;
/** From one thing an action did landing to the next: long enough to see each land before the next. */
const CUE_STEP_MS = 450;
/** The longest any one action plays for, however much it set off: every part is shortened to fit (§26.1). */
export const PLAYBACK_MS = 3000;
/** How long each missile takes to get there (§26.1): an arrow quickly, a bolt quicker, a fireball or a throw on a higher, slower arc. */
export const FLIGHT_MS: Readonly<Record<Missile, number>> = { arrow: 400, bolt: 250, fireball: 600, fireFlask: 600, thunderFlask: 600, smokePot: 600 };
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

/** What each thrown item bursts into (§26.1), and over how much. */
const THROWN_BURST: Readonly<Record<ThrownItem, BurstKind>> = { fireFlask: "fire", thunderFlask: "thunder", smokePot: "smoke" };

/** Damage as the board shows it, with a real minus sign. */
const minus = (damage: number) => `−${damage}`;

/** Every timing in a cue, scaled. */
function scaled(cue: BattleCue, scale: number): BattleCue {
    const by = (ms: number) => Math.round(ms * scale);
    const timed = { ...cue, start: by(cue.start), length: by(cue.length) };
    // A flight's arc is drawn by how far through it is, so it never lands in no time.
    return timed.kind === "flight" ? { ...timed, land: Math.max(1, by(timed.land)) } : timed;
}

/**
 * What an action did, as the board plays it (§26.2): a timed cue for each
 * thing that happened, one after another in the order of the events, each
 * starting as the last one lands.
 *
 * A shot flies from the shooter to its target — an arrow, or the Mage's
 * bolt — and its hit text rises as it gets there: stuck in the target on a
 * hit, glancing off on a graze, flying past on a miss. A strike slashes
 * across its target. A fireball or a thrown flask flies to the square it was
 * aimed at and bursts there, and everyone it hit is hit at once, with the
 * effect it puts on under each number. A knock-out's "Down" follows its
 * damage, and the character it downed stands until that damage lands. Low
 * cover the burst blasted away goes as the burst fades.
 *
 * `before` is everyone as the action found them, which says where each cue
 * stands: a move carries its mover along, so an overwatch shot flies to where
 * the mover had got to. Moves, stances, watches and scores play nothing of
 * their own. However much happened, it all fits in `PLAYBACK_MS`.
 */
export function battleCues(events: readonly ToldEvent[], before: readonly Fighter[]): BattleCue[] {
    const as = new Map(before.map(fighter => [fighter.id, fighter]));
    const at = new Map(before.map(fighter => [fighter.id, fighter.square]));
    const cues: BattleCue[] = [];
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
        landed = landed === null ? lead : landed + Math.max(CUE_STEP_MS, lead);
        return landed;
    };
    const text = (fighter: number, when: number, value: string, tone: HitTone, extra: Pick<TextCue, "label" | "mark"> = {}) => {
        const square = at.get(fighter);
        if (square === undefined) return;
        const cue: TextCue = { kind: "text", fighter, square, value, tone, ...extra, start: when, length: HIT_TEXT_MS };
        cues.push(cue);
        latest.set(fighter, cue);
    };
    /** Something flying from a character to a square, landing at `land`. */
    const fly = (fighter: number, to: Square | undefined, missile: Missile, result: FlightCue["result"], land: number, after = 0) => {
        const from = at.get(fighter);
        const flight = FLIGHT_MS[missile];
        if (from === undefined || to === undefined) return;
        cues.push({ kind: "flight", missile, from, to, result, start: land - flight, land: flight, length: flight + after });
    };

    for (const event of events) {
        switch (event.kind) {
            case "moved": {
                const end = event.path.at(-1);
                if (end !== undefined) at.set(event.fighter, end);
                break;
            }
            case "shot": {
                // The Mage's bolt; anyone else who shoots has a bow.
                const missile = as.get(event.fighter)?.character === "mage" ? "bolt" : "arrow";
                const land = beat(FLIGHT_MS[missile]);
                fly(event.fighter, at.get(event.target), missile, event.result, land, SHOT_AFTER_MS);
                text(event.target, land, event.result === "miss" ? "Miss" : minus(event.damage), event.result,
                    event.result === "graze" ? { label: "Graze" } : {});
                break;
            }
            case "struck": {
                const land = beat(SLASH_MS);
                const square = at.get(event.target);
                if (square !== undefined) cues.push({ kind: "slash", square, start: land - SLASH_MS, length: 2 * SLASH_MS });
                text(event.target, land, minus(event.damage), "hit");
                break;
            }
            case "burned":
                text(event.fighter, beat(), minus(event.damage), "hit", { mark: "burning" });
                break;
            case "fireball":
            case "thrown": {
                const item = event.kind === "thrown" ? event.item : null;
                // A draught is never thrown: it's drunk, and told as a heal.
                if (item === "healingDraught") break;
                const missile = item ?? "fireball";
                const land = beat(FLIGHT_MS[missile]);
                fly(event.fighter, event.at, missile, "landed", land);
                // A fireball spreads over the 3×3, and so does a flask made to.
                const radius = item && !(ITEMS[item] as Item).area ? 0 : 1;
                cues.push({ kind: "burst", burst: item ? THROWN_BURST[item] : "fire", at: event.at, radius, start: land, length: BURST_MS });
                landing = { start: land, targets: event.targets };
                if (event.damage > 0) event.targets.forEach(target => text(target, land, minus(event.damage), "hit"));
                break;
            }
            case "blasted":
                cues.push({ kind: "scorch", squares: event.squares, start: (landing?.start ?? 0) + Math.round(BURST_MS * SCORCH_AT), length: Math.round(BURST_MS * (1 - SCORCH_AT)) });
                break;
            case "healed":
                text(event.target, beat(), event.hp > 0 ? `+${event.hp}` : "Cured", "heal");
                break;
            case "raised":
                text(event.target, beat(), `+${event.hp}`, "heal", { label: "Raised" });
                break;
            case "downed": {
                // It stands as it was until the blow that downed it lands, then fades.
                const blow = latest.get(event.fighter);
                const fighter = as.get(event.fighter);
                const square = at.get(event.fighter);
                const land = beat();
                if (fighter && square !== undefined) cues.push({ kind: "fall", fighter: { ...fighter, square }, start: blow?.start ?? land, length: FALL_MS });
                text(event.fighter, land, "Down", "word");
                break;
            }
            case "effect": {
                const cue = latest.get(event.fighter);
                if (event.change === "cleared") {
                    if (cue?.tone === "heal" && !cue.label && cue.value !== "Cured") cue.label = "Cured";
                    break;
                }
                const { name } = EFFECTS[event.effect];
                if (cue && (cue.tone === "hit" || cue.tone === "graze") && !cue.label && !cue.mark) cue.label = name;
                else if (landing?.targets.includes(event.fighter)) text(event.fighter, landing.start, name, "word");
                else text(event.fighter, beat(), name, "word");
                break;
            }
        }
    }

    const end = Math.max(0, ...cues.map(cue => cue.start + cue.length));
    if (end <= PLAYBACK_MS) return cues;
    return cues.map(cue => scaled(cue, PLAYBACK_MS / end));
}
