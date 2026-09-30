// Cover against one attacker (docs/games/realm-arena.md §13.1, §13.3). A
// character takes cover from the squares next to it, but only those that lie
// between it and whoever is attacking: the ones the line of the attack passes
// through, or grazes the corner of, on its way out. High cover there gives
// full cover; otherwise low cover gives half. With neither, it's flanked.
//
// So a wall to the north covers against an attacker to the north-east as long
// as the wall runs on to the north-east square too, and not against one almost
// due east, who is looking along it.

import { sightLine } from "./lineOfSight";
import { isNeighbour, type Battlefield, type Cover, type Square } from "./terrain";

const RANK: Record<Cover, number> = { none: 0, half: 1, full: 2 };

/** The cover `target` has against an attack from `attacker`. `"none"` means it's flanked. */
export function coverAgainst(field: Battlefield, target: Square, attacker: Square): Cover {
    const { crossed, grazed } = sightLine(field, target, attacker);
    return [...crossed, ...grazed.flat()]
        .filter(square => isNeighbour(field, target, square))
        .map(square => field.terrain[square].cover)
        .reduce<Cover>((best, cover) => RANK[cover] > RANK[best] ? cover : best, "none");
}
