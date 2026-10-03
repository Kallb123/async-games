import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { GameResultStatGroup, uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RealmArenaGameType } from "@/utils/apiModels/GameLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { userToken } from "@/utils/games/history";
import { CHARACTERS, POINTS_BUDGET, type CharacterId, type PlayerCount } from "./characters";
import { addTally, NO_TALLY, xpOf, type MasterySnapshot, type Tally } from "./mastery";
import { battlefieldById, DEPLOYMENT_NAMES, mapForPlayers, type RealmArenaMapId } from "./maps";
import { battleRounds, pickOf, storedFighter, type BattleEvent, type Fighter, type MusterPick, type ToldEvent } from "./rules";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome } from "./apiModels";
import type { Square } from "@/utils/games/battlefield/terrain";

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
     * response can be built from this state alone. A replay adapter's
     * `toResponseState` is handed the state but not the turn order
     * (utils/games/replay.ts), and the response needs it for the budget, the
     * battle length and who has mustered.
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
    /**
     * The low cover blasted away so far, in the order it went (§22). The map
     * stays code and this is all that's stored of what happened to it: every
     * rule reads the map with these cleared (`battleOf`). Absent on a game
     * that predates it.
     */
    blasted: Square[];
    /** The sealed squads, in seat order, while the muster lasts; emptied as the battle begins. */
    musters: IRealmArenaMuster[];
    /** By userId, every player from 0 at the start — an empty object would be dropped when the document is first inserted. */
    scores: Record<string, number>;
    /**
     * Each player's rank with each character, taken when the battle was
     * created and never changed (§23.3). Only ranks above 0 are kept, and an
     * empty object is dropped on insert as `scores` would be, so it's absent
     * whenever nobody is ranked — and on a game that predates it. A player or
     * character missing is rank 0.
     */
    mastery?: MasterySnapshot;
    /**
     * Snapshots of the whole state, newest last, pushed by a `RealmArenaAct`
     * that rolled nothing and hurt nobody (docs/undo.md). `by` is whose action
     * it was. Never sent. Capped at UNDO_STACK_DEPTH, and emptied on every
     * hand-off. Absent on a game that predates it.
     */
    undoStack: { by: string, state: IRealmArenaSpecificGameState }[];
    /**
     * The id of the last command that pushed or popped a snapshot.
     * RealmArenaUndo refuses unless it is the tail of commandHistory, which is
     * how anything else played — an attack above all — puts every snapshot
     * behind it out of reach (docs/undo.md §4).
     */
    undoAnchorId: string | null;
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
    // `turnOrder`. With the mastery snapshot, which is persisted too, the
    // starting state rebuilds from it (§17.1, §23.3).
    const { turnOrder, history } = rollOffTurnOrder(userIdList);
    // Imported here rather than at the top: the lookup reads game results,
    // whose module reaches back to this one through the replay adapters, and
    // a static import would make the two load each other.
    const { masterySnapshotOf } = await import("./masteryRecord");
    const specificGameState = buildInitialRealmArenaState(turnOrder, await masterySnapshotOf(turnOrder));

    const field = battlefieldById(specificGameState.map);
    const zones = DEPLOYMENT_NAMES[specificGameState.map];
    history.push({ text: `Setup: Hold the Centre on the ${field.name}, over ${battleRounds(turnOrder.length)} battle rounds` });
    history.push({ text: `Setup: ${turnOrder.map((userId, seat) => `${userToken(userId)} deploys ${zones[seat]}`).join(", ")}` });
    history.push({ text: `Setup: each player musters ${POINTS_BUDGET[turnOrder.length as PlayerCount]} points' worth of characters, sealed until every player has` });

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
 * The battle before anyone has mustered: the map for the party's size, no
 * squads, nobody scored, and each seat's ranks as `mastery` gave them when the
 * battle was created. A pure function of those two, both persisted, so replay
 * rebuilds it rather than persisting a snapshot of the state (§17.1, §23.3).
 * Throws for a party the map has no deployment zone for.
 */
