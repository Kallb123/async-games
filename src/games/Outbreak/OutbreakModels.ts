import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import {
    GameResultChart,
    GameResultChartSeries,
    GameResultStatGroup,
    compactCharts,
    formatPerTurnChart,
    uuidString,
} from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { OutbreakGameType } from "@/utils/apiModels/GameLogic";
import { shuffle } from "@/utils/games/shuffle";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import { userToken } from "@/utils/games/history";
import {
    IOutbreakGameDataResponse,
    IOutbreakSpecificGameStateResponse,
} from "./apiModels";
import {
    ATLANTA_CITY_ID,
    CITIES,
    CITY_COUNT,
    DIFFICULTIES,
    DISEASE_COLORS,
    DISEASE_COLOR_DEFS,
    epidemicCountFor,
    EVENT_CARD_IDS,
    OutbreakCureState,
    OutbreakDifficulty,
    OutbreakDiseaseColor,
    OutbreakPhase,
    OutbreakRoleId,
} from "./board";
import {
    ACTIONS_PER_TURN,
    CUBES_PER_COLOR,
    OutbreakCubeCounts,
    buildEpidemicDeck,
    dealRoles,
    emptyCubeCounts,
    placeCubeOrOutbreak,
    startingHandSize,
} from "./rules";

// ═══════════════════════════════════════════════════════════════════════════
//  OUTBREAK
// ═══════════════════════════════════════════════════════════════════════════

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface OutbreakInvitationRequest extends IInvitationRequest {
    difficulty: OutbreakDifficulty;
}

export interface IOutbreakInvitationData extends IInvitationData {
    difficulty: OutbreakDifficulty;
}

export interface IOutbreakInvitationDataDocument extends IOutbreakInvitationData, IInvitationDataDocument {}

export interface IOutbreakInvitationDataModel extends Model<IOutbreakInvitationDataDocument> {}

var OutbreakInvitationSchema = new Schema<IOutbreakInvitationDataDocument>({
    difficulty: String,
}, { discriminatorKey: 'kind' });
OutbreakInvitationSchema.methods.CreateGame = async function(
    invite: IOutbreakInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Outbreak game');

    const gameType = new OutbreakGameType();
    const difficulty = this.difficulty as OutbreakDifficulty;

    // §6 step 9 wants whoever holds the highest-population city card, but
    // city population isn't modelled on CITY_DEFS (board.ts) — it's cosmetic
    // flavour for a one-off setup pick, not part of the win/loss economy — so,
    // like Train Time's running order, the order is simply drawn at random.
    const turnOrder = shuffle(userIdList);
    const history = [
        { text: `Setup: running order is ${turnOrder.map(userToken).join(' → ')}` },
        { text: `Setup: ${difficulty} difficulty — a research station is up in Atlanta` },
    ];

    const specificGameState = buildInitialOutbreakState(turnOrder, difficulty);
    const infectedCount = specificGameState.infectionDiscard.length;
    const cubesPlaced = specificGameState.cities.reduce(
        (sum, c) => sum + DISEASE_COLORS.reduce((s, color) => s + c.cubes[color], 0),
        0,
    );
    history.push({ text: `Setup: ${infectedCount} cities begin infected (${cubesPlaced} cubes)` });
    history.push({ text: `Setup: each player dealt ${startingHandSize(turnOrder.length)} cards` });

    const gameData: IOutbreakGameData = {
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
        initialSpecificGameState: cloneOutbreakState(specificGameState, turnOrder),
    };
    return gameData;
};
export var OutbreakInvitationModel =
    models.OutbreakInvitation ||
    InvitationModel.discriminator<IOutbreakInvitationDataDocument, IOutbreakInvitationDataModel>('OutbreakInvitation', OutbreakInvitationSchema);

// ─── Player / city / specific state ─────────────────────────────────────────

export interface IOutbreakCityState {
    cubes: OutbreakCubeCounts;
    station: boolean;
}

