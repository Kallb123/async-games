import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { SAC_Resource, SAC_DevCard, SAC_Terrain, SAC_Harbor } from "./board";
import type { SACExpansions } from "./expansions";

export interface ISACHexResponse {
    terrain: SAC_Terrain;
    numberToken: number | null;
}

export interface ISACVertexResponse {
    building: 'settlement' | 'city' | null;
    owner: string | null;
}

export interface ISACEdgeResponse {
    hasRoad: boolean;
    owner: string | null;
}

export interface ISACHarborResponse {
    type: SAC_Harbor;
    vertices: [number, number];
}

export interface ISACPlayerStateResponse {
    userId: string;
    username: string;
    resources: { [K in SAC_Resource]: number };
    devCardCount: number;
    knightsPlayed: number;
    remainingRoads: number;
    remainingSettlements: number;
    remainingCities: number;
    // Visible VP only (no hidden VP dev cards)
    visibleVP: number;
}

export interface ISACSpecificGameStateResponse {
    hexes: ISACHexResponse[];
    vertices: ISACVertexResponse[];
    edges: ISACEdgeResponse[];
    harbors: ISACHarborResponse[];
    playerStates: { [username: string]: ISACPlayerStateResponse };
    robberHexIndex: number;
    phase: 'setup' | 'main';
    setupStep: number;
    pendingRoadSetup: boolean;
    lastSetupSettlementVertex: number | null;
    hasRolled: boolean;
    lastRoll: number | null;
    pendingRobber: boolean;
    longestRoadOwner: string | null;
    largestArmyOwner: string | null;
    devCardDeckSize: number;
    pendingRoadBuilding: number;
    playedDevCard: boolean;
    // Own dev cards (only sent for the requesting user, but for simplicity we always include all)
    playerDevCards: { [username: string]: { [K in SAC_DevCard]: number } };
    // Dev cards bought this turn — held but not yet playable until the turn ends
    // (they're promoted into playerDevCards on end-of-turn). Surfaced so the hand
    // can distinguish a just-bought card from a playable one.
    playerNewDevCards: { [username: string]: { [K in SAC_DevCard]: number } };
    // 5–6 Player Extension Special Build Phase (§8.5). `specialBuildActive` is
    // true while other players take their between-turns build; `specialBuildQueue`
    // lists the usernames still owed a special-build turn (index 0 = active now);
    // `specialBuildMainPlayer` is the player whose main turn opened the phase.
    specialBuildActive: boolean;
    specialBuildQueue: string[];
    specialBuildMainPlayer: string | null;
    // Active expansions and the VP target they imply (design doc §8).
    expansions: SACExpansions;
    victoryTarget: number;
}

export interface ISACGameDataResponse extends IGameDataResponse {
    specificGameState: ISACSpecificGameStateResponse;
    // True when the game carries the stored initial-state snapshot needed for
    // turn recap (games created after recap support). Drives whether the recap
    // controls are offered.
    recapAvailable?: boolean;
}
