// Hold Out's own battlefields (docs/games/realm-arena.md §30.9, §35), by the
// name the host picks them by, apart from the maps themselves: the setup
// screen reads which team each is built for without loading a battlefield.

import type { RealmArenaMapId } from ".";

/**
 * The battlefields a co-op host can pick for Hold Out instead of the line
 * battle (§30.9, §35), as the battle stores the choice (`coop.map`): absent is
 * the line battle, as every battle before the choice was.
 */
export const COOP_MAPS = ["sackedFort", "sunkenVillage"] as const;
export type CoopMap = typeof COOP_MAPS[number];

/** Each of Hold Out's own battlefields, for each size of team it's built for. */
export const HOLD_OUT_MAPS: Readonly<Record<CoopMap, Readonly<Record<number, RealmArenaMapId>>>> = {
    sackedFort: { 2: "sackedFortTwo", 3: "sackedFortThree" },
    sunkenVillage: { 3: "sunkenVillageThree" },
};

/**
 * The Hold Out battlefield a team of this size fights on when the host picked
 * `map`: that one if it's built for the team, the Sacked Fort if not and it
 * is — a lobby started short of the party it was set up for — and none if
 * neither is, which is the line battle. What the setup screen offers, too.
 */
export function fittingHoldOutMap(map: CoopMap, players: number): CoopMap | undefined {
    return [map, "sackedFort" as const].find(one => HOLD_OUT_MAPS[one][players] !== undefined);
}
