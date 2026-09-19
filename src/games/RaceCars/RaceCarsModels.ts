import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RaceCarsGameType, IRaceCarsArrivalOutcome } from "@/utils/apiModels/GameLogic";
import {
    GameResultStatGroup,
    GameResultChart,
    GameResultEvent,
    gameResultEventSchemaDef,
    formatPerTurnChart,
    compactCharts,
} from "@/utils/apiModels/GameDataApi";
import { buildTimeline, IReplayStep } from "@/utils/games/replay";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { mongoMap } from "@/utils/games/mongoMaps";
import { userToken } from "@/utils/games/history";
import { pluralize } from "@/utils/ui/text";
import {
    distanceDef,
    gearName,
    RaceCarsDistanceId,
    RaceCarsGear,
    RaceCarsSpecId,
    readRaceSettings,
    spaceKey,
    specDef,
    startingLaps,
    trackById,
} from "./board";
import { cloneRaceCarsState } from "./rules";
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
    trackId: string;
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

export interface IRaceCarsInvitationData extends IInvitationData {
    trackId: string;
    distance: RaceCarsDistanceId;
    spec: RaceCarsSpecId;
    oilSpills: boolean;
}

export interface IRaceCarsInvitationDataDocument extends IRaceCarsInvitationData, IInvitationDataDocument {}

export interface IRaceCarsInvitationDataModel extends Model<IRaceCarsInvitationDataDocument> {}