export interface IOutbreakPlayerState {
    // City-card and event-card ids held (board.ts's isCityCardId/isEventCardId
    // tell them apart) — public throughout, never redacted per viewer (§2's
    // "shared table, shared brain" pillar).
    hand: number[];
    city: number;
    // Dealt in buildInitialOutbreakState via rules.ts's dealRoles (§21.6 step 9).
    role: OutbreakRoleId | null;
    // Contingency Planner only (§11, §21.6 step 10): an event card retrieved
    // from the discard pile, held outside the hand and hand limit until
    // played — at which point it's removed from the game rather than
    // rejoining the discard pile (see spendEventCard in OutbreakLogic.ts).
    contingencyCard: number | null;
    // Refills at the *start* of this player's own turn, not the end of the
    // previous one (docs/games/outbreak-gdd.md §21.4 — the crew planner
    // needs this to cross from one player's actions to the next).
    actionsLeft: number;
    // Operations Expert (§11): her once-per-turn station-to-anywhere flight.
    // Resets alongside actionsLeft at the start of her own turn. Meaningless
    // for every other role, but kept unconditional like the rest of this
    // state rather than made optional for one role.
    opsExpertFlightUsed: boolean;
    // Running totals for the end-of-game charts (never reset mid-game) — see
    // computeOutbreakResultStats below. cubesTreated counts cubes removed by
    // this player's own Treat Disease action (not a Medic's automatic
    // clearing, which is a side effect of moving rather than a chosen
    // action). timesTravelled counts every time this player's own pawn
    // relocated, however it moved — her own drive/flight, a Dispatcher
    // moving her, or Airlift — since the chart is about where she ended up,
    // not who spent the action.
    cubesTreated: number;
    timesTravelled: number;
}

export interface IOutbreakSpecificGameState {
    difficulty: OutbreakDifficulty;
    cities: IOutbreakCityState[]; // length CITY_COUNT, indexed by city id
    cubesLeft: Record<OutbreakDiseaseColor, number>;
    cures: Record<OutbreakDiseaseColor, OutbreakCureState>;
    outbreaks: number;
    infectionRateIndex: number;
    // The 48 city cards plus one EPIDEMIC_CARD_ID per epidemic in play (§6
    // step 7) — event cards join it in §21.6 step 10.
    playerDeck: number[];
    // May contain EPIDEMIC_CARD_ID entries: an epidemic is discarded like any
    // other player card once resolved (§9.1).
    playerDiscard: number[];
    infectionDeck: number[]; // top first — redacted to a count on the wire
    infectionDiscard: number[]; // public, and the game's most-read information (§14.2)
    players: Map<string, IOutbreakPlayerState>;
    phase: OutbreakPhase;
    // One Quiet Night (§12, §21.6 step 10): consumed the next time
    // resolveInfectPhase runs, skipping that Infect Cities phase entirely.
    oneQuietNightActive: boolean;
    // Forecast (§12), step 1: the top infection cards drawn face-up, awaiting
    // the reorder OutbreakPlayEvent's 'forecastOrder' kind submits — public,
    // like the infection discard pile, since Forecast reveals them to the
    // whole table. Empty outside `phase === 'forecast'`.
    forecastCards: number[];
    // The phase ('actions' or 'discard') Forecast was played from, restored
    // once its ordering step resolves — §21.3 lets an event duck the hand
    // limit, and Forecast's own card leaving the hand may already have
    // settled that before the reorder even happens.
    forecastResumePhase: OutbreakPhase | null;
}

function cloneCityState(c: IOutbreakCityState): IOutbreakCityState {
    return { cubes: { ...c.cubes }, station: c.station };
}

function clonePlayerState(ps: IOutbreakPlayerState): IOutbreakPlayerState {
    return {
        hand: [...ps.hand],
        city: ps.city,
        role: ps.role,
        contingencyCard: ps.contingencyCard,
        actionsLeft: ps.actionsLeft,
        opsExpertFlightUsed: ps.opsExpertFlightUsed,
        cubesTreated: ps.cubesTreated,
        timesTravelled: ps.timesTravelled,
    };
}

// Deep-clones an Outbreak game state into independent plain objects,
// rebuilding the player map in `userIdList` order (see clonePlayerStates) —
// mirrors WorldDomination's cloneWorldDominationState: the board (here, the
// shuffled infection deal) is randomised at creation and can't be
// reconstructed later, so turn recap replays from a persisted snapshot
// instead.
export function cloneOutbreakState(
    gs: IOutbreakSpecificGameState,
    userIdList: string[],
): IOutbreakSpecificGameState {
    return {
        difficulty: gs.difficulty,
        cities: gs.cities.map(cloneCityState),
        cubesLeft: { ...gs.cubesLeft },
        cures: { ...gs.cures },
        outbreaks: gs.outbreaks,
        infectionRateIndex: gs.infectionRateIndex,
        playerDeck: [...gs.playerDeck],
        playerDiscard: [...gs.playerDiscard],
        infectionDeck: [...gs.infectionDeck],
        infectionDiscard: [...gs.infectionDiscard],
        players: clonePlayerStates(gs.players, userIdList, clonePlayerState),
        phase: gs.phase,
        oneQuietNightActive: gs.oneQuietNightActive,
        forecastCards: [...gs.forecastCards],
        forecastResumePhase: gs.forecastResumePhase,
    };
}

