import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { markDirty } from "@/utils/games/markDirty";
import { recordedRolls } from "@/utils/games/recordedRolls";
import { isDropped, nextActivePlayer, registerPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IRealmArenaCoop, IRealmArenaGameData, IRealmArenaSpecificGameState } from "@/games/RealmArena/RealmArenaModels";
import { ABILITIES, CHARACTERS, EFFECTS, enemyNameOf, factionById, ITEMS, musterSize, POINTS_BUDGET, REALM } from "@/games/RealmArena/characters";
import { battlefieldById, battlefieldOf } from "@/games/RealmArena/maps";
import { addTally, NO_TALLY, type Tally } from "@/games/RealmArena/mastery";
import {
    ACTION_POINTS,
    act,
    allied,
    areaAround,
    battleFrom,
    blastedIn,
    check,
    endTurn,
    ENEMY_SIDE,
    fighterById,
    isBattleOver,
    isStanding,
    isWarband,
    landedSmoke,
    musterRefusal,
    newFighter,
    pickOf,
    readyMadeMuster,
    ROLL_SIDES,
    squadSight,
    sideScore,
    squadsStanding,
    standingPoints,
    standings,
    startTurn,
    TEAM_SIDE,
    viewOf,
    storedFighter,
    warbandOwner,
    warbandsFor,
    type Action,
    type BattleEvent,
    type BattleState,
    type Fighter,
    type MusterPick,
    type Roll,
} from "@/games/RealmArena/rules";
import { nextAction } from "@/games/RealmArena/ai";
import { playerHistory, userToken, type IHistoryEntry } from "@/utils/games/history";
import { randomInt } from "@/utils/games/random";
import { endAsTeam } from "@/utils/games/endAsTeam";
import { capitalise, pluralize, possessive } from "@/utils/ui/text";

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
//
// In co-op (§29) the computer's warbands take their turns inside the players'
// End turns, one after each, through the same two steps a player's action and
// End turn go through (`applyAction`, `applyEndTurn`), and the End turn
// records what they did, so a replay never asks the planner again (§29.7).

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

/**
 * The battle as rules.ts reads it: the map, with what has been blasted cleared
 * from it (§22), in fog of war if it's fought in it and not yet over — the fog
 * lifts once the battle is (`complete`, §27).
 */
