import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import { compactCharts, formatPerTurnChart, gameResultEventSchemaDef, type GameResultAnyChart, type GameResultBarChart, type GameResultChartSeries, type GameResultStatGroup, type GameResultTable, type StoredGameResultEvent, type uuidString } from "@/utils/apiModels/GameDataApi";
import { mongoMap } from "@/utils/games/mongoMaps";
import { capitalise, pluralize } from "@/utils/ui/text";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { RealmArenaGameType, type IGameCommand } from "@/utils/apiModels/GameLogic";
import { battleOf, battleRoundsOf, budgetOf, enemyEvents, enemyHidden, enemyTurnsOf, nextWaveOf, toldTo, unnamed, warbandBudgetOf, type IRealmArenaOutcome, type RealmArenaBoard, type Told } from "./RealmArenaLogic";
import { rollOffTurnOrder } from "@/utils/games/rollOff";
import { CURRENT_RULESET_VERSION } from "./rulesets";
import { randomInt } from "@/utils/games/random";
import { userToken } from "@/utils/games/history";
import { BATTLE_SIZE_NAMES, CHARACTERS, COOP_PLAYERS, DIFFICULTY_NAMES, FACTION_IDS, factionById, FACTIONS, fitsCoop, isFactionId, playableFactionsOf, RANDOM_ENEMY, REALM_ONLY, UNKNOWN_ENEMY, type BattleSize, type CharacterId, type Difficulty, type FactionId } from "./characters";
import { addTally, NO_TALLY, xpOf, type MasterySnapshot, type Tally } from "./mastery";
import { battlefieldById, COOP_MAPS, DEPLOYMENT_NAMES, mapFor, type CoopMap, type RealmArenaMapId } from "./maps";
import { allied, ENEMY_SIDE, fighterById, fogGhost, isWarband, pickOf, squadSight, storedFighter, TEAM_SIDE, viewOf, warbandsFor, maxHpOf, actionPointsOf, type BattleEvent, type Fighter, type FogGhost, type MusterPick, type ToldEvent } from "./rules";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome, IRealmArenaStepPart, RealmArenaPartState } from "./apiModels";
import type { Square } from "@/utils/games/battlefield/terrain";
import { addRecords, NO_RECORD, RECORD_KEYS, type BattleRecord, type FightingRecord, type FightingRow, type WaveRecord } from "./battleRecord";
import { CHARACTER_IDS } from "./roster";
import { ENEMY_COLOUR, TEAM_COLOUR, TEAM_NAME } from "./ui";

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
    /** The wave-survival mission (§30.3). Absent means Hold the Centre. */
    mission?: "holdOut";
    /** How strong the warbands are (§30.5). Absent means Normal, as every battle before it was. */
    difficulty?: StoredDifficulty;
    /** The battlefield the host picked for Hold Out (§30.9). Absent means the line battle for the team's size (§29.2). */
    map?: CoopMap;
    /**
     * The warbands take their turns in a block (§29.4): every player goes in
     * seat order, then every warband still standing, then the players again —
     * rather than a warband after each player. Absent is the alternating
     * rotation every battle before it had, so a battle without it plays and
     * replays as it always did. Only for a team of two or more
     * (`buildInitialRealmArenaState`): with one player the two orders are the same.
     */
    teamBlocks?: true;
    /**
     * The host chose Random (§29.3): the team musters not knowing whom it
     * will face, and the faction stays hidden — off the wire and unnamed in
     * the log — until `enemySeen`. Written once, as the battle is created, so
     * a replay rebuilds it; absent when the host picked the faction, which
     * the team knows from the start.
     */
    random?: true;
    /**
     * A random enemy has been seen (§29.3): set by the first command that put
     * one of its characters in the team's view — the last muster without fog,
     * otherwise an action, an End turn or the enemy's own turn — and never
     * unset. An action that shows an enemy can't be undone (§27.1), so undo
     * never takes it back.
     */
    enemySeen?: true;
}