// Builds the deterministic starting specificGameState for an Outbreak game:
// the opening board of §6 steps 4, 5 and 8 — a research station in Atlanta,
// every pawn there too, and the initial infection (shuffle the infection
// deck, flip 3 cards placing 3 cubes each, then 3 placing 2 each, then 3
// placing 1 each — 9 cities infected, 18 cubes placed) — plus, per §6 step 6,
// a shuffled 53-card player deck (48 city cards + 5 events; no epidemics
// yet) with starting hands dealt from it before anything else touches it.
//
// The epidemic piles of §6 step 7 are built below, keyed off the difficulty
// dial (§13). Roles (§6 step 5, §11) are dealt alongside starting hands: all
// seven shuffled and the first N — one per seat — assigned, exactly as the
// physical deal would work with more players than roles.
export function buildInitialOutbreakState(turnOrder: string[], difficulty: OutbreakDifficulty): IOutbreakSpecificGameState {
    const cities: IOutbreakCityState[] = Array.from({ length: CITY_COUNT }, () => ({ cubes: emptyCubeCounts(), station: false }));
    cities[ATLANTA_CITY_ID].station = true;

    const infectionDeck = shuffle(Array.from({ length: CITY_COUNT }, (_, id) => id));
    const infectionDiscard: number[] = [];
    let cubes = cities.map(c => c.cubes);
    for (const cubeCount of [3, 2, 1]) {
        for (let i = 0; i < 3; i++) {
            const cityId = infectionDeck.shift()!;
            const color = CITIES[cityId].color;
            for (let n = 0; n < cubeCount; n++) {
                cubes = placeCubeOrOutbreak(cubes, cityId, color).cubes;
            }
            infectionDiscard.push(cityId);
        }
    }
    cities.forEach((c, id) => { c.cubes = cubes[id]; });

    const cubesLeft = emptyCubeCounts();
    for (const color of DISEASE_COLORS) {
        const used = cities.reduce((sum, c) => sum + c.cubes[color], 0);
        cubesLeft[color] = CUBES_PER_COLOR - used;
    }

    // §6 step 6: shuffle the 48 city cards plus the 5 event cards (§12) and
    // deal each player their opening hand from it before anything else
    // touches the deck — before, per step 7, the epidemic piles below are
    // even built. An event card is exactly as likely to open in a hand as a
    // city card; nothing about the deal favours one kind.
    const cardDeck = shuffle([
        ...Array.from({ length: CITY_COUNT }, (_, id) => id),
        ...EVENT_CARD_IDS,
    ]);
    const handSize = startingHandSize(turnOrder.length);
    const roles = dealRoles(turnOrder);
    const players = new Map<string, IOutbreakPlayerState>();
    for (const userId of turnOrder) {
        const hand = cardDeck.splice(0, handSize);
        players.set(userId, {
            hand,
            city: ATLANTA_CITY_ID,
            role: roles.get(userId) ?? null,
            contingencyCard: null,
            actionsLeft: ACTIONS_PER_TURN,
            opsExpertFlightUsed: false,
            cubesTreated: 0,
            timesTravelled: 0,
        });
    }

    // §6 step 7, §13: divide what's left into one equal-ish pile per epidemic
    // card the difficulty calls for, shuffle an epidemic into each, and stack
    // the piles — the single dial that sets the whole game's escalation pace.
    const playerDeck = buildEpidemicDeck(cardDeck, epidemicCountFor(difficulty));

    return {
        difficulty,
        cities,
        cubesLeft,
        cures: { blue: 'none', yellow: 'none', black: 'none', red: 'none' },
        outbreaks: 0,
        infectionRateIndex: 0,
        playerDeck,
        playerDiscard: [],
        infectionDeck,
        infectionDiscard,
        players,
        phase: 'actions',
        oneQuietNightActive: false,
        forecastCards: [],
        forecastResumePhase: null,
    };
}

