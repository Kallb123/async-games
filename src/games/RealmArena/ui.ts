// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import type { Rect } from "@/utils/ui/mapLabels";
import { capitalise, pluralize } from "@/utils/ui/text";
import type { Reach } from "@/utils/games/battlefield/pathfinding";
import { coordsOf, squareAt, TERRAIN, type Battlefield, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, type AbilityId, type CharacterId, type Weapon } from "./characters";
import { ACTION_POINTS, check, fighterById, inRange, isStanding, moveAp, nextTo, reachOf, reactionsTo, shotOdds, weaponReaches, type BattleEvent, type BattleState, type Fighter, type MusterPick, type ShotOdds } from "./rules";

/** Board units per square: the SVG's viewBox is the map's size times this. */
export const CELL = 10;

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

/** One SVG path drawing every square that shares a key: a row's run of them one rectangle. */
export interface RunLayer<K> {
    key: K;
    d: string;
}

/**
 * The squares of a board grouped by `keyOf`, one path per key rather than a
 * shape per square, since the 36×48 fort is 1,728 of them and a 48×48 one
 * would be 2,304 (§13.1). Neighbouring squares with one key along a row merge
 * into a single rectangle, which keeps the path short and leaves no hairline
 * seam between them. A square whose key is undefined isn't drawn. Keys come
 * in the order they're first met; a caller wanting another sorts them.
 */
export function runLayers<K>(field: Pick<Battlefield, "width" | "height">, keyOf: (square: Square) => K | undefined): RunLayer<K>[] {
    const runs = new Map<K, string[]>();
    for (let row = 0; row < field.height; row++) {
        let col = 0;
        while (col < field.width) {
            const key = keyOf(row * field.width + col);
            let end = col + 1;
            while (end < field.width && keyOf(row * field.width + end) === key) end++;
            if (key !== undefined) {
                const path = runs.get(key) ?? [];
                path.push(`M${col * CELL} ${row * CELL}h${(end - col) * CELL}v${CELL}h${-(end - col) * CELL}z`);
                runs.set(key, path);
            }
            col = end;
        }
    }
    return [...runs].map(([key, path]) => ({ key, d: path.join("") }));
}

/** One kind of ground, as one SVG path. */
export interface GroundLayer {
    letter: TerrainLetter;
    d: string;
}

/**
 * The ground drawn from the map's letters (§17.3 PR 5's placeholder), one
 * path per kind of terrain, in the order `TERRAIN` lists its letters, so open
 * ground is painted first.
 */
export function groundLayers(field: Battlefield): GroundLayer[] {
    const order = Object.keys(TERRAIN) as TerrainLetter[];
    return runLayers(field, square => LETTER_OF.get(field.terrain[square]))
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
        .map(({ key, d }) => ({ letter: key, d }));
}

