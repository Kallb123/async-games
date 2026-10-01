import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RealmArenaGameType } from "@/utils/apiModels/GameLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { userToken } from "@/utils/games/history";
import { POINTS_BUDGET, type PlayerCount } from "./characters";
import { battlefieldById, DEFAULT_MAP, type RealmArenaMapId } from "./maps";
import { battleRounds, storedFighter, type Fighter, type MusterPick } from "./rules";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse } from "./apiModels";

// ═══════════════════════════════════════════════════════════════════════════
//  REALM ARENA
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/realm-arena.md §17.3 PR 3: a battle can be created, mustered and
// fought by the commands in RealmArenaLogic.ts. §17.2 fixes the state this
// file persists, and the one thing in it that's hidden: the muster.

// ─── State (§17.2) ──────────────────────────────────────────────────────────

/** A battle opens with each player mustering in seat order, then is fought. */
export type RealmArenaPhase = "muster" | "battle";

/** One player's sealed squad, as they mustered it. */
export interface IRealmArenaMuster {
    owner: string;
    picks: MusterPick[];
}

export interface IRealmArenaSpecificGameState {
    map: RealmArenaMapId;
    /**
     * The players in seat order: `gameState.turnOrder`, copied in so the
     * response can be built from this state alone, as a replay builds it.
     */
    seats: string[];
    phase: RealmArenaPhase;
    /** Battle rounds played to the end: 0 until the first round's last turn ends. The round being played is one more. */
    roundsPlayed: number;
    /**
     * Everyone on the battlefield, in the shape rules.ts reads, with ids
     * counting from 0 in seat order. Empty until the last player has mustered:
     * the squads join the battlefield together, so a fighter id can't give
     * away the size of a squad still sealed.
     */
    fighters: Fighter[];
    /** The sealed squads, in seat order, while the muster lasts; emptied as the battle begins. */
    musters: IRealmArenaMuster[];
    /** By userId, every player from 0 at the start — an empty object would be dropped when the document is first inserted. */
    scores: Record<string, number>;
}

// ─── Invitation ─────────────────────────────────────────────────────────────

export type RealmArenaInvitationRequest = IInvitationRequest;

export type IRealmArenaInvitationData = IInvitationData;

export interface IRealmArenaInvitationDataDocument extends IRealmArenaInvitationData, IInvitationDataDocument {}

export interface IRealmArenaInvitationDataModel extends Model<IRealmArenaInvitationDataDocument> {}

var RealmArenaInvitationSchema = new Schema<IRealmArenaInvitationDataDocument>({}, { discriminatorKey: 'kind' });
RealmArenaInvitationSchema.methods.CreateGame = async function(invite: IRealmArenaInvitationData, userIdList: string[]) {
    console.log('CreateGame: Realm Arena game');

    const gameType = new RealmArenaGameType();

    // Seat order is the only randomness in setup, and it's persisted as
    // `turnOrder`, so the starting state rebuilds from it alone (§17.1).
    const { turnOrder, history } = rollOffTurnOrder(userIdList);
    const specificGameState = buildInitialRealmArenaState(turnOrder);

    const field = battlefieldById(specificGameState.map);
    history.push({ text: `Setup: Hold the Centre on the ${field.name}, over ${battleRounds(turnOrder.length)} battle rounds` });
    history.push({ text: `Setup: ${userToken(turnOrder[0])} deploys along the north edge and ${userToken(turnOrder[1])} along the south` });
    history.push({ text: `Setup: each player musters ${POINTS_BUDGET[turnOrder.length as PlayerCount]} points' worth of characters, sealed until both have` });

    const gameData: IRealmArenaGameData = {
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
    };
    return gameData;
};
export var RealmArenaInvitationModel =
    models.RealmArenaInvitation ||
    InvitationModel.discriminator<IRealmArenaInvitationDataDocument, IRealmArenaInvitationDataModel>('RealmArenaInvitation', RealmArenaInvitationSchema);

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * The battle before anyone has mustered: the map, no squads, nobody scored.
 * A pure function of the seat order, so replay rebuilds it rather than
 * persisting a snapshot (§17.1). Throws for a party the map has no deployment
 * zone for — two players only, until the 48×48 fort (§17.4 B2).
 */
