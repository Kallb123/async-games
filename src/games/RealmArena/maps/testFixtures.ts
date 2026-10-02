// Measurements every battlefield's test takes: where you can stand, what's cut
// off, and how far each seat has to go — the numbers a map's fairness is
// checked by when its shape alone can't guarantee it (the Ring Fort, §19).

import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { coordsOf, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";

export const CENTRE = "centre";

export const standable = (field: Battlefield): Square[] =>
    field.terrain.flatMap((terrain, square) => terrain.standable ? [square] : []);

/** Every square someone could stand on that can't be walked to from the first seat's zone. */
export function sealedOff(field: Battlefield): { col: number; row: number }[] {
    const { costs } = reachFrom(field, field.deployments[0][0]);
    return standable(field).filter(square => costs[square] === Infinity).map(square => coordsOf(field, square));
}

/** The movement it takes from each square of `from` to the nearest square of `to`. */
export function walksFrom(field: Battlefield, from: readonly Square[], to: readonly Square[]): number[] {
    return from.map(square => {
        const { costs } = reachFrom(field, square);
        return Math.min(...to.map(target => costs[target]));
    });
}

/** The quickest walk from one seat's zone to the centre, and the average over the zone. */
export function walkToCentre(field: Battlefield, seat: number): { quickest: number; average: number } {
    const walks = walksFrom(field, field.deployments[seat], field.objectives[CENTRE]);
    return { quickest: Math.min(...walks), average: walks.reduce((sum, walk) => sum + walk, 0) / walks.length };
}

/** The tower tops from which some standable square of the centre is in sight. */
export function towersOverCentre(field: Battlefield): Square[] {
    const centre = field.objectives[CENTRE].filter(square => field.terrain[square].standable);
    return standable(field).filter(top => field.terrain[top].highGround && centre.some(square => canSee(field, top, square)));
}
