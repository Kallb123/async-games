import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { RealmArenaMapId } from "./maps";
import type { Fighter, MusterPick } from "./rules";
import type { Square } from "@/utils/games/battlefield/terrain";
import type { RealmArenaPhase } from "./RealmArenaModels";

// docs/games/realm-arena.md §17.2's state, on the wire. Once the battle has
// begun every field of it goes to every player: there is no fog of war in the
// first playable version (§8), so a squad on the battlefield is in plain sight,
// HP, banked AP, cooldowns and all.
//
// The one secret is the muster (§17.2): until the last player has mustered,
// each player's squad is theirs alone. It isn't on the battlefield yet — it's
// in `myMuster`, sent only to the player it belongs to, and nothing else here
// is derived from anyone else's (`fighters` stays empty until the battle
// begins, so not even a count or a fighter id gives a squad away).

export interface IRealmArenaSpecificGameStateResponse {
    map: RealmArenaMapId;
    phase: RealmArenaPhase;
    /** The battle round being played, from 1; the last one once the battle is over, and 0 during the muster. */
    round: number;
    /** How many battle rounds the battle lasts (§13.8). */
    battleRounds: number;
    /** Each player's points to muster with (§13.6). */
    budget: number;
    /** Everyone on the battlefield, standing or fallen. Empty until every squad has mustered. */
    fighters: Fighter[];
    /** The low cover blasted away so far (§22): the board reads the map with these cleared, as the rules do. */
    blasted: Square[];
    /** The players, in seat order, who have mustered. Whose turn it is already says who is mustering now. */
    mustered: string[];
    /** The viewer's own sealed squad, while the muster lasts; null once it's over, or for a viewer who hasn't mustered. */
    myMuster: MusterPick[] | null;
    /** Every player's score, by userId (§13.7). */
    scores: Record<string, number>;
    /** True when the viewer has an action of their own they can still take back (docs/undo.md). The undo stack itself is never sent. */
    canUndo: boolean;
}

export interface IRealmArenaGameDataResponse extends IGameDataResponse {
    specificGameState: IRealmArenaSpecificGameStateResponse;
}
