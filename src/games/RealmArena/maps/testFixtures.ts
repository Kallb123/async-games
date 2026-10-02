// Measurements every battlefield's test takes: where you can stand, what's cut
// off, and how far each seat has to go — the numbers a map's fairness is
// checked by when its shape alone can't guarantee it (the Ring Fort, §19).

import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { coordsOf, TERRAIN, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";

export const standable = (field: Battlefield): Square[] =>
    field.tiles.flatMap(({ terrain }, square) => terrain.standable ? [square] : []);

export const sorted = (squares: readonly Square[]): Square[] => [...squares].sort((a, b) => a - b);

/** The seats with a deployment square that can't walk to the centre. */
export function strandedSeats(field: Battlefield): number[] {
    return [...field.deployments.keys()].filter(seat => !walksFrom(field, field.deployments[seat], field.objectives.centre).every(Number.isFinite));
}

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
    const walks = walksFrom(field, field.deployments[seat], field.objectives.centre);
    return { quickest: Math.min(...walks), average: walks.reduce((sum, walk) => sum + walk, 0) / walks.length };
}

/** The tower tops from which some standable square of the centre is in sight. */
export function towersOverCentre(field: Battlefield): Square[] {
    const centre = field.objectives.centre.filter(square => field.tiles[square].terrain.standable);
    return standable(field).filter(top => field.tiles[top].terrain === TERRAIN["^"] && centre.some(square => canSee(field, top, square)));
}