// Rebuilds the deterministic starting specificGameState for turn recap
// (§21.5, §21.6 step 12): the deal, the initial infection and the role deal
// are all randomised at creation, so — like World Domination and Train
// Time — replay clones the persisted initialSpecificGameState snapshot
// rather than re-deriving it, via cloneOutbreakState above. Rebuilds the
// player map in `gameState.turnOrder` order, the same order it was dealt in.
export function buildInitialOutbreakStateFromGameData(gameData: IOutbreakGameData): IOutbreakSpecificGameState {
    return cloneOutbreakState(gameData.initialSpecificGameState, gameData.gameState.turnOrder);
}

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IOutbreakGameData extends IGameData {
    specificGameState: IOutbreakSpecificGameState;
    // Immutable copy of the starting (post-deal) state, persisted at creation
    // so turn recap can replay from it — see cloneOutbreakState above.
    initialSpecificGameState: IOutbreakSpecificGameState;
}

export interface IOutbreakGameDataDocument extends IOutbreakGameData, IGameDataDocument {}

export interface IOutbreakGameDataModel extends Model<IOutbreakGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

function outbreakCubeCountsSchemaDef() {
    return { blue: Number, yellow: Number, black: Number, red: Number };
}

function makeOutbreakStateSchemaDef() {
    return {
        difficulty: String,
        cities: [{
            cubes: outbreakCubeCountsSchemaDef(),
            station: Boolean,
        }],
        cubesLeft: outbreakCubeCountsSchemaDef(),
        cures: { blue: String, yellow: String, black: String, red: String },
        outbreaks: Number,
        infectionRateIndex: Number,
        playerDeck: [Number],
        playerDiscard: [Number],
        infectionDeck: [Number],
        infectionDiscard: [Number],
        oneQuietNightActive: { type: Boolean, default: false },
        forecastCards: [Number],
        forecastResumePhase: { type: String, default: null },
        players: {
            type: Schema.Types.Map,
            of: {
                hand: [Number],
                city: Number,
                role: { type: String, default: null },
                contingencyCard: { type: Number, default: null },
                actionsLeft: Number,
                opsExpertFlightUsed: { type: Boolean, default: false },
                cubesTreated: { type: Number, default: 0 },
                timesTravelled: { type: Number, default: 0 },
            },
        },
        phase: String,
    };
}

