import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { RaceCarsGear, RaceCarsSpecId } from "./board";
import type { RaceCarsPhase } from "./rules";

// docs/games/race-cars.md §23.4's state, on the wire. Every field of it, in
// fact: §2's fourth pillar makes the whole game public — the dice are thrown
// in the open, the wear pools are printed beside each car and the turn in
// progress is the thing the next driver is watching. Nothing below is a count
// standing in for something hidden, because there is nothing hidden.
//
// That is a claim rather than an absence, and RaceCarsModels.test.ts asserts
// it as a key list rather than a substring: the day a field arrives that a
// driver *shouldn't* see, the assertion fails instead of shipping it.

export interface IRaceCarsSlickResponse {
    row: number;
    lane: number;
    /** The round it was laid in — a driver can read how long it has left (§14). */
    laidOnRound: number;
}

export interface IRaceCarsPlayerStateResponse {
    userId: string;
    username: string;
    /** Grid slot, 1-6, printed on the car — the second identity channel (§19). */
    raceNumber: number;
    row: number;
    lane: number;
    lapsCompleted: number;
    gear: RaceCarsGear;
    tyres: number;
    brakes: number;
    gearbox: number;
    /** Stops banked in the corner this car is standing in; 0 on a straight (§10). */
    cornerStops: number;
    skipNextTurn: boolean;
    /** Written once, for the whole field, by the ending (§4.2). */
    finishedPosition: number | null;
    // The turn in progress. Public like everything else: §7's whole shape is
    // that the field watches a driver's number come up before they choose
    // where to spend it, and the board draws the reach band from it.
    phase: RaceCarsPhase;
    roll: number | null;
    brakeSpent: number;
}

export interface IRaceCarsSpecificGameStateResponse {
    trackId: string;
    laps: number;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
    round: number;
    /** userIds, leader first — fixed for this round, and readable before anybody moves (§15). */
    roundOrder: string[];
    roundIndex: number;
    slicks: IRaceCarsSlickResponse[];
    /** Keyed by the player's stable Clerk userId; each value carries the username for display. */
    playerStates: { [userId: string]: IRaceCarsPlayerStateResponse };
}

export interface IRaceCarsGameDataResponse extends IGameDataResponse {
    specificGameState: IRaceCarsSpecificGameStateResponse;
    // True once the game carries the stored starting-grid snapshot recap
    // replays from — see IRaceCarsGameData.initialSpecificGameState. The board
    // screen's TurnNavControls gate on it, which is why it ships with the
    // snapshot rather than with the recap adapter that reads it.
    recapAvailable?: boolean;
}