var RaceCarsInvitationSchema = new Schema<IRaceCarsInvitationDataDocument>({
    trackId: String,
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

    // §6 step 5: the field is drawn into the grid slots, which is the only
    // randomness in setup — and, by step 7, also the running order for round
    // one, since turn order is track order and P1 leads. One draw, not two.
    const { turnOrder, history } = rollOffTurnOrder(userIdList);
    const specificGameState = buildInitialRaceCarsState(turnOrder, this as IRaceCarsInvitationData);

    const track = trackById(specificGameState.trackId);
    const spec = specDef(specificGameState.spec);

    // Oldest line first, like every other `CreateGame` — `startGameFromInvitation`
    // flips the block once (`asStoredHistory`, utils/games/history.ts).
    //
    // The settings are read back off the state rather than off the invitation: a
    // lobby-created race can arrive holding anything at all, and the log should
    // say what is actually being raced.
    history.push({ text: `Setup: ${pluralize(specificGameState.laps, 'lap')} of ${track.name} — ${track.corners.length} corners a lap` });
    history.push({ text: `Setup: every car runs the ${spec.name} spec — ${spec.tyres} tyres, ${spec.brakes} brakes, ${spec.gearbox} gearbox` });
    history.push({ text: `Setup: oil spills are ${specificGameState.oilSpills ? 'on' : 'off'}` });
    history.push({ text: `Setup: the grid is ${turnOrder.map((userId, slot) => `P${slot + 1} ${userToken(userId)}`).join(', ')}` });
    // §6a closes the block. The roll-off above *is* the grid draw, so the d20
    // named here is the first thing that happens once the grid is set rather
    // than a second draw — which is why it reads under those dice and not over
    // them, where its own line would make them look like the getaways.
    history.push({ text: 'Setup: round one is the start — every driver throws a d20 to get away' });

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
            history,
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

// `cloneRaceCarsState` moved to rules.ts (docs/undo.md §16): RaceCarsLogic.ts's
// undo command needs it too, and rules.ts is the one file both it and this one
// already import without the two of them importing each other. Re-exported so
// nothing that already imports it from here has to change.
export { cloneRaceCarsState };

/**
 * The grid of §6, with `turnOrder` already drawn: P1 first, so the running
 * order for round one *is* the grid order (step 7).
 *
 * Every car is identical (§5.3) — same spec, same full wear pools, gear 0, no
 * corner stops banked — so the only thing that separates two drivers at the
 * start line is which of §5.2's six staggered spaces they were dealt, who moves
 * first, and what §6a's d20 makes of their getaway once the race begins.
 *
 * The four settings are normalised rather than trusted: `POST /api/lobby`
 * spreads a host's per-game settings into the invitation unchecked, so this is
 * the one place both creation paths reach (§23.4). See `readRaceSettings`.
 */
export function buildInitialRaceCarsState(
    turnOrder: string[],
    raw: { trackId?: unknown; distance?: unknown; spec?: unknown; oilSpills?: unknown },
): IRaceCarsSpecificGameState {
    const { settings } = readRaceSettings(raw);
    const track = trackById(settings.trackId);
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
            // Nought, or a lap short on a circuit that lines its grid up behind
            // the finish line, where the first crossing starts the race (§15).
            lapsCompleted: startingLaps(track),
            gear: 0,
            tyres: spec.tyres,
            brakes: spec.brakes,
            gearbox: spec.gearbox,
            cornerStops: 0,
            skipNextTurn: false,
            finishedPosition: null,
            // §6a: round one is the startup round, so every car opens on the
            // d20 rather than on a gear it could not have chosen from the grid.
            phase: 'start',
            roll: null,
            brakeSpent: 0,
            startRoll: null,
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
        undoStack: [],
        undoAnchorId: null,
    };
}

/**
 * Rebuilds the starting grid for turn recap from the persisted snapshot,
 * with the player map in `gameState.turnOrder` order — the order it was dealt
 * in, which is the grid order (§6 step 7).
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
                startRoll: { type: Number, default: null },
            },
        },
        // ─── Undo (docs/undo.md) ────────────────────────────────────────────
        undoStack: [{ by: String, state: Schema.Types.Mixed }],
        undoAnchorId: { type: String, default: null },
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
        specificGameState: gameStateToModel(
            doc.specificGameState,
            userIdNameMap,
            viewerId,
            doc.gameState.commandHistory.at(-1)?.id ?? null,
        ),
        // Games created before the snapshot existed simply don't offer recap;
        // every board page that offers it gates on this flag, which is why it
        // ships with the snapshot rather than with PR 8's adapter.
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

/**
 * §23.4's deliberate non-redaction: every field of the *board* goes to every
 * viewer, because §2's fourth pillar says the whole game is public — the dice
 * are thrown in the open, the wear pools are printed beside each car, and the
 * turn in progress is exactly what the next driver is watching.
 *
 * `viewerId` is read for exactly one thing docs/undo.md adds that isn't public:
 * `canUndo`, which answers "have *you* got a move you can still take back" and
 * is therefore false for everyone else by construction, not by redaction —
 * the move it would undo is a car on the board, which the whole table can
 * already see. `lastCommandId` (commandHistory's real tail) is threaded
 * through for the same reason SAC's `gameStateToResponse` takes one: the
 * stack's own owner alone would still say yes after a command that ran
 * without touching the stack (docs/undo.md §7).
 */
export function gameStateToModel(
    gs: IRaceCarsSpecificGameState,
    userIdNameMap: { [key: string]: string },
    viewerId: string | null,
    lastCommandId: string | null = null,
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
            startRoll: ps.startRoll,
        };
    }

    // The viewer's own — whether *they* have a move they can still take back
    // (docs/undo.md §7-§8). Absent (`?? []`) for a game that predates the
    // stack, false for anyone whose move it isn't, and false for a viewerless
    // replay/recap, since no viewerId can ever equal a stack entry's `by`.
    //
    // The stack's own owner isn't the whole story: it still names the mover
    // after a non-undoable command runs without touching it — a shift or a
    // launch played right after a move, or the ordinary hand-off at the end of
    // the turn. Matching `undoAnchorId` against `lastCommandId`
    // (commandHistory's real tail) is the same test RaceCarsUndo runs on
    // itself, so this can't say yes to a move the command would actually
    // refuse.
    const topEntry = (gs.undoStack ?? []).at(-1);
    const canUndo = topEntry?.by === viewerId && gs.undoAnchorId === lastCommandId;

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
        canUndo,
    };
}

export var RaceCarsGameDataModel =
    models.RaceCarsGameData ||
    GameDataModel.discriminator<IRaceCarsGameDataDocument, IRaceCarsGameDataModel>('RaceCarsGameData', RaceCarsGameDataSchema);

