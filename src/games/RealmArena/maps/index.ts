// Every battlefield Realm Arena can be fought on, by the id a game stores
// (docs/games/realm-arena.md §15, §19, §29.2, §30.9): one per player count for
// a free-for-all and one per size of team for each co-op map, since a map's fairness
// rests on its deployment zones (§19.1). A battle persists the
// id rather than the map, so the map stays code and a fix to it reaches every
// battle — which is also why the id, once used, can never be renamed.

import { battlefieldWith, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { FOUR_GATE_FORT } from "./fourGateFort";
import { RING_FORT } from "./ringFort";
import { RUINED_FORT } from "./ruinedFort";
import { SACKED_FORT_THREE, SACKED_FORT_TWO } from "./sackedFort";
import { SUNKEN_VILLAGE_THREE } from "./sunkenVillage";
import { fittingHoldOutMap, HOLD_OUT_MAPS, type CoopMap } from "./holdOut";
import { EVERY_EDGE_IN_THIRDS } from "./middleOut";
import { THREE_GATE_FORT } from "./threeGateFort";
import { TWIN_GATE_FORT } from "./twinGateFort";

export const REALM_ARENA_MAPS = {
    ruinedFort: RUINED_FORT,
    ringFort: RING_FORT,
    fourGateFort: FOUR_GATE_FORT,
    twinGateFort: TWIN_GATE_FORT,
    threeGateFort: THREE_GATE_FORT,
    sackedFortTwo: SACKED_FORT_TWO,
    sackedFortThree: SACKED_FORT_THREE,
    sunkenVillageThree: SUNKEN_VILLAGE_THREE,
} as const satisfies Record<string, Battlefield>;

export type RealmArenaMapId = keyof typeof REALM_ARENA_MAPS;

export { COOP_MAPS, type CoopMap } from "./holdOut";

/** The two-player map, and the one an unknown id falls back to. */
export const DEFAULT_MAP: RealmArenaMapId = "ruinedFort";

/** Where each seat deploys on each map, in seat order — on a co-op map, the team's and then the warbands' — as the setup log names it. */
export const DEPLOYMENT_NAMES: Readonly<Record<RealmArenaMapId, readonly string[]>> = {
    ruinedFort: ["along the north edge", "along the south edge"],
    ringFort: ["in the north-west corner", "in the north-east corner", "in the middle of the south edge"],
    fourGateFort: ["in the north-west corner", "in the north-east corner", "in the south-east corner", "in the south-west corner"],
    twinGateFort: [
        "on the west half of the north edge", "on the east half of the north edge",
        "on the west half of the south edge", "on the east half of the south edge",
    ],
    threeGateFort: [
        "at the west end of the north edge", "in the middle of the north edge", "at the east end of the north edge",
        "at the west end of the south edge", "in the middle of the south edge", "at the east end of the south edge",
    ],
    sackedFortTwo: ["in the west of the keep", "in the east of the keep", "along the north and south edges", "along the east and west edges"],
    sackedFortThree: ["in the west of the keep", "in the middle of the keep", "in the east of the keep", ...EVERY_EDGE_IN_THIRDS],
    sunkenVillageThree: ["in the west of the green", "in the middle of the green", "in the east of the green", ...EVERY_EDGE_IN_THIRDS],
};

/** The map a party of this size fights on (§19.1): the Ruined Fort for two, the Ring Fort for three, the Four-Gate Fort for four. */
export function mapForPlayers(playerCount: number): RealmArenaMapId {
    return playerCount <= 2 ? "ruinedFort" : playerCount === 3 ? "ringFort" : "fourGateFort";
}

/**
 * The map a battle is fought on: a free-for-all's for the party's size, or in
 * co-op the line battle for the size of the team (§29.2) — the Ruined Fort for
 * one, the Twin-Gate Fort for two, the Three-Gate Fort for three — unless the
 * host picked one of Hold Out's own: the Sacked Fort (§30.9), built for a team
 * of two or three, or the Sunken Village (§35), built for three. A team the
 * pick isn't built for — a lobby started short — has the Sacked Fort if it
 * fits, and the line battle if not.
 */
export function mapFor(playerCount: number, coop: boolean, map?: CoopMap): RealmArenaMapId {
    if (!coop) return mapForPlayers(playerCount);
    const own = map && fittingHoldOutMap(map, playerCount);
    if (own) return HOLD_OUT_MAPS[own][playerCount];
    return playerCount <= 1 ? "ruinedFort" : playerCount === 2 ? "twinGateFort" : "threeGateFort";
}

/** The battlefield a stored id names; the default for an id no release knows, so a battle can always be read. */
export function battlefieldById(id: string): Battlefield {
    return Object.hasOwn(REALM_ARENA_MAPS, id) ? REALM_ARENA_MAPS[id as RealmArenaMapId] : REALM_ARENA_MAPS[DEFAULT_MAP];
}

/**
 * The battlefield as it stands in a battle: its map, with the low cover
 * blasted so far cleared to scorched ground (docs/games/realm-arena.md §22).
 * What every rule reads, on the server and the board alike. A battle stored
 * before anything could be blasted has no list, and nothing blasted.
 */
export function battlefieldOf(id: string, blasted: readonly Square[] | undefined): Battlefield {
    return battlefieldWith(battlefieldById(id), blasted ?? []);
}
