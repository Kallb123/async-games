import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { markDirty } from "@/utils/games/markDirty";
import { recordedRolls } from "@/utils/games/recordedRolls";
import { nextActivePlayer } from "@/utils/games/playerDropout";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IRealmArenaGameData, IRealmArenaSpecificGameState } from "@/games/RealmArena/RealmArenaModels";
import { CHARACTERS, POINTS_BUDGET, type PlayerCount } from "@/games/RealmArena/characters";
import { battlefieldById } from "@/games/RealmArena/maps";
import {
    act,
    check,
    endTurn,
    isBattleOver,
    musterRefusal,
    newFighter,
    ROLL_SIDES,
    standings,
    startTurn,
    storedFighter,
    type Action,
    type BattleEvent,
    type BattleState,
    type Fighter,
    type MusterPick,
} from "@/games/RealmArena/rules";
import { playerHistory, userToken } from "@/utils/games/history";
import { randomInt } from "@/utils/games/random";
import { pluralize } from "@/utils/ui/text";

// ═══════════════════════════════════════════════════════════════════════════
//  REALM ARENA
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/realm-arena.md §17.3 PR 3: the game type and §17.2's three
// commands. A turn is a run of `RealmArenaAct`s — one action each, so a player
// sees a shot land before choosing the next — and one `RealmArenaEndTurn`. The
// muster before the battle is one `RealmArenaMuster` a player.
//
// Nothing here decides a rule. Every action is checked and resolved by
// rules.ts, which never draws a random number: `RealmArenaAct` draws the rolls
// it's asked for, records them in order, and on a replay hands the recorded
// ones back instead (§17.2).

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

/** The battle as rules.ts reads it. */
export function battleOf(gs: IRealmArenaSpecificGameState): BattleState {
    return { field: battlefieldById(gs.map), fighters: (gs.fighters ?? []).map(storedFighter) };
}

/**
 * Whether it's `userId`'s turn in this game, in this phase. `currentTurn` is
 * the route's check too; this is the command's own, so a command that reaches
 * a game some other way (a replay, the turn-timeout sweep) is held to it.
 */
function onTurn(data: IRealmArenaGameData, userId: string, phase: IRealmArenaSpecificGameState["phase"]): boolean {
    return !data.complete && data.specificGameState.phase === phase && data.currentTurn === userId
        && data.gameState.turnOrder.includes(userId);
}

/** Adds what a run of events scored to the scores (§13.7). */
function addScores(gs: IRealmArenaSpecificGameState, events: readonly BattleEvent[]): void {
    const scores = { ...gs.scores };
    for (const event of events) {
        if (event.kind === "scored") scores[event.player] = (scores[event.player] ?? 0) + event.points;
    }
    gs.scores = scores;
}

// ─── Narration ──────────────────────────────────────────────────────────────
//
// The history line an action writes, continuing the sentence its player's
// name starts: "Alice moved their Knight; Bob's Archer fired on overwatch: a
// hit for 3". Characters are named by owner and kind — every squad is public
// once the battle has begun.

function whose(fighters: readonly Fighter[], id: number, actor: string): string {
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character";
    const name = CHARACTERS[fighter.character].name;
    return fighter.owner === actor ? `their ${name}` : `${userToken(fighter.owner)}'s ${name}`;
}

/**
 * What one event says. The acting player's own deeds start with a verb, so
 * they read straight on from the name; anyone else's start with who did it.
 */
function clause(event: BattleEvent, fighters: readonly Fighter[], actor: string): string {
    const name = (id: number) => whose(fighters, id, actor);
    const landed = (damage: number, graze: boolean) => damage === 0 ? "a miss" : `${graze ? "a graze" : "a hit"} for ${damage}`;
    switch (event.kind) {
        case "moved": return `${event.sneaking ? "sneaked" : "moved"} ${name(event.fighter)}`;
        case "shot":
            return event.reaction
                ? `${name(event.fighter)} fired on overwatch: ${landed(event.damage, event.result === "graze")}`
                : `shot ${name(event.target)} with ${name(event.fighter)} (${event.chance}%): ${landed(event.damage, event.result === "graze")}`;
        case "struck":
            return event.reaction
                ? `${name(event.fighter)} struck on guard for ${event.damage}`
                : `struck ${name(event.target)} with ${name(event.fighter)} for ${event.damage}`;
        case "fireball":
            return `threw a fireball with ${name(event.fighter)}, hitting ${pluralize(event.targets.length, "character")} for ${event.damage}`;
        case "downed": return `${name(event.fighter)} is down`;
        case "healed": return `healed ${name(event.target)} with ${name(event.fighter)} for ${event.hp}`;
        case "raised": return `raised ${name(event.target)} with ${name(event.fighter)}`;
        case "hunkered": return `hunkered ${name(event.fighter)} down`;
        case "shieldWall": return `raised a shield wall with ${name(event.fighter)}`;
        case "watching": return `put ${name(event.fighter)} on watch`;
        case "scored": {
            const who = event.player === actor ? "scored" : `${userToken(event.player)} scored`;
            return `${who} ${event.points} for ${event.reason === "centre" ? "holding the centre" : "the knock-out"}`;
        }
    }
}

