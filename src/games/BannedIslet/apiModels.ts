import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type {
    BannedIsletCardId,
    BannedIsletDifficulty,
    BannedIsletPhase,
    BannedIsletRoleId,
    BannedIsletTileId,
    BannedIsletTileState,
    BannedIsletTreasureId,
} from "./board";

export interface IBannedIsletPositionResponse {
    tile: BannedIsletTileId;
    state: BannedIsletTileState;
}

export interface IBannedIsletPlayerStateResponse {
    userId: string;
    username: string;
    // Public by design — §2's "shared table, shared brain" pillar, the same
    // call Outbreak makes, sent in full for every player and not just the
    // viewer. The decks below are the only thing this game hides.
    hand: BannedIsletCardId[];
    // A grid position, not a tile id (§21.4): everything a pawn does is
    // spatial, and a sunk tile still occupies a hole routes have to go round.
    position: number;
    role: BannedIsletRoleId;
    actionsLeft: number;
    // The Pilot's once-a-turn flight (§12) — public like actionsLeft, so the
    // action picker can offer it only while it is still available.
    pilotFlightUsed: boolean;
}

export interface IBannedIsletSpecificGameStateResponse {
    difficulty: BannedIsletDifficulty;
    // 24 entries, indexed by grid position (§5.1). The island's shape is
    // constant; which named tile sits where is shuffled at setup.
    positions: IBannedIsletPositionResponse[];
    waterLevel: number;
    treasures: Record<BannedIsletTreasureId, boolean>;
    // Both deck orders are redacted to counts (§21.4, and docs/new-game.md's
    // "Don't leak hidden information"): knowing which tile drowns next is the
    // whole game.
    treasureDeckCount: number;
    treasureDiscard: BannedIsletCardId[];
    floodDeckCount: number;
    // Public, and the most-read thing on screen — reading it is the skill
    // §14.2 is built to reward, so hiding it would remove the game's only
    // forecast.
    floodDiscard: BannedIsletTileId[];
    // Keyed by the player's stable Clerk userId; each value carries the
    // username for display.
    playerStates: { [userId: string]: IBannedIsletPlayerStateResponse };
    phase: BannedIsletPhase;
}

export interface IBannedIsletGameDataResponse extends IGameDataResponse {
    specificGameState: IBannedIsletSpecificGameStateResponse;
    // True once the game carries the stored initial-state snapshot recap
    // needs — see IBannedIsletGameData.initialSpecificGameState.
    recapAvailable?: boolean;
}