/** A square's centre, in board units. */
export function squareCentre(field: Pick<Battlefield, "width">, square: Square): { x: number; y: number } {
    const { col, row } = coordsOf(field, square);
    return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

/** The rectangle a set of squares covers, in board units — a deployment zone, or the centre. */
export function areaRect(field: Pick<Battlefield, "width">, squares: readonly Square[]): Rect {
    const coords = squares.map(square => coordsOf(field, square));
    const cols = coords.map(c => c.col), rows = coords.map(c => c.row);
    const col = Math.min(...cols), row = Math.min(...rows);
    return { x: col * CELL, y: row * CELL, width: (Math.max(...cols) - col + 1) * CELL, height: (Math.max(...rows) - row + 1) * CELL };
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
 * every square a step of a review touched: the squares, and `FOCUS_REACH`
 * either side of them.
 */
export function focusOn(field: Pick<Battlefield, "width">, ...squares: Square[]): Rect {
    const { x, y, width, height } = areaRect(field, squares);
    const margin = FOCUS_REACH * CELL;
    return { x: x - margin, y: y - margin, width: width + margin * 2, height: height + margin * 2 };
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
 * The region `BoardZoom` brings into view for a selected character: most of
 * where it could move this turn (`REACH_SHOWN`), with `ap` to spend — what it
 * has left on its owner's turn, a full turn's otherwise. Never less than
 * `focusOn` frames round it, so a character with nowhere to go is still
 * brought close.
 */
export function reachFocus(state: BattleState, fighter: Fighter, ap: number): Rect {
    const near = focusOn(state.field, fighter.square);
    const { costs } = reachOf(state, { ...fighter, ap });
    const squares = Array.from(costs.keys()).filter(square => costs[square] !== Infinity);
    if (squares.length === 0) return near;
    const reach = areaRect(state.field, squares);
    const { x, y } = squareCentre(state.field, fighter.square);
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
        || was.banked !== now.banked || was.hunkered !== now.hunkered || was.shieldWall !== now.shieldWall;
    return after.flatMap(fighter => {
        const was = before.find(one => one.id === fighter.id);
        if (!was || !changed(was, fighter)) return [];
        return was.square === fighter.square ? [fighter.square] : [was.square, fighter.square];
    });
}

/** What a character is doing that the board marks on it, in words: the tooltip, and the selected character's card. */
export function fighterStatus(fighter: Fighter): string[] {
    if (fighter.hp <= 0) return ["Down"];
    return [
        ...(fighter.banked > 0 ? [`On watch (${fighter.banked} AP banked)`] : []),
        ...(fighter.hunkered ? ["Hunkered down"] : []),
        ...(fighter.shieldWall ? ["Shield wall"] : []),
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

/** The square under a point on the board, in board units, or undefined off the map. */
export function squareAtPoint(field: Pick<Battlefield, "width" | "height">, x: number, y: number): Square | undefined {
    return squareAt(field, Math.floor(x / CELL), Math.floor(y / CELL));
}

/**
 * The tap-to-move shading (§13.2): every square a character could stop on,
 * one layer for each AP it would cost to get there, nearest first. Where it
 * stands isn't shaded.
 */
export function reachLayers(field: Battlefield, fighter: Fighter, reach: Reach, sneaking: boolean): RunLayer<number>[] {
    return runLayers(field, square => square === reach.from || reach.costs[square] === Infinity
        ? undefined : moveAp(fighter.character, reach.costs[square], sneaking))
        .sort((a, b) => a.key - b.key);
}

/** What decides where an aimed action can land: the character's weapon, a fireball's range, or the squares next to it (a heal, a raise). */
export type RangeKind = "weapon" | "fireball" | "nextTo";

/**
 * An aimed action's range from where a character stands, as one path: every
 * square it could be lined up on, were someone there to aim at. A weapon, a
 * heal or a raise is aimed at a character, so only a square one could stand on
 * counts; a fireball can land on any square it can see in range. Where the
 * character stands isn't drawn. Read from the rules `check` itself asks, so
 * the shading and what the server allows can't drift apart.
 */
export function rangeArea(state: BattleState, fighter: Fighter, kind: RangeKind): string | null {
    const { field } = state;
    const reaches = (square: Square): boolean => {
        if (square === fighter.square) return false;
        if (kind === "fireball") return inRange(field, fighter.square, square, ABILITIES.fireball.range);
        if (!field.terrain[square].standable) return false;
        return kind === "weapon" ? weaponReaches(state, fighter, square) : nextTo(field, fighter.square, square);
    };
    return runLayers(field, square => reaches(square) || undefined)[0]?.d ?? null;
}

/** A path as an SVG polyline's points, through each square's centre. */
export function pathPoints(field: Pick<Battlefield, "width">, path: readonly Square[]): string {
    return path.map(square => {
        const { x, y } = squareCentre(field, square);
        return `${x},${y}`;
    }).join(" ");
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

/** One line of what an action did, as the board shows it coming back: a shot carries the roll it was decided by. */
export interface EventLine {
    icon: string;
    title: string;
    sub?: string;
    /** The 1–100 roll a shot was decided by. */
    roll?: number;
}

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
                return [{ icon: "✚", title: `${Name(event.target)} healed for ${event.hp}` }];
            case "raised":
                return [{ icon: "✚", title: `${Name(event.target)} is back up at ${event.hp} HP` }];
            case "hunkered":
                return [{ icon: "⛨", title: `${Name(event.fighter)} hunkered down` }];
            case "shieldWall":
                return [{ icon: "🛡️", title: `${Name(event.fighter)} raised a shield wall` }];
            case "watching":
                return [{ icon: "👁", title: `${Name(event.fighter)} is on watch`, sub: `${event.banked} AP banked` }];
            case "scored":
                return [{ icon: "★", title: `${event.player === viewerId ? "You" : nameFor(event.player)} scored ${event.points}`, sub: event.reason === "centre" ? "Holding the centre" : "The knock-out" }];
        }
    });
}