export function battleOf(gs: IRealmArenaSpecificGameState, complete = false): BattleState {
    return battleFrom(battlefieldOf(gs.map, gs.blasted ?? []), {
        fighters: (gs.fighters ?? []).map(storedFighter),
        fog: gs.fog === true && !complete,
        seats: gs.seats,
        coop: gs.coop !== undefined,
    });
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

/**
 * Whose turn follows `userId`'s (§5.1): the next seat round the table, stepping
 * over anyone dropped and, once the battle has begun, any squad with nobody
 * left standing — a wiped-out squad takes no more turns, and its score stands.
 * `userId` itself may be either. `userId` back when nobody else can play,
 * which only a battle that is already over can come to.
 */
export function nextSeat(data: IRealmArenaGameData, userId: string): string {
    const gs = data.specificGameState;
    const standing = new Set(gs.phase === "battle" ? squadsStanding(battleOf(gs), data.gameState.turnOrder) : data.gameState.turnOrder);
    let next = nextActivePlayer(data, userId);
    while (next !== userId && !standing.has(next)) next = nextActivePlayer(data, next);
    return next;
}

/** Adds what a run of events scored to the scores (§13.7). */
function addScores(gs: IRealmArenaSpecificGameState, events: readonly BattleEvent[]): void {
    const scores = { ...gs.scores };
    for (const event of events) {
        if (event.kind === "scored") scores[event.player] = (scores[event.player] ?? 0) + event.points;
    }
    gs.scores = scores;
}

// ─── Mastery (§23.3) ─────────────────────────────────────────────────────────

/**
 * Which count an action adds one to for the character taking it (§23.1): an
 * attack or an aimed shot, an ability, or an item. A cleave is one ability
 * however many it strikes, and so is every ability an option swaps in, a
 * crippling shot among them (§23.2). A move — a sneak too — hunkering down
 * and going on watch earn nothing, since every character can do them.
 */
const TALLIED: Readonly<Partial<Record<Action["kind"], keyof Tally>>> = {
    attack: "attacks",
    aimedShot: "attacks",
    cleave: "abilities",
    shieldWall: "abilities",
    fireball: "abilities",
    heal: "abilities",
    raise: "abilities",
    shieldBash: "abilities",
    demolish: "abilities",
    cripplingShot: "abilities",
    huntersMark: "abilities",
    purify: "abilities",
    throw: "items",
    draught: "items",
};

/**
 * The fighters with what an action earned added to their tallies: one to the
 * actor's count for the action (`TALLIED`), whatever it rolled, and an attack
 * for every watcher whose reaction it set off — on overwatch or on guard,
 * during somebody else's command. Run on every action, so undo takes a tally
 * back with the snapshot it restores.
 */
export function tallied(fighters: readonly Fighter[], action: Action, events: readonly BattleEvent[]): Fighter[] {
    const own = TALLIED[action.kind];
    const credits: [number, keyof Tally][] = [
        ...(own ? [[action.fighter, own] as [number, keyof Tally]] : []),
        ...events.flatMap((event): [number, keyof Tally][] =>
            (event.kind === "shot" || event.kind === "struck") && event.reaction ? [[event.fighter, "attacks"]] : []),
    ];
    return fighters.map(fighter => credits.reduce((one, [id, count]) => id !== fighter.id ? one
        : { ...one, tally: addTally(one.tally ?? NO_TALLY, { ...NO_TALLY, [count]: 1 }) }, fighter));
}

// ─── Undo (docs/undo.md) ────────────────────────────────────────────────────
//
// The eighth game to take a move back, and shaped like Fires Out's: a turn is
// a run of `RealmArenaAct`s and only End turn hands it on, and the player
// sends it. So there is no ten-second hold (§5) — Undo is simply there until
// the player does something that isn't undoable.
//
// Undoable: a move, a sneak, hunkering down, going on watch, a shield wall, a
// heal, a raise, a Purify, a Hunter's mark, a healing draught, and a throw or a
// Demolish that lands on nobody — a smoke pot always does (§21.2) — the
// actions that roll nothing and hurt nobody. A fire flask or a Demolish that
// lands on nobody still blasts low cover away (§22), and is still taken back
// whole: the snapshot holds what was blasted. A mark hurts nobody either: it
// only makes a target easier to hit, which the other side sees whether or not
// it's taken back.
// Never an attack of any kind (an attack, an aimed shot, a crippling shot, a
// cleave, a shield bash, a fireball, a flask or a Demolish that lands on
// someone): a shot rolls, and a strike, a fireball or a flask hits someone
// the other side has seen it land on. Nor a move that sets
// anyone off: an overwatch shot rolls, and a guard's strike is an attack on
// the mover, so a move a watcher reacted to stays made. That is decided off
// what the action did rather than off its kind — `peaceful` — so a move along
// a path nobody watches can be taken back, and the same move into a watcher's
// sight can't. Taking back an item's use puts the item back: the snapshot
// holds it like everything else.
//
// Anything that isn't peaceful empties the stack rather than only moving the
// anchor: otherwise a peaceful action after it would push on top of the older
// snapshots, and undoing that one would put the anchor back in reach of a
// state from before the attack. The stack is emptied on every hand-off in
// CheckEndTurn too, which the turn timer's End turn goes through, so no
// snapshot outlives its turn.

/** The kinds that can ever be taken back: no attack is among them. */
const UNDOABLE_KINDS: ReadonlySet<Action["kind"]> = new Set(["move", "sneak", "hunker", "watch", "shieldWall", "heal", "raise", "purify", "huntersMark", "draught", "throw", "demolish"]);

/**
 * What an undoable action may have done: everything but an attack landing, a
 * knock-out or the points for one. A heal, a draught or a Purify clearing an
 * effect is an `effect` event, and so is a mark (§20.3). Cover blasted away
 * hurts nobody (§22). A `thrown` or a `demolished` event is peaceful only when
 * it hit nobody, which `peaceful` checks itself.
 */
const PEACEFUL_EVENTS: ReadonlySet<BattleEvent["kind"]> = new Set(["moved", "healed", "raised", "hunkered", "shieldWall", "watching", "effect", "marked", "blasted"]);

/**
 * How many snapshots the stack keeps: a character's whole turn of one-AP
 * moves. A turn spread over the squad can hold more undoable actions than
 * that, which only costs reach — the anchor decides what can be restored.
 */
export const UNDO_STACK_DEPTH = ACTION_POINTS;

/** Whether an action rolled nothing and hurt nobody, so taking it back hands nobody a second go at a roll. A throw or a Demolish is, when it landed on nobody. */
function peaceful(action: Action, events: readonly BattleEvent[], rolls: readonly number[]): boolean {
    return UNDOABLE_KINDS.has(action.kind) && rolls.length === 0
        && events.every(event => PEACEFUL_EVENTS.has(event.kind) || ((event.kind === "thrown" || event.kind === "demolished") && event.targets.length === 0));
}

/**
 * Whether an action showed its player an enemy their side couldn't see
 * before it, or someone else's smoke cloud (§27): a move round a corner, cover
 * blasted open, an ally raised.
 * What's been seen can't be unseen, so such an action can't be taken back —
 * or a player could step out, look, and step back for free. Never in a battle
 * without fog, where everyone is seen already.
 */
function revealed(before: BattleState, after: BattleState, player: string): boolean {
    if (!after.fog) return false;
    const sighted = (state: BattleState) => {
        const view = viewOf(state, player);
        const others = view.fighters.filter(fighter => !allied(view, fighter.owner, player));
        return { ids: others.map(fighter => fighter.id), clouds: [...landedSmoke(others), ...view.clouds ?? []] };
    };
    const was = sighted(before), now = sighted(after);
    return now.ids.some(id => !was.ids.includes(id)) || now.clouds.some(cloud => !was.clouds.includes(cloud));
}

/**
 * The whole state, as plain objects the undo stack can keep and hand back.
 * Never nests a stack: a snapshot's own `undoStack` is empty, and restoring
 * one leaves the live stack where it is anyway.
 */
export function cloneRealmArenaState(gs: IRealmArenaSpecificGameState): IRealmArenaSpecificGameState {
    return {
        map: gs.map,
        seats: [...gs.seats],
        phase: gs.phase,
        roundsPlayed: gs.roundsPlayed,
        fighters: (gs.fighters ?? []).map(storedFighter),
        ...(gs.fog ? { fog: true } : {}),
        ...(gs.coop ? { coop: { ...gs.coop } } : {}),
        blasted: [...(gs.blasted ?? [])],
        musters: (gs.musters ?? []).map(({ owner, picks }) => ({ owner, picks: picks.map(pickOf) })),
        scores: { ...gs.scores },
        // Written once as the battle is created and never changed, so shared.
        mastery: gs.mastery ?? {},
        undoStack: [],
        undoAnchorId: null,
    };
}

/**
 * Pushes a snapshot taken before `command`'s first mutation and moves the
 * anchor onto `command`. Capped at UNDO_STACK_DEPTH — dropping the oldest only
 * ever costs reach, never correctness.
 */
function commitUndo(gs: IRealmArenaSpecificGameState, command: IGameCommand, before: IRealmArenaSpecificGameState): void {
    gs.undoStack = [...(gs.undoStack ?? []), { by: command.senderId, state: before }].slice(-UNDO_STACK_DEPTH);
    gs.undoAnchorId = command.id;
}

/** Forgets every snapshot: after anything that isn't peaceful, and on every hand-off. */
function clearUndo(gs: IRealmArenaSpecificGameState): void {
    gs.undoStack = [];
    gs.undoAnchorId = null;
}

// ─── Narration ──────────────────────────────────────────────────────────────
//
// The history line an action writes, continuing the sentence its player's
// name starts: "Alice moved their Knight; Bob's Archer fired on overwatch: a
// hit for 3". Characters are named by owner and kind — every squad is public
// once the battle has begun.
//
// In co-op the warbands are named by their faction (§29.6): "the Renegades'
// Archer fired on overwatch". A random enemy isn't, until the team has seen
// it (§29.3): a character's kind is its faction, so until then the log calls
// the enemy "the enemy" and each of its characters "an enemy character". A
// line is kept as it was written, so those lines stay as the team knew them.

/**
 * Whether the team knows whom it fights (§29.3): a faction the host picked,
 * from the start, or a random one once it has been seen. Never in a
 * free-for-all, which has no enemy.
 */
export function enemyKnown(coop: IRealmArenaCoop | undefined): boolean {
    return coop !== undefined && !enemyHidden(coop);
}

/** Whether whom the team fights is still hidden from it: a random enemy not yet seen (§29.3). */
export function enemyHidden(coop: IRealmArenaCoop | undefined): boolean {
    return coop?.random === true && coop.enemySeen !== true;
}

/**
 * Events as a hidden enemy's characters may be told (§29.3), on the wire and
 * in the recap: anything one of them (`hidden`) did that says which kind of
 * character did it — a sneak, a shield wall, a mark, a heal or a raise — and
 * so which faction, isn't told, and a sneak is told as a move. A shot, a
 * strike or a blast says only what it did to whom. A healing draught is an
 * item, which any faction can carry.
 */
export function unnamed(events: readonly BattleEvent[], hidden: (fighter: number) => boolean): BattleEvent[] {
    return events.flatMap((event): BattleEvent[] => {
        if (!("fighter" in event) || !hidden(event.fighter)) return [event];
        switch (event.kind) {
            case "moved": return [{ ...event, sneaking: false }];
            case "shieldWall":
            case "marked":
            case "raised": return [];
            case "healed": return event.via === "draught" ? [event] : [];
            default: return [event];
        }
    });
}

/**
 * How the log names an owner (§29.6): a player by their history token, which
 * the shared resolver turns into their name; a warband by its faction's
 * `enemyName`, as plain text — "the Renegades" — or, while a random enemy is
 * hidden, "the enemy" (§29.3). The resolver would show a warband's token as
 * an unknown player.
 */
export function ownerToken(owner: string, coop: IRealmArenaCoop | undefined): string {
    if (!isWarband(owner)) return userToken(owner);
    return enemyNameOf(coop && enemyKnown(coop) ? coop.enemy : undefined);
}


function whose(fighters: readonly Fighter[], id: number, actor: string, coop: IRealmArenaCoop | undefined): string {
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character";
    const own = fighter.owner === actor;
    if (isWarband(fighter.owner) && !enemyKnown(coop)) return own ? "one of its characters" : "an enemy character";
    const name = CHARACTERS[fighter.character].name;
    return own ? `their ${name}` : `${possessive(ownerToken(fighter.owner, coop))} ${name}`;
}

/**
 * What one event says. The acting player's own deeds start with a verb, so
 * they read straight on from the name; anyone else's start with who did it.
 */
function clause(event: BattleEvent, fighters: readonly Fighter[], actor: string, coop: IRealmArenaCoop | undefined): string {
    const name = (id: number) => whose(fighters, id, actor, coop);
    const landed = (damage: number, graze: boolean) => damage === 0 ? "a miss" : `${graze ? "a graze" : "a hit"} for ${damage}`;
    const veiled = enemyHidden(coop) && "fighter" in event && isWarband(fighters.find(one => one.id === event.fighter)?.owner ?? "") ? veiledClause(event, name) : undefined;
    if (veiled !== undefined) return veiled;
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
        case "healed": {
            const hp = event.hp > 0 ? ` for ${event.hp}` : "";
            const self = event.target === event.fighter;
            switch (event.via) {
                case "draught": return `healed ${name(event.target)} with ${self ? "its" : `${name(event.fighter)}'s`} healing draught${hp}`;
                // A Cleric's Purify reaches itself, and needs no "with" to say so.
                case "purify": return `purified ${name(event.target)}${self ? "" : ` with ${name(event.fighter)}`}${hp}`;
                default: return `healed ${name(event.target)} with ${name(event.fighter)}${hp}`;
            }
        }
        case "thrown": {
            const hit = event.targets.length === 0 ? ""
                : `, hitting ${pluralize(event.targets.length, "character")}${event.damage > 0 ? ` for ${event.damage}` : ""}`;
            return `threw a ${ITEMS[event.item].name.toLowerCase()} with ${name(event.fighter)}${hit}`;
        }
        case "blasted": return `blasted away ${pluralize(event.squares.length, "square")} of low cover`;
        case "demolished": {
            const hit = event.targets.length === 0 ? "" : `, hitting ${pluralize(event.targets.length, "character")} for ${event.damage}`;
            return `used ${ABILITIES.demolish.name} with ${name(event.fighter)}${hit}`;
        }
        case "marked": return `used ${ABILITIES.huntersMark.name} with ${name(event.fighter)}`;
        case "raised": return `raised ${name(event.target)} with ${name(event.fighter)}`;
        case "hunkered": return `hunkered ${name(event.fighter)} down`;
        case "shieldWall": return `raised a shield wall with ${name(event.fighter)}`;
        case "watching": return `put ${name(event.fighter)} on watch`;
        case "spotted": return `${name(event.fighter)} found ${name(event.by)} in its way, and went round`;
        case "effect": return `${name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect].state}`;
        case "burned": return `${name(event.fighter)} burned for ${event.damage}`;
        case "scored": {
            const who = event.player === actor ? "scored" : `${ownerToken(event.player, coop)} scored`;
            return `${who} ${event.points} for ${event.reason === "centre" ? "holding the centre" : "the knock-out"}`;
        }
    }
}

