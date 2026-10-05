import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { compactCharts, formatPerTurnChart, gameResultEventSchemaDef, type GameResultAnyChart, type GameResultBarChart, type GameResultStatGroup, type GameResultTable, type uuidString } from "@/utils/apiModels/GameDataApi";
import { mongoMap } from "@/utils/games/mongoMaps";
import { pluralize } from "@/utils/ui/text";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RealmArenaGameType } from "@/utils/apiModels/GameLogic";
import { battleOf, toldTo } from "./RealmArenaLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { randomInt } from "@/utils/games/random";
import { userToken } from "@/utils/games/history";
import { CHARACTERS, FACTIONS, factionById, isFactionId, musterSize, POINTS_BUDGET, type CharacterId, type FactionId } from "./characters";
import { addTally, NO_TALLY, xpOf, type MasterySnapshot, type Tally } from "./mastery";
import { battlefieldById, DEPLOYMENT_NAMES, mapFor, type RealmArenaMapId } from "./maps";
import { battleRounds, pickOf, storedFighter, viewOf, type BattleEvent, type Fighter, type MusterPick, type ToldEvent } from "./rules";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome } from "./apiModels";
import type { Square } from "@/utils/games/battlefield/terrain";
import { addRecords, NO_RECORD, RECORD_KEYS, type BattleRecord, type FightingRecord, type FightingRow } from "./battleRecord";
import { CHARACTER_IDS } from "./roster";

// ═══════════════════════════════════════════════════════════════════════════
//  REALM ARENA
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/realm-arena.md §17.3 PR 3: a battle can be created, mustered and
// fought by the commands in RealmArenaLogic.ts. §17.2 fixes the state this
// file persists, and the one thing in it that's hidden: the muster — and, in
// a battle fought in fog of war, whatever each player's squad can't see (§27).

// ─── State (§17.2) ──────────────────────────────────────────────────────────

/** A battle opens with each player mustering in seat order, then is fought. */
export type RealmArenaPhase = "muster" | "battle";

/** A co-op battle (§29.8). */
export interface IRealmArenaCoop {
    /** The faction the warbands are, never "random": Random is drawn as the battle is created (§29.3). */
    enemy: FactionId;
    /** Which warband takes the enemy's next turn, counting from 0 (§29.4). */
    nextWarband: number;
}

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
    /**
     * Whether the battle is fought in fog of war (§27): each player sees only
     * what their squad can. Chosen by the host and fixed when the battle is
     * created, so a replay plays it the same way; absent in a battle without
     * it, every battle from before it among them.
     */
    fog?: boolean;
    /**
     * Co-op against the computer (§29): the players fight as one team against
     * a warband each, played by the game. Chosen by the host and fixed when
     * the battle is created; absent in a free-for-all, every battle from
     * before it among them.
     */
    coop?: IRealmArenaCoop;
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

export interface RealmArenaInvitationRequest extends IInvitationRequest {
    /** Fight the battle in fog of war (§27). Off unless sent as true. */
    fog?: boolean;
    /** Fight together against the computer (§29), and whom. A free-for-all when absent. */
    coop?: RealmArenaCoopInvite;
}

/** Whom a co-op team fights, as the host chose it: a faction, or one drawn at random as the battle is created (§29.3). */
export interface RealmArenaCoopInvite {
    enemy: FactionId | typeof RANDOM_ENEMY;
}

export const RANDOM_ENEMY = "random";

/** How many players a co-op team can be (§29.1): one battlefield for each (§29.2). */
export const COOP_PLAYERS = { min: 2, max: 3 } as const;

/**
 * A co-op setting as the host chose it, or undefined for anything else a
 * request could send: only an enemy that is a faction, or Random. What the
 * setup route checks and the invitation stores, so a lobby invitation, whose
 * settings reach the model unread, is held to it as well.
 */
export function coopInviteOf(value: unknown): RealmArenaCoopInvite | undefined {
    const enemy = (value as { enemy?: unknown } | null | undefined)?.enemy;
    return enemy === RANDOM_ENEMY || isFactionId(enemy) ? { enemy } : undefined;
}

export interface IRealmArenaInvitationData extends IInvitationData {
    fog?: boolean;
    coop?: RealmArenaCoopInvite;
}

export interface IRealmArenaInvitationDataDocument extends IRealmArenaInvitationData, IInvitationDataDocument {}

export interface IRealmArenaInvitationDataModel extends Model<IRealmArenaInvitationDataDocument> {}

