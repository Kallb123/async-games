import { rulesetOf, type RulesContext } from "@/games/RealmArena/rulesets";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { commandVersion, type ICommandOutcome, type IGameCommand, type IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { markDirty } from "@/utils/games/markDirty";
import { recordedRolls } from "@/utils/games/recordedRolls";
import { isDropped, nextActivePlayer, registerPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IRealmArenaCoop, IRealmArenaGameData, IRealmArenaSpecificGameState } from "@/games/RealmArena/RealmArenaModels";
import { DIFFICULTY_NAMES, enemyNameOf, factionById, musterBudget, readyMadeSquad, REALM_ONLY, warbandBudget, type Budget, type CharacterId, type FactionId, type OptionId } from "@/games/RealmArena/characters";
import { battlefieldById, battlefieldOf } from "@/games/RealmArena/maps";
import { addTally, NO_TALLY, type Tally } from "@/games/RealmArena/mastery";
import {
    areaDamage,
    abilitiesOf,
    actionPointsOf,
    act,
    allied,
    areaAround,
    armouredTeam,
    battleFrom,
    battleRounds,
    blastedIn,
    check,
    endTurn,
    ENEMY_SIDE,
    fighterById,
    fogGhost,
    isBattleOver,
    isStanding,
    isWarband,
    landedSmoke,
    lastWaveRound,
    maxHpOf,
    musterRefusal,
    nextWaveRound,
    newFighter,
    pickOf,
    readyMadeMuster,
    ROLL_SIDES,
    SCORED_FOR,
    squadSight,
    sideScore,
    sidesStanding,
    squadsStanding,
    standingPoints,
    standings,
    startTurn,
    stoutTeam,
    warbandSteps,
    TEAM_SIDE,
    viewOf,
    storedFighter,
    warbandOwner,
    warbandsFor,
    waveArrives,
    wavesLanded,
    type Action,
    type BattleEvent,
    type BattleState,
    type Fighter,
    type MusterPick,
    type Roll,
} from "@/games/RealmArena/rules";
import { facingTowards, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import { nextAction, turnMemo } from "@/games/RealmArena/ai";
import { playerHistory, tellEveryone, userToken, type IHistoryEntry } from "@/utils/games/history";
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
        rulesVersion: gs.rulesVersion,
        armoured: armouredTeam(gs.coop?.mission, gs.rulesVersion, gs.coop?.enemy),
    });
}

/** Each player's points to muster with (§13.6): the party's, moved by the battle's size (§30.5). */
export function budgetOf(gs: IRealmArenaSpecificGameState): Budget {
    return musterBudget(gs.seats.length, gs.coop !== undefined, gs.size);
}

/** The factions each player may muster from (B6): the host's choice, or the Realm alone in a battle from before it. */
export function playableFactions(gs: IRealmArenaSpecificGameState): readonly FactionId[] {
    return gs.factions ?? REALM_ONLY;
}

/** How many rounds this battle lasts (`battleRounds`): the one length its ending, its waves, its round counter and its record all read. */
export function battleRoundsOf(gs: Pick<IRealmArenaSpecificGameState, "seats" | "coop" | "rulesVersion">): number {
    return battleRounds(gs.seats.length, { mission: gs.coop?.mission, rulesVersion: gs.rulesVersion });
}

/** Each co-op warband's points (§30.5): the players', moved by the difficulty, and in a stout Hold Out (`stoutTeam`) a rung further down. */
export function warbandBudgetOf(gs: IRealmArenaSpecificGameState): Budget {
    return warbandBudget(gs.seats.length, gs.size, gs.coop?.difficulty, warbandSteps(gs.coop?.mission, gs.rulesVersion));
}

/** The squad every warband musters, and each wave refills it to (§29.7, §30.3): its faction's ready-made squad for its budget. */
function warbandSquad(gs: IRealmArenaSpecificGameState): readonly CharacterId[] {
    return readyMadeSquad(factionById(gs.coop?.enemy, gs), warbandBudgetOf(gs));
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
    leap: "abilities",
    slashAndDash: "abilities",
    bulwark: "abilities",
    taunt: "abilities",
    shove: "abilities",
    poisonArrow: "abilities",
    bouncingArrow: "abilities",
    splittingArrow: "abilities",
    shootDodge: "abilities",
    iceBall: "abilities",
    thunder: "abilities",
    focus: "abilities",
    beckon: "abilities",
    blessing: "abilities",
    ward: "abilities",
    runeRaise: "abilities",

    shieldWall: "abilities",
    fireball: "abilities",
    dynamite: "abilities",
    heal: "abilities",
    raise: "abilities",
    shieldBash: "abilities",
    demolish: "abilities",
    cripplingShot: "abilities",
    huntersMark: "abilities",
    purify: "abilities",
    rend: "abilities",
    regrowth: "abilities",
    burst: "abilities",
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
// heal or a Regrowth, a raise, a Purify, a Hunter's mark, a healing draught,
// and a throw or a Demolish that lands on nobody — a smoke pot always does
// (§21.2) — the actions that roll nothing and hurt nobody. A fire flask or a Demolish that
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
const UNDOABLE_KINDS: ReadonlySet<Action["kind"]> = new Set(["move", "sneak", "hunker", "watch", "shieldWall", "heal", "regrowth", "raise", "purify", "huntersMark", "draught", "throw", "demolish", "slashAndDash", "taunt", "focus", "blessing", "ward", "beckon", "leap", "runeRaise"]);

/**
 * What an undoable action may have done: everything but an attack landing, a
 * knock-out or the points for one. A heal, a draught or a Purify clearing an
 * effect is an `effect` event, and so is a mark (§20.3). Cover blasted away
 * hurts nobody (§22). A `thrown` or a `demolished` event is peaceful only when
 * it hit nobody, which `peaceful` checks itself.
 */
const PEACEFUL_EVENTS: ReadonlySet<BattleEvent["kind"]> = new Set(["moved", "healed", "raised", "hunkered", "shieldWall", "watching", "effect", "marked", "blasted", "ability"]);

const UNDO_DEPTHS = new WeakMap<object, number>();

/**
 * How many snapshots the stack keeps, under the battle's own catalogue: a
 * character's whole turn of one-AP moves, for the character with the most AP
 * it could have — its turn's (`actionPointsOf`, every bonus included) and what
 * its abilities add when used (`Ability.bonusAp`), with any option it could be
 * mustered with. A turn spread over the squad can hold more undoable actions
 * than that, which only costs reach — the anchor decides what can be restored.
 */
export function undoDepthOf(context: RulesContext): number {
    const catalogue = rulesetOf(context);
    let depth = UNDO_DEPTHS.get(catalogue);
    if (depth === undefined) {
        const { CHARACTERS, OPTIONS, ABILITIES } = catalogue;
        const options = Object.keys(OPTIONS) as OptionId[];
        const kits = (Object.keys(CHARACTERS) as CharacterId[]).flatMap(character =>
            [undefined, ...options.filter(id => OPTIONS[id]?.character === character)].map(option => ({ character, option })));
        const onUse = (fighter: (typeof kits)[number]) => abilitiesOf(fighter, context).reduce((sum, id) => sum + (ABILITIES[id]?.passive ? 0 : ABILITIES[id]?.bonusAp ?? 0), 0);
        depth = Math.max(...kits.map(fighter => actionPointsOf(fighter, context) + onUse(fighter)));
        UNDO_DEPTHS.set(catalogue, depth);
    }
    return depth;
}

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
 * What an action changes of the battle, and what a viewer's board is drawn
 * from (`gameStateToModel`): the characters, the cover blasted away, where each
 * side last saw the other's, the co-op state a sighting writes to, and the
 * score.
 */
export type RealmArenaBoard = Pick<IRealmArenaSpecificGameState, "fighters" | "blasted" | "sightings" | "coop" | "scores">;

/**
 * The board as plain objects, copied so nothing that happens next reaches it:
 * what the undo stack keeps, and what a warband's turn keeps after each part
 * of it (`EnemyTurn`). The stored fighters may be a Mongoose copy, which
 * `storedFighter` reads back in full.
 */
export function boardOf(gs: RealmArenaBoard): RealmArenaBoard {
    return {
        fighters: (gs.fighters ?? []).map(storedFighter),
        ...(gs.sightings ? { sightings: Object.fromEntries(Object.entries(gs.sightings).map(([viewer, ghosts]) => [viewer, ghosts.map(ghost => ({ ...ghost }))])) } : {}),
        ...(gs.coop ? { coop: { ...gs.coop } } : {}),
        blasted: [...(gs.blasted ?? [])],
        scores: { ...gs.scores },
    };
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
        ...boardOf(gs),
        ...(gs.fog ? { fog: true } : {}),
        ...(gs.size ? { size: gs.size } : {}),
        ...(gs.factions ? { factions: [...gs.factions] } : {}),
        ...(gs.rulesVersion !== undefined ? { rulesVersion: gs.rulesVersion } : {}),
        musters: (gs.musters ?? []).map(({ owner, faction, picks }) => ({ owner, ...(faction ? { faction } : {}), picks: picks.map(pickOf) })),
        // Written once as the battle is created and never changed, so shared.
        mastery: gs.mastery ?? {},
        undoStack: [],
        undoAnchorId: null,
    };
}