/**
 * What a hidden enemy's character did (§29.3), where the deed would name its
 * kind: that it moved, or used an ability, never which — an ability is a kind
 * of character's, and a character's kind is its faction. Undefined for
 * anything that says nothing of the kind, told as `clause` tells it.
 */
function veiledClause(event: BattleEvent, name: (id: number) => string): string | undefined {
    const hit = (targets: readonly number[], damage: number) => targets.length === 0 ? "" : `, hitting ${pluralize(targets.length, "character")} for ${damage}`;
    switch (event.kind) {
        case "moved": return `moved ${name(event.fighter)}`;
        case "fireball":
        case "demolished": return `used an ability with ${name(event.fighter)}${hit(event.targets, event.damage)}`;
        case "healed": return event.via === "draught" ? undefined : `used an ability on ${name(event.target)} with ${name(event.fighter)}`;
        case "raised": return `used an ability on ${name(event.target)} with ${name(event.fighter)}`;
        case "marked":
        case "shieldWall": return `used an ability with ${name(event.fighter)}`;
        default: return undefined;
    }
}

/** A move told once, however many times reactions broke it up. */
function narrate(events: readonly BattleEvent[], before: readonly Fighter[], actor: string, coop: IRealmArenaCoop | undefined): string {
    return events
        .filter((event, index) => event.kind !== "moved" || events.findIndex(one => one.kind === "moved") === index)
        .map(event => clause(event, before, actor, coop))
        .join("; ");
}