var RealmArenaInvitationSchema = new Schema<IRealmArenaInvitationDataDocument>({
    // The host's choice on the setup screen (§27). Only `true` is fog: the
    // lobby route hands a game's own settings straight to the model, and
    // anything else a body sent — "banana", {} — is no fog rather than a
    // failed cast and a 500.
    fog: { type: Boolean, set: (value: unknown) => value === true },
    // Co-op (§29), likewise held to what it can be: anything but a faction or
    // Random is a free-for-all.
    coop: { type: Schema.Types.Mixed, set: coopInviteOf },
}, { discriminatorKey: 'kind' });
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
    // Co-op only for a team its battlefields are built for: a lobby can fill
    // to four, and four play a free-for-all whatever the invitation said.
    const invited = coopInviteOf(this.coop);
    const coop = invited && turnOrder.length >= COOP_PLAYERS.min && turnOrder.length <= COOP_PLAYERS.max ? invited : undefined;
    // Random is drawn here, on the server, once, and stored as the faction it
    // came out as (§29.3): a replay rebuilds the same enemy, and no client
    // chooses it.
    const factionIds = Object.keys(FACTIONS) as FactionId[];
    const enemy = coop && (coop.enemy === RANDOM_ENEMY ? factionIds[randomInt(factionIds.length)] : coop.enemy);
    const specificGameState = buildInitialRealmArenaState(turnOrder, await masterySnapshotOf(turnOrder), this.fog === true, enemy);

    const field = battlefieldById(specificGameState.map);
    const zones = DEPLOYMENT_NAMES[specificGameState.map];
    history.push({ text: `Setup: Hold the Centre on the ${field.name}, over ${battleRounds(turnOrder.length)} battle rounds` });
    if (coop && enemy) {
        // A random enemy isn't named: the team musters not knowing whom it will face (§29.3).
        const foe = coop.enemy === RANDOM_ENEMY ? "an enemy drawn at random" : factionById(enemy).enemyName;
        history.push({ text: `Setup: the players fight together against ${foe}, a warband deployed opposite each of them` });
    }
    history.push({ text: `Setup: ${turnOrder.map((userId, seat) => `${userToken(userId)} deploys ${zones[seat]}`).join(", ")}` });
    if (specificGameState.fog) history.push({ text: "Setup: fought in fog of war, so each player sees only what their squad can" });
    history.push({ text: `Setup: each player musters ${POINTS_BUDGET[musterSize(turnOrder.length, !!coop)]} points' worth of characters, sealed until every player has` });

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
 * battle was created, in fog of war if the host chose it (§27), and in co-op
 * against `enemy`'s warbands if the host chose that (§29), with the first
 * warband to take the enemy's first turn. A pure function of those four, all
 * persisted, so replay rebuilds it rather than persisting a snapshot of the
 * state (§17.1, §23.3). Throws for a party the map has no deployment zone for
 * — in co-op, a zone for each player and one for each warband.
 */
export function buildInitialRealmArenaState(turnOrder: string[], mastery: MasterySnapshot, fog = false, enemy?: FactionId): IRealmArenaSpecificGameState {
    const coop = enemy !== undefined;
    const map = mapFor(turnOrder.length, coop);
    const field = battlefieldById(map);
    const seated = coop ? field.deployments.length / 2 : field.deployments.length;
    if (turnOrder.length < 2 || turnOrder.length > seated) {
        throw new Error(`Realm Arena: the ${field.name} seats 2–${seated} players, not ${turnOrder.length}`);
    }
    return {
        map,
        seats: [...turnOrder],
        // Only when it's on, so a battle without it looks as every one before it did.
        ...(fog ? { fog: true } : {}),
        ...(coop ? { coop: { enemy, nextWarband: 0 } } : {}),
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
            // Written once, as the battle is created (§27).
            fog: Boolean,
            // The enemy is written once, as the battle is created; the rotation
            // moves on with every enemy turn (§29.4).
            coop: Schema.Types.Mixed,
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
        specificGameState: gameStateToModel(doc.specificGameState, viewerId, doc.gameState.commandHistory.at(-1)?.id ?? null, doc.complete),
    };
};

