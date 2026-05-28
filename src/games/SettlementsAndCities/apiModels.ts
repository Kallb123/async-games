import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { SAC_Resource, SAC_DevCard, SAC_Terrain, SAC_Harbor } from "./board";

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
}

export interface ISACGameDataResponse extends IGameDataResponse {
    specificGameState: ISACSpecificGameStateResponse;
}