/**
 * The history line an owner's deed writes, named by `ownerToken`. A warband's
 * carries no `actorId`: nobody can react to the computer, or be pushed about
 * a reaction from it.
 */
function lineBy(owner: string, text: string, coop: IRealmArenaCoop | undefined): IHistoryEntry {
    return isWarband(owner) ? { text: capitalise(`${ownerToken(owner, coop)} ${text}`) } : playerHistory(owner, text);
}

/**
 * Notes a random enemy seen (§29.3) once any of its characters is in the
 * team's view: the team shares its sight (§29.1), so any seat's view is the
 * team's. Without fog that's the moment the squads take the field. Run after
 * everything that can change what the team sees, so the line written by the
 * command that showed it is the last to keep the enemy unnamed.
 */
function noteSighting(gs: IRealmArenaSpecificGameState): void {
    const coop = gs.coop;
    if (!enemyHidden(coop) || gs.phase !== "battle") return;
    const battle = battleOf(gs);
    // As `viewOf` reads a view, standing or fallen, without building one.
    const seen = squadSight(battle, gs.seats[0]);
    if (!battle.fog || battle.fighters.some(fighter => isWarband(fighter.owner) && seen(fighter.square))) gs.coop = { ...coop!, enemySeen: true };
}

// ─── What a viewer is told (§27) ────────────────────────────────────────────

/**
 * The events of a command in a fogged battle as one viewer may see them
 * played (§27). Their own side's doings are theirs in full — an ally's
 * among them, since a side shares its sight (§29.1). An enemy's move keeps
 * only the squares the viewer's side sees, and only when it ends on one of
 * them: one that ends out of sight is told with no path at all, so the board
 * loses the mover there rather than leaving it where it was last seen. A
 * fireball, a flask or a Demolish landing where the viewer sees none of it,
 * and hitting none of their side's, isn't told. Nor is a character out of
 * sight going on watch: the log says it did, but not the AP it banked, which
 * is how many reactions are waiting. Everything else carries no square, and
 * what it says the log says too.
 *
 * Sight is read from the battle after the command. In an enemy's command the
 * viewer's side doesn't move, so that's the sight it had all along — or
 * less, if something downed one of them, which then hit one of theirs. In
 * co-op an End turn holds the enemy's turn (§29.4), and its own player is
 * told it this way too, as their teammates are (`outcomeFor`).
 *
 * While a random enemy is `hidden` (§29.3), what its characters did is told
 * `unnamed` too.
 *
 * Here beside the game type rather than with the response it shapes, so the
 * game type can cut the outcome a command returns its sender (`outcomeFor`).
 */
