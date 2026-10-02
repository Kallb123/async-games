// Every battlefield Realm Arena can be fought on, by the id a game stores
// (docs/games/realm-arena.md §15, §19): one per player count, since a map's
// fairness rests on its deployment zones (§19.1). A battle persists the
// id rather than the map, so the map stays code and a fix to it reaches every
// battle — which is also why the id, once used, can never be renamed.

import type { Battlefield } from "@/utils/games/battlefield/terrain";
import { FOUR_GATE_FORT } from "./fourGateFort";
import { RING_FORT } from "./ringFort";
import { RUINED_FORT } from "./ruinedFort";

export const REALM_ARENA_MAPS = {
    ruinedFort: RUINED_FORT,
    ringFort: RING_FORT,
    fourGateFort: FOUR_GATE_FORT,
} as const satisfies Record<string, Battlefield>;

export type RealmArenaMapId = keyof typeof REALM_ARENA_MAPS;

/** The two-player map, and the one an unknown id falls back to. */
export const DEFAULT_MAP: RealmArenaMapId = "ruinedFort";

/** Where each seat deploys on each map, in seat order, as the setup log names it. */
export const DEPLOYMENT_NAMES: Readonly<Record<RealmArenaMapId, readonly string[]>> = {
    ruinedFort: ["along the north edge", "along the south edge"],
    ringFort: ["in the north-west corner", "in the north-east corner", "in the middle of the south edge"],
    fourGateFort: ["in the north-west corner", "in the north-east corner", "in the south-east corner", "in the south-west corner"],
};

/** The map a party of this size fights on (§19.1): the Ruined Fort for two, the Ring Fort for three, the Four-Gate Fort for four. */
export function mapForPlayers(playerCount: number): RealmArenaMapId {
    return playerCount <= 2 ? "ruinedFort" : playerCount === 3 ? "ringFort" : "fourGateFort";
}

/** The battlefield a stored id names; the default for an id no release knows, so a battle can always be read. */
export function battlefieldById(id: string): Battlefield {
    return Object.hasOwn(REALM_ARENA_MAPS, id) ? REALM_ARENA_MAPS[id as RealmArenaMapId] : REALM_ARENA_MAPS[DEFAULT_MAP];
}