/** One player's sealed squad, as they mustered it. */
export interface IRealmArenaMuster {
    owner: string;
    /** The faction the squad was mustered from (B6). Absent on a warband's, which is the enemy's. */
    faction?: FactionId;
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
    /**
     * How big the battle is (§30.5), which moves every squad's budget. Chosen
     * by the host and fixed when the battle is created; absent for a normal
     * one, every battle from before it among them.
     */
    size?: StoredBattleSize;
    /**
     * The factions each player may muster from (B6), at least one, in
     * `FACTION_IDS` order. Chosen by the host and fixed when the battle is
     * created; absent for the Realm alone, every battle from before it among
     * them (`playableFactions`).
     */
    factions?: FactionId[];
    /**
     * The immutable ruleset release the battle was created under (`CURRENT_RULESET_VERSION`),
     * which decides which of the rules that have changed it plays by: from
     * `BALANCE_VERSION` on, melee rolls to hit, cover counts double at range, Heal and
     * Raise are limited differently, and Hold Out's team is tougher against
     * smaller warbands. Fixed when the battle is created, so one in progress
     * keeps its rules through a deploy and a replay plays it the same way;
     * absent on a battle from before it, which plays by the old ones.
     */
    rulesVersion?: number;
    /** Battle rounds played to the end: 0 until the first round's last turn ends. The round being played is one more. */
    roundsPlayed: number;
    /**
     * Everyone on the battlefield, in the shape rules.ts reads, with ids
     * counting from 0 in seat order. Empty until the last player has mustered:
     * the squads join the battlefield together, so a fighter id can't give
     * away the size of a squad still sealed.
     */
    fighters: Fighter[];
    /** Each player's last sighting of enemy units, keyed by viewer id. Never sent wholesale. */
    sightings?: Record<string, FogGhost[]>;
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
     * it was. Never sent. Capped at `undoDepthOf`, and emptied on every
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

/** A battle size other than normal, as a battle stores it: absent is normal (§30.5). */
export type StoredBattleSize = Exclude<BattleSize, "normal">;
/** A difficulty other than normal, as a battle stores it: absent is normal (§30.5). */
export type StoredDifficulty = Exclude<Difficulty, "normal">;

/**
 * A battle size as the host chose it, or undefined for normal and for
 * anything else a request could send: what the setup route checks and the
 * invitation stores.
 */
export function battleSizeOf(value: unknown): StoredBattleSize | undefined {
    return value === "small" || value === "large" ? value : undefined;
}

export interface RealmArenaInvitationRequest extends IInvitationRequest {
    /** Fight the battle in fog of war (§27). Off unless sent as true. */
    fog?: boolean;
    /** How big the battle is (§30.5). Normal when absent. */
    size?: StoredBattleSize;
    /** Fight together against the computer (§29), and whom. A free-for-all when absent. */
    coop?: RealmArenaCoopInvite;
    /** The factions the players may muster from (B6): at least one. The Realm alone when absent. */
    factions?: FactionId[];
    /** One player alone against the computer (§30.6): co-op with nobody invited, started at once. */
    solo?: boolean;
}

/** Whom a co-op team fights, as the host chose it: a faction, or one drawn at random as the battle is created (§29.3). */
export interface RealmArenaCoopInvite {
    enemy: FactionId | typeof RANDOM_ENEMY;
    /** Absent is the original Hold the Centre mission. */
    mission?: "holdOut";
    /** Absent is Normal (§30.5). */
    difficulty?: StoredDifficulty;
    /** Hold Out only; absent is the line battle (§30.9). */
    map?: CoopMap;
    /** Warbands take their turns in a block after the players' (§29.4); absent is a warband after each player. */
    teamBlocks?: true;
}

/**
 * A co-op setting as the host chose it, or undefined for anything else a
 * request could send: only an enemy that is a faction, or Random, a mission
 * that is Hold Out, a difficulty that is Easy or Hard, and in Hold Out a
 * battlefield that is one of `COOP_MAPS`, and team blocks that are true or false
 * (false is the default and isn't kept), each when sent.
 * What the setup route checks and the invitation stores, so a lobby
 * invitation, whose settings reach the model unread, is held to it as well.
 */
export function coopInviteOf(value: unknown): RealmArenaCoopInvite | undefined {
    const { enemy, mission, difficulty, map, teamBlocks } = (value ?? {}) as { enemy?: unknown, mission?: unknown, difficulty?: unknown, map?: unknown, teamBlocks?: unknown };
    if (teamBlocks !== undefined && typeof teamBlocks !== "boolean") return undefined;
    if (mission !== undefined && mission !== "holdOut") return undefined;
    if (difficulty !== undefined && difficulty !== "easy" && difficulty !== "hard") return undefined;
    if (map !== undefined && (mission !== "holdOut" || !COOP_MAPS.includes(map as CoopMap))) return undefined;
    if (enemy !== RANDOM_ENEMY && !isFactionId(enemy)) return undefined;
    return { enemy, ...(mission ? { mission } : {}), ...(difficulty ? { difficulty } : {}), ...(map ? { map: map as CoopMap } : {}), ...(teamBlocks ? { teamBlocks: true as const } : {}) };
}

export interface IRealmArenaInvitationData extends IInvitationData {
    fog?: boolean;
    size?: StoredBattleSize;
    coop?: RealmArenaCoopInvite;
    factions?: FactionId[];
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
    // The battle's size (§30.5), likewise: anything but small or large is normal.
    size: { type: String, set: battleSizeOf },
    // The factions the players may muster from (B6), likewise: anything but
    // a list of known factions, at least one, is the Realm alone.
    factions: { type: Schema.Types.Mixed, set: playableFactionsOf },
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
    const coop = fitsCoop(turnOrder.length) ? invited : undefined;
    // Random is drawn here, on the server, once, and stored as the faction it
    // came out as (§29.3): a replay rebuilds the same enemy, and no client
    // chooses it.
    const enemy = coop && (coop.enemy === RANDOM_ENEMY ? FACTION_IDS[randomInt(FACTION_IDS.length)] : coop.enemy);
    const specificGameState = buildInitialRealmArenaState(turnOrder, await masterySnapshotOf(turnOrder), {
        fog: this.fog === true,
        size: battleSizeOf(this.size),
        factions: playableFactionsOf(this.factions),
        rulesVersion: CURRENT_RULESET_VERSION,
        ...(coop && enemy ? { coop: { ...coop, enemy, ...(coop.enemy === RANDOM_ENEMY ? { random: true as const } : {}) } } : {}),
    });