export function toldTo(events: readonly BattleEvent[], battle: BattleState, viewerId: string | null, hidden = false): BattleEvent[] {
    const seen = squadSight(battle, viewerId);
    const own = (id: number) => allied(battle, fighterById(battle, id)?.owner, viewerId);
    const inSight = (id: number) => {
        const fighter = fighterById(battle, id);
        return fighter !== undefined && (own(id) || seen(fighter.square));
    };
    const told = hidden ? unnamed(events, id => isWarband(fighterById(battle, id)?.owner ?? "")) : events;
    return told.flatMap((event): BattleEvent[] => {
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
     * What a command's own sender is told it did: everything, but in a battle
     * fought in fog of war and not yet over, cut to what their side saw
     * (`toldTo`) — which in co-op is the enemy's turn inside their End turn
     * (§29.8). A shot's roll stays: it's theirs, or one fired at them.
     */
    outcomeFor(gameData: IGameData, outcome: ICommandOutcome, viewerId: string): ICommandOutcome {
        const data = gameData as IRealmArenaGameData;
        // An End turn's parts are the recap's (§29.9), and the enemy's holds
        // its actions whole: the board plays the turn from `events`.
        const { recap: _recap, ...told } = outcome as IRealmArenaOutcome;
        const battle = battleOf(data.specificGameState, data.complete);
        if (!battle.fog || !Array.isArray(told.events)) return told;
        return { ...told, events: toldTo(told.events, battle, viewerId, enemyHidden(data.specificGameState.coop)) } as IRealmArenaOutcome;
    }

    /**
     * The rotation (§17.2): the turn passes round the seats, through the muster
     * and on into the battle without a break, stepping over a seat dropped or
     * wiped out (`nextSeat`). The next battle turn has already begun by now:
     * the command that ended the last one began it (`handOff`), since its
     * burning can end the battle, and only a command's own changes are seen
     * by `CheckGameOver`, which runs before this.
     */
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IRealmArenaGameData;
        data.currentTurn = nextSeat(data, data.currentTurn);
        // Nothing on the stack can be restored past a hand-off (docs/undo.md).
        clearUndo(data.specificGameState);
        markDirty(gameData);
    }

    /**
     * The end of the battle (§5.1): the turn limit played out (§13.8), or at
     * most one side left standing. The winner is whoever the tie-break chain
     * puts first, so there always is one — passing over anyone dropped, whose
     * score stands in the final line but who wasn't there at the end. In
     * co-op it's one ending for the whole team (§29.5, `endInCoop`).
     */
    CheckGameOver(gameData: IGameData): boolean {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (gs.phase !== "battle") return false;
        const order = data.gameState.turnOrder;
        const battle = battleOf(gs);
        if (!isBattleOver(battle, order, gs.roundsPlayed)) return false;
        if (gs.coop) {
            endInCoop(data, battle, gs.coop);
            return true;
        }

        const ranked = standings(battle, order, gs.scores);
        const winner = ranked.find(userId => !isDropped(data, userId)) ?? ranked[0];
        data.complete = true;
        data.winner = winner;
        data.currentTurn = '';
        data.gameState.history.unshift({
            text: `The battle is over: ${ranked.map(userId => `${userToken(userId)} ${pluralize(gs.scores[userId] ?? 0, "point")}`).join(", ")}`,
        });
        data.gameState.history.unshift(playerHistory(winner, "wins the battle"));
        return true;
    }
}

/**
 * A co-op battle's ending (§29.5): the team wins if its score — its players'
 * added together — beats the enemy's, which is `standings` read by side, with
 * the warbands' seats after the players' so a battle level all the way goes
 * to the enemy, holding the field. One ending for everybody, `teamwin` or
 * `teamloss` (`endAsTeam`), with the final score as its detail. The fog lifts
 * as the battle ends (§27.1), and a random enemy's faction with it (§29.3), so
 * the final line names it.
 */
function endInCoop(data: IRealmArenaGameData, battle: BattleState, coop: IRealmArenaCoop): void {
    const gs = data.specificGameState;
    const warbands = warbandsFor(gs.seats);
    const [team, enemy] = [sideScore(battle, gs.scores, TEAM_SIDE), sideScore(battle, gs.scores, ENEMY_SIDE)];
    const won = !isWarband(standings(battle, [...gs.seats, ...warbands], gs.scores)[0]);
    const foe = enemyNameOf(coop.enemy);
    data.gameState.history.unshift({
        text: `The battle is over: the team ${pluralize(team, "point")} (${gs.seats.map(userId => `${userToken(userId)} ${gs.scores[userId] ?? 0}`).join(", ")}), ${foe} ${enemy}`,
    });
    // Level scores went to whoever had more left standing, then to the enemy.
    const detail = team !== enemy ? `${pluralize(team, "point")} to ${enemy}`
        : `${pluralize(team, "point")} each, ${standingPoints(battle, TEAM_SIDE) > standingPoints(battle, ENEMY_SIDE)
            ? "with more of the team left standing" : "and the enemy held the field"}`;
    endAsTeam(data, won ? "teamwin" : "teamloss", `The team ${won ? "wins" : "loses"} the battle`, detail);
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
        const size = musterSize(order.length, gs.coop !== undefined);
        // Held to the ranks the battle was created with, never to anything sent (§23.3),
        // and to the Realm's roster, which every player fights as (§29.3).
        const ranks = gs.mastery?.[this.senderId] ?? {};
        if (musterRefusal(field, seat, this.picks, POINTS_BUDGET[size], ranks, REALM) !== undefined) return INVALID;

        // Exactly what was checked, and nothing else a request carried.
        this.picks = this.picks.map(pickOf);
        musters.push({ owner: this.senderId, picks: this.picks });
        gs.musters = musters;
        data.gameState.history.unshift(playerHistory(this.senderId, this.myString()));

        if (musters.length === order.length) {
            // In co-op the warbands muster last, each the enemy's ready-made
            // squad in the zone opposite its player's (§29.7).
            if (gs.coop) {
                const squad = factionById(gs.coop.enemy).readyMade[size];
                musters.push(...order.map((_, k) => ({ owner: warbandOwner(k), picks: readyMadeMuster(field, order.length + k, squad) })));
            }
            // Every squad joins the battlefield at once, ids in seat order, the warbands' last.
            gs.fighters = musters.flatMap(({ owner, picks }) => picks.map(pick => ({ owner, pick })))
                .map(({ owner, pick }, id) => newFighter(id, owner, pick.character, pick.square, pick.item ?? null, pick.option));
            gs.musters = [];
            gs.phase = "battle";
            data.gameState.history.unshift({ text: "The squads take the field, and the battle begins" });
            // The first seat's turn begins. Nobody has an effect yet, so
            // nothing happens but fresh AP.
            gs.fighters = startTurn(battleOf(gs), order[0]).fighters;
            noteSighting(gs);
        }
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }
}

