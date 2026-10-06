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
import { coverOfRise, isNeighbour, riseOf, type Battlefield, type Cover, type Square } from "./terrain";

const RANK: Record<Cover, number> = { none: 0, half: 1, full: 2 };

/** The cover `target` has against an attack from `attacker`. `"none"` means it's flanked. */
export function coverAgainst(field: Battlefield, target: Square, attacker: Square): Cover {
    // Only the squares next to it cover it, so the line is walked no further.
    const { crossed, grazed } = sightLine(field, target, attacker, 1);
    return [...crossed, ...grazed.flat()]
        .filter(square => isNeighbour(field, target, square))
        .flatMap(square => [field.tiles[square].terrain.cover, coverOfRise(riseOf(field, square, target))])
        .reduce<Cover>((best, cover) => RANK[cover] > RANK[best] ? cover : best, "none");
}
