import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import type { DifficultyId, RestrictedApKind, RulesetId, SpecialistId, ThreatLevel } from "./rules";
import type { EdgeKind } from "./board";

export interface IFiresOutPoiResponse {
    id: number;
    revealed: boolean;
    // Present only once revealed (§10.1) — absent, not false, so its absence
    // from the serialised response is provable (see hiddenHands.test.ts's
    // approach for the two other games that redact this way).
    victim?: boolean;
}

export interface IFiresOutSpaceResponse {
    threat: ThreatLevel;
    poi: IFiresOutPoiResponse | null;
    hazmat: boolean;
    hotspot: boolean;
}

export interface IFiresOutEdgeResponse {
    kind: EdgeKind;
    damage: 0 | 1 | 2;
    doorOpen: boolean;
}

export interface IFiresOutFirefighterResponse {
    ownerId: string;
    username: string;
    space: number;
    specialist: SpecialistId;
    apLeft: number;
    restrictedAp: { kind: RestrictedApKind; left: number } | null;
    bankedAp: number;
    carrying: 'victim' | 'hazmat' | null;
}

export interface IFiresOutSpecificGameStateResponse {
    ruleset: RulesetId;
    difficulty: DifficultyId;
    spaces: IFiresOutSpaceResponse[];
    edges: IFiresOutEdgeResponse[];
    // The undrawn POI pool is a deck, not a die (§17.5) — redacted to a count,
    // the same treatment Outbreak gives its two decks.
    poiPoolCount: number;
    rescued: number;
    lost: number;
    firefighters: IFiresOutFirefighterResponse[];
    activeFirefighter: number;
    /** §9.4: hot spot markers not yet placed — 0 in a Family game. */
    hotspotReserve: number;
}

export interface IFiresOutGameDataResponse extends IGameDataResponse {
    specificGameState: IFiresOutSpecificGameStateResponse;
    recapAvailable?: boolean;
}