/** A move told once, however many times reactions broke it up. */
function narrate(events: readonly BattleEvent[], before: readonly Fighter[], actor: string): string {
    return events
        .filter((event, index) => event.kind !== "moved" || events.findIndex(one => one.kind === "moved") === index)
        .map(event => clause(event, before, actor))
        .join("; ");
}

// ─── Game type ──────────────────────────────────────────────────────────────

@serializable
export class RealmArenaGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "RealmArena";
    friendlyName: string = "Realm Arena";
    icon: string = "";
    url: string = "realmarena";
    readonly className: string = "RealmArenaGameType";

    /**
     * The rotation (§17.2): the turn passes round the seats, through the muster
     * and on into the battle without a break. A player's battle turn begins
     * here, with fresh AP and the stances and banks of their last turn gone —
     * `startTurn`, run on the hand-off so a timed-out turn and a replay begin
     * the next one exactly as a played turn does.
     */
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IRealmArenaGameData;
        const next = nextActivePlayer(data, data.currentTurn);
        data.currentTurn = next;
        const gs = data.specificGameState;
        if (gs.phase === "battle") {
            gs.fighters = startTurn(battleOf(gs), next);
            markDirty(gameData);
        }
    }

    /**
     * The end of the battle (§5.1): the turn limit played out (§13.8), or at
     * most one squad left standing. The winner is whoever the tie-break chain
     * puts first, so there always is one.
     */
    CheckGameOver(gameData: IGameData): boolean {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (gs.phase !== "battle") return false;
        const order = data.gameState.turnOrder;
        const battle = battleOf(gs);
        if (!isBattleOver(battle, order, gs.roundsPlayed)) return false;

        const ranked = standings(battle, order, gs.scores);
        data.complete = true;
        data.winner = ranked[0];
        data.currentTurn = '';
        data.gameState.history.unshift({
            text: `The battle is over: ${ranked.map(userId => `${userToken(userId)} ${pluralize(gs.scores[userId] ?? 0, "point")}`).join(", ")}`,
        });
        data.gameState.history.unshift(playerHistory(ranked[0], "wins the battle"));
        return true;
    }
}

// ─── Commands ───────────────────────────────────────────────────────────────

/** The squad, and where each character stands (§17.2). Sealed until every player has mustered. */
@serializable
export class RealmArenaMuster implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    picks: MusterPick[] = [];
    readonly className = "RealmArenaMuster";

    // Says nothing about the squad: the match review prints this to everyone.
    myString() { return "mustered their squad"; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "muster")) return INVALID;
        const order = data.gameState.turnOrder;
        const seat = order.indexOf(this.senderId);
        const musters = gs.musters ?? [];
        // Seat order, one turn each, so a player's seat is the next muster.
        if (seat !== musters.length) return INVALID;
        const field = battlefieldById(gs.map);
        if (musterRefusal(field, seat, this.picks, POINTS_BUDGET[order.length as PlayerCount]) !== undefined) return INVALID;

        // Exactly what was checked, and nothing else a request carried.
        this.picks = this.picks.map(({ character, square }) => ({ character, square }));
        musters.push({ owner: this.senderId, picks: this.picks });
        gs.musters = musters;
        data.gameState.history.unshift(playerHistory(this.senderId, this.myString()));

        if (musters.length === order.length) {
            // Every squad joins the battlefield at once, ids in seat order.
            gs.fighters = musters.flatMap(({ owner, picks }) => picks.map(pick => ({ owner, pick })))
                .map(({ owner, pick }, id) => newFighter(id, owner, pick.character, pick.square));
            gs.musters = [];
            gs.phase = "battle";
            data.gameState.history.unshift({ text: "The squads take the field, and the battle begins" });
        }
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }
}