// ─── Result stats (§23.7 PR 8) ───────────────────────────────────────────────
//
// Boiled-down stats for the GameResult read model, computed once at game-end
// (see recordGameResult in GameResultData.ts). §23.4's non-redaction means
// every one of these is already public on the wire; the result page is simply
// the first place they are totalled up rather than read turn by turn.

export interface IRaceCarsGameResultStats {
    /** §4.2's classification — written once, for the whole field, by the ending. */
    finishingPosition: Map<string, number>;
    /**
     * Laps × the track's row count, plus the final row — net progress, the same
     * reading `rowsPerTurn` takes each round.
     *
     * **Rows on purpose**, and the one family of numbers still quoted in them
     * (with `rowsPerTurn` and `rowsBehindLeader`). Everything a rule *charges*
     * moved to spaces, because a space is a space on either line through a
     * corner (§10) — but a rank round the lap is exactly what these three are
     * asking for: how far round two cars are, against each other, on one
     * circuit. Spaces driven would flatter whichever of them took the longer
     * way round.
     */
    rowsCovered: Map<string, number>;
    topGear: Map<string, number>;
    tyresSpent: Map<string, number>;
    brakesSpent: Map<string, number>;
    gearboxSpent: Map<string, number>;
    /** Overshoots that actually cost tyres — an unpayable one spins instead and is counted there, not here. */
    cornersOvershot: Map<string, number>;
    towsTaken: Map<string, number>;
    spins: Map<string, number>;
    slicksLaid: Map<string, number>;
    /** Every slick entered, whether or not the d6 came up a spin (§14). */
    slicksHit: Map<string, number>;
    /**
     * Net progress per player at the end of each round — the race trace: rows
     * covered per driver per round, whose crossing lines are the overtakes.
     * Powers the result page's per-turn chart. Computed by replaying
     * commandHistory via computePerTurnStat (see replay.ts), driven from this
     * game's GAME_RESULT_STATS entry in GameResultData.ts.
     */
    rowsPerTurn: Map<string, number>[];
    /** Every spin, keyed to the spinning driver's own line on that chart (§23.2 gap 2). */
    spinEvents: GameResultEvent[];
}

export const raceCarsGameResultStatsSchemaDef = {
    finishingPosition: { type: Schema.Types.Map, of: Number },
    rowsCovered: { type: Schema.Types.Map, of: Number },
    topGear: { type: Schema.Types.Map, of: Number },
    tyresSpent: { type: Schema.Types.Map, of: Number },
    brakesSpent: { type: Schema.Types.Map, of: Number },
    gearboxSpent: { type: Schema.Types.Map, of: Number },
    cornersOvershot: { type: Schema.Types.Map, of: Number },
    towsTaken: { type: Schema.Types.Map, of: Number },
    spins: { type: Schema.Types.Map, of: Number },
    slicksLaid: { type: Schema.Types.Map, of: Number },
    slicksHit: { type: Schema.Types.Map, of: Number },
    rowsPerTurn: [{ type: Schema.Types.Map, of: Number }],
    spinEvents: [gameResultEventSchemaDef],
};

/**
 * A computePerTurnEvents detector (see replay.ts): marks the spinning driver's
 * own line on the rows/round chart wherever a spin lands, so the result page
 * can show a marker at the round it happened. Exported so it can be
 * unit-tested and wired straight into GAME_RESULT_STATS.RaceCars.compute
 * (GameResultData.ts) without GameResultData.ts having to know this game's
 * command names or its arrival-event shape itself.
 *
 * Doubles as the per-driver spin count: every spin is exactly one event here
 * (`resolveArrival` returns the instant it spins a car, §13), so grouping
 * these by `seriesKey` is the same count `computeArrivalTotals` would have to
 * take a second replay pass to reach.
 */
