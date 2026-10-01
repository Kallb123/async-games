// Every battlefield Realm Arena can be fought on, by the id a game stores
// (docs/games/realm-arena.md §17.4 B1 adds the second). A battle persists the
// id rather than the map, so the map stays code and a fix to it reaches every
// battle — which is also why the id, once used, can never be renamed.

import type { Battlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./ruinedFort";

export const REALM_ARENA_MAPS = {
    ruinedFort: RUINED_FORT,
} as const satisfies Record<string, Battlefield>;

export type RealmArenaMapId = keyof typeof REALM_ARENA_MAPS;

/** The two-player map, and the only one until B1 (§17.3). */
export const DEFAULT_MAP: RealmArenaMapId = "ruinedFort";

/** The battlefield a stored id names; the default for an id no release knows, so a battle can always be read. */
export function battlefieldById(id: string): Battlefield {
    return Object.hasOwn(REALM_ARENA_MAPS, id) ? REALM_ARENA_MAPS[id as RealmArenaMapId] : REALM_ARENA_MAPS[DEFAULT_MAP];
}