export function buildInitialRealmArenaState(turnOrder: string[]): IRealmArenaSpecificGameState {
    const field = battlefieldById(DEFAULT_MAP);
    if (turnOrder.length < 2 || turnOrder.length > field.deployments.length) {
        throw new Error(`Realm Arena: the ${field.name} seats 2–${field.deployments.length} players, not ${turnOrder.length}`);
    }
    return {
        map: DEFAULT_MAP,
        seats: [...turnOrder],
        phase: "muster",
        roundsPlayed: 0,
        fighters: [],
        musters: [],
        scores: Object.fromEntries(turnOrder.map(userId => [userId, 0])),
    };
}

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IRealmArenaGameData extends IGameData {
    specificGameState: IRealmArenaSpecificGameState;
}

export interface IRealmArenaGameDataDocument extends IRealmArenaGameData, IGameDataDocument {}

export interface IRealmArenaGameDataModel extends Model<IRealmArenaGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

// The squads live in plain arrays (§17.2): rules.ts reads and returns plain
// fighters, and a Mongoose subdocument array is neither one nor clonable. So
// they're Mixed, and every command that changes them ends with `markDirty`
// (RealmArenaLogic.ts) — Mongoose only notices a Mixed path reassigned.
var RealmArenaGameDataSchema = new Schema<IRealmArenaGameDataDocument>(
    {
        specificGameState: {
            map: String,
            seats: [String],
            phase: String,
            roundsPlayed: Number,
            fighters: Schema.Types.Mixed,
            musters: Schema.Types.Mixed,
            scores: Schema.Types.Mixed,
        },
    },
    { discriminatorKey: 'kind' },
);

RealmArenaGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<IRealmArenaGameDataResponse> {
    console.log('CreateDataResponse: Realm Arena game');

    const doc: IRealmArenaGameData = this as IRealmArenaGameData;
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
        endDetail: doc.endDetail,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, viewerId),
    };
};

/**
 * The state on the wire, for one viewer (docs/new-game.md, "Don't leak hidden
 * information"). Everything on the battlefield is public. The sealed muster
 * isn't: until the last player has mustered, the viewer gets their own squad
 * and nobody else's — not hidden on screen but absent from the response, for
 * a null viewer (a replay) as much as for an opponent (§17.2).
 *
 * Built field by field rather than spread, so a field added to the state later
 * reaches the wire only when someone writes it in here.
 */
export function gameStateToModel(
    gs: IRealmArenaSpecificGameState,
    viewerId: string | null,
): IRealmArenaSpecificGameStateResponse {
    const seats = [...gs.seats];
    const rounds = battleRounds(seats.length);
    const musters = gs.musters ?? [];
    const own = gs.phase === "muster" ? musters.find(muster => muster.owner === viewerId) : undefined;
    return {
        map: gs.map,
        phase: gs.phase,
        round: gs.phase === "muster" ? 0 : Math.min(gs.roundsPlayed + 1, rounds),
        battleRounds: rounds,
        budget: POINTS_BUDGET[seats.length as PlayerCount],
        fighters: (gs.fighters ?? []).map(storedFighter),
        mustered: gs.phase === "muster" ? musters.map(muster => muster.owner) : seats,
        myMuster: own ? own.picks.map(({ character, square }) => ({ character, square })) : null,
        scores: { ...gs.scores },
    };
}

export var RealmArenaGameDataModel =
    models.RealmArenaGameData ||
    GameDataModel.discriminator<IRealmArenaGameDataDocument, IRealmArenaGameDataModel>('RealmArenaGameData', RealmArenaGameDataSchema);
