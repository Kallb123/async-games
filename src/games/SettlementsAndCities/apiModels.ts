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
    // How many resource cards this player holds. Public: hand size is open
    // information in Catan — it's what the robber and the 7-discard are played
    // around — and it's all the scoreboard needs.
    resourceCount: number;
    // Which resources make up that count. A hand's composition is hidden
    // (docs/games/settlements-and-cities.md §6 "The Robber" — a hand is stolen
    // from at random, not chosen from), so this is sent only for the
    // player who asked. Undefined for everyone else, and for a viewerless view
    // (recap/result replays).
    resources?: { [K in SAC_Resource]: number };
    // Dev cards held — playable and just-bought counted together, since a
    // purchase happens in the open even though the card drawn doesn't. This is
    // the only dev-card figure other players get; playerDevCards below carries
    // the identities, and only for the viewer.
    devCardCount: number;
    knightsPlayed: number;
    // Cumulative resources gathered from any source this match (production,
    // setup, robber steals, Year of Plenty, Monopoly) - never decremented by
    // spending. Powers the resources/turn chart on the result page.
    resourcesGathered: number;
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
    lastRollDie1: number | null;
    lastRollDie2: number | null;
    pendingRobber: boolean;
    longestRoadOwner: string | null;
    largestArmyOwner: string | null;
    devCardDeckSize: number;
    pendingRoadBuilding: number;
    playedDevCard: boolean;
    // Dev card identities, keyed by username. Development cards are hidden —
    // including the victory-point ones, which stay hidden until they win the
    // game (docs/games/settlements-and-cities.md §6 "Development Cards", §7) —
    // so this carries exactly one entry: the player who asked.
    // Empty for a viewerless view. Everyone else's holding is devCardCount.
    playerDevCards: { [username: string]: { [K in SAC_DevCard]: number } };
    // Dev cards bought this turn — held but not yet playable until the turn ends
    // (they're promoted into playerDevCards on end-of-turn). Surfaced so the hand
    // can distinguish a just-bought card from a playable one. Viewer-only, same
    // as playerDevCards.
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
