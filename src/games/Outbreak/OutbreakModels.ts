import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { OutbreakGameType } from "@/utils/apiModels/GameLogic";
import { shuffle } from "@/utils/games/shuffle";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import {
    IOutbreakGameDataResponse,
    IOutbreakSpecificGameStateResponse,
} from "./apiModels";
import {
    ATLANTA_CITY_ID,
    CITIES,
    CITY_COUNT,
    DISEASE_COLORS,
    epidemicCountFor,
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
    const usernameMap = await userIdListToUsernameMap(userIdList);
    const history = [
        `Setup: running order is ${turnOrder.map(u => usernameMap.get(u) ?? u).join(' → ')}`,
        `Setup: ${difficulty} difficulty — a research station is up in Atlanta`,
    ];

    const specificGameState = buildInitialOutbreakState(turnOrder, difficulty);
    const infectedCount = specificGameState.infectionDiscard.length;
    const cubesPlaced = specificGameState.cities.reduce(
        (sum, c) => sum + DISEASE_COLORS.reduce((s, color) => s + c.cubes[color], 0),
        0,
    );
    history.push(`Setup: ${infectedCount} cities begin infected (${cubesPlaced} cubes)`);
    history.push(`Setup: each player dealt ${startingHandSize(turnOrder.length)} cards`);

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
    // City-card ids held. Event cards join this once OutbreakPlayEvent lands
    // (§21.6 step 10) — public throughout, never redacted per viewer (§2's
    // "shared table, shared brain" pillar).
    hand: number[];
    city: number;
    // Dealt in buildInitialOutbreakState via rules.ts's dealRoles (§21.6 step 9).
    role: OutbreakRoleId | null;
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
    };
}

// Builds the deterministic starting specificGameState for an Outbreak game:
// the opening board of §6 steps 4, 5 and 8 — a research station in Atlanta,
// every pawn there too, and the initial infection (shuffle the infection
// deck, flip 3 cards placing 3 cubes each, then 3 placing 2 each, then 3
// placing 1 each — 9 cities infected, 18 cubes placed) — plus, per §6 step 6,
// a shuffled player deck (just the 48 city cards; no epidemics yet) with
// starting hands dealt from it before anything else touches it.
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

    // §6 step 6: shuffle the 48 city cards and deal each player their opening
    // hand from it before anything else touches the deck — before, per step
    // 7, the epidemic piles below are even built.
    const cityDeck = shuffle(Array.from({ length: CITY_COUNT }, (_, id) => id));
    const handSize = startingHandSize(turnOrder.length);
    const roles = dealRoles(turnOrder);
    const players = new Map<string, IOutbreakPlayerState>();
    for (const userId of turnOrder) {
        const hand = cityDeck.splice(0, handSize);
        players.set(userId, {
            hand,
            city: ATLANTA_CITY_ID,
            role: roles.get(userId) ?? null,
            contingencyCard: null,
            actionsLeft: ACTIONS_PER_TURN,
            opsExpertFlightUsed: false,
        });
    }

    // §6 step 7, §13: divide what's left into one equal-ish pile per epidemic
    // card the difficulty calls for, shuffle an epidemic into each, and stack
    // the piles — the single dial that sets the whole game's escalation pace.
    const playerDeck = buildEpidemicDeck(cityDeck, epidemicCountFor(difficulty));

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
    };
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
        players: {
            type: Schema.Types.Map,
            of: {
                hand: [Number],
                city: Number,
                role: { type: String, default: null },
                contingencyCard: { type: Number, default: null },
                actionsLeft: Number,
                opsExpertFlightUsed: { type: Boolean, default: false },
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
    const usernameList = await userIdListToUsernameList(doc.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    doc.userIdList.forEach((userId, i) => { userIdNameMap[userId] = usernameList[i]; });

    return {
        gameType: doc.gameType,
        usernameList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: publicGameState(doc.gameState),
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
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
        playerStates[username] = {
            userId,
            username,
            hand: [...ps.hand],
            city: ps.city,
            role: ps.role,
            actionsLeft: ps.actionsLeft,
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
    };
}

export var OutbreakGameDataModel =
    models.OutbreakGameData ||
    GameDataModel.discriminator<IOutbreakGameDataDocument, IOutbreakGameDataModel>('OutbreakGameData', OutbreakGameDataSchema);