/**
 * What an action or an End turn did, in order: for the board to show coming
 * back (§17.3 PR 7), and the recap to tell. Recomputed on a replay, so never
 * persisted.
 */
export interface IRealmArenaOutcome extends ICommandOutcome {
    events: BattleEvent[];
    /**
     * An End turn's parts, for the recap's rows (§29.9): in co-op the
     * warband's turn it held (§29.4), step by step, and what happened as the
     * next turn began — burning (§20.2). Their events are in `events` too.
     * Never sent: `outcomeFor` leaves it out of a command's own response, and
     * a review reads only `events`.
     */
    recap?: { enemy?: EnemyTurn; started: BattleEvent[] };
}

/** One of a warband's actions, as it was checked, and what it did. */
export interface EnemyStep {
    action: Action;
    events: BattleEvent[];
}

/**
 * A warband's turn, as it was played (§29.4): what burning did as it began,
 * each action it took, and what its End turn did — absent when the battle
 * was over before it came to one. Each part that happened wrote the log a
 * line of its own, in that order: the burning only when there was some, one
 * line an action, and one for the End turn.
 */
export interface EnemyTurn {
    owner: string;
    started: BattleEvent[];
    steps: EnemyStep[];
    ended?: BattleEvent[];
}

/** Everything that happened in a warband's turn, in order. */
export const enemyEvents = (turn: EnemyTurn): BattleEvent[] => [...turn.started, ...turn.steps.flatMap(step => step.events), ...turn.ended ?? []];

/** How many lines of the log a warband's turn wrote: one for its burning, if any, one an action, and one for its End turn. */
export const enemyLineCount = (turn: EnemyTurn): number => (turn.started.length > 0 ? 1 : 0) + turn.steps.length + (turn.ended ? 1 : 0);

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
    throw: "threw an item",
    draught: "used a healing draught",
    shieldBash: "used Shield bash",
    demolish: "used Demolish",
    cripplingShot: "took a crippling shot",
    huntersMark: "used Hunter's mark",
    purify: "used Purify",
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
        case "raise":
        case "draught":
        case "shieldBash":
        case "cripplingShot":
        case "huntersMark": return { kind: action.kind, fighter: action.fighter, target: action.target };
        case "hunker":
        case "watch":
        case "shieldWall":
        case "purify": return { kind: action.kind, fighter: action.fighter };
        case "cleave": return { kind: action.kind, fighter: action.fighter, targets: [...action.targets] };
        case "fireball":
        case "throw":
        case "demolish": return { kind: action.kind, fighter: action.fighter, at: action.at };
    }
}

/** What `applyAction` did: the action as it was checked, what happened, and the battle before it. */
interface Applied {
    action: Action;
    events: BattleEvent[];
    before: BattleState;
}

/**
 * One action by one of `owner`'s characters, a player's or a warband's
 * (§29.8): checked, cleaned, taken with `roll`, and everything that follows
 * from it kept — the mastery tally, the cover it blasted, the points it
 * scored and its line in the log. Undefined when `check` refuses it, having
 * changed nothing. Whose turn it is, and undo, are the caller's.
 */
function applyAction(data: IRealmArenaGameData, owner: string, sent: unknown, roll: Roll): Applied | undefined {
    const gs = data.specificGameState;
    const before = battleOf(gs);
    if ("refused" in check(before, owner, sent)) return undefined;
    const action = cleanAction(sent as Action);
    const { fighters, events } = act(before, owner, action, roll);
    gs.fighters = tallied(fighters, action, events);
    const blasted = blastedIn(events);
    if (blasted.length > 0) gs.blasted = [...(gs.blasted ?? []), ...blasted];
    addScores(gs, events);
    data.gameState.history.unshift(lineBy(owner, narrate(events, before.fighters, owner, gs.coop), gs.coop));
    noteSighting(gs);
    return { action, events, before };
}

/**
 * The start of `owner`'s turn, a player's or a warband's: fresh AP, and
 * burning, which can down a character (§20.2) — told in a line of its own
 * (§20.3). Returns what happened.
 */
function beginTurn(data: IRealmArenaGameData, owner: string): BattleEvent[] {
    const gs = data.specificGameState;
    const battle = battleOf(gs);
    const { fighters, events } = startTurn(battle, owner);
    gs.fighters = fighters;
    addScores(gs, events);
    if (events.length > 0) data.gameState.history.unshift({ text: capitalise(narrate(events, battle.fighters, "", gs.coop)) });
    noteSighting(gs);
    return events;
}

/**
 * The end of `owner`'s turn, a player's or a warband's (§29.8): every
 * character with AP enough goes on watch but those in `keepStill`, and the
 * centre scores. Returns what happened.
 */
function applyEndTurn(data: IRealmArenaGameData, owner: string, keepStill: readonly number[]): BattleEvent[] {
    const gs = data.specificGameState;
    const battle = battleOf(gs);
    const { fighters, events } = endTurn(battle, owner, gs.roundsPlayed + 1, keepStill);
    gs.fighters = fighters;
    addScores(gs, events);
    data.gameState.history.unshift(lineBy(owner, ["ended their turn", ...events.map(event => clause(event, battle.fighters, owner, gs.coop))].join("; "), gs.coop));
    noteSighting(gs);
    return events;
}

