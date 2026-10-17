// A bigger Sacked Fort, for the rendering bench's scale fixtures: the fort in
// the middle of a `size`-square battlefield, ringed by its own terrain wrapped
// round (the corner towers, the walls and the woods of the next fort over), and
// its zones and centre moved to where the fort now stands. The battle on it is
// the same battle; there is just more ground to draw. It stands in for a bigger
// game's map (docs/realm-arena-rendering.md §7), where 8,000 tiles and more is
// the expected scale.
//
// It's registered over the Sacked Fort's own id (`registerScaledSackedFort`) — by
// fixture.ts while the battle is played, and by the bench page before it draws —
// so the engine, `reviewParts` and the board all read the bigger map without a
// line of the game knowing — and handed back (the undo it returns) as soon as
// it's done with, since in the app, where the admin renderer lab draws these
// battles, every other Sacked Fort in the tab reads the same id.

import { REALM_ARENA_MAPS } from "@/games/RealmArena/maps";
import { SACKED_FORT_THREE_MAP } from "@/games/RealmArena/maps/sackedFort";
import { buildBattlefield, type Area, type Battlefield } from "@/utils/games/battlefield/terrain";

/** The fort the scale fixtures are played on, as a battle stores it. */
export const SCALED_MAP_ID = "sackedFortThree";

/** The Sacked Fort for three, in the middle of a `size` × `size` battlefield. */
export function scaledSackedFort(size: number): Battlefield {
    const fort = SACKED_FORT_THREE_MAP;
    const across = fort.rows.length;
    if (size < across) throw new Error(`a scaled Sacked Fort is at least ${across} squares across`);
    const offset = Math.floor((size - across) / 2);
    const wrap = (n: number) => ((n - offset) % across + across) % across;
    const moved = (area: Area): Area => ({ ...area, col: area.col + offset, row: area.row + offset });
    return buildBattlefield({
        name: `Sacked Fort, ${size} squares across`,
        rows: Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => fort.rows[wrap(row)][wrap(col)]).join("")),
        deployments: fort.deployments.map(zone => "col" in zone ? moved(zone) : zone.map(moved)),
        objectives: Object.fromEntries(Object.entries(fort.objectives).map(([name, area]) => [name, moved(area)])),
    });
}

/** Has every reader of the Sacked Fort's id read the scaled one instead, until the undo it returns is called. */
export function registerScaledSackedFort(size: number): () => void {
    const maps = REALM_ARENA_MAPS as Record<string, Battlefield>;
    const was = maps[SCALED_MAP_ID];
    maps[SCALED_MAP_ID] = scaledSackedFort(size);
    return () => { maps[SCALED_MAP_ID] = was; };
}
