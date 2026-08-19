import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { IWorldDominationGameDataResponse, IWorldDominationSpecificGameStateResponse, IWorldDominationPlayerStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup, GameResultChart, formatPerTurnChart, compactCharts, playerByUserId as findPlayerByUserId } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { WorldDominationGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { shuffle } from "@/utils/games/shuffle";
import {
    TERRITORIES,
    TERRITORY_COUNT,
    buildWorldDominationCardDeck,
    startingArmiesForPlayerCount,
    IWorldDominationTerritory,
    IWorldDominationCard,
    WorldDominationPhase,
} from "./board";

// ═══════════════════════════════════════════════════════════════════════════
//  WORLD DOMINATION
// ═══════════════════════════════════════════════════════════════════════════

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface WorldDominationInvitationRequest extends IInvitationRequest {}

export interface IWorldDominationInvitationData extends IInvitationData {}

export interface IWorldDominationInvitationDataDocument extends IWorldDominationInvitationData, IInvitationDataDocument {}

export interface IWorldDominationInvitationDataModel extends Model<IWorldDominationInvitationDataDocument> {}

function SortUsersByRoll(
    userIdList: string[],
    usernameMap: Map<string, string>,
    turnOrder: string[],
    history: string[],
    dieToRoll: number,
) {
    const turnRolls = userIdList.map(userId => ({ userId, diceRoll: DiceRoll(dieToRoll) }));
    const distinctRolls = new Map<number, string[]>();
    turnRolls.forEach(({ userId, diceRoll }) => {
        const bucket = distinctRolls.get(diceRoll);
        if (bucket) bucket.push(userId);
        else distinctRolls.set(diceRoll, [userId]);
    });
    [...distinctRolls.keys()].sort((a, b) => b - a).forEach(roll => {
        const users = distinctRolls.get(roll)!;
        if (users.length > 1) {
            const names = users.map(u => usernameMap.get(u));
            history.push(`Setup: ${names.join(' & ')} rolled a ${roll} and are re-rolling`);
            SortUsersByRoll(users, usernameMap, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(users[0]);
            history.push(`Setup: ${usernameMap.get(users[0])} rolled a ${roll}${turnOrder.length === 1 ? ' and goes first' : ''}`);
        }
    });
}

// ─── Player / combat / specific state ──────────────────────────────────────

export interface IWorldDominationPlayerState {
    cards: IWorldDominationCard[];
    eliminated: boolean;
    // Whether the active player has conquered >=1 enemy territory this turn —
    // drives the end-of-turn card draw (docs/games/worlddomination.md §4.4).
    conqueredTerritoryThisTurn: boolean;
    // Cumulative armies placed via WorldDominationDeployArmies over the whole
    // match (setup allotment, reinforcements, cashed-in card top-ups). Armies
    // are later lost in combat, so — unlike territory counts — this can't be
    // reconstructed from final state alone; tracked live like Dice Cities'
    // totalCoinsEarned.
    totalArmiesDeployed: number;
}

export interface IWorldDominationPendingOccupation {
    fromTerritoryId: number;
    toTerritoryId: number;
    minArmies: number;
}

export interface IWorldDominationLastBattle {
    attackerId: string;
    fromTerritoryId: number;
    toTerritoryId: number;
    attackerDice: number[];
    defenderDice: number[];
    attackerLosses: number;
    defenderLosses: number;
    conquered: boolean;
    defenderEliminated: string | null; // userId of an eliminated defender, if any
}

export interface IWorldDominationSpecificGameState {
    territories: IWorldDominationTerritory[]; // length TERRITORY_COUNT, indexed by territory id
    playerStates: Map<string, IWorldDominationPlayerState>;
    phase: WorldDominationPhase;
    // Armies the current player still has to place this turn (setup allotment
    // during 'setup', or the computed reinforcement during 'reinforce').
    reinforcementsRemaining: number;
    // Set the moment a territory is conquered; must be resolved (WorldDominationOccupyTerritory)
    // before any other attack/fortify command is accepted (docs §4.2 "Occupation").
    pendingOccupation: IWorldDominationPendingOccupation | null;
    fortifyUsed: boolean;
    cardSetsCashedIn: number;
    cardDeck: IWorldDominationCard[];
    lastBattle: IWorldDominationLastBattle | null;
}

function cloneCard(c: IWorldDominationCard): IWorldDominationCard {
    return { id: c.id, type: c.type, territoryId: c.territoryId };
}

function clonePlayerState(ps: IWorldDominationPlayerState): IWorldDominationPlayerState {
    return {
        cards: ps.cards.map(cloneCard),
        eliminated: ps.eliminated,
        conqueredTerritoryThisTurn: ps.conqueredTerritoryThisTurn,
        totalArmiesDeployed: ps.totalArmiesDeployed,
    };
}

// Deep-clones a World Domination game state into independent plain objects, rebuilding
// playerStates as a fresh Map in `userIdList` order — mirrors SAC's
// cloneSACState (see SettlementsAndCitiesModels.ts) for the same reason: the
// board (here, the shuffled territory deal + card deck) is randomised at
// creation and can't be reconstructed later, so turn recap replays from a
// persisted snapshot instead.
export function cloneWorldDominationState(
    gs: IWorldDominationSpecificGameState,
    userIdList: string[],
): IWorldDominationSpecificGameState {
    const source: Map<string, IWorldDominationPlayerState> = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, IWorldDominationPlayerState>));

    const playerStates = new Map<string, IWorldDominationPlayerState>();
    for (const userId of userIdList) {
        const ps = source.get(userId);
        if (ps) playerStates.set(userId, clonePlayerState(ps));
    }

    return {
        territories: gs.territories.map((t): IWorldDominationTerritory => ({ owner: t.owner, armies: t.armies })),
        playerStates,
        phase: gs.phase,
        reinforcementsRemaining: gs.reinforcementsRemaining,
        pendingOccupation: gs.pendingOccupation ? { ...gs.pendingOccupation } : null,
        fortifyUsed: gs.fortifyUsed,
        cardSetsCashedIn: gs.cardSetsCashedIn,
        cardDeck: gs.cardDeck.map(cloneCard),
        lastBattle: gs.lastBattle ? { ...gs.lastBattle, attackerDice: [...gs.lastBattle.attackerDice], defenderDice: [...gs.lastBattle.defenderDice] } : null,
    };
}