/** One action by one character (§17.2): a move, a sneak, an attack, an aimed shot, an ability, an item (§21), hunkering down, or going on watch. */
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
     * request, so a client can never choose its own. Absent on an action that
     * rolled nothing, so the undo guard (docs/undo.md §6) sees it didn't.
     */
    recordedRolls?: number[];
    readonly className = "RealmArenaAct";
    // Only when it rolled nothing and hurt nobody — enforced in Execute
    // (`peaceful`, above).
    readonly undoable = true;

    myString() {
        return (typeof this.action?.kind === "string" && Object.hasOwn(ACTION_PHRASES, this.action.kind)
            ? ACTION_PHRASES[this.action.kind as Action["kind"]] : undefined) ?? "acted";
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "battle")) return INVALID;
        // Before the first mutation, pushed only if the action proves peaceful.
        const snapshot = UNDOABLE_KINDS.has(this.action?.kind) ? cloneRealmArenaState(gs) : null;

        const { roll, used } = recordedRolls(this.recordedRolls, () => randomInt(ROLL_SIDES) + 1);
        const applied = applyAction(data, this.senderId, this.action, roll);
        if (!applied) return INVALID;
        const { action, events, before } = applied;

        this.action = action;
        // Not even an empty list when nothing rolled: the undo guard reads any
        // `recorded…` key as randomness consumed (docs/undo.md §6).
        if (used.length > 0) this.recordedRolls = used;
        else delete this.recordedRolls;
        if (snapshot && peaceful(action, events, used) && !revealed(before, battleOf(gs), this.senderId)) commitUndo(gs, this, snapshot);
        else clearUndo(gs);
        markDirty(gameData);
        return { validMove: true, turnOver: false, events } as IRealmArenaOutcome;
    }
}

/**
 * Takes the sender's last action back (docs/undo.md): only one `RealmArenaAct`
 * pushed a snapshot for, and only while it is still the last command played.
 */
@serializable
export class RealmArenaUndo implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "RealmArenaUndo";

    myString() { return "took back their last move"; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "battle")) return INVALID;

        // A snapshot is only good for the command directly behind it: refused
        // once anything else has run since it was pushed (docs/undo.md §4).
        const lastCommand = data.gameState.commandHistory.at(-1);
        if (!lastCommand || gs.undoAnchorId !== lastCommand.id) return INVALID;
        const entry = (gs.undoStack ?? []).at(-1);
        if (!entry || entry.by !== this.senderId) return INVALID;

        const undoStack = gs.undoStack.slice(0, -1);
        const { undoStack: _undoStack, undoAnchorId: _undoAnchorId, ...restored } = entry.state;
        Object.assign(gs, restored);
        // Every snapshot is cloned with the list, but nothing is left to rest on that.
        gs.blasted = restored.blasted ?? [];
        gs.undoStack = undoStack;
        gs.undoAnchorId = this.id;

        // No `currentTurn` to put back: nothing undoable here ever ends a turn.
        data.gameState.history.unshift(playerHistory(this.senderId, this.myString()));
        markDirty(gameData);
        return { validMove: true, turnOver: false };
    }
}

/**
 * The end of a player's battle turn (§17.2): every character with AP enough
 * goes on watch, except those named to keep still, and the centre scores.
 * A timed-out turn sends this with nobody kept still (§4). In co-op, the
 * enemy's turn follows inside it (§29.4).
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
    /**
     * In co-op, the actions the warband whose turn followed took, in order
     * (§29.7): written by the first `Execute`, which asked the planner for
     * them, and read back by a replay, which never asks it. Absent outside
     * co-op. A `recorded…` field, so the command route strips it from a
     * request: no client chooses the enemy's moves.
     */
    recordedEnemyActions?: Action[];
    /** Every 1–100 roll the warband's turn used, in order, as `RealmArenaAct`'s are recorded. Absent when it rolled nothing. */
    recordedRolls?: number[];
    readonly className = "RealmArenaEndTurn";

    myString() { return "ended their turn"; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRealmArenaGameData;
        const gs = data.specificGameState;
        if (!onTurn(data, this.senderId, "battle")) return INVALID;

        // Only the player's own standing characters, once each: anything else
        // a request named would change nothing, so it isn't kept either.
        const still = Array.isArray(this.keepStill) ? this.keepStill : [];
        this.keepStill = battleOf(gs).fighters
            .filter(fighter => fighter.owner === this.senderId && still.includes(fighter.id))
            .map(fighter => fighter.id);

        const events = applyEndTurn(data, this.senderId, this.keepStill);
        const { roll, used } = recordedRolls(this.recordedRolls, () => randomInt(ROLL_SIDES) + 1);
        const { enemy, started } = handOff(data, this.senderId, { recorded: this.recordedEnemyActions, roll });
        // Always a list in co-op, an empty one when no warband took a turn,
        // so a replay that comes to one never asks the planner.
        if (gs.coop) this.recordedEnemyActions = enemy?.steps.map(step => step.action) ?? [];
        if (used.length > 0) this.recordedRolls = used;
        else delete this.recordedRolls;
        markDirty(gameData);
        return {
            validMove: true,
            turnOver: true,
            events: [...events, ...enemy ? enemyEvents(enemy) : [], ...started],
            recap: { ...enemy ? { enemy } : {}, started },
        } as IRealmArenaOutcome;
    }
}

/** Where a warband's actions come from (§29.8): the ones an End turn recorded, on a replay, or the planner's, live. */
interface WarbandMoves {
    recorded: readonly unknown[] | undefined;
    roll: Roll;
}

/**
 * How long a warband may plan for in one turn before it stops where it is
 * (§29.7): its turn runs inside a player's request. A planned turn takes a
 * quarter of a second; this is a guard, not a budget.
 */
const WARBAND_DEADLINE_MS = 2_000;