/**
 * The state on the wire, for one viewer (docs/new-game.md, "Don't leak hidden
 * information"). The sealed muster is hidden: until the last player has
 * mustered, the viewer gets their own squad and nobody else's — not hidden on
 * screen but absent from the response, for a null viewer (a replay) as much
 * as for an opponent (§17.2).
 *
 * So, in a battle fought in fog of war, is whatever the viewer's squad can't
 * see (§27): `fighters` is their own squad and every other character on a
 * square it sees, and nobody else's at all — not a count, not a fallen body —
 * and a smoke cloud whose thrower is out of sight comes as the square it
 * landed on, only when the viewer can see some of it. A null viewer has no
 * squad and sees nobody. The fog lifts once the battle is over (`complete`),
 * when everything on the battlefield is everyone's.
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
    complete = false,
): IRealmArenaSpecificGameStateResponse {
    const seats = [...gs.seats];
    const rounds = battleRounds(seats.length);
    const musters = gs.musters ?? [];
    const own = gs.phase === "muster" ? musters.find(muster => muster.owner === viewerId) : undefined;
    const view = viewOf(battleOf(gs, complete), viewerId);
    return {
        map: gs.map,
        phase: gs.phase,
        round: gs.phase === "muster" ? 0 : Math.min(gs.roundsPlayed + 1, rounds),
        battleRounds: rounds,
        budget: POINTS_BUDGET[musterSize(seats.length, gs.coop !== undefined)],
        fog: gs.fog === true,
        // Whom the team fights stays off the wire for now: a random enemy is
        // kept hidden until it's seen (§29.3), which comes with PR 4b.
        coop: gs.coop !== undefined,
        fighters: view.fighters.map(storedFighter),
        clouds: [...view.clouds ?? []],
        blasted: [...(gs.blasted ?? [])],
        mustered: gs.phase === "muster" ? musters.map(muster => muster.owner) : seats,
        myMuster: own ? own.picks.map(pickOf) : null,
        mastery: ranksOnTheWire(gs.mastery ?? {}, viewerId),
        scores: { ...gs.scores },
        // Absent (`?? []`) on a game that predates the stack; false for every
        // viewer but the actor, and for a viewerless replay.
        canUndo: viewerId !== null && (gs.undoStack ?? []).at(-1)?.by === viewerId && gs.undoAnchorId === lastCommandId,
    };
}

/**
 * The viewer's own ranks from the battle's snapshot (§23.3) — all the muster
 * screen checks against. Nobody else's: a profile's mastery is shown only to
 * its owner and their friends, and a battle can be joined by a stranger.
 * Built key by key rather than copied, so only a rank of 1–3 by a character's
 * id reaches the wire, whatever else a Mixed path might one day hold.
 */
function ranksOnTheWire(mastery: MasterySnapshot, viewerId: string | null): MasterySnapshot {
    const characterIds = Object.keys(CHARACTERS) as CharacterId[];
    const own = Object.entries(mastery).filter(([userId]) => userId === viewerId);
    return Object.fromEntries(own.map(([userId, ranks]) => [userId, Object.fromEntries(characterIds.flatMap(id => {
        const rank = ranks?.[id];
        return rank === 1 || rank === 2 || rank === 3 ? [[id, rank]] : [];
    }))]));
}

/**
 * What a replayed snapshot carries of the command behind it (§26.2), for one
 * viewer: the events an action or an End turn returned, for a review to play.
 *
 * Everything in them is told by the log, which every player reads — who did
 * what to whom, the damage, the knock-outs — except a shot's roll, which the
 * log leaves out and so does this. A muster's outcome, where the one secret of
 * a battle without fog is, carries no events at all, and gets nothing here.
 *
 * What the log never tells is where anything happened, and in a battle fought
 * in fog of war (§27) that is the secret: so for each viewer, in a battle not
 * yet over, an event that would put something they can't see on the board is
 * cut down to what they can (`toldTo`). `gs` is the battle after the command.
 * replay.test.ts pins every event's fields, so a new one can't slip through
 * without someone deciding what it tells.
 */