export function buildInitialWorldDominationState(gameData: IWorldDominationGameData): IWorldDominationSpecificGameState {
    return cloneWorldDominationState(gameData.initialSpecificGameState, gameData.userIdList);
}

var WorldDominationInvitationSchema = new Schema<IWorldDominationInvitationDataDocument>({}, { discriminatorKey: 'kind' });
WorldDominationInvitationSchema.methods.CreateGame = async function(
    invite: IWorldDominationInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: World Domination game');

    const gameType = new WorldDominationGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];
    const usernameMap = await userIdListToUsernameMap(userIdList);
    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    // Territories are dealt out evenly and at random (docs §3.2 Option B — the
    // draft-order placement of Option A doesn't translate well to async turns,
    // so the territory claim is automated the same way SAC's board layout is).
    const shuffledIds = shuffle(TERRITORIES.map(t => t.id));
    const territories: IWorldDominationTerritory[] = Array.from({ length: TERRITORY_COUNT }, () => ({ owner: null, armies: 0 }));
    shuffledIds.forEach((territoryId, i) => {
        const owner = turnOrder[i % turnOrder.length];
        territories[territoryId] = { owner, armies: 1 };
    });

    const startingPool = startingArmiesForPlayerCount(turnOrder.length);
    const playerStates = new Map<string, IWorldDominationPlayerState>();
    for (const userId of turnOrder) {
        playerStates.set(userId, { cards: [], eliminated: false, conqueredTerritoryThisTurn: false, totalArmiesDeployed: 0 });
    }

    history.push(`Setup: territories dealt — ${startingPool} armies each, place your remaining troops`);

    const firstPlayer = turnOrder[0];
    const firstOwned = territories.filter(t => t.owner === firstPlayer).length;

    const specificGameState: IWorldDominationSpecificGameState = {
        territories,
        playerStates,
        phase: 'setup',
        reinforcementsRemaining: Math.max(0, startingPool - firstOwned),
        pendingOccupation: null,
        fortifyUsed: false,
        cardSetsCashedIn: 0,
        cardDeck: shuffle(buildWorldDominationCardDeck()),
        lastBattle: null,
    };

    const gameData: IWorldDominationGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: firstPlayer,
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
        initialSpecificGameState: cloneWorldDominationState(specificGameState, turnOrder),
    };
    return gameData;
};
export var WorldDominationInvitationModel =
    models.WorldDominationInvitation ||
    InvitationModel.discriminator<IWorldDominationInvitationDataDocument, IWorldDominationInvitationDataModel>('WorldDominationInvitation', WorldDominationInvitationSchema);

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IWorldDominationGameData extends IGameData {
    specificGameState: IWorldDominationSpecificGameState;
    // Immutable copy of the starting (post-deal) state, persisted at creation so
    // turn recap can replay from it — see cloneWorldDominationState above.
    initialSpecificGameState: IWorldDominationSpecificGameState;
}

