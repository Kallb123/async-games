// Seeing across a battlefield (docs/games/realm-arena.md §13.1, §25): one
// square sees another when the straight line between their centres crosses
// nothing that blocks sight. Trees always do. Anything else does when it
// stands a full height above both ends — a wall between two characters on the
// ground, but not between a tower top and the ground beyond the wall. Low
// cover and characters never do. A figure may look down the side of full
// cover directly beside it: an angled line may leave through that first
// square, but the same cover further away still blocks sight. The walk is
// exact integer arithmetic, so it always chooses the same squares.

import { coordsOf, isNeighbour, towersOver, type Battlefield, type Square } from "./terrain";

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
 * straight through a corner when it meets both at once.
 */
export function sightLine(field: Battlefield, from: Square, to: Square): SightLine {
    const a = coordsOf(field, from), b = coordsOf(field, to);
    const across = Math.abs(b.col - a.col), down = Math.abs(b.row - a.row);
    const stepCol = Math.sign(b.col - a.col), stepRow = Math.sign(b.row - a.row);
    // Every square between two squares on the map is on the map too.
    const at = (c: number, r: number): Square => r * field.width + c;
    const line: SightLine = { crossed: [], grazed: [] };
    let col = a.col, row = a.row;
    for (let i = 0, j = 0; i < across || j < down;) {
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
 * Whether one square can see another. A line through a corner is blocked only
 * when the squares either side of it both block sight — a diagonal wall — so
 * a single tree doesn't hide what's past its corner.
 */
export function canSee(field: Battlefield, from: Square, to: Square): boolean {
    const blocks = (square: Square) => field.tiles[square].terrain.blocksSight || towersOver(field, square, from, to);
    const { crossed, grazed } = sightLine(field, from, to);
    const a = coordsOf(field, from), b = coordsOf(field, to);
    const besideAtAnAngle = (square: Square) => {
        if (!isNeighbour(field, from, square)) return false;
        const cover = coordsOf(field, square);
        return (cover.col - a.col) * (b.row - a.row) !== (cover.row - a.row) * (b.col - a.col);
    };
    return !crossed.some(square => blocks(square) && !besideAtAnAngle(square))
        && !grazed.some(([one, other]) => blocks(one) && blocks(other));
}