var OutbreakGameDataSchema = new Schema<IOutbreakGameDataDocument>(
    {
        specificGameState: makeOutbreakStateSchemaDef(),
        initialSpecificGameState: makeOutbreakStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

OutbreakGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<IOutbreakGameDataResponse> {
    console.log('CreateDataResponse: Outbreak game');

    const doc: IOutbreakGameData = this as IOutbreakGameData;
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
        // Which §4.2 loss it was — 'teamloss' alone doesn't say (see
        // endInTeamLoss, and GameEndDetail).
        endDetail: doc.endDetail,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

// `_viewerId` is unused: §2 makes every hand public, so — unlike World
// Domination's cards or Train Time's tickets — nothing here is redacted per
// viewer. Kept in the signature to match the shared CreateDataResponse
// contract (see GameData.ts).
export function gameStateToModel(
    gs: IOutbreakSpecificGameState,
    userIdNameMap: { [key: string]: string },
    _viewerId: string | null,
): IOutbreakSpecificGameStateResponse {
    const playerStatesSource = mongoMap(gs.players);
    const playerStates: IOutbreakSpecificGameStateResponse['playerStates'] = {};
    for (const [userId, ps] of playerStatesSource) {
        const username = userIdNameMap[userId] ?? userId;
        playerStates[userId] = {
            userId,
            username,
            hand: [...ps.hand],
            city: ps.city,
            role: ps.role,
            contingencyCard: ps.contingencyCard,
            actionsLeft: ps.actionsLeft,
            opsExpertFlightUsed: ps.opsExpertFlightUsed,
            cubesTreated: ps.cubesTreated,
            timesTravelled: ps.timesTravelled,
        };
    }

    return {
        difficulty: gs.difficulty,
        cities: gs.cities.map(c => ({ cubes: { ...c.cubes }, station: c.station })),
        cubesLeft: { ...gs.cubesLeft },
        cures: { ...gs.cures },
        outbreaks: gs.outbreaks,
        infectionRateIndex: gs.infectionRateIndex,
        // Deck order is the one thing the whole design is about not knowing —
        // redact to a count (docs/new-game.md, "Don't leak hidden information").
        playerDeckCount: gs.playerDeck.length,
        playerDiscard: [...gs.playerDiscard],
        infectionDeckCount: gs.infectionDeck.length,
        infectionDiscard: [...gs.infectionDiscard],
        playerStates,
        phase: gs.phase,
        oneQuietNightActive: gs.oneQuietNightActive,
        forecastCards: [...gs.forecastCards],
    };
}

export var OutbreakGameDataModel =
    models.OutbreakGameData ||
    GameDataModel.discriminator<IOutbreakGameDataDocument, IOutbreakGameDataModel>('OutbreakGameData', OutbreakGameDataSchema);

// ─── Result stats (§21.6 step 12) ───────────────────────────────────────────
// A co-op table shares one result, so the formatted summary below is one
// game-wide stat group (no per-player breakdown) — the same shape Solitaire
// uses for its own solo summary. The two per-turn series are per-player
// though, same as every other game's end-of-game charts (see
// computePerTurnStat in replay.ts): cumulative cubes treated and cumulative
// times travelled, read off each player's own running totals on
// specificGameState.players (IOutbreakPlayerState.cubesTreated/
// timesTravelled) rather than recomputed here. Wired into GAME_RESULT_STATS
// in src/utils/mongodb/GameResultData.ts.

export interface IOutbreakGameResultStats {
    curesDiscovered: number;
    outbreaks: number;
    turnsLasted: number;
    difficulty: OutbreakDifficulty;
    cubesTreatedPerTurn: Map<string, number>[];
    timesTravelledPerTurn: Map<string, number>[];
    // The one series here that isn't per player: each turn's remaining supply
    // keyed by disease colour, not by userId. A colour hitting zero is one of
    // the three ways the table loses (§4.2), so how fast each supply drained
    // is the story of the game — see formatOutbreakCharts.
    cubesLeftPerTurn: Map<string, number>[];
}

export const outbreakGameResultStatsSchemaDef = {
    curesDiscovered: Number,
    outbreaks: Number,
    turnsLasted: Number,
    difficulty: String,
    cubesTreatedPerTurn: [{ type: Schema.Types.Map, of: Number }],
    timesTravelledPerTurn: [{ type: Schema.Types.Map, of: Number }],
    cubesLeftPerTurn: [{ type: Schema.Types.Map, of: Number }],
};

export function computeOutbreakResultStats(
    gameData: IOutbreakGameData,
    cubesTreatedPerTurn: Map<string, number>[],
    timesTravelledPerTurn: Map<string, number>[],
    cubesLeftPerTurn: Map<string, number>[],
): IOutbreakGameResultStats {
    const gs = gameData.specificGameState;
    return {
        curesDiscovered: DISEASE_COLORS.filter(color => gs.cures[color] !== 'none').length,
        outbreaks: gs.outbreaks,
        // OutbreakEndTurn is the only command that ends a turn (§21.4) — every
        // other command in commandHistory is a mid-turn action, discard or
        // event, so this counts real turns rather than raw command volume.
        turnsLasted: gameData.gameState.commandHistory.filter(c => c.className === 'OutbreakEndTurn').length,
        difficulty: gs.difficulty,
        cubesTreatedPerTurn,
        timesTravelledPerTurn,
        cubesLeftPerTurn,
    };
}

// The four cube-supply lines, in their own disease colours rather than the
// player colours a per-player chart uses — see GameResultChartSeries.
const CUBE_SUPPLY_SERIES: GameResultChartSeries[] = DISEASE_COLORS.map(color => ({
    key: color,
    name: DISEASE_COLOR_DEFS[color].name,
    color: DISEASE_COLOR_DEFS[color].hex,
}));

// Renders the per-turn series as GameResult charts — mirrors Train Time's
// formatTrainTimeCharts. The last of them plots the board rather than the
// table: one line per disease colour, dropping toward the zero that loses the
// game.
export function formatOutbreakCharts(
    stats: IOutbreakGameResultStats,
    usernameById: Map<string, string>,
): GameResultChart[] {
    return compactCharts(
        formatPerTurnChart(stats.cubesTreatedPerTurn, "Cubes treated per turn", "Cubes"),
        formatPerTurnChart(stats.timesTravelledPerTurn, "Times travelled per turn", "Moves"),
        formatPerTurnChart(stats.cubesLeftPerTurn ?? [], "Cubes left in supply", "Cubes", CUBE_SUPPLY_SERIES),
    );
}

export function formatOutbreakResultStats(stats: IOutbreakGameResultStats): GameResultStatGroup[] {
    const difficultyLabel = DIFFICULTIES.find(d => d.id === stats.difficulty)?.label ?? stats.difficulty;
    return [{
        lines: [
            `${pluralize(stats.curesDiscovered, 'disease')} cured of 4 · ${difficultyLabel}`,
            `${pluralize(stats.outbreaks, 'outbreak')} survived (of 8) · ${pluralize(stats.turnsLasted, 'turn')}`,
        ],
    }];
}