export function detectSpinEvent(step: IReplayStep): Omit<GameResultEvent, 'turnIndex'>[] | undefined {
    if (step.command.className !== "RaceCarsMove" && step.command.className !== "RaceCarsSlipstream") return undefined;
    // A declined tow (§12) carries no arrival at all — nothing to mark.
    const arrival = (step.outcome as Partial<IRaceCarsArrivalOutcome>).arrival;
    if (!arrival?.spun) return undefined;
    return [{ icon: 'spin', title: `${step.command.senderUsername} spun`, seriesKey: step.command.senderId }];
}

function spinsByDriver(spinEvents: GameResultEvent[]): Map<string, number> {
    const spins = new Map<string, number>();
    for (const event of spinEvents) {
        if (event.seriesKey) spins.set(event.seriesKey, (spins.get(event.seriesKey) ?? 0) + 1);
    }
    return spins;
}

/**
 * The four totals no `computePerTurnStat`/`computePerTurnEvents` call already
 * gives us — corners overshot, tows taken, slicks laid and slicks hit — read
 * straight off the same `RaceCarsArrivalEvent`s the recap reads (recap.ts),
 * one replay pass for all four rather than one apiece. Spins are not among
 * them: `detectSpinEvent`'s own events already carry that count (see
 * `spinsByDriver`), and a driver's finishing numbers (position, rows covered,
 * top gear, pool spend) come straight off the final `specificGameState`
 * rather than a replay at all.
 */
async function computeArrivalTotals(gameData: IRaceCarsGameData): Promise<{
    overshoots: Map<string, number>;
    tows: Map<string, number>;
    slicksLaid: Map<string, number>;
    slicksHit: Map<string, number>;
}> {
    const overshoots = new Map<string, number>();
    const tows = new Map<string, number>();
    const slicksLaid = new Map<string, number>();
    const slicksHit = new Map<string, number>();
    const bump = (map: Map<string, number>, userId: string) => map.set(userId, (map.get(userId) ?? 0) + 1);

    const identityMap = Object.fromEntries(gameData.userIdList.map(userId => [userId, userId]));
    try {
        await buildTimeline(gameData, identityMap, [], (step) => {
            if (step.command.className !== "RaceCarsMove" && step.command.className !== "RaceCarsSlipstream") return;
            const senderId = step.command.senderId;
            // A declined tow (§12) carries no arrival at all — nothing moved.
            const arrival = (step.outcome as Partial<IRaceCarsArrivalOutcome>).arrival;
            for (const event of arrival?.events ?? []) {
                if (event.type === 'overshoot' && !event.waived) bump(overshoots, senderId);
                if (event.type === 'oilCheck') bump(slicksHit, senderId);
            }
            if (step.command.className === "RaceCarsSlipstream"
                && (step.command as unknown as { tow: unknown }).tow !== null) {
                bump(tows, senderId);
            }

            const prevSlicks = new Set(
                (step.prev.specificGameState as IRaceCarsSpecificGameStateResponse).slicks
                    .map(slick => spaceKey(slick.row, slick.lane)));
            for (const slick of (step.next.specificGameState as IRaceCarsSpecificGameStateResponse).slicks) {
                if (!prevSlicks.has(spaceKey(slick.row, slick.lane))) bump(slicksLaid, senderId);
            }
        });
    } catch {
        // Mirrors replayTurnByTurn's own graceful downgrade (utils/games/replay.ts):
        // a game that can't be replayed (no starting snapshot) reports zeroes for
        // these four rather than failing the whole result, since this runs at
        // game-end inside recordGameResult and a player's final turn is worth
        // more than a handful of extra numbers.
    }

    return { overshoots, tows, slicksLaid, slicksHit };
}