/**
 * Pushes a snapshot taken before `command`'s first mutation and moves the
 * anchor onto `command`. Capped at `undoDepthOf` — dropping the oldest only
 * ever costs reach, never correctness.
 */
function commitUndo(gs: IRealmArenaSpecificGameState, command: IGameCommand, before: IRealmArenaSpecificGameState): void {
    gs.undoStack = [...(gs.undoStack ?? []), { by: command.senderId, state: before }].slice(-undoDepthOf(gs));
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
            case "moved": {
                const { via: _via, ...movement } = event;
                return [{ ...movement, sneaking: false }];
            }
            case "ability": return [];
            case "iceBall":
            case "fireball":
            case "dynamite":
            case "demolished":
            case "burst": return event.targets.map(target => ({ kind: "struck", fighter: event.fighter, target, damage: areaDamage(event, target), reaction: false }));
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
export function ownerToken(owner: string, coop: IRealmArenaCoop | undefined, context?: RulesContext): string {
    if (!isWarband(owner)) return userToken(owner);
    return enemyNameOf(coop && enemyKnown(coop) ? coop.enemy : undefined, context);
}

/**
 * How the log names a character: "their Knight", "Bob's Archer" — or, in a
 * line written for a player whose side didn't see it (`seen`, §27.2), "a
 * character out of sight", as the board names one.
 */
function whose(fighters: readonly Fighter[], id: number, actor: string, coop: IRealmArenaCoop | undefined, seen?: (id: number) => boolean, context?: RulesContext): string {
    if (seen && !seen(id)) return "a character out of sight";
    const fighter = fighters.find(one => one.id === id);
    if (!fighter) return "a character";
    const own = fighter.owner === actor;
    if (isWarband(fighter.owner) && !enemyKnown(coop)) return own ? "one of its characters" : "an enemy character";
    const name = rulesetOf(context).CHARACTERS[fighter.character].name;
    return own ? `their ${name}` : `${possessive(ownerToken(fighter.owner, coop, context))} ${name}`;
}

/**
 * What one event says. The acting player's own deeds start with a verb, so
 * they read straight on from the name; anyone else's start with who did it.
 */
function clause(event: BattleEvent, fighters: readonly Fighter[], actor: string, coop: IRealmArenaCoop | undefined, seen?: (id: number) => boolean, context?: RulesContext): string {
    const { ABILITIES, EFFECTS, ITEMS } = rulesetOf(context);
    const name = (id: number) => whose(fighters, id, actor, coop, seen, context);
    // Whom a blast hit, of the characters the line's reader saw (§27.2).
    const hitIn = (targets: readonly number[]) => seen ? targets.filter(seen) : targets;
    const landed = (damage: number, graze: boolean) => damage === 0 ? "a miss" : `${graze ? "a graze" : "a hit"} for ${damage}`;
    const hidden = enemyHidden(coop);
    const warbands = (id: number) => isWarband(fighters.find(one => one.id === id)?.owner ?? "");
    // An effect a hidden enemy left names the weapon it came from — Corroded
    // the Swarm's acid, Burning the Mage's fire — on its turn, or on a
    // teammate it hit on overwatch (§31.3).
    if (hidden && event.kind === "effect" && event.change !== "cleared" && (isWarband(actor) || !warbands(event.fighter))) return `${name(event.fighter)} is afflicted`;
    const veiled = hidden && "fighter" in event && warbands(event.fighter) ? veiledClause(event, name, hitIn) : undefined;
    if (veiled !== undefined) return veiled;
    switch (event.kind) {
        case "ability": return `used ${ABILITIES[event.ability]!.name} with ${name(event.fighter)}`;
        case "moved": return `${event.via ? `moved with ${ABILITIES[event.via]!.name}` : event.sneaking ? "sneaked" : "moved"} ${name(event.fighter)}`;
        case "shot":
            return event.reaction
                ? `${name(event.fighter)} fired on overwatch: ${landed(event.damage, event.result === "graze")}`
                : `shot ${name(event.target)} with ${name(event.fighter)} (${event.chance}%): ${landed(event.damage, event.result === "graze")}`;
        case "struck": {
            // A strike that rolled and missed did no damage: "and missed", as a shot's "a miss".
            const outcome = event.missed ? "and missed" : `for ${event.damage}`;
            return event.reaction
                ? `${name(event.fighter)} struck on guard ${outcome}`
                : `struck ${name(event.target)} with ${name(event.fighter)} ${outcome}`;
        }
        case "fireball":
        case "iceBall":
        case "dynamite":
            return `${ACTION_PHRASES[event.kind]} with ${name(event.fighter)}, hitting ${pluralize(hitIn(event.targets).length, "character")}${event.damages ? "" : ` for ${event.damage}`}`;
        case "downed": return `${name(event.fighter)} is down`;
        case "healed": {
            const hp = event.hp > 0 ? ` for ${event.hp}` : "";
            const self = event.target === event.fighter;
            if (event.via === "draught") return `healed ${name(event.target)} with ${self ? "its" : `${name(event.fighter)}'s`} healing draught${hp}`;
            // A Purify, a Heal or a Regrowth on the healer itself needs no "with" to say so.
            return `${event.via === "purify" ? "purified" : "healed"} ${name(event.target)}${self ? "" : ` with ${name(event.fighter)}`}${hp}`;
        }
        case "thrown": {
            const hit = hitIn(event.targets).length === 0 ? ""
                : `, hitting ${pluralize(hitIn(event.targets).length, "character")}${event.damage > 0 ? ` for ${event.damage}` : ""}`;
            return `threw a ${ITEMS[event.item].name.toLowerCase()} with ${name(event.fighter)}${hit}`;
        }
        case "blasted": return `blasted away ${pluralize(event.squares.length, "square")} of low cover`;
        case "demolished": {
            const hit = hitIn(event.targets).length === 0 ? "" : `, hitting ${pluralize(hitIn(event.targets).length, "character")}${event.damages ? "" : ` for ${event.damage}`}`;
            return `used ${ABILITIES.demolish.name} with ${name(event.fighter)}${hit}`;
        }
        case "marked": return `used ${ABILITIES.huntersMark.name} with ${name(event.fighter)}`;
        case "burst": {
            const hit = hitIn(event.targets).length === 0 ? "" : `, hitting ${pluralize(hitIn(event.targets).length, "character")}${event.damages ? "" : ` for ${event.damage}`}`;
            return `burst ${name(event.fighter)}${hit}`;
        }
        case "raised": return `raised ${name(event.target)} with ${name(event.fighter)}`;
        case "hunkered": return `hunkered ${name(event.fighter)} down`;
        case "shieldWall": return `raised a shield wall with ${name(event.fighter)}`;
        case "watching": return `put ${name(event.fighter)} on watch`;
        case "spotted": return `${name(event.fighter)} found ${name(event.by)} in its way, and went round`;
        case "effect": return `${name(event.fighter)} is ${event.change === "cleared" ? "no longer " : ""}${EFFECTS[event.effect]!.state}`;
        case "burned": return event.effect ? `${name(event.fighter)} took ${event.damage} damage from ${hidden ? "an effect" : EFFECTS[event.effect]!.name}` : `${name(event.fighter)} burned for ${event.damage}`;
        case "scored": {
            const who = event.player === actor ? "scored" : `${ownerToken(event.player, coop, context)} scored`;
            return `${who} ${event.points} for ${SCORED_FOR[event.reason]}`;
        }
    }
}

/**
 * What a hidden enemy's character did (§29.3), where the deed would name its
 * kind: that it moved, or used an ability, never which — an ability is a kind
 * of character's, and a character's kind is its faction. Undefined for
 * anything that says nothing of the kind, told as `clause` tells it.
 */
function veiledClause(event: BattleEvent, name: (id: number) => string, hitIn: (targets: readonly number[]) => readonly number[]): string | undefined {
    const hit = (targets: readonly number[], damage: number) => hitIn(targets).length === 0 ? "" : `, hitting ${pluralize(hitIn(targets).length, "character")} for ${damage}`;
    switch (event.kind) {
        case "moved": return `moved ${name(event.fighter)}`;
        case "fireball":
        case "iceBall":
        case "dynamite":
        case "demolished":
        case "burst": return `used an ability with ${name(event.fighter)}${hit(event.targets, event.damage)}`;
        case "healed": return event.via === "draught" ? undefined : `used an ability on ${name(event.target)} with ${name(event.fighter)}`;
        case "raised": return `used an ability on ${name(event.target)} with ${name(event.fighter)}`;
        case "ability":
        case "marked":
        case "shieldWall": return `used an ability with ${name(event.fighter)}`;
        default: return undefined;
    }
}

/** A move told once, however many times reactions broke it up. */
function narrate(events: readonly BattleEvent[], before: readonly Fighter[], actor: string, coop: IRealmArenaCoop | undefined, seen?: (id: number) => boolean, context?: RulesContext): string {
    return events
        .filter((event, index) => event.kind !== "moved" || events.findIndex(one => one.kind === "moved") === index)
        .map(event => clause(event, before, actor, coop, seen, context))
        .join("; ");
}

/**
 * The history line an owner's deed writes, named by `ownerToken`. A warband's
 * carries no `actorId`: nobody can react to the computer, or be pushed about
 * a reaction from it.
 */
function lineBy(owner: string, text: string, coop: IRealmArenaCoop | undefined, context?: RulesContext): IHistoryEntry {
    return isWarband(owner) ? { text: capitalise(`${ownerToken(owner, coop, context)} ${text}`) } : playerHistory(owner, text);
}

/**
 * What each player was told of a run of events in a battle fought in fog of
 * war (§27.2), by userId: the events their line of the log was written from
 * (`toldTo`) — none for a player who wasn't told the line at all.
 */
export type Told = Record<string, BattleEvent[]>;

/**
 * What each player was told of some events (`toldTo`), read from `battle` —
 * the battle as they left it, which is the current one unless the caller has
 * it already. Only in a battle fought in fog of war (§27); undefined without.
 */
function toldByViewer(data: IRealmArenaGameData, events: readonly BattleEvent[], battle = battleOf(data.specificGameState)): Told | undefined {
    if (!battle.fog) return undefined;
    return Object.fromEntries(data.gameState.turnOrder.map(viewer => [viewer, toldTo(events, battle, viewer)]));
}

/**
 * Writes the line `write` makes of some events to the log — and, in a battle
 * fought in fog of war, the line as each player's side saw them (§27.2):
 * written from only the events they were told (`toldTo`), naming every
 * character they didn't see as one out of sight (`seen`). `write` gives
 * nothing for a player it has nothing to say to, who isn't told the line at
 * all, and nothing at all for no events. Read from the battle as the events
 * left it, as a review reads it. Returns what each player was told, in fog.
 */
function writeLine(
    data: IRealmArenaGameData,
    events: readonly BattleEvent[],
    write: (events: readonly BattleEvent[], seen?: (id: number) => boolean) => IHistoryEntry | undefined,
): Told | undefined {
    const line = write(events);
    if (!line) return undefined;
    const battle = battleOf(data.specificGameState);
    data.gameState.history.unshift(line);
    const told = toldByViewer(data, events, battle);
    if (!told) return undefined;
    line.perViewer = data.gameState.turnOrder.flatMap(viewer => {
        const own = write(told[viewer], witnessed(events, battle, viewer));
        return own ? [{ userId: viewer, text: own.text }] : [];
    });
    return told;
}

/**
 * Notes a random enemy seen (§29.3) once any of its characters is in the
 * team's view: the team shares its sight (§29.1), so any seat's view is the
 * team's. Without fog that's the moment the squads take the field. Run after
 * everything that can change what the team sees, so the line written by the
 * command that showed it is the last to keep the enemy unnamed.
 */
function noteSighting(gs: IRealmArenaSpecificGameState, events: readonly BattleEvent[] = []): void {
    rememberFogSightings(gs, events);
    const coop = gs.coop;
    if (!enemyHidden(coop) || gs.phase !== "battle") return;
    const battle = battleOf(gs);
    // As `viewOf` reads a view, standing or fallen, without building one.
    const seen = squadSight(battle, gs.seats[0]);
    if (!battle.fog || felt(battle, events) || battle.fighters.some(fighter => isWarband(fighter.owner) && seen(fighter.square))) gs.coop = { ...coop!, enemySeen: true };
}

/**
 * Whether the team felt the enemy in these events, seen or not (§29.3, §31.3):
 * one of its characters hurt one of theirs, or one of its own went down. A
 * hit's damage and a knock-out's points each tell one faction from another —
 * a Rend's 6 is no Realm blow — and the victim of one can be downed by it,
 * leaving nobody to see who struck. So either counts as the sighting.
 */
function felt(battle: BattleState, events: readonly BattleEvent[]): boolean {
    const enemy = (id: number) => isWarband(fighterById(battle, id)?.owner ?? "");
    return events.some(event => {
        switch (event.kind) {
            case "shot":
            case "struck": return enemy(event.fighter) && event.damage > 0 && !enemy(event.target);
            case "fireball":
            case "iceBall":
            case "dynamite":
            case "thrown":
            case "demolished":
            case "burst": return enemy(event.fighter) && event.targets.some(target => !enemy(target));
            case "downed": return enemy(event.fighter);
            default: return false;
        }
    });
}

/** Refresh every player's last known enemy positions after the battlefield changes. */
export function rememberFogSightings(gs: IRealmArenaSpecificGameState, events: readonly BattleEvent[] = []): void {
    if (!gs.fog || gs.phase !== "battle") return;
    const battle = battleOf(gs);
    const moved = new Map<number, Square[]>();
    for (const event of events) if (event.kind === "moved") {
        const path = moved.get(event.fighter) ?? [];
        moved.set(event.fighter, [...path, ...event.path.slice(path.at(-1) === event.path[0] ? 1 : 0)]);
    }
    // Only Hold Out's warbands hunt by what they remember (§30.3), so only they keep it.
    const viewers = gs.coop?.mission === "holdOut" ? [...gs.seats, ...warbandsFor(gs.seats)] : gs.seats;
    gs.sightings = Object.fromEntries(viewers.map(viewer => {
        const seen = squadSight(battle, viewer);
        const remembered = new Map((gs.sightings?.[viewer] ?? []).map(ghost => [ghost.id, ghost]));

        // Seeing the remembered square proves that stale marker wrong.
        for (const [id, ghost] of remembered) if (seen(ghost.square)) remembered.delete(id);
        for (const fighter of battle.fighters) {
            if (allied(battle, fighter.owner, viewer)) continue;
            if (seen(fighter.square)) {
                // One seen lying down is down, not somewhere to be looked for.
                if (isStanding(fighter)) remembered.set(fighter.id, fogGhost(fighter));
                else remembered.delete(fighter.id);
                continue;
            }
            // A move may finish out of sight. Remember the first hidden
            // square after its last visible step: where it entered fog, not
            // its now-secret destination, and never a square in sight, where
            // it would stand beside whoever is really there. It faces the
            // step it was seen take into the fog, not any it took after.
            const path = moved.get(fighter.id);
            if (!path) continue;
            let entry: { square: Square; facing: Facing } | undefined;
            for (let index = 1; index < path.length; index++) {
                if (seen(path[index - 1]) && !seen(path[index])) entry = { square: path[index], facing: facingTowards(battle.field, path[index - 1], path[index]) };
            }
            if (entry !== undefined) remembered.set(fighter.id, { ...fogGhost(fighter), ...entry });
        }
        return [viewer, [...remembered.values()]];
    }));
}

// ─── What a viewer is told (§27) ────────────────────────────────────────────

/**
 * Which characters a viewer's side saw take part in a command in a fogged
 * battle (§27): their own side's, anyone on a square it sees as the command
 * left the battle, and anyone whose move crossed one — so an enemy that
 * stepped into sight, or out of it, was seen.
 */
export function witnessed(events: readonly BattleEvent[], battle: BattleState, viewerId: string | null): (id: number) => boolean {
    const seen = squadSight(battle, viewerId);
    const saw = new Set(battle.fighters.filter(fighter => allied(battle, fighter.owner, viewerId) || seen(fighter.square)).map(fighter => fighter.id));
    for (const event of events) if (event.kind === "moved" && event.path.some(seen)) saw.add(event.fighter);
    return id => saw.has(id);
}

/**
 * The events of a command in a fogged battle as one viewer is told them
 * (§27.2) — in their log, their recap and their review. Their own side's
 * doings are theirs in full — an ally's among them, since a side shares its
 * sight (§29.1) — and so is anything done to one of their side, though who
 * did it may be out of sight. Of anyone else, only what the viewer's side saw
 * (`witnessed`): a shot or a blow whose shooter or target it saw, a character
 * it saw going down, healed, marked or on watch. Nothing it didn't see is
 * told at all, not even that it happened. An enemy's move keeps only the
 * squares the viewer's side sees, and only when it ends on one of them: one
 * that ends out of sight is told with no path at all, so the board loses the
 * mover there rather than leaving it where it was last seen. A fireball, a
 * flask or a Demolish is told where the viewer sees some of it land. What's
 * told regardless is what's everyone's: cover blasted away, which is gone for
 * everyone (§22), and points scored, which the scoreboard shows.
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
 * game type can cut the outcome a command returns its sender (`outcomeFor`)
 * and write each player's line of the log (`writeLine`).
 */
export function toldTo(events: readonly BattleEvent[], battle: BattleState, viewerId: string | null, hidden = false): BattleEvent[] {
    const seen = squadSight(battle, viewerId);
    const own = (id: number) => allied(battle, fighterById(battle, id)?.owner, viewerId);
    const saw = witnessed(events, battle, viewerId);
    const told = hidden ? unnamed(events, id => isWarband(fighterById(battle, id)?.owner ?? "")) : events;
    return told.flatMap((event): BattleEvent[] => {
        const keep = (yes: boolean) => yes ? [event] : [];
        switch (event.kind) {
            case "moved": {
                if (own(event.fighter)) return [event];
                if (!saw(event.fighter)) return [];
                const end = event.path.at(-1);
                return [{ ...event, path: end !== undefined && seen(end) ? event.path.filter(seen) : [] }];
            }
            case "fireball":
            case "iceBall":
            case "dynamite":
            case "thrown":
            case "demolished":
                return keep(saw(event.fighter) || event.targets.some(saw) || areaAround(battle.field, event.at).some(seen));
            case "burst":
                return keep(saw(event.fighter) || event.targets.some(saw));
            case "shot":
            case "struck":
            case "healed":
            case "raised":
            case "marked":
                return keep(saw(event.fighter) || saw(event.target));
            case "spotted":
                return keep(saw(event.fighter) || saw(event.by));
            case "downed":
            case "hunkered":
            case "shieldWall":
            case "watching":
            case "ability":
            case "effect":
            case "burned":
                return keep(saw(event.fighter));
            case "blasted":
            case "scored":
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
     * (§29.8). A shot's or a strike's roll stays: it's theirs, or one aimed at them.
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
        if (!battleIsOver(gs)) return false;
        // The fog lifts as the battle ends (§27.1), on the log too.
        tellEveryone(data.gameState);
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
 * `teamloss` (`endAsTeam`), with the final score as its detail — and the
 * difficulty, when it wasn't Normal (§30.5). The fog lifts
 * as the battle ends (§27.1), and a random enemy's faction with it (§29.3), so
 * the final line names it.
 */
function endInCoop(data: IRealmArenaGameData, battle: BattleState, coop: IRealmArenaCoop): void {
    const gs = data.specificGameState;
    const { won, detail } = coop.mission === "holdOut"
        // Only ever asked once the battle is over, which in Hold Out is when it has an ending.
        ? holdOutEnding(gs)!
        : holdTheCentreEnding(data, battle, coop);
    const onDifficulty = coop.difficulty ? `, on ${DIFFICULTY_NAMES[coop.difficulty]}` : "";
    endAsTeam(data, won ? "teamwin" : "teamloss", `The team ${won ? "wins" : "loses"} the battle`, `${detail}${onDifficulty}`);
}

/** How a battle of Hold the Centre has ended (§29.5), once it's over, with its final line written. */
function holdTheCentreEnding(data: IRealmArenaGameData, battle: BattleState, coop: IRealmArenaCoop): { won: boolean; detail: string } {
    const gs = data.specificGameState;
    const warbands = warbandsFor(gs.seats);
    const [team, enemy] = [sideScore(battle, gs.scores, TEAM_SIDE), sideScore(battle, gs.scores, ENEMY_SIDE)];
    const won = !isWarband(standings(battle, [...gs.seats, ...warbands], gs.scores)[0]);
    const foe = enemyNameOf(coop.enemy, gs);
    data.gameState.history.unshift({
        text: `The battle is over: the team ${pluralize(team, "point")} (${gs.seats.map(userId => `${userToken(userId)} ${gs.scores[userId] ?? 0}`).join(", ")}), ${foe} ${enemy}`,
    });
    // Level scores went to whoever had more left standing, then to the enemy.
    const detail = team !== enemy ? `${pluralize(team, "point")} to ${enemy}`
        : `${pluralize(team, "point")} each, ${standingPoints(battle, TEAM_SIDE) > standingPoints(battle, ENEMY_SIDE)
            ? "with more of the team left standing" : "and the enemy held the field"}`;
    return { won, detail };
}

/** Whether the battle is over (§5.1). Hold Out goes on through an enemy wiped out between waves (§30.3). */
function battleIsOver(gs: IRealmArenaSpecificGameState): boolean {
    if (gs.coop?.mission !== "holdOut") return isBattleOver(battleOf(gs), gs.seats, gs.roundsPlayed, { mission: gs.coop?.mission, rulesVersion: gs.rulesVersion });
    return holdOutEnding(gs) !== undefined;
}

/**
 * How a battle of Hold Out has ended, if it has (§30.3): lost the moment
 * nobody of the team is standing; won once the last round is played, or once
 * the last wave has landed and nobody of the enemy is standing.
 */
function holdOutEnding(gs: IRealmArenaSpecificGameState): { won: boolean; detail: string } | undefined {
    const rounds = battleRoundsOf(gs);
    const standing = sidesStanding(battleOf(gs));
    const round = Math.min(gs.roundsPlayed + 1, rounds);
    if (!standing.includes(TEAM_SIDE)) return { won: false, detail: `overrun in round ${round}` };
    if (gs.roundsPlayed >= rounds) return { won: true, detail: `held out for all ${rounds} rounds` };
    if (round >= lastWaveRound(rounds) && !standing.includes(ENEMY_SIDE)) return { won: true, detail: `beat the last wave in round ${round}` };
    return undefined;
}

/**
 * The command version from which every Hold Out wave is a character bigger
 * than the last (§30.10): an End turn played before it lands a wave that only
 * refills each warband to its squad, on a replay too. Never moves once
 * shipped: later versions keep growing waves.
 */
const GROWING_WAVES_VERSION = 5;

/**
 * The strength a warband is brought up to by the wave landing as `round`
 * begins (§30.3, §30.10): its squad, and one character more for every wave
 * landed so far — the squad's own characters again, in its order, the first
 * after the last. So a wave always has someone to bring, however few of the
 * enemy the team has downed. `growing` false is the squad alone, as every
 * wave before growing waves was.
 */
export function waveStrength(squad: readonly CharacterId[], round: number, growing = true): CharacterId[] {
    const extra = growing && squad.length > 0 ? wavesLanded(round) : 0;
    return [...squad, ...Array.from({ length: extra }, (_, k) => squad[k % squad.length])];
}

/**
 * The reinforcements one warband can place in its deployment zone in the wave
 * landing as `round` begins: the one landing now, unless told otherwise.
 */
export function waveOf(gs: IRealmArenaSpecificGameState, owner: string, growing: boolean, round = gs.roundsPlayed + 1): Fighter[] {
    if (gs.coop?.mission !== "holdOut") return [];
    const warband = warbandsFor(gs.seats).indexOf(owner);
    if (warband < 0) return [];
    const field = battlefieldById(gs.map);
    const planned = readyMadeMuster(field, gs.seats.length + warband, waveStrength(warbandSquad(gs), round, growing));
    const missing = [...planned];
    for (const fighter of gs.fighters.filter(one => one.owner === owner && isStanding(one))) {
        const index = missing.findIndex(pick => pick.character === fighter.character);
        if (index >= 0) missing.splice(index, 1);
    }
    const occupied = new Set(gs.fighters.filter(isStanding).map(fighter => fighter.square));
    const preferred = planned.map(pick => pick.square);
    const zone = [...preferred, ...field.deployments[gs.seats.length + warband].filter(square => !preferred.includes(square))]
        .filter(square => !occupied.has(square));
    let nextId = Math.max(-1, ...gs.fighters.map(fighter => fighter.id)) + 1;
    return missing.slice(0, zone.length).map((pick, index) => newFighter(nextId++, owner, pick.character, zone[index], pick.item ?? null, pick.option, undefined, gs));
}

/**
 * The command version from which the team rallies as each Hold Out wave lands
 * (§30.11): every character of it still standing regains half its HP, rounded
 * down. An End turn played before it lands a wave that heals nobody, on a
 * replay too. Never moves once shipped.
 */
const RALLYING_VERSION = 6;

/** What the team's characters standing as a wave lands regain (§30.11): half their HP, rounded down, never past full. */
function rally(gs: IRealmArenaSpecificGameState): void {
    for (const fighter of gs.fighters) {
        if (isWarband(fighter.owner) || !isStanding(fighter)) continue;
        const full = maxHpOf(fighter, gs);
        fighter.hp = Math.min(full, fighter.hp + Math.floor(full / 2));
    }
}

/** The wave due as the round `roundsPlayed` has just reached begins, if one is (§30.3). `version` is the End turn's that lands it. */
function landWave(data: IRealmArenaGameData, version: number): void {
    const gs = data.specificGameState;
    if (gs.coop?.mission !== "holdOut" || !waveArrives(gs.roundsPlayed + 1, battleRoundsOf(gs))) return;
    for (const owner of warbandsFor(gs.seats)) {
        const fresh = waveOf(gs, owner, version >= GROWING_WAVES_VERSION);
        if (fresh.length === 0) continue;
        gs.fighters.push(...fresh);
    }
    // The scheduled wave is public even when every deployment square is
    // blocked; its line must not reveal which hidden warbands found room.
    data.gameState.history.unshift({ text: `A fresh wave of ${enemyNameOf(enemyKnown(gs.coop) ? gs.coop.enemy : undefined, gs)} arrives` });
    if (version >= RALLYING_VERSION) {
        rally(gs);
        data.gameState.history.unshift({ text: "The team rallies: everyone standing regains half their HP" });
    }
    noteSighting(gs);
}

/**
 * The next Hold Out wave as the team is told of it (§30.11): the round it
 * lands in, and how many of the enemy it would bring if it landed now — the
 * whole battlefield in sight. In fog of war the team can't count who is down
 * or where there's room, so it's told only how many it brings at most, and
 * nothing at all while a random enemy is unseen: its size would name the
 * faction. Undefined outside Hold Out's battle, and once the last has landed.
 */
export function nextWaveOf(gs: IRealmArenaSpecificGameState): { round: number; arriving?: number; upTo?: true } | undefined {
    if (gs.coop?.mission !== "holdOut" || gs.phase !== "battle") return undefined;
    const rounds = battleRoundsOf(gs);
    const round = nextWaveRound(gs.roundsPlayed + 1, rounds);
    if (round === undefined) return undefined;
    if (enemyHidden(gs.coop)) return { round };
    // Growing: every End turn played from here on is the current version's.
    // A count the placement can't work out costs the line its count, never
    // the board its response.
    if (!gs.fog) {
        try {
            return { round, arriving: warbandsFor(gs.seats).reduce((sum, owner) => sum + waveOf(gs, owner, true, round).length, 0) };
        } catch (error) {
            console.error("Realm Arena: the next wave couldn't be counted", error);
            return { round };
        }
    }
    return { round, arriving: warbandsFor(gs.seats).length * waveStrength(warbandSquad(gs), round).length, upTo: true };
}

// ─── Commands ───────────────────────────────────────────────────────────────

/**
 * The outcome of a turn ending, a muster or an End turn. Solo (§30.6) has one
 * seat, so the turn comes straight back to the player who ended it: that's no
 * hand-off, so nobody is pushed "your move" a moment after their own, but the
 * turn is still over for the clock and for the achievements judged as one ends
 * (`timerRestarts`), as in Fires Out's solitaire mode.
 */
function turnEnded(gs: IRealmArenaSpecificGameState): ICommandOutcome {
    return { validMove: true, turnOver: gs.seats.length > 1, timerRestarts: true };
}

/** The squad, and where each character stands (§17.2). Sealed until every player has mustered. */
@serializable
export class RealmArenaMuster implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    picks: MusterPick[] = [];
    /** The faction the squad is mustered from (B6): one the host allowed. The battle's first when absent, as every muster before the choice was. */
    faction?: FactionId;
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
        // From a faction the host allowed (B6), and held to its roster (§29.3)
        // and the ranks the battle was created with, never to anything sent (§23.3).
        const allowed = playableFactions(gs);
        const faction = this.faction ?? allowed[0];
        if (!allowed.includes(faction)) return INVALID;
        const ranks = gs.mastery?.[this.senderId] ?? {};
        if (musterRefusal(field, seat, this.picks, budgetOf(gs), ranks, rulesetOf(gs).FACTIONS[faction], gs) !== undefined) return INVALID;

        // Exactly what was checked, and nothing else a request carried.
        this.picks = this.picks.map(pickOf);
        this.faction = faction;
        musters.push({ owner: this.senderId, faction, picks: this.picks });
        gs.musters = musters;
        data.gameState.history.unshift(playerHistory(this.senderId, this.myString()));

        if (musters.length === order.length) {
            // In co-op the warbands muster last, each the enemy's ready-made
            // squad for the difficulty in the zone opposite its player's (§29.7, §30.5).
            if (gs.coop) {
                const squad = warbandSquad(gs);
                musters.push(...order.map((_, k) => ({ owner: warbandOwner(k), picks: readyMadeMuster(field, order.length + k, squad) })));
            }
            // Every squad joins the battlefield at once, ids in seat order, the warbands' last.
            // In a stout Hold Out the team's characters have more HP than their
            // character's (`stoutTeam`); the warbands' keep theirs.
            const stout = stoutTeam(gs.coop?.mission, gs.rulesVersion);
            gs.fighters = musters.flatMap(({ owner, picks }) => picks.map(pick => ({ owner, pick })))
                .map(({ owner, pick }, id) => newFighter(id, owner, pick.character, pick.square, pick.item ?? null, pick.option, stout && !isWarband(owner), gs));
            gs.musters = [];
            gs.phase = "battle";
            data.gameState.history.unshift({ text: "The squads take the field, and the battle begins" });
            // The first seat's turn begins. Nobody has an effect yet, so
            // nothing happens but fresh AP.
            gs.fighters = startTurn(battleOf(gs), order[0]).fighters;
            noteSighting(gs);
        }
        markDirty(gameData);
        return turnEnded(gs);
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
     * What the recap's rows need beyond `events`: an End turn's parts (§29.9)
     * — in co-op the warband's turn it held (§29.4), step by step, and what
     * happened as the next turn began, burning (§20.2), their events in
     * `events` too — and, in fog of war, what each player was told of it all
     * (§27.2). Never sent: `outcomeFor` leaves it out of a command's own
     * response, and a review reads only `events`.
     */
    recap?: {
        enemy?: EnemyTurn;
        /**
         * The warbands' turns after `enemy`'s, when they take their turns in a
         * block (`IRealmArenaCoop.teamBlocks`, §29.4): one End turn plays them
         * all. Absent when there is only the one.
         */
        thenEnemy?: EnemyTurn[];
        started?: BattleEvent[];
        /** In fog, what each player was told of what happened as the next turn began (§27.2). */
        startedTold?: Told;
        /**
         * In fog, what each player was told of an action (§27.2): the events
         * its line of the log for them was written from. On an End turn in
         * co-op, of the player's own End turn alone, before the warband's.
         */
        told?: Told;
    };
}

/** One of a warband's actions, as it was checked, what it did, and in fog what each player was told of it. */
export interface EnemyStep {
    action: Action;
    events: BattleEvent[];
    told?: Told;
    /**
     * The board as the action left it, for a review that plays the turn one
     * action at a time. Taken as it's played, never stored, and never sent as
     * it is: each viewer's is drawn from it (`stepOutcomeToModel`).
     */
    after?: RealmArenaBoard;
}

/**
 * A warband's turn, as it was played (§29.4): what burning did as it began,
 * each action it took, and what its End turn did — absent when the battle
 * was over before it came to one. Each part that happened wrote the log a
 * line of its own, in that order: the burning only when there was some, one
 * line an action, and one for the End turn — in fog, the burning and each
 * action only for the players told of it (§27.2).
 */
export interface EnemyTurn {
    owner: string;
    started: BattleEvent[];
    /** In fog, what each player was told of the burning as it began (§27.2). */
    startedTold?: Told;
    /** The board once the burning had done what it did, as `EnemyStep.after` is the board after an action. */
    startedAfter?: RealmArenaBoard;
    steps: EnemyStep[];
    ended?: BattleEvent[];
    /** In fog, what each player was told of the End turn (§27.2): the centre it scored, and any warband going on watch in their sight. */
    endedTold?: Told;
}

/** Everything that happened in a warband's turn, in order. */
export const enemyEvents = (turn: EnemyTurn): BattleEvent[] => [...turn.started, ...turn.steps.flatMap(step => step.events), ...turn.ended ?? []];

/** Every warband turn an End turn played, in order: one, or in a block (§29.4) as many as were standing. */
export const enemyTurnsOf = (recap: Pick<NonNullable<IRealmArenaOutcome["recap"]>, "enemy" | "thenEnemy"> | undefined): EnemyTurn[] =>
    recap?.enemy ? [recap.enemy, ...recap.thenEnemy ?? []] : [];

const ACTION_PHRASES: Readonly<Record<Action["kind"], string>> = {
    move: "moved",
    sneak: "sneaked",
    attack: "attacked",
    aimedShot: "took an aimed shot",
    hunker: "hunkered down",
    watch: "went on watch",
    shieldWall: "raised a shield wall",
    cleave: "cleaved",
    leap: "leapt",
    slashAndDash: "used Slash and Dash",
    bulwark: "used Bulwark",
    taunt: "used Taunt",
    shove: "used Shove",
    poisonArrow: "fired a Poison Arrow",
    bouncingArrow: "fired a Bouncing Arrow",
    splittingArrow: "fired a Splitting Arrow",
    shootDodge: "used Shoot + Dodge",
    iceBall: "cast Ice Ball",
    thunder: "cast Thunder",
    focus: "used Focus",
    beckon: "used Beckon",
    blessing: "used Blessing",
    ward: "used Ward",
    runeRaise: "raised a fallen ally",

    fireball: "threw a fireball",
    dynamite: "threw dynamite",
    heal: "healed an ally",
    raise: "raised a fallen ally",
    throw: "threw an item",
    draught: "used a healing draught",
    shieldBash: "used Shield bash",
    demolish: "used Demolish",
    cripplingShot: "took a crippling shot",
    huntersMark: "used Hunter's mark",
    purify: "used Purify",
    rend: "used Rend",
    regrowth: "used Regrowth",
    burst: "used Burst",
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
        case "huntersMark":
        case "rend":
        case "shove":
        case "poisonArrow":
        case "bouncingArrow":
        case "thunder":
        case "beckon":
        case "ward":
        case "runeRaise":
        case "regrowth": return { kind: action.kind, fighter: action.fighter, target: action.target };
        case "hunker":
        case "watch":
        case "shieldWall":
        case "purify":
        case "slashAndDash":
        case "bulwark":
        case "taunt":
        case "focus":
        case "blessing":
        case "burst": return { kind: action.kind, fighter: action.fighter };
        case "shootDodge": return { kind: action.kind, fighter: action.fighter, target: action.target, path: [...action.path] };
        case "splittingArrow":
        case "cleave": return { kind: action.kind, fighter: action.fighter, targets: [...action.targets] };
        case "fireball":
        case "iceBall":
        case "dynamite":
        case "throw":
        case "leap":
        case "demolish": return { kind: action.kind, fighter: action.fighter, at: action.at };
    }
}

/** What `applyAction` did: the action as it was checked, what happened, the battle before it, and in fog what each player was told of it. */
interface Applied {
    action: Action;
    events: BattleEvent[];
    before: BattleState;
    told?: Told;
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
    const told = writeLine(data, events, (said, seen) => said.length === 0 ? undefined : lineBy(owner, narrate(said, before.fighters, owner, gs.coop, seen, gs), gs.coop, gs));
    noteSighting(gs, events);
    return { action, events, before, told };
}

/**
 * The start of `owner`'s turn, a player's or a warband's: fresh AP, and
 * burning, which can down a character (§20.2) — told in a line of its own
 * (§20.3). Returns what happened, and in fog what each player was told of it.
 */
function beginTurn(data: IRealmArenaGameData, owner: string): { events: BattleEvent[]; told?: Told } {
    const gs = data.specificGameState;
    const battle = battleOf(gs);
    const { fighters, events } = startTurn(battle, owner);
    gs.fighters = fighters;
    addScores(gs, events);
    const told = writeLine(data, events, (said, seen) => said.length === 0 ? undefined : { text: capitalise(narrate(said, battle.fighters, "", gs.coop, seen, gs)) });
    noteSighting(gs);
    return { events, told };
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
    // Told to everyone, whatever they saw of it: that a turn ended is no secret.
    writeLine(data, events, (said, seen) => lineBy(owner, ["ended their turn", ...said.map(event => clause(event, battle.fighters, owner, gs.coop, seen, gs))].join("; "), gs.coop, gs));
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
        return { validMove: true, turnOver: false, events, recap: { told: applied.told } } as IRealmArenaOutcome;
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
        // In fog, told to whoever was told the move it takes back, and nobody
        // else: to them, there was no move to take back (§27.2).
        const line = playerHistory(this.senderId, this.myString());
        const undone = data.gameState.history.find(entry => entry.commandId === lastCommand.id)?.perViewer;
        if (undone) line.perViewer = undone.map(({ userId }) => ({ userId, text: line.text }));
        data.gameState.history.unshift(line);
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
    /**
     * The actions of the warbands' turns after the first, when they take their
     * turns in a block (`IRealmArenaCoop.teamBlocks`, §29.4), one list a turn.
     * Absent when one warband took a turn or none did.
     */
    recordedMoreEnemyActions?: Action[][];
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
        // What each player was told of it, read from the battle as it left it,
        // before the warband's turn that follows changes it (§29.9).
        const told = gs.coop ? toldByViewer(data, events) : undefined;
        const { roll, used } = recordedRolls(this.recordedRolls, () => randomInt(ROLL_SIDES) + 1);
        const recorded = this.recordedEnemyActions ? [this.recordedEnemyActions, ...Array.isArray(this.recordedMoreEnemyActions) ? this.recordedMoreEnemyActions : []] : undefined;
        const { enemy: turns, started, startedTold } = handOff(data, this.senderId, { recorded, roll }, commandVersion(this));
        const [enemy, ...thenEnemy] = turns;
        // Always a list in co-op, an empty one when no warband took a turn,
        // so a replay that comes to one never asks the planner.
        if (gs.coop) this.recordedEnemyActions = enemy?.steps.map(step => step.action) ?? [];
        if (thenEnemy.length > 0) this.recordedMoreEnemyActions = thenEnemy.map(turn => turn.steps.map(step => step.action));
        else delete this.recordedMoreEnemyActions;
        if (used.length > 0) this.recordedRolls = used;
        else delete this.recordedRolls;
        // Here as well as in CheckEndTurn, which a solo battle never reaches
        // (§30.6): an undo across the warband's turn would undo the warband's turn.
        clearUndo(gs);
        markDirty(gameData);
        return {
            ...turnEnded(gs),
            events: [...events, ...turns.flatMap(enemyEvents), ...started],
            recap: { enemy, ...thenEnemy.length > 0 ? { thenEnemy } : {}, started, startedTold, told },
        } as IRealmArenaOutcome;
    }
}

/** Where a warband's actions come from (§29.8): the ones an End turn recorded, on a replay, or the planner's, live. */
interface WarbandMoves {
    /** The actions each warband turn of this End turn took, in order, on a replay; undefined live. */
    recorded: readonly (readonly unknown[])[] | undefined;
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
 * Undefined in a free-for-all, and when there's no warband left to play. A
 * block of turns (`IRealmArenaCoop.teamBlocks`) names the warband (`only`),
 * and gets nothing if that one has been wiped out.
 */
function warbandTurn(data: IRealmArenaGameData, moves: { recorded: readonly unknown[] | undefined; roll: Roll }, only?: number): EnemyTurn | undefined {
    const gs = data.specificGameState;
    const coop = gs.coop;
    if (!coop) return undefined;
    const count = gs.seats.length;
    const standing = squadsStanding(battleOf(gs), Array.from({ length: count }, (_, k) => warbandOwner(k)));
    const k = only !== undefined
        ? (standing.includes(warbandOwner(only)) ? only : undefined)
        : Array.from({ length: count }, (_, step) => (coop.nextWarband + step) % count).find(one => standing.includes(warbandOwner(one)));
    if (k === undefined) return undefined;
    const owner = warbandOwner(k);
    gs.coop = { ...coop, nextWarband: (k + 1) % count };

    const { events: started, told: startedTold } = beginTurn(data, owner);
    const turn: EnemyTurn = { owner, started, startedTold, startedAfter: boardOf(gs), steps: [] };
    const over = () => battleIsOver(gs);
    if (over()) return turn;

    const cap = battleOf(gs).fighters.filter(fighter => fighter.owner === owner && isStanding(fighter)).reduce((sum, fighter) => sum + actionPointsOf(fighter, gs), 0);
    const deadline = Date.now() + WARBAND_DEADLINE_MS;
    const memo = turnMemo();
    for (let step = 0; !over(); step++) {
        if (!moves.recorded && (step === cap || Date.now() > deadline)) break;
        let action: unknown, applied: Applied | undefined;
        // The planner, and any rule an action it chose trips over, can't fail
        // the player's End turn — or wedge the turn timer's, which runs it on
        // every sweep. `applyAction` changes nothing until the action has
        // been worked out, so the battle stands as the last one left it.
        try {
            action = moves.recorded ? moves.recorded[step] : nextAction(
                viewOf(battleOf(gs), owner), owner, gs.roundsPlayed + 1,
                gs.coop?.mission === "holdOut" ? gs.sightings?.[owner] ?? [] : undefined, memo,
            );
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
        turn.steps.push({ action: applied.action, events: applied.events, told: applied.told, after: boardOf(gs) });
    }
    if (!over()) {
        turn.ended = applyEndTurn(data, owner, []);
        turn.endedTold = toldByViewer(data, turn.ended);
    }
    return turn;
}

/**
 * Every warband still standing, one turn each in order, as a block (§29.4,
 * `IRealmArenaCoop.teamBlocks`): it stops where a turn leaves the battle over.
 * A replay's turns come from `moves.recorded`, in the order they were played.
 */
function warbandBlock(data: IRealmArenaGameData, moves: WarbandMoves): EnemyTurn[] {
    const gs = data.specificGameState;
    const turns: EnemyTurn[] = [];
    for (let k = 0; k < gs.seats.length && !battleIsOver(gs); k++) {
        const turn = warbandTurn(data, { recorded: moves.recorded && (moves.recorded[turns.length] ?? []), roll: moves.roll }, k);
        if (turn) turns.push(turn);
    }
    return turns;
}

/**
 * The hand-off after `from` ends their turn: in co-op, the next warband takes
 * its turn (§29.4) — or, when they take their turns in a block, every warband
 * does once the last player has gone, before the round turns over — then the turn passes to the next seat still playing, which
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
function handOff(data: IRealmArenaGameData, from: string, moves: WarbandMoves, version: number): { enemy: EnemyTurn[]; started: BattleEvent[]; startedTold?: Told } {
    const gs = data.specificGameState;
    const order = data.gameState.turnOrder;
    const blocks = gs.coop?.teamBlocks === true;
    const enemy: EnemyTurn[] = [];
    if (!blocks && !battleIsOver(gs)) {
        const turn = warbandTurn(data, { recorded: moves.recorded?.[0], roll: moves.roll });
        if (turn) enemy.push(turn);
    }
    const started: BattleEvent[] = [];
    // In fog, what each player was told of it all, line by line (§27.2).
    const startedTold: Told | undefined = gs.fog ? Object.fromEntries(order.map(viewer => [viewer, []])) : undefined;
    for (let seat = from; ;) {
        let next = nextSeat(data, seat);
        const wraps = () => order.indexOf(next) <= order.indexOf(seat);
        // The block follows the last player to go, whether that player ended
        // their turn or was burned out at the start of it, and the next seat
        // is then worked out again: a warband may have wiped a squad out.
        if (blocks && wraps() && !battleIsOver(gs)) {
            enemy.push(...warbandBlock(data, moves));
            next = nextSeat(data, seat);
        }
        if (wraps()) {
            gs.roundsPlayed += 1;
            landWave(data, version);
        }
        if (battleIsOver(gs)) return { enemy, started, startedTold };

        const { events, told } = beginTurn(data, next);
        started.push(...events);
        for (const viewer of order) startedTold?.[viewer].push(...told?.[viewer] ?? []);
        if (battleIsOver(gs) || squadsStanding(battleOf(gs), [next]).length > 0) return { enemy, started, startedTold };
        seat = next;
    }
}

// Free-for-all (docs/games/realm-arena.md §17.4 B2): a player who stops
// turning up has their squad leave the battlefield, and their score stands
// (§4). Their characters are taken off rather than downed, so nobody scores a
// knock-out for them and nobody can raise them, and none of them is left on
// watch; the rotation steps past the seat (`nextSeat`). Nor does the player
// score an assist for a character their squad hurt before it left (§13.7). A duel isn't carried
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
        for (const fighter of gs.fighters) {
            if (!fighter.woundedBy) continue;
            fighter.woundedBy = fighter.woundedBy.filter(owner => owner !== userId);
            if (fighter.woundedBy.length === 0) delete fighter.woundedBy;
        }
        clearUndo(gs);
    },
});
