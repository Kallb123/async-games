import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { TrainTimeCardColour } from "./board";

/** A Destination Ticket as the client draws it: cities by id, plus how it stands. */
export interface ITrainTimeTicketView {
    id: number;
    cityA: number;
    cityB: number;
    points: number;
    /** Whether the holder's network already connects the two cities. */
    complete: boolean;
}

export interface ITrainTimePlayerStateResponse {
    userId: string;
    username: string;
    /** Only the count is public — the cards themselves are hidden (design doc §10). */
    handCount: number;
    /** Public: how many tickets they hold. Which ones is not. */
    ticketCount: number;
    trains: number;
    /** Route points. The ticket swing lands in ticketScore at the end. */
    score: number;
    /** 0 until final scoring, then the tickets' net contribution (§7). */
    ticketScore: number;
    ticketsCompleted: number;
    /** 0 until final scoring, then LONG_HAUL_BONUS if they laid the longest run (§7). */
    longHaulBonus: number;
    /**
     * Their longest continuous run of track right now, in train spaces. Public
     * and live all game — every claim is on the board for everyone to count —
     * so the Long Haul race can be read before it's scored.
     */
    longestRun: number;
    routesClaimed: number;
    /** Every player's tickets, revealed to the table once the game is over (§10). */
    tickets?: ITrainTimeTicketView[];
}

export interface ITrainTimeSpecificGameStateResponse {
    /** The five face-up cards. Public, and live at render time. */
    market: TrainTimeCardColour[];
    deckCount: number;
    discardCount: number;
    /** Owning username per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    playerStates: { [username: string]: ITrainTimePlayerStateResponse };
    /** Cards the requesting player has already taken in this turn's draw action (0 or 1). */
    myDrawsThisTurn: number;
    /** Usernames who still owe a final turn once the last lap has started, else null. */
    finalRoundPending: string[] | null;
    /**
     * True once the game has actually been played out and scored — tickets
     * revealed, the Long Haul settled (§7). A game that was abandoned or ended
     * early is `complete` without ever being scored, so the two aren't the same
     * question.
     */
    scored: boolean;
    /** The requesting player's own hand — never anybody else's. */
    myHand: TrainTimeCardColour[];
    ticketDeckCount: number;
    /** The requesting player's kept tickets, with live completion. */
    myTickets: ITrainTimeTicketView[];
    /** Tickets on offer to them right now — the setup deal or an Action C draw. */
    myPendingTickets: ITrainTimeTicketView[];
    /** How many of those they must keep; 0 when nothing is pending. */
    myTicketsToKeep: number;
}

export interface ITrainTimeGameDataResponse extends IGameDataResponse {
    specificGameState: ITrainTimeSpecificGameStateResponse;
    /**
     * Whether this game carries the starting snapshot turn recap replays from.
     * False for games dealt before recap support, whose shuffled decks can't be
     * reconstructed — the review controls stay off the screen for those.
     */
    recapAvailable?: boolean;
}
