import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { GameResultStatGroup, uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RealmArenaGameType } from "@/utils/apiModels/GameLogic";
import { battleOf } from "./RealmArenaLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { userToken } from "@/utils/games/history";
import { CHARACTERS, POINTS_BUDGET, type CharacterId, type PlayerCount } from "./characters";
import { addTally, NO_TALLY, xpOf, type MasterySnapshot, type Tally } from "./mastery";
import { battlefieldById, DEPLOYMENT_NAMES, mapForPlayers, type RealmArenaMapId } from "./maps";
import { areaAround, battleRounds, pickOf, squadSight, storedFighter, viewOf, type BattleEvent, type BattleState, type Fighter, type MusterPick, type ToldEvent } from "./rules";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome } from "./apiModels";
import type { Square } from "@/utils/games/battlefield/terrain";

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
}

export interface IRealmArenaInvitationData extends IInvitationData {
    fog?: boolean;
}

export interface IRealmArenaInvitationDataDocument extends IRealmArenaInvitationData, IInvitationDataDocument {}

export interface IRealmArenaInvitationDataModel extends Model<IRealmArenaInvitationDataDocument> {}

var RealmArenaInvitationSchema = new Schema<IRealmArenaInvitationDataDocument>({
    // The host's choice on the setup screen (§27). Only `true` is fog: the
    // lobby route hands a game's own settings straight to the model, and
    // anything else a body sent — "banana", {} — is no fog rather than a
    // failed cast and a 500.
    fog: { type: Boolean, set: (value: unknown) => value === true },
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
    const specificGameState = buildInitialRealmArenaState(turnOrder, await masterySnapshotOf(turnOrder), this.fog === true);

    const field = battlefieldById(specificGameState.map);
    const zones = DEPLOYMENT_NAMES[specificGameState.map];
    history.push({ text: `Setup: Hold the Centre on the ${field.name}, over ${battleRounds(turnOrder.length)} battle rounds` });
    history.push({ text: `Setup: ${turnOrder.map((userId, seat) => `${userToken(userId)} deploys ${zones[seat]}`).join(", ")}` });
    if (specificGameState.fog) history.push({ text: "Setup: fought in fog of war, so each player sees only what their squad can" });
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
 * battle was created, in fog of war if the host chose it (§27). A pure
 * function of those three, all persisted, so replay rebuilds it rather than
 * persisting a snapshot of the state (§17.1, §23.3). Throws for a party the
 * map has no deployment zone for.
 */
export function buildInitialRealmArenaState(turnOrder: string[], mastery: MasterySnapshot, fog = false): IRealmArenaSpecificGameState {
    const map = mapForPlayers(turnOrder.length);
    const field = battlefieldById(map);
    if (turnOrder.length < 2 || turnOrder.length > field.deployments.length) {
        throw new Error(`Realm Arena: the ${field.name} seats 2–${field.deployments.length} players, not ${turnOrder.length}`);
    }
    return {
        map,
        seats: [...turnOrder],
        // Only when it's on, so a battle without it looks as every one before it did.
        ...(fog ? { fog: true } : {}),
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
        budget: POINTS_BUDGET[seats.length as PlayerCount],
        fog: gs.fog === true,
        fighters: view.fighters.map(storedFighter),
        clouds: [...view.clouds ?? []],
        blasted: [...(gs.blasted ?? [])],
        mustered: gs.phase === "muster" ? musters.map(muster => muster.owner) : seats,
        myMuster: own ? own.picks.map(pickOf) : null,
        mastery: ranksOnTheWire(gs.mastery ?? {}),
        scores: { ...gs.scores },
        // Absent (`?? []`) on a game that predates the stack; false for every
        // viewer but the actor, and for a viewerless replay.
        canUndo: viewerId !== null && (gs.undoStack ?? []).at(-1)?.by === viewerId && gs.undoAnchorId === lastCommandId,
    };
}

/**
 * The battle's snapshot of ranks as every viewer gets it (§23.3): built key by
 * key rather than copied, so only a rank of 1–3 by a character's id reaches
 * the wire, whatever else a Mixed path might one day hold.
 */
function ranksOnTheWire(mastery: MasterySnapshot): MasterySnapshot {
    const characterIds = Object.keys(CHARACTERS) as CharacterId[];
    return Object.fromEntries(Object.entries(mastery).map(([userId, ranks]) => [userId, Object.fromEntries(characterIds.flatMap(id => {
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

/**
 * The events of a command in a fogged battle as one viewer may see them
 * played (§27). Their own characters' doings are theirs in full. Someone
 * else's move keeps only the squares the viewer's squad sees, and only when
 * it ends on one of them: one that ends out of sight is told with no path at
 * all, so the board loses the mover there rather than leaving it where it was
 * last seen. A fireball, a flask or a Demolish landing where the viewer sees
 * none of it, and hitting none of theirs, isn't told. Nor is a character out of
 * sight going on watch: the log says it did, but not the AP it banked, which
 * is how many reactions are waiting. Everything else carries no square, and
 * what it says the log says too.
 *
 * Sight is read from the battle after the command. In anybody else's command
 * the viewer's squad doesn't move, so that's the sight it had all along — or
 * less, if something downed one of them, which then hit one of theirs.
 */
function toldTo(events: readonly BattleEvent[], battle: BattleState, viewerId: string | null): BattleEvent[] {
    const seen = squadSight(battle, viewerId);
    const own = (id: number) => battle.fighters.find(fighter => fighter.id === id)?.owner === viewerId && viewerId !== null;
    const inSight = (id: number) => {
        const fighter = battle.fighters.find(one => one.id === id);
        return fighter !== undefined && (own(id) || seen(fighter.square));
    };
    return events.flatMap((event): BattleEvent[] => {
        switch (event.kind) {
            case "moved": {
                if (own(event.fighter)) return [event];
                const end = event.path.at(-1);
                return [{ ...event, path: end !== undefined && seen(end) ? event.path.filter(seen) : [] }];
            }
            case "fireball":
            case "thrown":
            case "demolished":
                return own(event.fighter) || event.targets.some(own) || areaAround(battle.field, event.at).some(seen) ? [event] : [];
            case "watching":
                return inSight(event.fighter) ? [event] : [];
            default:
                return [event];
        }
    });
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
        // A row is one battle's worth. Its counts are read by name: the row is
        // a Mongoose subdocument when it comes off a stored result, and
        // spreading one copies its internals, not these fields.
        const { attacks, abilities, items } = row;
        lines.push(`${CHARACTERS[row.character]?.name ?? row.character}: ${xpOf({ battles: 1, attacks, abilities, items })} XP`);
        groups.set(row.userId, lines);
    }
    return [...groups].map(([userId, lines]) => ({ username: usernameById.get(userId) ?? userId, lines }));
}