export interface IWorldDominationGameDataDocument extends IWorldDominationGameData, IGameDataDocument {}

export interface IWorldDominationGameDataModel extends Model<IWorldDominationGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

function makeWorldDominationStateSchemaDef() {
    return {
        territories: [{ owner: { type: String, default: null }, armies: Number }],
        playerStates: {
            type: Schema.Types.Map,
            of: {
                cards: [{ id: String, type: { type: String }, territoryId: { type: Number, default: null } }],
                eliminated: Boolean,
                conqueredTerritoryThisTurn: Boolean,
                totalArmiesDeployed: Number,
            },
        },
        phase: String,
        reinforcementsRemaining: Number,
        pendingOccupation: Schema.Types.Mixed,
        fortifyUsed: Boolean,
        cardSetsCashedIn: Number,
        cardDeck: [{ id: String, type: { type: String }, territoryId: { type: Number, default: null } }],
        lastBattle: Schema.Types.Mixed,
    };
}

var WorldDominationGameDataSchema = new Schema<IWorldDominationGameDataDocument>(
    {
        specificGameState: makeWorldDominationStateSchemaDef(),
        initialSpecificGameState: makeWorldDominationStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

WorldDominationGameDataSchema.methods.CreateDataResponse = async function(): Promise<IWorldDominationGameDataResponse> {
    console.log('CreateDataResponse: World Domination game');

    const doc: IWorldDominationGameData = this as IWorldDominationGameData;
    const usernameList = await userIdListToUsernameList(doc.userIdList);
    const userIdNameMap: { [key: string]: string } = {};
    (doc.userIdList as string[]).forEach((userId, i) => {
        userIdNameMap[userId] = usernameList[i];
    });

    return {
        gameType: doc.gameType,
        usernameList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: {
            ...doc.gameState,
            history: replaceHistoryUserIds(doc.gameState.history, userIdNameMap),
        },
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToResponse(doc.specificGameState, userIdNameMap),
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

function replaceHistoryUserIds(history: string[], userIdNameMap: { [key: string]: string }): string[] {
    return history.map(entry => {
        let updated = entry;
        for (const [userId, username] of Object.entries(userIdNameMap)) {
            if (!userId) continue;
            updated = updated.split(userId).join(username);
        }
        return updated;
    });
}

export function gameStateToResponse(
    gs: IWorldDominationSpecificGameState,
    userIdNameMap: { [key: string]: string },
): IWorldDominationSpecificGameStateResponse {
    const playerStates: IWorldDominationSpecificGameStateResponse['playerStates'] = {};
    const playerStatesSource = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, IWorldDominationPlayerState>));

    for (const [userId, ps] of playerStatesSource) {
        const username = userIdNameMap[userId];
        const owned = gs.territories.filter(t => t.owner === userId);
        playerStates[username] = {
            userId,
            username,
            territoryCount: owned.length,
            armies: owned.reduce((sum, t) => sum + t.armies, 0),
            totalArmiesDeployed: ps.totalArmiesDeployed,
            cards: ps.cards.map(c => ({ id: c.id, type: c.type, territoryId: c.territoryId })),
            eliminated: ps.eliminated,
        };
    }

    const territories = gs.territories.map(t => ({
        owner: t.owner ? (userIdNameMap[t.owner] ?? t.owner) : null,
        armies: t.armies,
    }));

    const lastBattle = gs.lastBattle ? {
        attackerId: userIdNameMap[gs.lastBattle.attackerId] ?? gs.lastBattle.attackerId,
        fromTerritoryId: gs.lastBattle.fromTerritoryId,
        toTerritoryId: gs.lastBattle.toTerritoryId,
        attackerDice: [...gs.lastBattle.attackerDice],
        defenderDice: [...gs.lastBattle.defenderDice],
        attackerLosses: gs.lastBattle.attackerLosses,
        defenderLosses: gs.lastBattle.defenderLosses,
        conquered: gs.lastBattle.conquered,
        defenderEliminated: gs.lastBattle.defenderEliminated
            ? (userIdNameMap[gs.lastBattle.defenderEliminated] ?? gs.lastBattle.defenderEliminated)
            : null,
    } : null;

    return {
        territories,
        playerStates,
        phase: gs.phase,
        reinforcementsRemaining: gs.reinforcementsRemaining,
        pendingOccupation: gs.pendingOccupation ? { ...gs.pendingOccupation, maxArmies: gs.territories[gs.pendingOccupation.fromTerritoryId].armies - 1 } : null,
        fortifyUsed: gs.fortifyUsed,
        cardSetsCashedIn: gs.cardSetsCashedIn,
        cardDeckSize: gs.cardDeck.length,
        lastBattle,
    };
}

export function playerByUserId(
    state: IWorldDominationSpecificGameStateResponse | undefined,
    userId: string
): IWorldDominationPlayerStateResponse | undefined {
    return findPlayerByUserId(state, userId);
}

export var WorldDominationGameDataModel =
    models.WorldDominationGameData ||
    GameDataModel.discriminator<IWorldDominationGameDataDocument, IWorldDominationGameDataModel>('WorldDominationGameData', WorldDominationGameDataSchema);

// ─── GameResult stats ────────────────────────────────────────────────────────
// Boiled-down per-player stats for the GameResult read model (see
// recordGameResult in GameResultData.ts), following the same pattern as SAC's
// computeSettlementsAndCitiesResultStats: territories/cards are read straight
// off the final state (physical, so nothing is lost by computing them once at
// the end).
export interface IWorldDominationPlayerResultStats {
    territories: number;
    cardsHeld: number;
    eliminated: boolean;
}

export interface IWorldDominationGameResultStats {
    playerStats: Map<string, IWorldDominationPlayerResultStats>;
    // Armies currently deployed (on the board) per player at the end of each
    // turn, in turn order. Derived straight from response state (territories
    // are physical, so nothing is lost recomputing this per turn).
    armiesDeployedPerTurn: Map<string, number>[];
    // Cumulative totalArmiesDeployed per player at the end of each turn, in
    // turn order - not derivable from armiesDeployedPerTurn (armies are lost
    // in combat). Computed by replaying commandHistory via computePerTurnStat
    // (see replay.ts), driven from this game's GAME_RESULT_STATS entry in
    // GameResultData.ts, since it isn't tracked as history on specificGameState.
    totalArmiesDeployedPerTurn: Map<string, number>[];
}

export const worldDominationGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            territories: Number,
            cardsHeld: Number,
            eliminated: Boolean,
        },
    },
    armiesDeployedPerTurn: [{ type: Schema.Types.Map, of: Number }],
    totalArmiesDeployedPerTurn: [{ type: Schema.Types.Map, of: Number }],
};

