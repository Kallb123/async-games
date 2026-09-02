import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { GameResultStatGroup, uuidString } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { userToken } from "@/utils/games/history";
import { shuffle } from "@/utils/games/shuffle";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { FiresOutGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { AMBULANCE_START, DAMAGE_TO_COLLAPSE, DifficultyId, ENGINE_START, RulesetId, START_SPACE, VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN, difficultyTier } from "./board";
import {
    IFiresOutEdgeState,
    IFiresOutFirefighterState,
    IFiresOutPoiState,
    IFiresOutSpaceState,
    NextRoll,
    applyExperiencedSetup,
    applyFamilySetup,
    buildEmptyEdges,
    buildEmptySpaces,
    dealSpecialists,
    newFirefighter,
    refillFirefighterAp,
    shuffledPoiPool,
    totalDamage,
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

export interface IFiresOutInvitationData extends IInvitationData {
    ruleset: RulesetId;
    difficulty: DifficultyId;
}

export interface IFiresOutInvitationRequest extends IInvitationRequest {
    ruleset: RulesetId;
    difficulty: DifficultyId;
}

export interface IFiresOutInvitationDataDocument extends IFiresOutInvitationData, IInvitationDataDocument {}

export interface IFiresOutInvitationDataModel extends Model<IFiresOutInvitationDataDocument> {}

var FiresOutInvitationSchema = new Schema<IFiresOutInvitationDataDocument>({
    ruleset: String,
    difficulty: String,
}, { discriminatorKey: 'kind' });
FiresOutInvitationSchema.methods.CreateGame = async function(
    invite: IFiresOutInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: FiresOut game');

    const gameType = new FiresOutGameType();
    const ruleset = this.ruleset as RulesetId;
    const difficulty = this.difficulty as DifficultyId;

    // Who's up first is arbitrary (no printed rule decides it) — drawn at
    // random the same way Outbreak and Train Time decide their opening order.
    const turnOrder = shuffle(userIdList);
    const history = [
        { text: `Setup: running order is ${turnOrder.map(userToken).join(' → ')}` },
        { text: ruleset === 'experienced'
            ? `Setup: ${difficulty} difficulty — the crew arrives to a building already compromised by explosion`
            : `Setup: the crew arrives to a fire already spreading through the house` },
    ];

    const specificGameState = buildInitialFiresOutState(turnOrder, ruleset, difficulty);

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
    // §17.6 step 8: the whole family/experienced switch — read by rules.ts's
    // fire system and by setup below, never branched on anywhere else.
    ruleset: RulesetId;
    difficulty: DifficultyId; // meaningless (but always populated) for a Family game
    spaces: IFiresOutSpaceState[]; // length SPACE_COUNT (board.ts) — interior spaces then the exterior track
    edges: IFiresOutEdgeState[]; // length EDGE_COUNT (board.ts), indexed by EdgeDef.id
    poiPool: boolean[]; // shuffled once at setup, drawn in order — redacted to a count on the wire
    nextPoiId: number; // running counter for IFiresOutPoiState.id, so every placed marker gets a stable id
    rescued: number; // §5: 7 wins
    lost: number; // §5: 4 loses
    firefighters: IFiresOutFirefighterState[];
    activeFirefighter: number; // index into firefighters — §17.2's per-figure turn, not per-player
    // §9.4, §17.6 step 8: hot spot markers not yet placed on the board — 0 for
    // every Family game. Placed-on-board + this always equals
    // TOTAL_HOTSPOT_MARKERS (board.ts), the conservation invariant §17.7 asks for.
    hotspotReserve: number;
    // §6.2 step 6, §12, §17.6 step 9: parking spots — always populated (the
    // same "meaningless but populated" pattern as `difficulty`), only ever
    // driven or used as the rescue destination once `ruleset === 'experienced'`.
    engine: number;
    ambulance: number;
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
        restrictedAp: normalizedRestrictedAp(ff.restrictedAp),
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
        ruleset: gs.ruleset,
        difficulty: gs.difficulty,
        spaces: gs.spaces.map(cloneSpaceState),
        edges: gs.edges.map(cloneEdgeState),
        poiPool: [...gs.poiPool],
        nextPoiId: gs.nextPoiId,
        rescued: gs.rescued,
        lost: gs.lost,
        firefighters: gs.firefighters.map(cloneFirefighterState),
        activeFirefighter: gs.activeFirefighter,
        hotspotReserve: gs.hotspotReserve,
        engine: gs.engine,
        ambulance: gs.ambulance,
    };
}

// §6.1/§6.2: Family's fixed diagram or Experienced's rolled setup (§17.6 step
// 8) — one real `nextRoll` here, the only place in this module randomness is
// consumed directly (like shuffledPoiPool's own `shuffle()` call), since
// setup's dice rolls are never replayed — buildInitialFiresOutStateFromGameData
// below clones the persisted *result*, the same way the Family fire cluster
// and the POI shuffle already work.
export function buildInitialFiresOutState(turnOrder: string[], ruleset: RulesetId, difficulty: DifficultyId): IFiresOutSpecificGameState {
    const spaces = buildEmptySpaces();
    const edges = buildEmptyEdges();
    const poiPool = shuffledPoiPool();
    const realRoll: NextRoll = sides => DiceRoll(sides);

    let nextPoiId: number;
    let hotspotReserve: number;
    if (ruleset === 'experienced') {
        ({ nextPoiId, hotspotReserve } = applyExperiencedSetup(spaces, edges, poiPool, difficulty, turnOrder.length, realRoll));
    } else {
        applyFamilySetup(spaces, poiPool);
        nextPoiId = 3; // applyFamilySetup already assigned ids 0-2
        hotspotReserve = 0;
    }

    // §6.2 step 7, §17.6 step 10: one Specialist card per firefighter, dealt
    // at random the same way dealSpecialists mirrors Outbreak's dealRoles —
    // never in the Family game, which sets Specialist cards aside (§6.1 step
    // 7) and leaves every firefighter the 'generalist' placeholder
    // newFirefighter already builds. refillFirefighterAp seeds each
    // firefighter's very first apLeft/restrictedAp from their dealt
    // specialist (bankedAp is still 0, so this is exactly what their first
    // CheckEndTurn would compute) — the same call CheckEndTurn itself makes
    // every turn after, so a specialist's numbers are derived in one place.
    const specialists = ruleset === 'experienced' ? dealSpecialists(turnOrder) : null;
    const firefighters = turnOrder.map(userId => {
        const ff = newFirefighter(userId, START_SPACE);
        if (specialists) ff.specialist = specialists.get(userId)!;
        refillFirefighterAp(ff, ruleset);
        return ff;
    });

    return {
        ruleset,
        difficulty,
        spaces,
        edges,
        poiPool,
        nextPoiId,
        rescued: 0,
        lost: 0,
        firefighters,
        activeFirefighter: 0,
        hotspotReserve,
        engine: ENGINE_START,
        ambulance: AMBULANCE_START,
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
        ruleset: String,
        difficulty: String,
        spaces: [{
            threat: String,
            // A bare nested object here is a Mongoose "single nested
            // subdocument" path, which — unlike every other optional field in
            // this file — can't just flatten to individually-defaulted-null
            // leaves (id/revealed/victim only mean anything together): the
            // whole point is "no POI here at all" vs. a real one. Without
            // `default: undefined`, Mongoose hands back a truthy empty
            // subdocument for a space that was saved with `poi: null`, on
            // every read after the first (every command reloads the document
            // fresh — see requireLiveGame's findOne().exec()), which made
            // every space look like it held an unrevealed POI.
            poi: {
                type: new Schema({ id: Number, revealed: Boolean, victim: Boolean }, { _id: false }),
                default: undefined,
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
        hotspotReserve: Number,
        engine: Number,
        ambulance: Number,
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

// `restrictedAp`'s two leaves (`kind`/`left`) are each individually
// `default: null` in the schema below — the fix `poi` above needed, since
// unlike `poi` there's no "the whole record is meaningless alone" problem —
// so `kind` alone is always trustworthy read straight off a loaded document.
// Checking the *parent* object's truthiness instead (as this used to) isn't:
// a Mongoose nested-object path is never really `null` once loaded, so that
// check always took the truthy branch, matching `poi`'s bug. Used by both
// gameStateToModel (the outgoing DTO) and cloneFirefighterState (the
// initialSpecificGameState snapshot) — it only normalises the value, no
// redaction happens here, so both are safe to share it.
function normalizedRestrictedAp(restrictedAp: IFiresOutFirefighterState['restrictedAp']): IFiresOutFirefighterState['restrictedAp'] {
    return restrictedAp?.kind != null ? { kind: restrictedAp.kind, left: restrictedAp.left } : null;
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
        restrictedAp: normalizedRestrictedAp(ff.restrictedAp),
        bankedAp: ff.bankedAp,
        carrying: ff.carrying,
    }));

    return {
        ruleset: gs.ruleset,
        difficulty: gs.difficulty,
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
        hotspotReserve: gs.hotspotReserve,
        engine: gs.engine,
        ambulance: gs.ambulance,
    };
}

export var FiresOutGameDataModel =
    models.FiresOutGameData ||
    GameDataModel.discriminator<IFiresOutGameDataDocument, IFiresOutGameDataModel>('FiresOutGameData', FiresOutGameDataSchema);

// ─── Result stats (§17.6 step 11) ───────────────────────────────────────────
// A co-op table shares one result — one game-wide stat group, no per-player
// breakdown — the same shape Outbreak's and Solitaire's own summaries use.
// Wired into GAME_RESULT_STATS in src/utils/mongodb/GameResultData.ts.

export interface IFiresOutGameResultStats {
    rescued: number;
    lost: number;
    damage: number;
    turnsLasted: number;
    ruleset: RulesetId;
    difficulty: DifficultyId;
}

export const firesOutGameResultStatsSchemaDef = {
    rescued: Number,
    lost: Number,
    damage: Number,
    turnsLasted: Number,
    ruleset: String,
    difficulty: String,
};

export function computeFiresOutResultStats(gameData: IFiresOutGameData): IFiresOutGameResultStats {
    const gs = gameData.specificGameState;
    return {
        rescued: gs.rescued,
        lost: gs.lost,
        damage: totalDamage(gs.edges),
        // §17.4: "endTurn being the only kind that consumes randomness" — every
        // one runs exactly one Advance Fire, so counting them counts how many
        // times the fire advanced (§17.2's per-figure turn), not how many
        // players got a go.
        turnsLasted: gameData.gameState.commandHistory.filter(c => (c as unknown as { kind?: string }).kind === 'endTurn').length,
        ruleset: gs.ruleset,
        difficulty: gs.difficulty,
    };
}

export function formatFiresOutResultStats(stats: IFiresOutGameResultStats): GameResultStatGroup[] {
    const tierLabel = stats.ruleset === 'experienced' ? difficultyTier(stats.difficulty).label : 'Family';
    return [{
        lines: [
            `${pluralize(stats.rescued, 'victim')} rescued of ${VICTIMS_TO_WIN} · ${pluralize(stats.lost, 'victim')} lost of ${VICTIMS_LOST_TO_LOSE}`,
            `${stats.damage}/${DAMAGE_TO_COLLAPSE} damage · ${tierLabel} · ${pluralize(stats.turnsLasted, 'turn')}`,
        ],
    }];
}
