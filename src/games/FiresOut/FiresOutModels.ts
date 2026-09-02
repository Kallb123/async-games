import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { userToken } from "@/utils/games/history";
import { shuffle } from "@/utils/games/shuffle";
import { FiresOutGameType } from "@/utils/apiModels/GameLogic";
import { START_SPACE } from "./board";
import {
    IFiresOutEdgeState,
    IFiresOutFirefighterState,
    IFiresOutPoiState,
    IFiresOutSpaceState,
    applyFamilySetup,
    buildEmptyEdges,
    buildEmptySpaces,
    newFirefighter,
    shuffledPoiPool,
} from "./rules";
import {
    IFiresOutFirefighterResponse,
    IFiresOutGameDataResponse,
    IFiresOutPoiResponse,
    IFiresOutSpaceResponse,
    IFiresOutSpecificGameStateResponse,
} from "./apiModels";

// ═══════════════════════════════════════════════════════════════════════════
//  FIRES OUT
// ═══════════════════════════════════════════════════════════════════════════

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface IFiresOutInvitationData extends IInvitationData {}

export interface IFiresOutInvitationRequest extends IInvitationRequest {}

export interface IFiresOutInvitationDataDocument extends IFiresOutInvitationData, IInvitationDataDocument {}

export interface IFiresOutInvitationDataModel extends Model<IFiresOutInvitationDataDocument> {}

var FiresOutInvitationSchema = new Schema<IFiresOutInvitationDataDocument>({}, { discriminatorKey: 'kind' });
FiresOutInvitationSchema.methods.CreateGame = async function(
    invite: IFiresOutInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: FiresOut game');

    const gameType = new FiresOutGameType();

    // Who's up first is arbitrary (no printed rule decides it) — drawn at
    // random the same way Outbreak and Train Time decide their opening order.
    const turnOrder = shuffle(userIdList);
    const history = [
        { text: `Setup: running order is ${turnOrder.map(userToken).join(' → ')}` },
        { text: `Setup: the crew arrives to a fire already spreading through the house` },
    ];

    const specificGameState = buildInitialFiresOutState(turnOrder);

    const gameData: IFiresOutGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: {
            turnOrder,
            history,
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState,
        initialSpecificGameState: cloneFiresOutState(specificGameState),
    };
    return gameData;
};
export var FiresOutInvitationModel =
    models.FiresOutInvitation ||
    InvitationModel.discriminator<IFiresOutInvitationDataDocument, IFiresOutInvitationDataModel>('FiresOutInvitation', FiresOutInvitationSchema);

// ─── specificGameState ───────────────────────────────────────────────────────

export interface IFiresOutSpecificGameState {
    spaces: IFiresOutSpaceState[]; // length SPACE_COUNT (board.ts) — interior spaces then the exterior track
    edges: IFiresOutEdgeState[]; // length EDGE_COUNT (board.ts), indexed by EdgeDef.id
    poiPool: boolean[]; // shuffled once at setup, drawn in order — redacted to a count on the wire
    nextPoiId: number; // running counter for IFiresOutPoiState.id, so every placed marker gets a stable id
    rescued: number; // §5: 7 wins
    lost: number; // §5: 4 loses
    firefighters: IFiresOutFirefighterState[];
    activeFirefighter: number; // index into firefighters — §17.2's per-figure turn, not per-player
}

function cloneSpaceState(s: IFiresOutSpaceState): IFiresOutSpaceState {
    return { threat: s.threat, poi: s.poi ? { ...s.poi } : null, hazmat: s.hazmat, hotspot: s.hotspot };
}

function cloneEdgeState(e: IFiresOutEdgeState): IFiresOutEdgeState {
    return { kind: e.kind, damage: e.damage, doorOpen: e.doorOpen };
}

function cloneFirefighterState(ff: IFiresOutFirefighterState): IFiresOutFirefighterState {
    return {
        ownerId: ff.ownerId,
        space: ff.space,
        specialist: ff.specialist,
        apLeft: ff.apLeft,
        restrictedAp: ff.restrictedAp ? { ...ff.restrictedAp } : null,
        bankedAp: ff.bankedAp,
        carrying: ff.carrying,
    };
}

// Deep-clones a FiresOut state into independent plain objects — mirrors
// Outbreak's cloneOutbreakState. Unlike Outbreak's player Map, firefighters
// is a plain array built once in turnOrder order and never reordered, so
// there's no per-player key to rebuild by; cloning it element-for-element is
// enough to keep a persisted initialSpecificGameState snapshot independent of
// the live one turn recap replays from (docs/new-game.md, "a reproducible
// starting state").
export function cloneFiresOutState(gs: IFiresOutSpecificGameState): IFiresOutSpecificGameState {
    return {
        spaces: gs.spaces.map(cloneSpaceState),
        edges: gs.edges.map(cloneEdgeState),
        poiPool: [...gs.poiPool],
        nextPoiId: gs.nextPoiId,
        rescued: gs.rescued,
        lost: gs.lost,
        firefighters: gs.firefighters.map(cloneFirefighterState),
        activeFirefighter: gs.activeFirefighter,
    };
}

