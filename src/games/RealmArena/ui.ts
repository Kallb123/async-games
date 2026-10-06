// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import type { Rect } from "@/utils/ui/mapLabels";
import { capitalise, pluralize, possessive } from "@/utils/ui/text";
import type { Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, FACING_COUNT, facingTowards, squareAt, TERRAIN, type Battlefield, type Facing, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, EFFECT_IDS, EFFECTS, ITEM_IDS, ITEMS, type AbilityId, type CharacterId, type EffectId, type Item, type ItemId } from "./characters";
import { CHARACTER_IDS } from "./roster";
import { EFFECT_ART, ITEM_ART, type BurstKind, type Missile, type Sprite, type ThrownItem } from "./art";
import { ACTION_POINTS, CENTRE, SCORED_FOR, squadSight, hasEffect, isStanding, isWarband, moveAp, pickOf, reachOf, type BattleEvent, type BattleState, type Fighter, type MusterPick, type ShotResult, type ToldEvent } from "./rules";

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

/** How full a character's HP bar is, 0–1 — or would be, were it to lose `lost` HP, which never takes it below empty. */
export function hpFraction(fighter: Fighter, lost = 0): number {
    return Math.min(1, Math.max(0, fighter.hp - lost) / CHARACTERS[fighter.character].hp);
}

/** Why an ability can't be used yet — "Used", "Back in 2 turns" — or undefined when it's ready. */
export function abilityWait(fighter: Fighter, id: AbilityId): string | undefined {
    if (fighter.spent.includes(id)) return "Used";
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
export function reachShading(fighter: Fighter, reach: Reach, sneaking: boolean): ReadonlyMap<Square, number> {
    const shading = new Map<Square, number>();
    reach.costs.forEach((cost, square) => {
        if (square !== reach.from && cost !== Infinity) shading.set(square, moveAp(fighter, cost, sneaking));
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
export function fighterName(fighters: readonly Fighter[], fighter: Fighter): string {
    // The enemy's warbands go by one name (§29.6), so they're numbered as one.
    const squad = fighters.filter(one => one.owner === fighter.owner || (isWarband(one.owner) && isWarband(fighter.owner)));
    const index = squad.findIndex(one => one.id === fighter.id);
    return index < 0 ? CHARACTERS[fighter.character].name : numberedName(squad, index);
}

/** The name of one of a squad — fought with, or still being placed — numbered where it has more than one of it. */
export function numberedName(squad: readonly { character: CharacterId }[], index: number): string {
    const { character } = squad[index];
    const name = CHARACTERS[character].name;
    if (squad.filter(one => one.character === character).length === 1) return name;
    return `${name} ${squad.slice(0, index).filter(one => one.character === character).length + 1}`;
}

/**
 * Whose a character is, from where the viewer sits: "your Knight", "Bob's
 * Archer" — or, for one the viewer has no word of, in fog of war (§27) or
 * gone with a dropped player's squad, "a character out of sight".
 */
export function whoseName(fighters: readonly Fighter[], id: number, viewerId: string, nameFor: (userId: string) => string): string {
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character out of sight";
    const name = fighterName(fighters, fighter);
    return fighter.owner === viewerId ? `your ${name}` : `${possessive(nameFor(fighter.owner))} ${name}`;
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
 * everyone the viewer can see after the action, which without fog of war is
 * everyone it touched; in fog (§27), one that shot from out of sight is "a
 * character out of sight" (`whoseName`).
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
                    ...(event.via === "draught" ? { mark: ITEM_ART.healingDraught, sub: ITEMS.healingDraught.name }
                        : { icon: "✚", ...(event.via === "purify" ? { sub: ABILITIES.purify.name } : {}) }),
                    title: `${Name(event.target)} ${event.via === "purify" ? "purified" : "healed"}${event.hp > 0 ? ` for ${event.hp}` : ""}`,
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
            case "demolished":
            case "burst":
                return [{
                    icon: "💥",
                    title: `${event.kind === "burst" ? `${Name(event.fighter)} burst` : ABILITIES.demolish.name}: ${event.targets.length === 0 ? "nobody hit" : event.targets.map(name).join(", ")}`,
                    ...(event.targets.length > 0 ? { sub: `${event.damage} damage each` } : {}),
                }];
            case "marked":
                return [{ icon: "◎", title: `${Name(event.fighter)} used ${ABILITIES.huntersMark.name} on ${name(event.target)}` }];
            case "raised":
                return [{ icon: "✚", title: `${Name(event.target)} is back up at ${event.hp} HP` }];
            case "hunkered":
                return [{ mark: EFFECT_ART.hunkered, title: `${Name(event.fighter)} hunkered down` }];
            case "shieldWall":
                return [{ mark: EFFECT_ART.shieldWall, title: `${Name(event.fighter)} raised a shield wall` }];
            case "watching":
                return [{ icon: "👁", title: `${Name(event.fighter)} is on watch`, sub: `${event.banked} AP banked` }];
            case "spotted":
                return [{ icon: "👁", title: `${Name(event.fighter)} found ${name(event.by)} in its way`, sub: "Out of sight until then · went round" }];
            case "effect":
                return [{ mark: EFFECT_ART[event.effect], title: `${Name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect].state}` }];
            case "burned":
                return [{ mark: EFFECT_ART.burning, title: `${Name(event.fighter)} burned for ${event.damage}` }];
            case "scored":
                return [{ icon: "★", title: `${event.player === viewerId ? "You" : nameFor(event.player)} scored ${event.points}`, sub: capitalise(SCORED_FOR[event.reason]) }];
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
export const FLIGHT_MS: Readonly<Record<Missile, number>> = { arrow: 400, bolt: 250, fireball: 600, fireFlask: 600, thunderFlask: 600, smokePot: 600, acid: 450 };
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

/** What each character that shoots something other than an arrow shoots (§26.1): the Mage's bolt, the Spitter's acid. */
const SHOT_MISSILE: Readonly<Partial<Record<CharacterId, Missile>>> = { mage: "bolt", spitter: "acid" };

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
                const missile = (shooter && SHOT_MISSILE[shooter]) ?? "arrow";
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
            case "demolished":
            case "burst": {
                // A blow at the cover, or the Bloater's splash over the 3×3
                // round it: everyone it caught is hit at once as it lands.
                let land: number;
                if (event.kind === "demolished") {
                    land = beat(SLASH_MS);
                    cues.push({ kind: "slash", square: event.at, start: land - SLASH_MS, length: 2 * SLASH_MS });
                } else {
                    land = beat();
                    const square = at.get(event.fighter);
                    if (square !== undefined) cues.push({ kind: "burst", burst: "acid", at: square, radius: 1, start: land, length: BURST_MS });
                }
                landing = { start: land, targets: event.targets };
                event.targets.forEach(target => text(target, land, minus(event.damage), "hit"));
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
