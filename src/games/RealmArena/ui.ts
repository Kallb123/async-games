// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import type { Rect } from "@/utils/ui/mapLabels";
import { capitalise, pluralize } from "@/utils/ui/text";
import type { Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, TERRAIN, type Battlefield, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, EFFECT_IDS, EFFECTS, ITEMS, type AbilityId, type CharacterId, type EffectId, type ItemId, type Weapon } from "./characters";
import { ACTION_POINTS, check, fighterById, hasEffect, inRange, isStanding, moveAp, nextTo, reachOf, reactionsTo, shotOdds, weaponReaches, type BattleEvent, type BattleState, type Fighter, type MusterPick, type ShotOdds } from "./rules";

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

/** The glyph each item is told with where it has no drawn mark: what it did, as the board shows it coming back. */
export const ITEM_MARK: Readonly<Record<ItemId, string>> = {
    fireFlask: "🔥",
    thunderFlask: "⚡",
    smokePot: "💨",
    healingDraught: "🧪",
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
 * What a character is doing, and what's been done to it, in words: the
 * figure's tooltip, which can't show the marks. The watch, then its effects.
 */
export function fighterStatus(fighter: Fighter): string[] {
    if (!isStanding(fighter)) return ["Down"];
    const watch = watchStatus(fighter);
    return [...(watch ? [watch] : []), ...effectsOn(fighter).map(effect => EFFECTS[effect].name)];
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

/** What decides where an aimed action can land: the character's weapon, a fireball's range, or the squares next to it (a heal, a raise). */
export type RangeKind = "weapon" | "fireball" | "nextTo";

/**
 * An aimed action's range from where a character stands: every square it
 * could be lined up on, were someone there to aim at. A weapon, a
 * heal or a raise is aimed at a character, so only a square one could stand on
 * counts; a fireball can land on any square it can see in range. Where the
 * character stands isn't drawn. Read from the rules `check` itself asks, so
 * the shading and what the server allows can't drift apart.
 */
export function rangeSquares(state: BattleState, fighter: Fighter, kind: RangeKind): ReadonlySet<Square> {
    const { field } = state;
    const reaches = (square: Square): boolean => {
        if (square === fighter.square) return false;
        if (kind === "fireball") return inRange(field, fighter.square, square, ABILITIES.fireball.range);
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
export type TargetKind = "attack" | "aimedShot" | "heal" | "raise";

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
 * glyph or by the mark of the effect it's about. A shot carries the roll it
 * was decided by.
 */
export type EventLine = {
    title: string;
    sub?: string;
    /** The 1–100 roll a shot was decided by. */
    roll?: number;
} & ({ icon: string; effect?: never } | { effect: EffectId; icon?: never });

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
                    icon: event.draught ? ITEM_MARK.healingDraught : "✚",
                    title: `${Name(event.target)} healed${event.hp > 0 ? ` for ${event.hp}` : ""}`,
                    ...(event.draught ? { sub: ITEMS.healingDraught.name } : {}),
                }];
            case "thrown": {
                const { name: item } = ITEMS[event.item];
                if (event.item === "smokePot") return [{ icon: ITEM_MARK.smokePot, title: `${Name(event.fighter)} threw a smoke pot` }];
                return [{
                    icon: ITEM_MARK[event.item],
                    title: `${item}: ${event.targets.length === 0 ? "nobody hit" : event.targets.map(name).join(", ")}`,
                    ...(event.damage > 0 ? { sub: `${event.damage} damage each` } : {}),
                }];
            }
            case "raised":
                return [{ icon: "✚", title: `${Name(event.target)} is back up at ${event.hp} HP` }];
            case "hunkered":
                return [{ effect: "hunkered", title: `${Name(event.fighter)} hunkered down` }];
            case "shieldWall":
                return [{ effect: "shieldWall", title: `${Name(event.fighter)} raised a shield wall` }];
            case "watching":
                return [{ icon: "👁", title: `${Name(event.fighter)} is on watch`, sub: `${event.banked} AP banked` }];
            case "effect":
                return [{ effect: event.effect, title: `${Name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect].state}` }];
            case "burned":
                return [{ effect: "burning", title: `${Name(event.fighter)} burned for ${event.damage}` }];
            case "scored":
                return [{ icon: "★", title: `${event.player === viewerId ? "You" : nameFor(event.player)} scored ${event.points}`, sub: event.reason === "centre" ? "Holding the centre" : "The knock-out" }];
        }
    });
}