// §6.1: the Family game — the only ruleset built so far (fires-out-gdd.md
// §17.6 step 3) — starting fire cluster, first 3 POIs, one firefighter per
// player at the front door.
export function buildInitialFiresOutState(turnOrder: string[]): IFiresOutSpecificGameState {
    const spaces = buildEmptySpaces();
    const poiPool = shuffledPoiPool();
    applyFamilySetup(spaces, poiPool);

    return {
        spaces,
        edges: buildEmptyEdges(),
        poiPool,
        nextPoiId: 3, // applyFamilySetup already assigned ids 0-2
        rescued: 0,
        lost: 0,
        firefighters: turnOrder.map(userId => newFirefighter(userId, START_SPACE)),
        activeFirefighter: 0,
    };
}

// Rebuilds the deterministic starting specificGameState for turn recap: the
// fire cluster placement and the POI pool shuffle are both randomised at
// creation and then consumed during play, so — like Outbreak and World
// Domination — replay clones the persisted initialSpecificGameState snapshot
// rather than re-deriving it.
export function buildInitialFiresOutStateFromGameData(gameData: IFiresOutGameData): IFiresOutSpecificGameState {
    return cloneFiresOutState(gameData.initialSpecificGameState);
}

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IFiresOutGameData extends IGameData {
    specificGameState: IFiresOutSpecificGameState;
    initialSpecificGameState: IFiresOutSpecificGameState;
}

export interface IFiresOutGameDataDocument extends IFiresOutGameData, IGameDataDocument {}

export interface IFiresOutGameDataModel extends Model<IFiresOutGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

function firesOutStateSchemaDef() {
    return {
        spaces: [{
            threat: String,
            poi: {
                id: Number,
                revealed: Boolean,
                victim: Boolean,
            },
            hazmat: Boolean,
            hotspot: Boolean,
        }],
        edges: [{
            kind: String,
            damage: Number,
            doorOpen: Boolean,
        }],
        poiPool: [Boolean],
        nextPoiId: Number,
        rescued: Number,
        lost: Number,
        firefighters: [{
            ownerId: String,
            space: Number,
            specialist: String,
            apLeft: Number,
            restrictedAp: {
                kind: { type: String, default: null },
                left: { type: Number, default: null },
            },
            bankedAp: Number,
            carrying: { type: String, default: null },
        }],
        activeFirefighter: Number,
    };
}

var FiresOutGameDataSchema = new Schema<IFiresOutGameDataDocument>(
    {
        specificGameState: firesOutStateSchemaDef(),
        initialSpecificGameState: firesOutStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

FiresOutGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<IFiresOutGameDataResponse> {
    console.log('CreateDataResponse: FiresOut game');

    const doc: IFiresOutGameData = this as IFiresOutGameData;
    const { userIdListToNamesAndMap } = await import("@/utils/users/clerk");
    const { usernameList, userIdNameMap } = await userIdListToNamesAndMap(doc.userIdList);

    return {
        gameType: doc.gameType,
        usernameList,
        userIdList: doc.userIdList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: publicGameState(doc.gameState, userIdNameMap),
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

function poiResponse(poi: IFiresOutPoiState | null): IFiresOutPoiResponse | null {
    if (!poi) return null;
    // §10.1's design note is the whole reason this game has hidden
    // information: strip `victim` from any marker nobody has flipped over
    // yet (docs/new-game.md, "Don't leak hidden information") — the same
    // redaction Solitaire applies to a face-down card's rank/suit.
    return poi.revealed ? { id: poi.id, revealed: true, victim: poi.victim } : { id: poi.id, revealed: false };
}

// `_viewerId` is unused: nothing in this state is hidden per-player — POI
// identity is redacted from *everybody* until revealed, not just from
// opponents, and §17.3 requires every crewmate's AP, specialist and position
// to be visible on every screen (the crew planner depends on it). Kept in the
// signature to match the shared CreateDataResponse contract, the same as
// Outbreak's gameStateToModel.
export function gameStateToModel(
    gs: IFiresOutSpecificGameState,
    userIdNameMap: { [key: string]: string },
    _viewerId: string | null,
): IFiresOutSpecificGameStateResponse {
    const spaces: IFiresOutSpaceResponse[] = gs.spaces.map(s => ({
        threat: s.threat,
        poi: poiResponse(s.poi),
        hazmat: s.hazmat,
        hotspot: s.hotspot,
    }));

    const firefighters: IFiresOutFirefighterResponse[] = gs.firefighters.map(ff => ({
        ownerId: ff.ownerId,
        username: userIdNameMap[ff.ownerId] ?? ff.ownerId,
        space: ff.space,
        specialist: ff.specialist,
        apLeft: ff.apLeft,
        restrictedAp: ff.restrictedAp ? { ...ff.restrictedAp } : null,
        bankedAp: ff.bankedAp,
        carrying: ff.carrying,
    }));

    return {
        spaces,
        edges: gs.edges.map(e => ({ kind: e.kind, damage: e.damage, doorOpen: e.doorOpen })),
        // Deck order is exactly what §10's design note says the game must not
        // reveal — redact to a count, the same treatment Outbreak gives its
        // two decks.
        poiPoolCount: gs.poiPool.length,
        rescued: gs.rescued,
        lost: gs.lost,
        firefighters,
        activeFirefighter: gs.activeFirefighter,
    };
}

export var FiresOutGameDataModel =
    models.FiresOutGameData ||
    GameDataModel.discriminator<IFiresOutGameDataDocument, IFiresOutGameDataModel>('FiresOutGameData', FiresOutGameDataSchema);
