// Pure presentation helpers for Realm Arena's board screen (ARCHITECTURE.md —
// per-game presentation helpers live in games/<Game>/ui.ts). Readings of the
// state the response already ships, never a rule: those are rules.ts's.

import type { Rect } from "@/utils/ui/mapLabels";
import { coordsOf, TERRAIN, type Battlefield, type Square, type Terrain, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { CHARACTERS, type CharacterId } from "./characters";
import type { Fighter, MusterPick } from "./rules";

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

/** One kind of ground, as one SVG path: every square of it, a row's run of them one rectangle. */
export interface GroundLayer {
    letter: TerrainLetter;
    d: string;
}

/**
 * The ground drawn from the map's letters (§17.3 PR 5's placeholder): one path
 * per kind of terrain rather than a shape per square, since the 36×48 fort is
 * 1,728 of them and a 48×48 one would be 2,304 (§13.1). Neighbouring squares of
 * one kind along a row merge into a single rectangle, which keeps the path
 * short and leaves no hairline seam between them. In the order `TERRAIN` lists
 * its letters, so open ground is painted first.
 */
export function groundLayers(field: Battlefield): GroundLayer[] {
    const runs = new Map<TerrainLetter, string[]>();
    for (let row = 0; row < field.height; row++) {
        let col = 0;
        while (col < field.width) {
            const terrain = field.terrain[row * field.width + col];
            let end = col + 1;
            while (end < field.width && field.terrain[row * field.width + end] === terrain) end++;
            const letter = LETTER_OF.get(terrain);
            if (letter) {
                const path = runs.get(letter) ?? [];
                path.push(`M${col * CELL} ${row * CELL}h${(end - col) * CELL}v${CELL}h${-(end - col) * CELL}z`);
                runs.set(letter, path);
            }
            col = end;
        }
    }
    return (Object.keys(TERRAIN) as TerrainLetter[])
        .filter(letter => runs.has(letter))
        .map(letter => ({ letter, d: runs.get(letter)!.join("") }));
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
 * How many squares either side of a selected character the view keeps in
 * frame: seven across, which `BoardZoom` brings to its deepest step, where a
 * square is comfortable to tap (§13.1).
 */
const FOCUS_REACH = 3;

/** The region `BoardZoom` brings into view for a selected character. */
export function focusOn(field: Pick<Battlefield, "width">, square: Square): Rect {
    const { x, y } = squareCentre(field, square);
    const half = (FOCUS_REACH + 0.5) * CELL;
    return { x: x - half, y: y - half, width: half * 2, height: half * 2 };
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