    const field = battlefieldById(specificGameState.map);
    const zones = DEPLOYMENT_NAMES[specificGameState.map];
    history.push({ text: `Setup: ${coop?.mission === "holdOut" ? "Hold Out" : "Hold the Centre"} on the ${field.name}, over ${battleRoundsOf(specificGameState)} battle rounds` });
    if (invited && !coop) {
        history.push({ text: `Setup: co-op is for up to ${COOP_PLAYERS.max} players, so this is a free-for-all` });
    }
    if (enemy) {
        // A random enemy isn't named: the team musters not knowing whom it will face (§29.3).
        const foe = coop?.enemy === RANDOM_ENEMY ? "an enemy drawn at random" : factionById(enemy).enemyName;
        const where = specificGameState.coop?.map ? "a warband for each of them closing in from the edges" : "a warband deployed opposite each of them";
        history.push({ text: `Setup: the players fight together against ${foe}, ${where}` });
    }
    history.push({ text: `Setup: ${turnOrder.map((userId, seat) => `${userToken(userId)} deploys ${zones[seat]}`).join(", ")}` });
    if (specificGameState.fog) history.push({ text: "Setup: fought in fog of war, so each player sees only what their squad can" });
    const size = specificGameState.size ?? "normal";
    const sized = size === "normal" ? "" : `a ${BATTLE_SIZE_NAMES[size].toLowerCase()} battle, so `;
    const factions = specificGameState.factions ?? REALM_ONLY;
    const from = factions.length > 1 ? `, from ${factions.map(id => FACTIONS[id].name.replace(/^The /, "the ")).join(" or ")}` : "";
    history.push({ text: `Setup: ${sized}each player musters ${budgetOf(specificGameState)} points' worth of characters${from}, sealed until every player has` });
    if (specificGameState.coop?.teamBlocks) {
        history.push({ text: "Setup: the players take their turns one after another, then the warbands take theirs in a block" });
    }
    if (specificGameState.coop) {
        history.push({ text: `Setup: on ${DIFFICULTY_NAMES[specificGameState.coop.difficulty ?? "normal"]}, each warband musters ${warbandBudgetOf(specificGameState)} points' worth` });
    }

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

/** What the host chose for a co-op battle: its state without what the battle itself moves on. */
type CoopSettings = Omit<IRealmArenaCoop, "nextWarband" | "enemySeen">;

/** What the host chose for a battle, as it's created and as a replay rebuilds it. Every one absent is the default. */
export interface RealmArenaSettings {
    /** In fog of war (§27). */
    fog?: boolean;
    /** The battle's size (§30.5). */
    size?: StoredBattleSize;
    /** The factions the players may muster from (B6); the Realm alone when absent. */
    factions?: FactionId[];
    /** In co-op against the computer (§29): the faction drawn or picked, whether it was drawn at `random` (§29.3), the mission (§30.3), the difficulty (§30.5) and the battlefield picked for Hold Out (§30.9). */
    coop?: CoopSettings;
    /** The ruleset release the battle is created under: what it plays by (`IRealmArenaSpecificGameState.rulesVersion`). Absent plays by the rules from before `BALANCE_VERSION`. */
    rulesVersion?: number;
}

/**
 * The battle before anyone has mustered: the map for the party's size (or
 * the Sacked Fort, if the host picked it for Hold Out, §30.9), no
 * squads, nobody scored, and each seat's ranks as `mastery` gave them when the
 * battle was created, with what the host chose (`settings`): fog of war
 * (§27), the battle's size (§30.5), and co-op against `enemy`'s warbands
 * (§29), with the first warband to take the enemy's first turn — kept hidden
 * until it's seen if it was drawn at `random` (§29.3). A pure function of
 * those, all persisted, so replay rebuilds it rather than persisting a
 * snapshot of the state (§17.1, §23.3). Throws for a party the map has no
 * deployment zone for — in co-op, a zone for each player and one for each
 * warband.
 */
export function buildInitialRealmArenaState(turnOrder: string[], mastery: MasterySnapshot, settings: RealmArenaSettings = {}): IRealmArenaSpecificGameState {
    const { fog, size } = settings;
    // Only when it's more than the Realm, so a battle without the choice looks as every one before it did.
    const factions = settings.factions && settings.factions.join() !== REALM_ONLY.join() ? [...settings.factions] : undefined;
    const coop = settings.coop !== undefined;
    const map = mapFor(turnOrder.length, coop, settings.coop?.map);
    const field = battlefieldById(map);
    const seated = coop ? field.deployments.length / 2 : field.deployments.length;
    // A team of one is solo (§30.6); a free-for-all needs someone to fight.
    const fewest = coop ? COOP_PLAYERS.min : 2;
    if (turnOrder.length < fewest || turnOrder.length > seated) {
        throw new Error(`Realm Arena: the ${field.name} seats ${fewest}–${seated} players, not ${turnOrder.length}`);
    }
    return {
        map,
        seats: [...turnOrder],
        // Only when it's on, so a battle without it looks as every one before it did.
        ...(fog ? { fog: true } : {}),
        ...(size ? { size } : {}),
        ...(factions ? { factions } : {}),
        ...(settings.rulesVersion !== undefined ? { rulesVersion: settings.rulesVersion } : {}),
        // Blocks are for a team of two or more: for one player they're the alternating order.
        ...(settings.coop ? { coop: coopState({ ...settings.coop, teamBlocks: settings.coop.teamBlocks && turnOrder.length >= 2 ? true : undefined }) } : {}),
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

/** A co-op battle's state as it starts: only the settings that were chosen, so one without them looks as every battle before it did. */
function coopState({ enemy, random, mission, difficulty, map, teamBlocks }: CoopSettings): IRealmArenaCoop {
    return { enemy, nextWarband: 0, ...(random ? { random } : {}), ...(mission ? { mission } : {}), ...(difficulty ? { difficulty } : {}), ...(map ? { map } : {}), ...(teamBlocks ? { teamBlocks } : {}) };
}

/** What a battle's settings are, read back off its state: what a replay rebuilds it from. */
export function settingsOf(gs: IRealmArenaSpecificGameState): RealmArenaSettings {
    const settings = { fog: gs.fog === true, size: gs.size, factions: gs.factions, rulesVersion: gs.rulesVersion };
    if (!gs.coop) return settings;
    const { nextWarband: _turn, enemySeen: _seen, ...coop } = gs.coop;
    return { ...settings, coop };
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
            // Written once, as the battle is created (§30.5). Without this
            // path the save dropped it, and every battle mustered at normal.
            size: { type: String, set: battleSizeOf },
            // Written once, as the battle is created (B6); absent is the Realm alone.
            factions: { type: [String], default: undefined },
            // Written once, as the battle is created; absent plays by the rules from before it.
            rulesVersion: Number,
            phase: String,
            roundsPlayed: Number,
            fighters: Schema.Types.Mixed,
            sightings: Schema.Types.Mixed,
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
        gameState: publicGameState(doc.gameState, userIdNameMap, viewerId),
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
    const rounds = battleRoundsOf(gs);
    const musters = gs.musters ?? [];
    const own = gs.phase === "muster" ? musters.find(muster => muster.owner === viewerId) : undefined;
    const view = viewOf(battleOf(gs, complete), viewerId);
    const nextWave = complete ? undefined : nextWaveOf(gs);
    return {
        map: gs.map,
        phase: gs.phase,
        round: gs.phase === "muster" ? 0 : Math.min(gs.roundsPlayed + 1, rounds),
        battleRounds: rounds,
        budget: budgetOf(gs),
        fog: gs.fog === true,
        coop: gs.coop !== undefined,
        ...(gs.size ? { size: gs.size } : {}),
        ...(gs.rulesVersion !== undefined ? { rulesVersion: gs.rulesVersion } : {}),
        // What the muster offers (B6): the host's choice, which nobody needs once the squads are on the field.
        ...(gs.phase === "muster" ? { factions: [...gs.factions ?? REALM_ONLY] } : {}),
        ...(gs.coop?.mission ? { mission: gs.coop.mission } : {}),
        ...(nextWave ? { nextWave } : {}),
        ...(gs.coop?.difficulty ? { difficulty: gs.coop.difficulty } : {}),
        ...(gs.coop?.teamBlocks ? { teamBlocks: true as const } : {}),
        // A random enemy stays off the wire until it's seen (§29.3), and the
        // fog lifts as the battle ends, the faction with it. Never a view with
        // one of its characters in it and not the faction: that's a sighting.
        ...(gs.coop && (!enemyHidden(gs.coop) || complete || view.fighters.some(fighter => isWarband(fighter.owner))) ? { enemy: gs.coop.enemy } : {}),
        // Who has hurt each one is the server's, for scoring assists (§13.7):
        // the board has no use for it, and in fog it would name whose blast
        // hurt a character the viewer couldn't see being hit.
        fighters: view.fighters.map(storedFighter).map(({ woundedBy: _woundedBy, effectSources: _effectSources, ...fighter }) => ({ ...fighter, maxHp: maxHpOf(fighter, gs), maxAp: actionPointsOf(fighter, gs) })),
        ghosts: fogGhostsFor(gs, viewerId, complete),
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

/** Only the requesting player's stale sightings whose remembered square is still hidden. */
function fogGhostsFor(gs: IRealmArenaSpecificGameState, viewerId: string | null, complete: boolean): FogGhost[] {
    if (!gs.fog || complete || viewerId === null || gs.phase !== "battle") return [];
    const battle = battleOf(gs);
    const seen = squadSight(battle, viewerId);
    const visible = new Set(viewOf(battle, viewerId).fighters.map(fighter => fighter.id));
    return (gs.sightings?.[viewerId] ?? [])
        .filter(ghost => !visible.has(ghost.id) && !seen(ghost.square))
        .map(fogGhost);
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
 *
 * An End turn that held a warband's turn (§29.4) also gets its `parts`
 * (`partsOf`), for a review that plays the turn one action at a time.
 */
export function stepOutcomeToModel(outcome: unknown, viewerId: string | null, gs: IRealmArenaSpecificGameState, complete = false): IRealmArenaStepOutcome | undefined {
    const events = (outcome as { events?: unknown } | null)?.events;
    if (!Array.isArray(events) || events.length === 0) return undefined;
    const battle = battleOf(gs, complete);
    const told = battle.fog ? toldTo(events as BattleEvent[], battle, viewerId, enemyHidden(gs.coop)) : events as BattleEvent[];
    // The parts only add to what `events` already tells, so a board one of
    // them can't draw (an odd state from an old command version) costs the
    // review its parts, never the timeline, the recap or a result built on it.
    let parts: IRealmArenaStepPart[] | undefined;
    try {
        parts = partsOf(outcome as IRealmArenaOutcome, viewerId, gs, complete);
    } catch (error) {
        console.error("Realm Arena: an End turn's parts couldn't be drawn, so its review step plays whole", error);
    }
    return { events: withoutRolls(told), ...parts ? { parts } : {} };
}

/** Events as a review is told them: a shot's or a strike's roll is the log's to leave out (§26.2). */
const withoutRolls = (events: readonly BattleEvent[]): ToldEvent[] => events.map((event): ToldEvent => {
    if (event.kind !== "shot" && event.kind !== "struck") return event;
    const { roll: _roll, ...rest } = event;
    return rest;
});

/**
 * An End turn's parts for one viewer, when it held a warband's turn (§29.4):
 * the player's own End turn with the burning that began the warband's, each
 * action the warband took, and its End turn with what happened as the next
 * turn began — each with the board as it left it, drawn for the viewer.
 *
 * Fog of war (§27) is kept the way the snapshot and the log keep it, part by
 * part. A part's events are what the viewer was told of it as it happened —
 * what the log's line for them was written from, recorded as each part was
 * played, and cut from the board at that point where nothing was recorded —
 * under the same cover for a random enemy (§29.3) and without a shot's roll,
 * as `events` are. A part they were told nothing of isn't listed: that it
 * happened is no more theirs than the line it wrote. And each board is
 * `gameStateToModel`'s own view for that viewer of the board as the part left
 * it, so it holds only what their side saw then, and the ghosts only they
 * remember. Nothing is shown of a part that the log and the recap don't
 * show, so there's nothing for a part's number or its place to tell. (A
 * board can hold an enemy the snapshot doesn't — one seen mid-turn by a
 * lookout downed later in it — but only as the viewer's side saw it then,
 * which is what the log's line for that action was written from.) Once the battle is over the fog is lifted for all of it, boards
 * included, as it is for `events`.
 *
 * Undefined with fewer than two parts told. The last never carries a board:
 * the snapshot's follows it, differing only by what nobody was told.
 */
function partsOf(outcome: IRealmArenaOutcome, viewerId: string | null, gs: IRealmArenaSpecificGameState, complete: boolean): IRealmArenaStepPart[] | undefined {
    const { events = [], recap } = outcome;
    const turns = enemyTurnsOf(recap);
    if (!recap || turns.length === 0) return undefined;
    const battle = battleOf(gs, complete);
    const hidden = battle.fog && enemyHidden(gs.coop);
    // What the viewer was told of some events: the record of it where there is
    // one, else what they would be told of them from the battle as it is now.
    const said = (told: Told | undefined, of: readonly BattleEvent[]): BattleEvent[] => {
        if (!battle.fog) return [...of];
        const recorded = told && viewerId !== null && told[viewerId] ? told[viewerId] : toldTo(of, battle, viewerId);
        return hidden ? unnamed(recorded, id => isWarband(fighterById(battle, id)?.owner ?? "")) : [...recorded];
    };
    // Two runs of events told in a row: nothing was recorded for one that had no events.
    const both = (first: Told | undefined, second: Told | undefined): Told | undefined =>
        first || second ? Object.fromEntries(Object.keys({ ...first, ...second }).map(viewer => [viewer, [...first?.[viewer] ?? [], ...second?.[viewer] ?? []]])) : undefined;
    const started = recap.started ?? [];
    // The command's own events are the player's End turn, then the warband's
    // turn, then what happened as the next turn began (`RealmArenaEndTurn`).
    const own = events.slice(0, events.length - turns.reduce((sum, turn) => sum + enemyEvents(turn).length, 0) - started.length);

    const board = (after: RealmArenaBoard | undefined): RealmArenaPartState | undefined => {
        if (!after) return undefined;
        const { fighters, ghosts, clouds, blasted, scores, enemy: whom } = gameStateToModel({ ...gs, ...after, sightings: after.sightings, coop: after.coop }, viewerId, null, complete);
        return { fighters, ghosts, clouds, blasted, scores, ...whom ? { enemy: whom } : {} };
    };
    // Warbands taking turns in a block (§29.4) hand over to one another in a
    // part of their own, as the first is handed the player's End turn.
    const last = turns[turns.length - 1];
    const planned = [
        { kind: "ended" as const, events: said(both(recap.told, turns[0].startedTold), [...own, ...turns[0].started]), after: turns[0].startedAfter },
        ...turns.flatMap((turn, index) => {
            const following = turns[index + 1];
            return [
                ...turn.steps.map(step => ({ kind: "enemy" as const, events: said(step.told, step.events), after: step.after })),
                ...following ? [{ kind: "enemy" as const, events: said(both(turn.endedTold, following.startedTold), [...turn.ended ?? [], ...following.started]), after: following.startedAfter }] : [],
            ];
        }),
        { kind: "handOff" as const, events: said(both(last.endedTold, recap.startedTold), [...last.ended ?? [], ...started]), after: undefined },
    ].filter(part => part.events.length > 0);
    if (planned.length < 2) return undefined;
    return planned.map(({ kind, events: told, after }, index): IRealmArenaStepPart => {
        const state = index < planned.length - 1 ? board(after) : undefined;
        return { kind, events: withoutRolls(told), ...state ? { state } : {} };
    });
}

/**
 * What a review step calls its command, for one viewer (§27.2): in a battle
 * fought in fog of war and not yet over, an action by another side is only
 * "acted" — the step is kept for whatever of it the viewer was told, and its
 * kind ("threw a fireball") could name a character the log calls one out of
 * sight. Undefined, for the command's own words, otherwise.
 */
export function stepSummary(command: IGameCommand, viewerId: string | null, gs: IRealmArenaSpecificGameState, complete = false): string | undefined {
    if (command.className !== "RealmArenaAct") return undefined;
    const battle = battleOf(gs, complete);
    return battle.fog && !allied(battle, command.senderId, viewerId) ? "acted" : undefined;
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
    assistPoints: { type: Schema.Types.Map, of: Number, default: undefined },
    pointsPerRound: [{ type: Schema.Types.Map, of: Number }],
    squadHpPerRound: [{ type: Schema.Types.Map, of: Number }],
    losses: [gameResultEventSchemaDef],
    // Hold Out's alone (§30.10): absent from any other battle, and from a result recorded before them.
    waves: { type: [{ _id: false, round: Number, arrived: Number, downed: { type: Schema.Types.Map, of: Number } }], default: undefined },
    standingPerRound: { type: [{ type: Schema.Types.Map, of: Number }], default: undefined },
    battleRounds: Number,
};

/**
 * Whether the replay the record was read from ended where the battle did:
 * every seat on the score it finished with. One that drifted from the battle
 * as fought refuses the moves it can no longer follow and carries on without
 * them, so its record would tell a different battle while looking whole.
 */
function recordEndsWhereBattleDid(gs: IRealmArenaSpecificGameState, record: BattleRecord): boolean {
    const final = record.pointsPerRound.at(-1);
    // In co-op the enemy's column too, its warbands added together (§29.6).
    const enemy = warbandsFor(gs.seats).reduce((sum, warband) => sum + (gs.scores[warband] ?? 0), 0);
    return final !== undefined && gs.seats.every(userId => final.get(userId) === (gs.scores[userId] ?? 0))
        && (!gs.coop || final.get(ENEMY_SIDE) === enemy);
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

/** A column's points from a stored per-column map — the centre's or the assists' — and 0 for a result recorded before it. */
function pointsOf(map: Map<string, number> | undefined): (column: string) => number {
    const read = map ? mongoMap(map) : undefined;
    return column => read?.get(column) ?? 0;
}

/**
 * One group a player, and in co-op one for the enemy: their score and where
 * it came from, who they downed and lost, the damage they dealt and the HP
 * they healed, the character that did the most of it (§28), then the XP each
 * character they fought with earned in this battle (§23.3). A result without
 * the record has the XP alone.
 */
export function formatRealmArenaResultStats(stats: IRealmArenaGameResultStats, usernameById: Map<string, string>): GameResultStatGroup[] {
    const groups = new Map<string, string[]>();
    const linesOf = (userId: string) => {
        const lines = groups.get(userId) ?? [];
        groups.set(userId, lines);
        return lines;
    };
    const finalScores = stats.pointsPerRound?.length ? mongoMap(stats.pointsPerRound[stats.pointsPerRound.length - 1]) : undefined;
    const centre = pointsOf(stats.centrePoints);
    const assists = pointsOf(stats.assistPoints);
    for (const [userId, { total, top }] of squadRecords(stats)) {
        const lines = linesOf(userId);
        const score = finalScores?.get(userId) ?? 0;
        const assisted = assists(userId);
        lines.push(`${pluralize(score, "point")}: ${centre(userId)} for the centre, ${total.knockoutPoints} for knock-outs${assisted > 0 ? `, ${assisted} for assists` : ""}`);
        lines.push(`Downed ${pluralize(total.knockouts, "enemy", "enemies")}, lost ${pluralize(total.downed, "character")}`);
        lines.push(`Dealt ${total.dealt} damage, healed ${total.healed} HP`);
        if (top) lines.push(`Top fighter: ${CHARACTERS[top.character]?.name ?? top.character}, with ${top.dealt} damage`);
    }
    for (const row of stats.mastery ?? []) {
        // A row is one battle's worth. Its counts are read by name, as above.
        const { attacks, abilities, items } = row;
        linesOf(row.userId).push(`${CHARACTERS[row.character]?.name ?? row.character}: ${xpOf({ battles: 1, attacks, abilities, items })} XP`);
    }
    // The enemy's column in co-op is its warbands together (§29.6), and nobody's to name.
    const holdOut = holdOutGroup(stats);
    return [
        ...(holdOut ? [holdOut] : []),
        ...[...groups].map(([userId, lines]) => ({ username: usernameById.get(userId) ?? (userId === ENEMY_SIDE ? ENEMY_SERIES.name : userId), lines })),
    ];
}

/** Who downed how many of a wave. Read by name: a stored wave is a Mongoose subdocument. */
const downedOf = ({ downed }: WaveRecord): Map<string, number> => mongoMap(downed ?? new Map<string, number>());

/** How many of the enemy a wave's players downed, all of them together. */
const downedIn = (wave: WaveRecord): number => [...downedOf(wave).values()].reduce((sum, count) => sum + count, 0);

/**
 * A battle of Hold Out's own story (§30.10), above the players': how it ended
 * and in which round, how many of the enemy its waves brought and how many the
 * team downed, then each wave's. None for any other battle, nor for a result
 * recorded before waves were.
 */
function holdOutGroup(stats: IRealmArenaGameResultStats): GameResultStatGroup | undefined {
    const { waves, standingPerRound, battleRounds: rounds } = stats;
    if (!waves?.length || !standingPerRound?.length || !rounds) return undefined;
    const lasted = standingPerRound.length;
    const overrun = (mongoMap(standingPerRound[lasted - 1]).get(TEAM_SIDE) ?? 0) === 0;
    const arrived = waves.reduce((sum, wave) => sum + wave.arrived, 0);
    const downed = waves.reduce((sum, wave) => sum + downedIn(wave), 0);
    return {
        username: "Hold Out",
        lines: [
            overrun ? `Overrun in round ${lasted} of ${rounds}`
                : lasted >= rounds ? `Held out for all ${rounds} rounds`
                : `Beat the last wave in round ${lasted} of ${rounds}`,
            `Faced ${pluralize(waves.length, "wave")}: ${arrived} of the enemy took the field, and the team downed ${downed}`,
            ...waves.map((wave, index) => `Wave ${index + 1}, round ${wave.round + 1}: ${wave.arrived} arrived, ${downedIn(wave)} downed`),
        ],
    };
}

/** How many of each side stood, round by round, with every wave marked on the enemy's line as it landed (§30.10). */
function formatStandingChart(stats: IRealmArenaGameResultStats) {
    const events: StoredGameResultEvent[] = (stats.waves ?? []).slice(1).map((wave, index) =>
        ({ turnIndex: wave.round, icon: "wave", title: `Wave ${index + 2}: ${wave.arrived} arrived`, seriesKey: ENEMY_SIDE }));
    return formatPerTurnChart(stats.standingPerRound, "Characters standing per round", "Characters", 1, SIDE_SERIES, events);
}

/** How many of the enemy the team downed in each wave, stacked by who downed them (§30.10). */
function formatWaveChart(stats: IRealmArenaGameResultStats): GameResultBarChart | undefined {
    if (!stats.waves?.length) return undefined;
    return {
        kind: "bar",
        title: "Enemies downed by wave",
        yLabel: "Downed",
        bars: stats.waves.map((wave, index) => ({
            label: `Wave ${index + 1}`,
            value: downedIn(wave),
            segments: Object.fromEntries(downedOf(wave)),
        })),
    };
}

/** The enemy, wherever the result draws it beside the players (§29.9): one column, its warbands added together. */
const ENEMY_SERIES: GameResultChartSeries = { key: ENEMY_SIDE, name: capitalise(UNKNOWN_ENEMY), color: ENEMY_COLOUR };

/** A co-op battle's two sides, as the result's race charts draw them (§29.9). */
const SIDE_SERIES: GameResultChartSeries[] = [{ key: TEAM_SIDE, name: capitalise(TEAM_NAME), color: TEAM_COLOUR }, ENEMY_SERIES];

/** Whether the record is a co-op battle's: it has a column for the enemy. */
const isCoopRecord = (stats: IRealmArenaGameResultStats): boolean =>
    stats.centrePoints ? mongoMap(stats.centrePoints).has(ENEMY_SIDE) : false;

/** A round's columns as the two sides: the players added together as the team, and the enemy as it is. */
function bySide(round: Map<string, number>): Map<string, number> {
    const columns = mongoMap(round);
    const team = [...columns].reduce((sum, [column, value]) => sum + (column === ENEMY_SIDE ? 0 : value), 0);
    return new Map([[TEAM_SIDE, team], [ENEMY_SIDE, columns.get(ENEMY_SIDE) ?? 0]]);
}

/** A round-by-round race, a line a player — or in co-op the team's line against the enemy's (§29.9). */
function formatRaceChart(stats: IRealmArenaGameResultStats, perRound: Map<string, number>[] | undefined, title: string, yLabel: string, events?: StoredGameResultEvent[]) {
    // Each series is already a round apiece, so it's charted as one player's
    // turns are: a playerCount of 1 collapses nothing.
    if (!isCoopRecord(stats)) return formatPerTurnChart(perRound, title, yLabel, 1, undefined, events);
    // A player's loss goes on the team's line. Read by name: a stored event is
    // a Mongoose subdocument, and spreading one copies its internals.
    const teamEvents = events?.map(({ turnIndex, icon, glyph, title, seriesKey }): StoredGameResultEvent =>
        ({ turnIndex, icon, glyph, title, seriesKey: seriesKey && seriesKey !== ENEMY_SIDE ? TEAM_SIDE : seriesKey }));
    return formatPerTurnChart(perRound?.map(bySide), title, yLabel, 1, SIDE_SERIES, teamEvents);
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
    if (bars.length === 0) return undefined;
    return { kind: "bar", title: "Damage by character", yLabel: "Damage", bars, ...(isCoopRecord(stats) ? { extraSeries: [ENEMY_SERIES] } : {}) };
}

/** Everything each squad did, a row a count and a column a player. Assists and friendly fire only when somebody had some. */
function formatRecordTable(stats: IRealmArenaGameResultStats): GameResultTable | undefined {
    const squads = [...squadRecords(stats)];
    if (squads.length === 0) return undefined;
    const centre = pointsOf(stats.centrePoints);
    const assists = pointsOf(stats.assistPoints);
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
            row("Points for the centre", (_total, userId) => centre(userId)),
            row("Points for knock-outs", total => total.knockoutPoints),
            ...(squads.some(([userId]) => assists(userId) > 0) ? [row("Points for assists", (_total, userId) => assists(userId))] : []),
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
        ...(isCoopRecord(stats) ? { extraSeries: [ENEMY_SERIES] } : {}),
    };
}

/**
 * The battle's record as charts (§28): the race for points, a round at a time,
 * with every character downed marked on its owner's line, and each squad's
 * health beside it; then the damage each kind of character dealt, and the
 * table of everything each squad did. None for a result without the record.
 * In co-op the races are the team's line against the enemy's, and the damage
 * and the table draw the enemy beside the players (§29.9). Hold Out adds how
 * many of each side stood, its waves marked, and what the team downed of each
 * wave (§30.10).
 */
export function formatRealmArenaCharts(stats: IRealmArenaGameResultStats): GameResultAnyChart[] {
    const damage = formatDamageChart(stats);
    const table = formatRecordTable(stats);
    const waves = formatWaveChart(stats);
    return [
        ...compactCharts(
            formatRaceChart(stats, stats.pointsPerRound, "Points per round", "Points", stats.losses),
            formatRaceChart(stats, stats.squadHpPerRound, "Squad health per round", "HP"),
            formatStandingChart(stats),
        ),
        ...(waves ? [waves] : []),
        ...(damage ? [damage] : []),
        ...(table ? [table] : []),
    ];
}
