import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { RealmArenaMapId } from "./maps";
import type { Fighter, FogGhost, MusterPick, ToldEvent } from "./rules";
import type { MasterySnapshot } from "./mastery";
import type { Square } from "@/utils/games/battlefield/terrain";
import type { RealmArenaPhase, StoredBattleSize, StoredDifficulty } from "./RealmArenaModels";
import type { FactionId } from "./characters";

// docs/games/realm-arena.md §17.2's state, on the wire. Once the battle has
// begun every field of it goes to every player — unless the host chose fog of
// war (§27). Without it, a squad on the battlefield is in plain sight, HP,
// banked AP, cooldowns and all. With it, each player is sent their own squad
// and only the characters it can see, until the battle is over
// (`gameStateToModel`).
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
    /** Each player's points to muster with (§13.6, §30.5). */
    budget: number;
    /** How big the battle is (§30.5); absent is normal. */
    size?: StoredBattleSize;
    /** The factions each player may muster from (B6): at least one, in `FACTION_IDS` order. Only during the muster. */
    factions?: FactionId[];
    /** Whether the battle is fought in fog of war (§27). */
    fog: boolean;
    /** Whether the players fight together against the computer's warbands (§29), so are one side (§29.6). */
    coop: boolean;
    /** The co-op mission; absent is Hold the Centre. */
    mission?: "holdOut";
    /**
     * Hold Out's next wave (§30.11): the round it lands in, and how many of the
     * enemy it would bring if it landed now — or, in fog of war (`upTo`), the
     * most it could bring, and no count while a random enemy is unseen. Absent
     * outside Hold Out's battle, once the last wave has landed, and once the
     * battle is over.
     */
    nextWave?: { round: number; arriving?: number; upTo?: true };
    /** How strong the co-op warbands are (§30.5); absent is Normal. */
    difficulty?: StoredDifficulty;
    /**
     * Whom the team fights, in co-op (§29.3), once the team knows: a faction
     * the host picked from the start, one drawn at random once one of its
     * characters has been seen — or the battle is over. Absent until then,
     * and in a free-for-all.
     */
    enemy?: FactionId;
    /**
     * Everyone on the battlefield, standing or fallen — or, in fog of war, the
     * viewer's own squad and everyone it can see. Empty until every squad has
     * mustered.
     */
    fighters: Fighter[];
    /** Enemy units at the last place the viewer saw them enter the fog. */
    ghosts: FogGhost[];
    /**
     * In fog of war, the smoke clouds the viewer can see whose throwers it
     * can't, by the square each landed on (§27); empty otherwise. The board
     * reads them with the rules (`BattleState.clouds`).
     */
    clouds: Square[];
    /** The low cover blasted away so far (§22): the board reads the map with these cleared, as the rules do. */
    blasted: Square[];
    /** The players, in seat order, who have mustered. Whose turn it is already says who is mustering now. */
    mustered: string[];
    /** The viewer's own sealed squad, while the muster lasts; null once it's over, or for a viewer who hasn't mustered. */
    myMuster: MusterPick[] | null;
    /**
     * The viewer's rank with each character, as the battle snapshotted it
     * when it was created (§23.3): what the muster's options are checked
     * against. Keyed by userId, and holding only the viewer's own — a
     * profile's ranks are for its owner and their friends. Only ranks above 0.
     */
    mastery: MasterySnapshot;
    /** Every player's score, by userId (§13.7). */
    scores: Record<string, number>;
    /** True when the viewer has an action of their own they can still take back (docs/undo.md). The undo stack itself is never sent. */
    canUndo: boolean;
}

export interface IRealmArenaGameDataResponse extends IGameDataResponse {
    specificGameState: IRealmArenaSpecificGameStateResponse;
}

/**
 * What one step of a review did (§26.2), on its replayed snapshot: every event
 * of an action or an End turn, for the board to play. Absent on a step that
 * did nothing to play, a muster above all.
 */
export interface IRealmArenaStepOutcome {
    events: ToldEvent[];
}