export async function computeRaceCarsResultStats(
    gameData: IRaceCarsGameData,
    rowsPerTurn: Map<string, number>[],
    topGearPerTurn: Map<string, number>[],
    spinEvents: GameResultEvent[],
): Promise<IRaceCarsGameResultStats> {
    const gs = gameData.specificGameState;
    const track = trackById(gs.trackId);
    const spec = specDef(gs.spec);

    const finishingPosition = new Map<string, number>();
    const rowsCovered = new Map<string, number>();
    const tyresSpent = new Map<string, number>();
    const brakesSpent = new Map<string, number>();
    const gearboxSpent = new Map<string, number>();
    for (const [userId, ps] of mongoMap(gs.players)) {
        finishingPosition.set(userId, ps.finishedPosition ?? 0);
        // Clamped at nought: a grid drawn behind the finish line seats the
        // field a lap short (§15, `startingLaps`), so this reads negative until
        // a driver's first crossing — and a result page that says "covered −75
        // rows" is wrong in a way the number it is reporting is not. The chart
        // this feeds floors its axis at nought too (`LineChart`), so a negative
        // point is drawn off the bottom of the viewBox rather than below the
        // line. Flat for those opening rounds, which is the honest shape of a
        // field that has not started its first lap.
        rowsCovered.set(userId, Math.max(0, ps.lapsCompleted * track.rows + ps.row));
        tyresSpent.set(userId, spec.tyres - ps.tyres);
        brakesSpent.set(userId, spec.brakes - ps.brakes);
        gearboxSpent.set(userId, spec.gearbox - ps.gearbox);
    }

    const topGear = new Map<string, number>();
    for (const userId of gameData.userIdList) {
        topGear.set(userId, Math.max(0, ...topGearPerTurn.map(turn => turn.get(userId) ?? 0)));
    }

    const totals = await computeArrivalTotals(gameData);

    return {
        finishingPosition,
        rowsCovered,
        topGear,
        tyresSpent,
        brakesSpent,
        gearboxSpent,
        cornersOvershot: totals.overshoots,
        towsTaken: totals.tows,
        spins: spinsByDriver(spinEvents),
        slicksLaid: totals.slicksLaid,
        slicksHit: totals.slicksHit,
        rowsPerTurn,
        spinEvents,
    };
}

/**
 * Renders IRaceCarsGameResultStats as one stat group per driver, ordered by
 * how they were classified (§4.2) — P1 first, the same order the scoreboard's
 * `finishedPosition` sorts by.
 */
export function formatRaceCarsResultStats(stats: IRaceCarsGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const byPosition = [...stats.finishingPosition.entries()].sort(([, a], [, b]) => a - b);

    return byPosition.map(([userId, position]) => {
        const lines = [
            `Finished P${position}`,
            `Covered ${pluralize(stats.rowsCovered.get(userId) ?? 0, 'row')} · top gear ${gearName((stats.topGear.get(userId) ?? 0) as RaceCarsGear)}`,
            `Spent ${stats.tyresSpent.get(userId) ?? 0} tyres, ${stats.brakesSpent.get(userId) ?? 0} brakes, ${stats.gearboxSpent.get(userId) ?? 0} gearbox`,
        ];

        const overshot = stats.cornersOvershot.get(userId) ?? 0;
        const tows = stats.towsTaken.get(userId) ?? 0;
        const spins = stats.spins.get(userId) ?? 0;
        const trouble = [
            overshot > 0 ? pluralize(overshot, 'corner overshot', 'corners overshot') : null,
            tows > 0 ? pluralize(tows, 'tow') : null,
            spins > 0 ? pluralize(spins, 'spin') : null,
        ].filter((line): line is string => line !== null);
        if (trouble.length > 0) lines.push(trouble.join(', '));

        const laid = stats.slicksLaid.get(userId) ?? 0;
        const hit = stats.slicksHit.get(userId) ?? 0;
        if (laid > 0 || hit > 0) lines.push(`Laid ${pluralize(laid, 'slick')} · hit ${pluralize(hit, 'slick')}`);

        return { username: usernameById.get(userId) ?? userId, lines };
    });
}

/** Renders rowsPerTurn as the race trace, with every spin marked on the spinning driver's own line. */
export function formatRaceCarsCharts(stats: IRaceCarsGameResultStats, usernameById: Map<string, string>): GameResultChart[] {
    return compactCharts(
        formatPerTurnChart(stats.rowsPerTurn, "Rows covered per round", "Rows", usernameById.size, undefined, stats.spinEvents),
    );
}
