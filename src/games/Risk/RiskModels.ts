import { GameDataModel, IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { IRiskGameDataResponse, IRiskSpecificGameStateResponse } from "./apiModels";
import { uuidString, GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";
import { v4 as uuidv4 } from 'uuid';
import { userIdListToUsernameList, userIdListToUsernameMap } from "@/utils/users/clerk";
import { RiskGameType } from "@/utils/apiModels/GameLogic";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { shuffle } from "@/utils/games/shuffle";
import {
    TERRITORIES,
    TERRITORY_COUNT,
    buildRiskCardDeck,
    startingArmiesForPlayerCount,
    IRiskTerritory,
    IRiskCard,
    RiskPhase,
} from "./board";

// ═══════════════════════════════════════════════════════════════════════════
//  RISK
// ═══════════════════════════════════════════════════════════════════════════

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface RiskInvitationRequest extends IInvitationRequest {}

export interface IRiskInvitationData extends IInvitationData {}

export interface IRiskInvitationDataDocument extends IRiskInvitationData, IInvitationDataDocument {}

export interface IRiskInvitationDataModel extends Model<IRiskInvitationDataDocument> {}

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

export interface IRiskPlayerState {
    cards: IRiskCard[];
    eliminated: boolean;
    // Whether the active player has conquered >=1 enemy territory this turn —
    // drives the end-of-turn card draw (docs/games/risk.md §4.4).
    conqueredTerritoryThisTurn: boolean;
}

export interface IRiskPendingOccupation {
    fromTerritoryId: number;
    toTerritoryId: number;
    minArmies: number;
}

export interface IRiskLastBattle {
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

export interface IRiskSpecificGameState {
    territories: IRiskTerritory[]; // length TERRITORY_COUNT, indexed by territory id
    playerStates: Map<string, IRiskPlayerState>;
    phase: RiskPhase;
    // Armies the current player still has to place this turn (setup allotment
    // during 'setup', or the computed reinforcement during 'reinforce').
    reinforcementsRemaining: number;
    // Set the moment a territory is conquered; must be resolved (RiskOccupyTerritory)
    // before any other attack/fortify command is accepted (docs §4.2 "Occupation").
    pendingOccupation: IRiskPendingOccupation | null;
    fortifyUsed: boolean;
    cardSetsCashedIn: number;
    cardDeck: IRiskCard[];
    lastBattle: IRiskLastBattle | null;
}

function cloneCard(c: IRiskCard): IRiskCard {
    return { id: c.id, type: c.type, territoryId: c.territoryId };
}

function clonePlayerState(ps: IRiskPlayerState): IRiskPlayerState {
    return {
        cards: ps.cards.map(cloneCard),
        eliminated: ps.eliminated,
        conqueredTerritoryThisTurn: ps.conqueredTerritoryThisTurn,
    };
}

// Deep-clones a Risk game state into independent plain objects, rebuilding
// playerStates as a fresh Map in `userIdList` order — mirrors SAC's
// cloneSACState (see SettlementsAndCitiesModels.ts) for the same reason: the
// board (here, the shuffled territory deal + card deck) is randomised at
// creation and can't be reconstructed later, so turn recap replays from a
// persisted snapshot instead.
export function cloneRiskState(
    gs: IRiskSpecificGameState,
    userIdList: string[],
): IRiskSpecificGameState {
    const source: Map<string, IRiskPlayerState> = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, IRiskPlayerState>));

    const playerStates = new Map<string, IRiskPlayerState>();
    for (const userId of userIdList) {
        const ps = source.get(userId);
        if (ps) playerStates.set(userId, clonePlayerState(ps));
    }

    return {
        territories: gs.territories.map((t): IRiskTerritory => ({ owner: t.owner, armies: t.armies })),
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

export function buildInitialRiskState(gameData: IRiskGameData): IRiskSpecificGameState {
    return cloneRiskState(gameData.initialSpecificGameState, gameData.userIdList);
}

var RiskInvitationSchema = new Schema<IRiskInvitationDataDocument>({}, { discriminatorKey: 'kind' });
RiskInvitationSchema.methods.CreateGame = async function(
    invite: IRiskInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Risk game');

    const gameType = new RiskGameType();

    const turnOrder: string[] = [];
    const history: string[] = [];
    const usernameMap = await userIdListToUsernameMap(userIdList);
    SortUsersByRoll(userIdList, usernameMap, turnOrder, history, 6);

    // Territories are dealt out evenly and at random (docs §3.2 Option B — the
    // draft-order placement of Option A doesn't translate well to async turns,
    // so the territory claim is automated the same way SAC's board layout is).
    const shuffledIds = shuffle(TERRITORIES.map(t => t.id));
    const territories: IRiskTerritory[] = Array.from({ length: TERRITORY_COUNT }, () => ({ owner: null, armies: 0 }));
    shuffledIds.forEach((territoryId, i) => {
        const owner = turnOrder[i % turnOrder.length];
        territories[territoryId] = { owner, armies: 1 };
    });

    const startingPool = startingArmiesForPlayerCount(turnOrder.length);
    const playerStates = new Map<string, IRiskPlayerState>();
    for (const userId of turnOrder) {
        playerStates.set(userId, { cards: [], eliminated: false, conqueredTerritoryThisTurn: false });
    }

    history.push(`Setup: territories dealt — ${startingPool} armies each, place your remaining troops`);

    const firstPlayer = turnOrder[0];
    const firstOwned = territories.filter(t => t.owner === firstPlayer).length;

    const specificGameState: IRiskSpecificGameState = {
        territories,
        playerStates,
        phase: 'setup',
        reinforcementsRemaining: Math.max(0, startingPool - firstOwned),
        pendingOccupation: null,
        fortifyUsed: false,
        cardSetsCashedIn: 0,
        cardDeck: shuffle(buildRiskCardDeck()),
        lastBattle: null,
    };

    const gameData: IRiskGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: firstPlayer,
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        gameState: {
            turnOrder,
            history,
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState,
        initialSpecificGameState: cloneRiskState(specificGameState, turnOrder),
    };
    return gameData;
};
export var RiskInvitationModel =
    models.RiskInvitation ||
    InvitationModel.discriminator<IRiskInvitationDataDocument, IRiskInvitationDataModel>('RiskInvitation', RiskInvitationSchema);

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IRiskGameData extends IGameData {
    specificGameState: IRiskSpecificGameState;
    // Immutable copy of the starting (post-deal) state, persisted at creation so
    // turn recap can replay from it — see cloneRiskState above.
    initialSpecificGameState: IRiskSpecificGameState;
}

export interface IRiskGameDataDocument extends IRiskGameData, IGameDataDocument {}

export interface IRiskGameDataModel extends Model<IRiskGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

function makeRiskStateSchemaDef() {
    return {
        territories: [{ owner: { type: String, default: null }, armies: Number }],
        playerStates: {
            type: Schema.Types.Map,
            of: {
                cards: [{ id: String, type: { type: String }, territoryId: { type: Number, default: null } }],
                eliminated: Boolean,
                conqueredTerritoryThisTurn: Boolean,
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

var RiskGameDataSchema = new Schema<IRiskGameDataDocument>(
    {
        specificGameState: makeRiskStateSchemaDef(),
        initialSpecificGameState: makeRiskStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

RiskGameDataSchema.methods.CreateDataResponse = async function(): Promise<IRiskGameDataResponse> {
    console.log('CreateDataResponse: Risk game');

    const doc: IRiskGameData = this as IRiskGameData;
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
        specificGameState: gameStateToResponse(doc.specificGameState, userIdNameMap),
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
    gs: IRiskSpecificGameState,
    userIdNameMap: { [key: string]: string },
): IRiskSpecificGameStateResponse {
    const playerStates: IRiskSpecificGameStateResponse['playerStates'] = {};
    const playerStatesSource = gs.playerStates instanceof Map
        ? gs.playerStates
        : new Map(Object.entries(gs.playerStates as unknown as Record<string, IRiskPlayerState>));

    for (const [userId, ps] of playerStatesSource) {
        const username = userIdNameMap[userId];
        playerStates[username] = {
            userId,
            username,
            territoryCount: gs.territories.filter(t => t.owner === userId).length,
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

export var RiskGameDataModel =
    models.RiskGameData ||
    GameDataModel.discriminator<IRiskGameDataDocument, IRiskGameDataModel>('RiskGameData', RiskGameDataSchema);

// ─── GameResult stats ────────────────────────────────────────────────────────
// Boiled-down per-player stats for the GameResult read model (see
// recordGameResult in GameResultData.ts), following the same pattern as SAC's
// computeSettlementsAndCitiesResultStats: territories/cards are read straight
// off the final state (physical, so nothing is lost by computing them once at
// the end).
export interface IRiskPlayerResultStats {
    territories: number;
    cardsHeld: number;
    eliminated: boolean;
}

export interface IRiskGameResultStats {
    playerStats: Map<string, IRiskPlayerResultStats>;
}

export const riskGameResultStatsSchemaDef = {
    playerStats: {
        type: Schema.Types.Map,
        of: {
            territories: Number,
            cardsHeld: Number,
            eliminated: Boolean,
        },
    },
};

export function computeRiskResultStats(gameData: IRiskGameData): IRiskGameResultStats {
    const gs = gameData.specificGameState;
    const playerStats = new Map<string, IRiskPlayerResultStats>();
    for (const [userId, ps] of gs.playerStates) {
        playerStats.set(userId, {
            territories: gs.territories.filter(t => t.owner === userId).length,
            cardsHeld: ps.cards.length,
            eliminated: ps.eliminated,
        });
    }
    return { playerStats };
}

export function formatRiskResultStats(stats: IRiskGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups: GameResultStatGroup[] = [];
    for (const [userId, s] of stats.playerStats) {
        groups.push({
            username: usernameById.get(userId) ?? userId,
            lines: [
                s.eliminated ? 'Eliminated' : `${pluralize(s.territories, 'territory', 'territories')}`,
                `Holding ${pluralize(s.cardsHeld, 'Risk card')}`,
            ],
        });
    }
    return groups;
}