/** What an action did, in order, for the board to show coming back (§17.3 PR 7). Recomputed on a replay, so never persisted. */
export interface IRealmArenaActOutcome extends ICommandOutcome {
    events: BattleEvent[];
}

const ACTION_PHRASES: Readonly<Record<Action["kind"], string>> = {
    move: "moved",
    sneak: "sneaked",
    attack: "attacked",
    aimedShot: "took an aimed shot",
    hunker: "hunkered down",
    watch: "went on watch",
    shieldWall: "raised a shield wall",
    cleave: "cleaved",
    fireball: "threw a fireball",
    heal: "healed an ally",
    raise: "raised a fallen ally",
};

/**
 * The action as `check` read it, and nothing else a request carried. `check`
 * has already refused anything malformed, so these are the fields it allowed.
 */
function cleanAction(action: Action): Action {
    switch (action.kind) {
        case "move":
        case "sneak": return { kind: action.kind, fighter: action.fighter, path: [...action.path] };
        case "attack":
        case "aimedShot":
        case "heal":
        case "raise": return { kind: action.kind, fighter: action.fighter, target: action.target };
        case "hunker":
        case "watch":
        case "shieldWall": return { kind: action.kind, fighter: action.fighter };
        case "cleave": return { kind: action.kind, fighter: action.fighter, targets: [...action.targets] };
        case "fireball": return { kind: action.kind, fighter: action.fighter, at: action.at };
    }
}

/** One action by one character (§17.2): a move, a sneak, an attack, an aimed shot, an ability, hunkering down, or going on watch. */
@serializable
export class RealmArenaAct implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    action: Action = { kind: "hunker", fighter: -1 };
    /**
     * Every 1–100 roll the action used, in the order it used them — its own
     * shot, and each overwatch it set off (§17.2). Written by the first
     * `Execute`, read back by a replay; the command route strips it from a
     * request, so a client can never choose its own.
     */
    recordedRolls?: number[];
    readonly className = "RealmArenaAct";

    myString() {
        return (typeof this.action?.kind === "string" && Object.hasOwn(ACTION_PHRASES, this.action.kind)
            ? ACTION_PHRASES[this.action.kind as Action["kind"]] : undefined) ?? "acted";
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "battle")) return INVALID;
        const battle = battleOf(gs);
        if ("refused" in check(battle, this.senderId, this.action)) return INVALID;
        const action = cleanAction(this.action);

        const { roll, used } = recordedRolls(this.recordedRolls, () => randomInt(ROLL_SIDES) + 1);
        const { fighters, events } = act(battle, this.senderId, action, roll);

        this.action = action;
        this.recordedRolls = used;
        gs.fighters = fighters;
        addScores(gs, events);
        data.gameState.history.unshift(playerHistory(this.senderId, narrate(events, battle.fighters, this.senderId)));
        markDirty(gameData);
        return { validMove: true, turnOver: false, events } as IRealmArenaActOutcome;
    }
}

/**
 * The end of a player's battle turn (§17.2): every character with AP enough
 * goes on watch, except those named to keep still, and the centre scores.
 * A timed-out turn sends this with nobody kept still (§4).
 */
@serializable
export class RealmArenaEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    /** Ids of the player's characters to keep still rather than go on watch. */
    keepStill: number[] = [];
    readonly className = "RealmArenaEndTurn";

    myString() { return "ended their turn"; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "battle")) return INVALID;
        const battle = battleOf(gs);

        // Only the player's own standing characters, once each: anything else
        // a request named would change nothing, so it isn't kept either.
        const still = Array.isArray(this.keepStill) ? this.keepStill : [];
        this.keepStill = battle.fighters
            .filter(fighter => fighter.owner === this.senderId && still.includes(fighter.id))
            .map(fighter => fighter.id);

        const order = data.gameState.turnOrder;
        const { fighters, events } = endTurn(battle, this.senderId, gs.roundsPlayed + 1, this.keepStill);
        gs.fighters = fighters;
        addScores(gs, events);
        data.gameState.history.unshift(playerHistory(this.senderId, ["ended their turn", ...events.map(event => clause(event, battle.fighters, this.senderId))].join("; ")));

        // The last seat's turn ends the round (§13.8).
        if (order.indexOf(this.senderId) === order.length - 1) gs.roundsPlayed += 1;
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }
}