export function computeWorldDominationResultStats(
    gameData: IWorldDominationGameData,
    armiesDeployedPerTurn: Map<string, number>[],
    totalArmiesDeployedPerTurn: Map<string, number>[],
): IWorldDominationGameResultStats {
    const gs = gameData.specificGameState;
    const playerStats = new Map<string, IWorldDominationPlayerResultStats>();
    for (const [userId, ps] of gs.playerStates) {
        playerStats.set(userId, {
            territories: gs.territories.filter(t => t.owner === userId).length,
            cardsHeld: ps.cards.length,
            eliminated: ps.eliminated,
        });
    }
    return { playerStats, armiesDeployedPerTurn, totalArmiesDeployedPerTurn };
}

export function formatWorldDominationResultStats(stats: IWorldDominationGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, s] of stats.playerStats) {
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                s.eliminated ? 'Eliminated' : `${pluralize(s.territories, 'territory', 'territories')}`,
                `Holding ${pluralize(s.cardsHeld, 'World Domination card')}`,
            ],
        });
    }
    return groups;
}

// Renders armiesDeployedPerTurn/totalArmiesDeployedPerTurn as GameResult
// charts: one entry per turn, keyed by username, for the result page's
// armies/turn charts.
export function formatWorldDominationCharts(stats: IWorldDominationGameResultStats, usernameById: Map<string, string>): GameResultChart[] {
    return compactCharts(
        formatPerTurnChart(stats.armiesDeployedPerTurn, usernameById, "Armies deployed per turn", "Armies"),
        formatPerTurnChart(stats.totalArmiesDeployedPerTurn, usernameById, "Cumulative armies deployed per turn", "Armies"),
    );
}
