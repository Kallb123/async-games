import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { TrainTimeCardColour } from "./board";

export interface ITrainTimePlayerStateResponse {
    userId: string;
    username: string;
    /** Only the count is public — the cards themselves are hidden (design doc §10). */
    handCount: number;
    trains: number;
    score: number;
    routesClaimed: number;
}

export interface ITrainTimeSpecificGameStateResponse {
    /** The five face-up cards. Public, and live at render time. */
    market: TrainTimeCardColour[];
    deckCount: number;
    discardCount: number;
    /** Owning username per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    playerStates: { [username: string]: ITrainTimePlayerStateResponse };
    /** Cards the active player has already taken in this turn's draw action (0 or 1). */
    drawsThisTurn: number;
    /** Usernames who still owe a final turn once the last lap has started, else null. */
    finalRoundPending: string[] | null;
    /** The requesting player's own hand — never anybody else's. */
    myHand: TrainTimeCardColour[];
}

export interface ITrainTimeGameDataResponse extends IGameDataResponse {
    specificGameState: ITrainTimeSpecificGameStateResponse;
}
