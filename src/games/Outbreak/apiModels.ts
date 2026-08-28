import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { OutbreakCureState, OutbreakDifficulty, OutbreakDiseaseColor, OutbreakPhase, OutbreakRoleId } from "./board";

export interface IOutbreakCityResponse {
    cubes: Record<OutbreakDiseaseColor, number>;
    station: boolean;
}

export interface IOutbreakPlayerStateResponse {
    userId: string;
    username: string;
    // Public by design — §2's "shared table, shared brain" pillar, sent in
    // full for every player, not just the viewer.
    hand: number[];
    city: number;
    role: OutbreakRoleId | null;
    actionsLeft: number;
}

export interface IOutbreakSpecificGameStateResponse {
    difficulty: OutbreakDifficulty;
    cities: IOutbreakCityResponse[]; // length CITY_COUNT, indexed by city id
    cubesLeft: Record<OutbreakDiseaseColor, number>;
    cures: Record<OutbreakDiseaseColor, OutbreakCureState>;
    outbreaks: number;
    infectionRateIndex: number;
    // Deck order is the one thing nobody should be able to read off the wire
    // (docs/new-game.md, "Don't leak hidden information") — redacted to a
    // count for every viewer, not just per-player.
    playerDeckCount: number;
    playerDiscard: number[];
    infectionDeckCount: number;
    // Public, and the game's most-read information (§14.2).
    infectionDiscard: number[];
    playerStates: { [username: string]: IOutbreakPlayerStateResponse };
    phase: OutbreakPhase;
    // One Quiet Night (§12): true once played, until it consumes itself by
    // skipping the next Infect Cities phase.
    oneQuietNightActive: boolean;
    // Forecast (§12), step 1: the revealed top infection cards awaiting a
    // new order — empty outside `phase === 'forecast'`.
    forecastCards: number[];
}

export interface IOutbreakGameDataResponse extends IGameDataResponse {
    specificGameState: IOutbreakSpecificGameStateResponse;
    // True once the game carries the stored initial-state snapshot recap
    // needs — see IOutbreakGameData.initialSpecificGameState.
    recapAvailable?: boolean;
}
