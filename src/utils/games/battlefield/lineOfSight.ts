// Seeing across a battlefield (docs/games/realm-arena.md §13.1, §25): one
// character sees another when the straight line from its eyes to theirs
// passes over everything between them. Each square the line crosses blocks it
// when the square's top reaches the line anywhere over the square, so what
// hides a character depends on the angle it's seen from: a wall hides two
// characters on the ground from each other, but from a tower top it hides
// only whoever is close enough behind it that the line down to them still
// passes through the wall, and the edge of a rise hides the ground at its foot
// from someone standing back from it. Trees block sight whatever the
// heights. A figure may look down the side of full cover directly beside it:
// an angled line may leave through that first square, but the same cover
// further away still blocks sight. The walk and the heights are exact
// integer arithmetic, so they always choose the same squares.
//
// A battle begun before sight had angles keeps the rule it began with
// (`Battlefield.levelSight`): a square blocks sight when it stands a full
// height above both ends, or, for a low hedge, above them at all.

import { coordsOf, FULL_HEIGHT, isNeighbour, towersOver, type Battlefield, type Square } from "./terrain";

/** The squares a line between two squares' centres passes through, ends left out. */
export interface SightLine {
    /** Squares the line crosses the inside of, in order from the start. */
    crossed: Square[];
    /**
     * Pairs of squares the line only grazes, by passing exactly through the
     * corner they share — the two either side of a diagonal step.
     */
    grazed: [Square, Square][];
}

/**
 * Walks the line from one square's centre to another's, a square at a time:
 * across a column edge or a row edge, whichever the line meets first, and
 * straight through a corner when it meets both at once. With `within`, only
 * as far as that many squares from `from` in any direction: the line never
 * turns back, so nothing past there comes nearer again.
 */
export function sightLine(field: Battlefield, from: Square, to: Square, within = Infinity): SightLine {
    const a = coordsOf(field, from), b = coordsOf(field, to);
    const across = Math.abs(b.col - a.col), down = Math.abs(b.row - a.row);
    const stepCol = Math.sign(b.col - a.col), stepRow = Math.sign(b.row - a.row);
    // Every square between two squares on the map is on the map too.
    const at = (c: number, r: number): Square => r * field.width + c;
    const line: SightLine = { crossed: [], grazed: [] };
    let col = a.col, row = a.row;
    for (let i = 0, j = 0; (i < across || j < down) && Math.max(i, j) <= within;) {
        // The next column edge is (i + ½) / across of the way along the line,
        // the next row edge (j + ½) / down: whichever is nearer comes first.
        const race = (1 + 2 * i) * down - (1 + 2 * j) * across;
        if (race === 0) {
            line.grazed.push([at(col + stepCol, row), at(col, row + stepRow)]);
            col += stepCol; row += stepRow; i++; j++;
        } else if (race < 0) {
            col += stepCol; i++;
        } else {
            row += stepRow; j++;
        }
        if (i < across || j < down) line.crossed.push(at(col, row));
    }
    return line;
}

/**
 * Where a character's eyes are above the top of its square, in eighths of a
 * height: an eighth below the top of its head. So a wall a full height tall
 * hides two characters on level ground from each other, and low cover three
 * quarters tall doesn't.
 */
const EYE_HEIGHT = 2 * FULL_HEIGHT - 1;

/**
 * Whether one square can see another: whether a character standing on one
 * could see the eyes of one standing on the other — or, on a field with
 * `levelSight`, whether nothing between them stands a full height above
 * both. A line through a corner is blocked only when the squares either side
 * of it both block it — a diagonal wall — so a single tree doesn't hide
 * what's past its corner.
 */
export function canSee(field: Battlefield, from: Square, to: Square): boolean {
    const a = coordsOf(field, from), b = coordsOf(field, to);
    const across = b.col - a.col, down = b.row - a.row;
    // How far along the line, from 0 at `from` to `scale` at `to`: every edge it crosses is a whole number of steps.
    const scale = 2 * Math.max(Math.abs(across), 1) * Math.max(Math.abs(down), 1);
    // Heights in eighths, so an eye is a whole number of them.
    const eyeOf = (square: Square) => 2 * field.tiles[square].elevation + EYE_HEIGHT;
    const eye = eyeOf(from), drop = eyeOf(to) - eye;
    // The stretch of the line over one column (or row) `offset` from `from`'s, when the line moves `delta` columns in all.
    const stretch = (offset: number, delta: number): [number, number] => {
        if (delta === 0) return [0, scale];
        const ends = [(2 * offset - 1) * scale / (2 * delta), (2 * offset + 1) * scale / (2 * delta)];
        return [Math.min(...ends), Math.max(...ends)];
    };
    const blocks = (square: Square) => {
        const { terrain, elevation } = field.tiles[square];
        if (terrain.blocksSight) return true;
        if (field.levelSight) return towersOver(field, square, from, to, terrain.screens ? 1 : undefined);
        const c = coordsOf(field, square);
        const [colIn, colOut] = stretch(c.col - a.col, across), [rowIn, rowOut] = stretch(c.row - a.row, down);
        // The line is lowest over the square where it leaves it, going down, or where it enters it, going up.
        const lowest = drop < 0 ? Math.min(colOut, rowOut) : Math.max(colIn, rowIn);
        return 2 * elevation * scale >= eye * scale + drop * lowest;
    };
    const { crossed, grazed } = sightLine(field, from, to);
    const besideAtAnAngle = (square: Square) => {
        if (!isNeighbour(field, from, square)) return false;
        const cover = coordsOf(field, square);
        return (cover.col - a.col) * down !== (cover.row - a.row) * across;
    };
    return !crossed.some(square => blocks(square) && !besideAtAnAngle(square))
        && !grazed.some(([one, other]) => blocks(one) && blocks(other));
}