export function buildInitialRealmArenaState(turnOrder: string[], mastery: MasterySnapshot): IRealmArenaSpecificGameState {
    const map = mapForPlayers(turnOrder.length);
    const field = battlefieldById(map);
    if (turnOrder.length < 2 || turnOrder.length > field.deployments.length) {
        throw new Error(`Realm Arena: the ${field.name} seats 2–${field.deployments.length} players, not ${turnOrder.length}`);
    }
    return {
        map,
        seats: [...turnOrder],
        phase: "muster",
        roundsPlayed: 0,
        fighters: [],
        blasted: [],
        musters: [],
        scores: Object.fromEntries(turnOrder.map(userId => [userId, 0])),
        mastery: { ...mastery },
        undoStack: [],
        undoAnchorId: null,
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
            blasted: [Number],
            musters: Schema.Types.Mixed,
            scores: Schema.Types.Mixed,
            // Written once, as the battle is created (§23.3).
            mastery: Schema.Types.Mixed,
            // ─── Undo (docs/undo.md) ───
            undoStack: Schema.Types.Mixed,
            undoAnchorId: { type: String, default: null },
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
        specificGameState: gameStateToModel(doc.specificGameState, viewerId, doc.gameState.commandHistory.at(-1)?.id ?? null),
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
 * reaches the wire only when someone writes it in here — the undo stack, a
 * copy of the whole state, never does.
 *
 * `lastCommandId` (commandHistory's real tail) is what makes `canUndo` the
 * same test RealmArenaUndo runs on itself: the stack's owner alone would still
 * say yes after an attack that pushed nothing (docs/undo.md §7).
 */
export function gameStateToModel(
    gs: IRealmArenaSpecificGameState,
    viewerId: string | null,
    lastCommandId: string | null,
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
        blasted: [...(gs.blasted ?? [])],
        mustered: gs.phase === "muster" ? musters.map(muster => muster.owner) : seats,
        myMuster: own ? own.picks.map(pickOf) : null,
        mastery: Object.fromEntries(Object.entries(gs.mastery ?? {}).map(([userId, ranks]) => [userId, { ...ranks }])),
        scores: { ...gs.scores },
        // Absent (`?? []`) on a game that predates the stack; false for every
        // viewer but the actor, and for a viewerless replay.
        canUndo: viewerId !== null && (gs.undoStack ?? []).at(-1)?.by === viewerId && gs.undoAnchorId === lastCommandId,
    };
}

/**
 * What a replayed snapshot carries of the command behind it (§26.2): the
 * events an action or an End turn returned, for a review to play.
 *
 * Every player is sent these, and everything in them is theirs to see: they
 * only exist once the battle has begun, when there is nothing hidden on the
 * battlefield (§8), and the log already tells each one — except a shot's roll,
 * which the log leaves out and so does this. A muster's outcome, where the one
 * secret is, carries no events at all, and gets nothing here.
 *
 * That rests on there being no fog of war (§8). If B5 brings it, an event
 * about a character some viewer can't see is a secret, and this has to be
 * built per viewer — replay.test.ts pins every event's fields so a new one
 * can't slip through unnoticed.
 */
export function stepOutcomeToModel(outcome: unknown): IRealmArenaStepOutcome | undefined {
    const events = (outcome as { events?: unknown } | null)?.events;
    if (!Array.isArray(events) || events.length === 0) return undefined;
    return {
        events: (events as BattleEvent[]).map((event): ToldEvent => {
            if (event.kind !== "shot") return event;
            const { roll: _roll, ...told } = event;
            return told;
        }),
    };
}

export var RealmArenaGameDataModel =
    models.RealmArenaGameData ||
    GameDataModel.discriminator<IRealmArenaGameDataDocument, IRealmArenaGameDataModel>('RealmArenaGameData', RealmArenaGameDataSchema);

// ─── Result stats (§23.3) ───────────────────────────────────────────────────

/**
 * What one player's characters of one kind did in a battle: that they fought
 * in it, and their tallies pooled — two Knights earn into the one Knight
 * mastery (§23.1). Mastery is read off these rows (masteryRecord.ts).
 */
export interface IRealmArenaMasteryRow extends Tally {
    userId: string;
    character: CharacterId;
}

/** Boiled down for the GameResult read model, once at game-end (see recordGameResult in GameResultData.ts). */
export interface IRealmArenaGameResultStats {
    mastery: IRealmArenaMasteryRow[];
}

export const realmArenaGameResultStatsSchemaDef = {
    mastery: [{ _id: false, userId: String, character: String, attacks: Number, abilities: Number, items: Number }],
};

/**
 * A row for every kind of character each player fought with, downed or not,
 * in seat order and then the order the muster lists them. A battle given up
 * during the muster has no fighters, so no rows, and nor does a dropped
 * player, whose squad left the battlefield with its tallies (§17.4 B2).
 */
export function computeRealmArenaResultStats(gameData: IRealmArenaGameData): IRealmArenaGameResultStats {
    const gs = gameData.specificGameState;
    const fighters = gs.fighters ?? [];
    const characterIds = Object.keys(CHARACTERS) as CharacterId[];
    return {
        mastery: gs.seats.flatMap(userId => characterIds.flatMap(character => {
            const kind = fighters.filter(fighter => fighter.owner === userId && fighter.character === character);
            if (kind.length === 0) return [];
            return [{ userId, character, ...kind.reduce((sum, fighter) => addTally(sum, fighter.tally ?? NO_TALLY), NO_TALLY) }];
        })),
    };
}

/** One group a player: the XP each character they fought with earned in this battle. */
export function formatRealmArenaResultStats(stats: IRealmArenaGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups = new Map<string, string[]>();
    for (const row of stats.mastery ?? []) {
        const lines = groups.get(row.userId) ?? [];
        // A row is one battle's worth.
        lines.push(`${CHARACTERS[row.character]?.name ?? row.character}: ${xpOf({ battles: 1, ...row })} XP`);
        groups.set(row.userId, lines);
    }
    return [...groups].map(([userId, lines]) => ({ username: usernameById.get(userId) ?? userId, lines }));
}
