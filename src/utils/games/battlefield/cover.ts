// Cover against one attacker (docs/games/realm-arena.md §13.1, §13.3). A
// character takes cover from the squares next to it, but only those that lie
// between it and whoever is attacking: the ones the line of the attack passes
// through, or grazes the corner of, on its way out. Each of those covers it by
// how far it rises above the character (`coverOfRise`): half for a half or
// three quarters, full for a full height. Trees give full cover whatever their
// height. With none, it's flanked.
//
// So a wall to the north covers against an attacker to the north-east as long
// as the wall runs on to the north-east square too, and not against one almost
// due east, who is looking along it.
//
// Cover is measured from the character, not the attacker, so a wall covers
// whoever crouches behind it even against an archer on a tower who can see
// over it. Cover says nothing about whether the shot can be taken at all: a
// full height the line crosses may also block sight, so ask `canSee` first.

import { sightLine } from "./lineOfSight";
import { coordsOf, coverOfRise, isNeighbour, riseOf, squareAt, type Battlefield, type Cover, type Square } from "./terrain";

const RANK: Record<Cover, number> = { none: 0, half: 1, full: 2 };

function better(best: Cover, cover: Cover): Cover {
    return RANK[cover] > RANK[best] ? cover : best;
}

/** What one square next to `target` covers it by: its terrain's own cover, or how far it rises above it, whichever is more. */
function coverFrom(field: Battlefield, neighbour: Square, target: Square): Cover {
    return better(field.tiles[neighbour].terrain.cover, coverOfRise(riseOf(field, neighbour, target)));
}

/** The cover `target` has against an attack from `attacker`. `"none"` means it's flanked. */
export function coverAgainst(field: Battlefield, target: Square, attacker: Square): Cover {
    // Only the squares next to it cover it, so the line is walked no further.
    const { crossed, grazed } = sightLine(field, target, attacker, 1);
    return [...crossed, ...grazed.flat()]
        .filter(square => isNeighbour(field, target, square))
        .map(square => coverFrom(field, square, target))
        .reduce<Cover>(better, "none");
}

/** The four sides of a square, as a step to the square beyond: north is up the map, towards row 0. */
export const SIDE_STEPS = {
    north: { col: 0, row: -1 },
    east: { col: 1, row: 0 },
    south: { col: 0, row: 1 },
    west: { col: -1, row: 0 },
} as const;

export type Side = keyof typeof SIDE_STEPS;

/**
 * The cover each side of `square` gives whoever stands on it, whichever way
 * an attacker comes from: what the square beside it gives (`coverFrom`, the
 * same reckoning `coverAgainst` makes for the ones the line crosses). Only
 * the four sides, not the corners, since that is where a shield is drawn;
 * the edge of the map gives none.
 */
export function coverBySide(field: Battlefield, square: Square): Record<Side, Cover> {
    const { col, row } = coordsOf(field, square);
    const sides = {} as Record<Side, Cover>;
    for (const side of Object.keys(SIDE_STEPS) as Side[]) {
        const next = squareAt(field, col + SIDE_STEPS[side].col, row + SIDE_STEPS[side].row);
        sides[side] = next === undefined ? "none" : coverFrom(field, next, square);
    }
    return sides;
}
