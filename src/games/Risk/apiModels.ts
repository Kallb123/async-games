import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { RiskCardType } from "./board";

export type RiskPhase = 'setup' | 'reinforce' | 'attack' | 'fortify';

export interface IRiskTerritoryResponse {
    owner: string | null; // username
    armies: number;
}

export interface IRiskCardResponse {
    id: string;
    type: RiskCardType;
    territoryId: number | null;
}

export interface IRiskPlayerStateResponse {
    userId: string;
    username: string;
    territoryCount: number;
    // Full hand, keyed by username same as SAC's playerDevCards: only the
    // requesting user's hand is meaningful client-side, but every hand is sent
    // for simplicity (this app doesn't hide hidden info server-side elsewhere).
    cards: IRiskCardResponse[];
    eliminated: boolean;
}

export interface IRiskPendingOccupationResponse {
    fromTerritoryId: number;
    toTerritoryId: number;
    minArmies: number;
    maxArmies: number;
}

export interface IRiskLastBattleResponse {
    attackerId: string;
    fromTerritoryId: number;
    toTerritoryId: number;
    attackerDice: number[];
    defenderDice: number[];
    attackerLosses: number;
    defenderLosses: number;
    conquered: boolean;
    defenderEliminated: string | null; // username of an eliminated defender, if any
}

export interface IRiskSpecificGameStateResponse {
    territories: IRiskTerritoryResponse[];
    playerStates: { [username: string]: IRiskPlayerStateResponse };
    phase: RiskPhase;
    reinforcementsRemaining: number;
    pendingOccupation: IRiskPendingOccupationResponse | null;
    fortifyUsed: boolean;
    cardSetsCashedIn: number;
    cardDeckSize: number;
    lastBattle: IRiskLastBattleResponse | null;
}

export interface IRiskGameDataResponse extends IGameDataResponse {
    specificGameState: IRiskSpecificGameStateResponse;
}
