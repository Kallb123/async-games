import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { WorldDominationCardType, WorldDominationPhase } from "./board";

export interface IWorldDominationTerritoryResponse {
    owner: string | null; // username
    armies: number;
}

export interface IWorldDominationCardResponse {
    id: string;
    type: WorldDominationCardType;
    territoryId: number | null;
}

export interface IWorldDominationPlayerStateResponse {
    userId: string;
    username: string;
    territoryCount: number;
    // Total armies currently on the board across this player's owned
    // territories (armies are lost in combat, so this can differ turn to turn
    // from what was deployed).
    armies: number;
    // Cumulative armies deployed via WorldDominationDeployArmies over the
    // whole match so far (never decreases, unlike `armies` above).
    totalArmiesDeployed: number;
    // How many territory cards this player holds. Public: hand size is visible
    // to the table, and it's what tells everyone a player is about to be forced
    // to cash in.
    cardCount: number;
    // The identities behind that count. Cards are dealt face down
    // (docs/games/worlddomination.md §2.4, §3), so this is sent only
    // for the player who asked — everyone else gets cardCount alone. Undefined
    // for other players, and for a viewerless view (recap/result replays).
    cards?: IWorldDominationCardResponse[];
    eliminated: boolean;
}

export interface IWorldDominationPendingOccupationResponse {
    fromTerritoryId: number;
    toTerritoryId: number;
    minArmies: number;
    maxArmies: number;
}

export interface IWorldDominationLastBattleResponse {
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

export interface IWorldDominationSpecificGameStateResponse {
    territories: IWorldDominationTerritoryResponse[];
    playerStates: { [username: string]: IWorldDominationPlayerStateResponse };
    phase: WorldDominationPhase;
    reinforcementsRemaining: number;
    pendingOccupation: IWorldDominationPendingOccupationResponse | null;
    fortifyUsed: boolean;
    cardSetsCashedIn: number;
    cardDeckSize: number;
    lastBattle: IWorldDominationLastBattleResponse | null;
}

export interface IWorldDominationGameDataResponse extends IGameDataResponse {
    specificGameState: IWorldDominationSpecificGameStateResponse;
    // True when the game carries the stored initial-state snapshot needed for
    // turn recap (games created after recap support). Drives whether the recap
    // controls are offered.
    recapAvailable?: boolean;
}