export function stepOutcomeToModel(outcome: unknown, viewerId: string | null, gs: IRealmArenaSpecificGameState, complete = false): IRealmArenaStepOutcome | undefined {
    const events = (outcome as { events?: unknown } | null)?.events;
    if (!Array.isArray(events) || events.length === 0) return undefined;
    const battle = battleOf(gs, complete);
    const told = battle.fog ? toldTo(events as BattleEvent[], battle, viewerId) : events as BattleEvent[];
    return {
        events: told.map((event): ToldEvent => {
            if (event.kind !== "shot") return event;
            const { roll: _roll, ...rest } = event;
            return rest;
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

/**
 * Boiled down for the GameResult read model, once at game-end (see
 * recordGameResult in GameResultData.ts): the mastery rows, and the battle's
 * record (§28) — every field of which is absent on a result recorded before
 * it, on a battle given up during the muster, and on one whose replay didn't
 * end where the battle did. A result without it shows the XP alone.
 */
export interface IRealmArenaGameResultStats extends Partial<BattleRecord> {
    mastery: IRealmArenaMasteryRow[];
}

export const realmArenaGameResultStatsSchemaDef = {
    mastery: [{ _id: false, userId: String, character: String, attacks: Number, abilities: Number, items: Number }],
    // `default: undefined` so a result recorded before the record reads back
    // as having none, rather than as a battle in which nobody did anything.
    fighting: { type: [{ _id: false, userId: String, character: String, ...Object.fromEntries(RECORD_KEYS.map(key => [key, Number])) }], default: undefined },
    centrePoints: { type: Schema.Types.Map, of: Number, default: undefined },
    pointsPerRound: [{ type: Schema.Types.Map, of: Number }],
    squadHpPerRound: [{ type: Schema.Types.Map, of: Number }],
    losses: [gameResultEventSchemaDef],
};

/**
 * Whether the replay the record was read from ended where the battle did:
 * every seat on the score it finished with. One that drifted from the battle
 * as fought refuses the moves it can no longer follow and carries on without
 * them, so its record would tell a different battle while looking whole.
 */
function recordEndsWhereBattleDid(gs: IRealmArenaSpecificGameState, record: BattleRecord): boolean {
    const final = record.pointsPerRound.at(-1);
    return final !== undefined && gs.seats.every(userId => final.get(userId) === (gs.scores[userId] ?? 0));
}

/**
 * A mastery row for every kind of character each player fought with, downed
 * or not, in seat order and then the order the muster lists them. A battle
 * given up during the muster has no fighters, so no rows, and nor does a
 * dropped player, whose squad left the battlefield with its tallies (§17.4 B2).
 *
 * `record` is the battle's record, read off the game-end replay (§28):
 * absent when the replay couldn't run, and left out when it didn't end where
 * the battle did. A dropped player keeps their record — the replay saw what
 * their squad did before it left.
 */
export function computeRealmArenaResultStats(gameData: IRealmArenaGameData, record?: BattleRecord): IRealmArenaGameResultStats {
    const gs = gameData.specificGameState;
    const fighters = gs.fighters ?? [];
    const mastery = gs.seats.flatMap(userId => CHARACTER_IDS.flatMap(character => {
        const kind = fighters.filter(fighter => fighter.owner === userId && fighter.character === character);
        if (kind.length === 0) return [];
        return [{ userId, character, ...kind.reduce((sum, fighter) => addTally(sum, fighter.tally ?? NO_TALLY), NO_TALLY) }];
    }));
    if (!record || record.fighting.length === 0) return { mastery };
    if (!recordEndsWhereBattleDid(gs, record)) {
        console.warn(`Realm Arena game ${gameData.gameId}: the replay didn't end where the battle did, so its result has no battle record`);
        return { mastery };
    }
    return { mastery, ...record };
}

/** A player's characters' records summed, and the one that dealt the most damage. */
interface SquadRecord {
    total: FightingRecord;
    top?: FightingRow;
}
function squadRecords(stats: IRealmArenaGameResultStats): Map<string, SquadRecord> {
    const squads = new Map<string, SquadRecord>();
    for (const row of stats.fighting ?? []) {
        const squad: SquadRecord = squads.get(row.userId) ?? { total: NO_RECORD };
        // Read by name: a stored row is a Mongoose subdocument, and spreading
        // one copies its internals, not these fields.
        squad.total = addRecords(squad.total, row);
        if (row.dealt > (squad.top?.dealt ?? 0)) squad.top = row;
        squads.set(row.userId, squad);
    }
    return squads;
}

/**
 * One group a player: their score and where it came from, who they downed and
 * lost, the damage they dealt and the HP they healed, the character that did
 * the most of it (§28), then the XP each character they fought with earned in
 * this battle (§23.3). A result without the record has the XP alone.
 */
export function formatRealmArenaResultStats(stats: IRealmArenaGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups = new Map<string, string[]>();
    const linesOf = (userId: string) => {
        const lines = groups.get(userId) ?? [];
        groups.set(userId, lines);
        return lines;
    };
    const finalScores = stats.pointsPerRound?.length ? mongoMap(stats.pointsPerRound[stats.pointsPerRound.length - 1]) : undefined;
    const centre = stats.centrePoints ? mongoMap(stats.centrePoints) : undefined;
    for (const [userId, { total, top }] of squadRecords(stats)) {
        const lines = linesOf(userId);
        const score = finalScores?.get(userId) ?? 0;
        lines.push(`${pluralize(score, "point")}: ${centre?.get(userId) ?? 0} for the centre, ${total.knockoutPoints} for knock-outs`);
        lines.push(`Downed ${pluralize(total.knockouts, "enemy", "enemies")}, lost ${pluralize(total.downed, "character")}`);
        lines.push(`Dealt ${total.dealt} damage, healed ${total.healed} HP`);
        if (top) lines.push(`Top fighter: ${CHARACTERS[top.character]?.name ?? top.character}, with ${top.dealt} damage`);
    }
    for (const row of stats.mastery ?? []) {
        // A row is one battle's worth. Its counts are read by name, as above.
        const { attacks, abilities, items } = row;
        linesOf(row.userId).push(`${CHARACTERS[row.character]?.name ?? row.character}: ${xpOf({ battles: 1, attacks, abilities, items })} XP`);
    }
    return [...groups].map(([userId, lines]) => ({ username: usernameById.get(userId) ?? userId, lines }));
}

/** The damage each kind of character dealt, a bar each in the muster's order, stacked by whose it was. */
function formatDamageChart(stats: IRealmArenaGameResultStats): GameResultBarChart | undefined {
    const rows = stats.fighting ?? [];
    const bars = CHARACTER_IDS.flatMap(character => {
        const kind = rows.filter(row => row.character === character);
        if (kind.length === 0) return [];
        const segments: Record<string, number> = {};
        for (const row of kind) segments[row.userId] = (segments[row.userId] ?? 0) + row.dealt;
        return [{ label: CHARACTERS[character].name, value: kind.reduce((sum, row) => sum + row.dealt, 0), segments }];
    });
    return bars.length > 0 ? { kind: "bar", title: "Damage by character", yLabel: "Damage", bars } : undefined;
}

/** Everything each squad did, a row a count and a column a player. Friendly fire only when somebody did some. */
function formatRecordTable(stats: IRealmArenaGameResultStats): GameResultTable | undefined {
    const squads = [...squadRecords(stats)];
    if (squads.length === 0) return undefined;
    const centre = stats.centrePoints ? mongoMap(stats.centrePoints) : undefined;
    const row = (label: string, value: (total: FightingRecord, userId: string) => number) => ({
        label,
        values: Object.fromEntries(squads.map(([userId, { total }]) => [userId, value(total, userId)])),
    });
    const friendlyFire = squads.some(([, { total }]) => total.friendlyFire > 0);
    return {
        kind: "table",
        title: "Battle record",
        rowLabel: "Stat",
        rows: [
            row("Points for the centre", (_total, userId) => centre?.get(userId) ?? 0),
            row("Points for knock-outs", total => total.knockoutPoints),
            row("Enemies downed", total => total.knockouts),
            row("Own characters downed", total => total.downed),
            row("Damage dealt", total => total.dealt),
            row("Damage taken", total => total.taken),
            row("HP healed", total => total.healed),
            row("Shots taken", total => total.shots),
            row("Shots that landed (%)", total => total.shots > 0 ? Math.round(100 * total.landed / total.shots) : 0),
            row("Reactions on watch", total => total.reactions),
            ...(friendlyFire ? [row("Friendly fire", total => total.friendlyFire)] : []),
        ],
    };
}

/**
 * The battle's record as charts (§28): the race for points, a round at a time,
 * with every character downed marked on its owner's line, and each squad's
 * health beside it; then the damage each kind of character dealt, and the
 * table of everything each squad did. None for a result without the record.
 */
export function formatRealmArenaCharts(stats: IRealmArenaGameResultStats): GameResultAnyChart[] {
    const damage = formatDamageChart(stats);
    const table = formatRecordTable(stats);
    return [
        // Each series is already a round apiece, so it's charted as one
        // player's turns are: a playerCount of 1 collapses nothing.
        ...compactCharts(
            formatPerTurnChart(stats.pointsPerRound, "Points per round", "Points", 1, undefined, stats.losses),
            formatPerTurnChart(stats.squadHpPerRound, "Squad health per round", "HP", 1),
        ),
        ...(damage ? [damage] : []),
        ...(table ? [table] : []),
    ];
}
