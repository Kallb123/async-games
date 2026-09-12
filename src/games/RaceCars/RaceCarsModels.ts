import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RaceCarsGameType } from "@/utils/apiModels/GameLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import { userToken } from "@/utils/games/history";
import { pluralize } from "@/utils/ui/text";
import {
    DEFAULT_TRACK_ID,
    distanceDef,
    RaceCarsDistanceId,
    RaceCarsSpecId,
    readRaceSettings,
    specDef,
    trackById,
} from "./board";
import type { IRaceCarsPlayerState, IRaceCarsSpecificGameState } from "./rules";
import {
    IRaceCarsGameDataResponse,
    IRaceCarsSpecificGameStateResponse,
} from "./apiModels";

// ═══════════════════════════════════════════════════════════════════════════
//  RACE CARS
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/race-cars.md §23.7 PR 2: a race can be created and its grid read
// back. §23.4 fixes the state this file persists and §6 the setup it performs.

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface RaceCarsInvitationRequest extends IInvitationRequest {
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

export interface IRaceCarsInvitationData extends IInvitationData {
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

export interface IRaceCarsInvitationDataDocument extends IRaceCarsInvitationData, IInvitationDataDocument {}

export interface IRaceCarsInvitationDataModel extends Model<IRaceCarsInvitationDataDocument> {}

var RaceCarsInvitationSchema = new Schema<IRaceCarsInvitationDataDocument>({
    distance: String,
    spec: String,
    oilSpills: Boolean,
}, { discriminatorKey: 'kind' });
RaceCarsInvitationSchema.methods.CreateGame = async function(
    invite: IRaceCarsInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Race Cars game');

    const gameType = new RaceCarsGameType();

    // §6 step 4: the field is drawn into the grid slots, which is the only
    // randomness in setup — and, by step 6, also the running order for round
    // one, since turn order is track order and P1 leads. One draw, not two.
    const { turnOrder, history } = rollOffTurnOrder(userIdList);
    const specificGameState = buildInitialRaceCarsState(turnOrder, this as IRaceCarsInvitationData);

    const track = trackById(specificGameState.trackId);
    const spec = specDef(specificGameState.spec);

    const gameData: IRaceCarsGameData = {
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
            history: [
                // The settings are read back off the state rather than off the
                // invitation: a lobby-created race can arrive holding anything
                // at all, and the log should say what is actually being raced.
                { text: `Setup: ${pluralize(specificGameState.laps, 'lap')} of ${track.name} — ${track.corners.length} corners a lap` },
                { text: `Setup: every car runs the ${spec.name} spec — ${spec.tyres} tyres, ${spec.brakes} brakes, ${spec.gearbox} gearbox` },
                { text: `Setup: oil spills are ${specificGameState.oilSpills ? 'on' : 'off'}` },
                { text: `Setup: the grid is ${turnOrder.map((userId, slot) => `P${slot + 1} ${userToken(userId)}`).join(', ')}` },
                ...history,
            ],
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState,
        initialSpecificGameState: cloneRaceCarsState(specificGameState, turnOrder),
    };
    return gameData;
};
export var RaceCarsInvitationModel =
    models.RaceCarsInvitation ||
    InvitationModel.discriminator<IRaceCarsInvitationDataDocument, IRaceCarsInvitationDataModel>('RaceCarsInvitation', RaceCarsInvitationSchema);

// ─── Setup (§6) ─────────────────────────────────────────────────────────────
//
// `IRaceCarsPlayerState` and `IRaceCarsSpecificGameState` are declared in
// rules.ts rather than here, so the schema below, the command classes and the
// board all read one definition of §23.4's state (see rules.ts).

function clonePlayerState(ps: IRaceCarsPlayerState): IRaceCarsPlayerState {
    // Every field named rather than spread: a Mongoose subdocument keeps its
    // fields behind getters, so `{ ...ps }` copies none of them and the
    // replayed grid would start with `undefined` everywhere (mongoMaps.ts).
    return {
        raceNumber: ps.raceNumber,
        row: ps.row,
        lane: ps.lane,
        lapsCompleted: ps.lapsCompleted,
        gear: ps.gear,
        tyres: ps.tyres,
        brakes: ps.brakes,
        gearbox: ps.gearbox,
        cornerStops: ps.cornerStops,
        skipNextTurn: ps.skipNextTurn,
        finishedPosition: ps.finishedPosition,
        phase: ps.phase,
        roll: ps.roll,
        brakeSpent: ps.brakeSpent,
    };
}

/**
 * Deep-clones a Race Cars state into independent plain objects, rebuilding the
 * player map in `userIdList` order (see `clonePlayerStates`).
 *
 * The grid draw of §6 step 4 is randomised at creation and is gone from the
 * live state the moment the first car moves, so — like every other multiplayer
 * game here — turn recap replays from a snapshot of it rather than re-deriving
 * it (§23.4, "Recorded randomness").
 */
export function cloneRaceCarsState(
    gs: IRaceCarsSpecificGameState,
    userIdList: string[],
): IRaceCarsSpecificGameState {
    return {
        trackId: gs.trackId,
        laps: gs.laps,
        spec: gs.spec,
        oilSpills: gs.oilSpills,
        round: gs.round,
        roundOrder: [...gs.roundOrder],
        roundIndex: gs.roundIndex,
        slicks: gs.slicks.map(slick => ({ row: slick.row, lane: slick.lane, laidOnRound: slick.laidOnRound })),
        players: clonePlayerStates(gs.players, userIdList, clonePlayerState),
    };
}

/**
 * The grid of §6, with `turnOrder` already drawn: P1 first, so the running
 * order for round one *is* the grid order (step 6).
 *
 * Every car is identical (§5.3) — same spec, same full wear pools, gear 0, no
 * corner stops banked — so the only thing that separates two drivers at the
 * start line is which of §5.2's six staggered spaces they were dealt and who
 * moves first.
 *
 * The three settings are normalised rather than trusted: `POST /api/lobby`
 * spreads a host's per-game settings into the invitation unchecked, so this is
 * the one place both creation paths reach (§23.4). See `readRaceSettings`.
 */
export function buildInitialRaceCarsState(
    turnOrder: string[],
    raw: { distance?: unknown; spec?: unknown; oilSpills?: unknown },
): IRaceCarsSpecificGameState {
    const { settings } = readRaceSettings(raw);
    const track = trackById(DEFAULT_TRACK_ID);
    const spec = specDef(settings.spec);

    // Unreachable by either creation path — both bound the party against
    // MAX_PLAYERS, which §23.4's track invariant holds `grid.length` to — so
    // this is a programming error rather than a race to degrade, and it is
    // better thrown at creation than discovered as a car parked at an
    // undefined row with a duplicate race number.
    if (turnOrder.length > track.grid.length) {
        throw new Error(`Race Cars: ${turnOrder.length} drivers for ${track.grid.length} grid slots at ${track.name}`);
    }

    const players = new Map<string, IRaceCarsPlayerState>();
    turnOrder.forEach((userId, slot) => {
        players.set(userId, {
            raceNumber: slot + 1,
            row: track.grid[slot].row,
            lane: track.grid[slot].lane,
            lapsCompleted: 0,
            gear: 0,
            tyres: spec.tyres,
            brakes: spec.brakes,
            gearbox: spec.gearbox,
            cornerStops: 0,
            skipNextTurn: false,
            finishedPosition: null,
            phase: 'shift',
            roll: null,
            brakeSpent: 0,
        });
    });

    return {
        trackId: track.id,
        laps: distanceDef(settings.distance).laps,
        spec: settings.spec,
        oilSpills: settings.oilSpills,
        round: 1,
        roundOrder: [...turnOrder],
        roundIndex: 0,
        slicks: [],
        players,
    };
}

/**
 * Rebuilds the starting grid for turn recap from the persisted snapshot,
 * with the player map in `gameState.turnOrder` order — the order it was dealt
 * in, which is the grid order (§6 step 6).
 */
export function buildInitialRaceCarsStateFromGameData(gameData: IRaceCarsGameData): IRaceCarsSpecificGameState {
    return cloneRaceCarsState(gameData.initialSpecificGameState, gameData.gameState.turnOrder);
}

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IRaceCarsGameData extends IGameData {
    specificGameState: IRaceCarsSpecificGameState;
    // Immutable copy of the starting grid, persisted at creation so turn recap
    // can replay from it — see cloneRaceCarsState above.
    initialSpecificGameState: IRaceCarsSpecificGameState;
}

export interface IRaceCarsGameDataDocument extends IRaceCarsGameData, IGameDataDocument {}

export interface IRaceCarsGameDataModel extends Model<IRaceCarsGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

// Declared in full rather than as Schema.Types.Mixed, which is what makes
// `markModified` needed nowhere in this game (§23.4): a declared array path
// tracks its own push/splice — `slicks` is the one that would otherwise need
// it — and so do subdocument mutations.
function makeRaceCarsStateSchemaDef() {
    return {
        trackId: String,
        laps: Number,
        spec: String,
        oilSpills: Boolean,
        round: Number,
        roundOrder: [String],
        roundIndex: Number,
        slicks: [{ row: Number, lane: Number, laidOnRound: Number }],
        players: {
            type: Schema.Types.Map,
            of: {
                raceNumber: Number,
                row: Number,
                lane: Number,
                lapsCompleted: Number,
                gear: Number,
                tyres: Number,
                brakes: Number,
                gearbox: Number,
                cornerStops: Number,
                skipNextTurn: { type: Boolean, default: false },
                finishedPosition: { type: Number, default: null },
                phase: String,
                roll: { type: Number, default: null },
                brakeSpent: { type: Number, default: 0 },
            },
        },
    };
}

var RaceCarsGameDataSchema = new Schema<IRaceCarsGameDataDocument>(
    {
        specificGameState: makeRaceCarsStateSchemaDef(),
        // The same factory, so the snapshot recap replays from can never be a
        // subtly different shape from the state it is a snapshot of.
        initialSpecificGameState: makeRaceCarsStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

RaceCarsGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<IRaceCarsGameDataResponse> {
    console.log('CreateDataResponse: Race Cars game');

    const doc: IRaceCarsGameData = this as IRaceCarsGameData;
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
        // §4.1's chequered flag is the only ending Race Cars writes for
        // itself, so this is only ever the engine's own (a forfeit, an
        // abandoned race) — forwarded rather than dropped so the board screen
        // reads the same clause it reads for every other game.
        endDetail: doc.endDetail,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
        // Games created before the snapshot existed simply don't offer recap;
        // every board page that offers it gates on this flag, which is why it
        // ships with the snapshot rather than with PR 8's adapter.
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

/**
 * §23.4's deliberate non-redaction: every field of the state goes to every
 * viewer, because §2's fourth pillar says the whole game is public — the dice
 * are thrown in the open, the wear pools are printed beside each car, and the
 * turn in progress is exactly what the next driver is watching.
 *
 * `_viewerId` is therefore declared and never read, which is the spelling
 * `publicGameState.test.ts` documents for a game that genuinely ignores its
 * viewer. Threading an argument nobody uses looks like clutter and is not: it
 * is what makes adding a hidden field later a change inside this one function
 * rather than across four signatures, a call site and a replay registration —
 * and the four-place version is the one somebody skips.
 */
export function gameStateToModel(
    gs: IRaceCarsSpecificGameState,
    userIdNameMap: { [key: string]: string },
    _viewerId: string | null,
): IRaceCarsSpecificGameStateResponse {
    const playerStates: IRaceCarsSpecificGameStateResponse['playerStates'] = {};
    for (const [userId, ps] of mongoMap(gs.players)) {
        playerStates[userId] = {
            userId,
            username: userIdNameMap[userId] ?? userId,
            raceNumber: ps.raceNumber,
            row: ps.row,
            lane: ps.lane,
            lapsCompleted: ps.lapsCompleted,
            gear: ps.gear,
            tyres: ps.tyres,
            brakes: ps.brakes,
            gearbox: ps.gearbox,
            cornerStops: ps.cornerStops,
            skipNextTurn: ps.skipNextTurn,
            finishedPosition: ps.finishedPosition,
            phase: ps.phase,
            roll: ps.roll,
            brakeSpent: ps.brakeSpent,
        };
    }

    return {
        trackId: gs.trackId,
        laps: gs.laps,
        spec: gs.spec,
        oilSpills: gs.oilSpills,
        round: gs.round,
        roundOrder: [...gs.roundOrder],
        roundIndex: gs.roundIndex,
        slicks: gs.slicks.map(slick => ({ row: slick.row, lane: slick.lane, laidOnRound: slick.laidOnRound })),
        playerStates,
    };
}

export var RaceCarsGameDataModel =
    models.RaceCarsGameData ||
    GameDataModel.discriminator<IRaceCarsGameDataDocument, IRaceCarsGameDataModel>('RaceCarsGameData', RaceCarsGameDataSchema);