/**
 * The next warband's turn in co-op (§29.4), straight after a player's: the
 * first, from `coop.nextWarband` on round, with someone standing. Its turn
 * begins as a player's does (`startTurn`), then it takes one action at a time
 * through `applyAction` — the next recorded one on a replay, otherwise the
 * planner's choice from its side's view — until there's none, or the battle
 * is over, and ends as a player's does, everyone with AP enough on watch.
 *
 * Live, a turn is capped at four actions a character and at a deadline, and
 * an action `check` refuses or a planner that throws ends it there, logged
 * (§29.7): what it did before is kept and recorded, so a replay matches.
 * Undefined in a free-for-all, and when there's no warband left to play.
 */
function warbandTurn(data: IRealmArenaGameData, moves: WarbandMoves): EnemyTurn | undefined {
    const gs = data.specificGameState;
    const coop = gs.coop;
    if (!coop) return undefined;
    const order = data.gameState.turnOrder;
    const count = gs.seats.length;
    const standing = squadsStanding(battleOf(gs), Array.from({ length: count }, (_, k) => warbandOwner(k)));
    const k = Array.from({ length: count }, (_, step) => (coop.nextWarband + step) % count).find(one => standing.includes(warbandOwner(one)));
    if (k === undefined) return undefined;
    const owner = warbandOwner(k);
    gs.coop = { ...coop, nextWarband: (k + 1) % count };

    const turn: EnemyTurn = { owner, started: beginTurn(data, owner), steps: [] };
    const over = () => isBattleOver(battleOf(gs), order, gs.roundsPlayed);
    if (over()) return turn;

    const cap = ACTION_POINTS * battleOf(gs).fighters.filter(fighter => fighter.owner === owner && isStanding(fighter)).length;
    const deadline = Date.now() + WARBAND_DEADLINE_MS;
    for (let step = 0; !over(); step++) {
        if (!moves.recorded && (step === cap || Date.now() > deadline)) break;
        let action: unknown, applied: Applied | undefined;
        // The planner, and any rule an action it chose trips over, can't fail
        // the player's End turn — or wedge the turn timer's, which runs it on
        // every sweep. `applyAction` changes nothing until the action has
        // been worked out, so the battle stands as the last one left it.
        try {
            action = moves.recorded ? moves.recorded[step] : nextAction(viewOf(battleOf(gs), owner), owner, gs.roundsPlayed + 1);
            if (action === undefined) break;
            applied = applyAction(data, owner, action, moves.roll);
        } catch (error) {
            console.error(`Realm Arena game ${data.gameId}: ${owner}'s turn threw, so it ends here`, error);
            break;
        }
        if (!applied) {
            console.warn(`Realm Arena game ${data.gameId}: ${owner}'s ${(action as Partial<Action>)?.kind} was refused, so its turn ends here`);
            break;
        }
        turn.steps.push({ action: applied.action, events: applied.events });
    }
    if (!over()) turn.ended = applyEndTurn(data, owner, []);
    return turn;
}

/**
 * The hand-off after `from` ends their turn: in co-op, the next warband takes
 * its turn (§29.4); then the turn passes to the next seat still playing, which
 * ends the round if it passes back round the table (§13.8), and that seat's
 * turn begins (`startTurn`) — unless the battle is over by then. What burning
 * does as a turn begins is written to the log in a line of its own (§20.3).
 *
 * Burning can wipe out a squad at the start of its own turn. Then the turn
 * passes on again, as it would have past that seat in the first place (B2),
 * and stops where that leaves the battle over. CheckEndTurn hands the turn to
 * the same seat this stops at: `nextSeat` steps past a squad wiped out.
 *
 * Returns the warband's turn, and everything that happened as the next
 * player's turn began.
 */
function handOff(data: IRealmArenaGameData, from: string, moves: WarbandMoves): { enemy?: EnemyTurn; started: BattleEvent[] } {
    const gs = data.specificGameState;
    const order = data.gameState.turnOrder;
    const enemy = isBattleOver(battleOf(gs), order, gs.roundsPlayed) ? undefined : warbandTurn(data, moves);
    const started: BattleEvent[] = [];
    for (let seat = from; ;) {
        const next = nextSeat(data, seat);
        if (order.indexOf(next) <= order.indexOf(seat)) gs.roundsPlayed += 1;
        if (isBattleOver(battleOf(gs), order, gs.roundsPlayed)) return { enemy, started };

        started.push(...beginTurn(data, next));
        if (isBattleOver(battleOf(gs), order, gs.roundsPlayed) || squadsStanding(battleOf(gs), [next]).length > 0) return { enemy, started };
        seat = next;
    }
}

// Free-for-all (docs/games/realm-arena.md §17.4 B2): a player who stops
// turning up has their squad leave the battlefield, and their score stands
// (§4). Their characters are taken off rather than downed, so nobody scores a
// knock-out for them and nobody can raise them, and none of them is left on
// watch; the rotation steps past the seat (`nextSeat`). A duel isn't carried
// on: two seats is `minPlayers`, so dropping one of them abandons the game, as
// it always has.
//
// The undo stack goes too: its snapshots are whole states from before the
// drop, and restoring one would put the squad back.
//
// Only in the battle. A muster is one turn each, so nobody can miss three in
// a row before it's over, and a seat missing from the muster's seat order
// would leave it waiting on them.
registerPlayerDropoutAdapter({
    className: "RealmArenaGameType",
    minPlayers: 2,
    canDrop(gameData) {
        return (gameData as IRealmArenaGameData).specificGameState.phase === "battle";
    },
    dropPlayer(gameData, userId) {
        const gs = (gameData as IRealmArenaGameData).specificGameState;
        gs.fighters = (gs.fighters ?? []).map(storedFighter).filter(fighter => fighter.owner !== userId);
        clearUndo(gs);
    },
});
