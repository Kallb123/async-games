// Realm Arena's computer player (docs/games/realm-arena.md §29.7): how a
// warband chooses what to do next in co-op, one action at a time.
//
// **A player's rules, view and dice.** It's handed the battle as its side sees
// it (`viewOf`) and nothing else, so in fog it knows only what its warbands
// see. Every action it lists is one `check` allows, and every action it judges
// is played out with `act`, so it can do nothing a player couldn't. It rolls
// nothing: it weighs a shot by its odds, and the command that takes the action
// rolls for it as for a player (§17.2).
//
// **One action, then plan again.** `nextAction` picks the single best action
// for the warband now — or none, when nothing beats stopping — and the turn
// loop takes it, sees what happened and asks again. A move is worth what the
// square lets the character do next, so it moves to a firing position and,
// asked again from there, fires.
//
// **Judged by one score.** Each action is played out on a copy of the battle,
// and the battle that results is scored from the warband's side: the points
// it's made, the strength of each side, how exposed its characters stand, the
// damage they threaten and how near the centre they are. Nothing here is
// written for one character, ability or faction: a Cleric heals because a
// healthier side scores higher, and a Mage holds a fireball that would catch
// its own because the damage to them costs more than the damage to the enemy
// earns.
//
// **Deterministic.** It draws no random number, and ties go to the lower
// fighter id, then the lower square: the same view always gets the same
// action. A battle replays the actions it recorded rather than asking it
// again, so it can be improved without changing a battle already fought.
//
// Pure and browser-safe, like rules.ts.

import { DEFAULT_CLIMB, reachFrom, pathTo } from "@/utils/games/battlefield/pathfinding";
import { battlefieldWith, coordsOf, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, type AbilityId } from "./characters";
import {
    abilitiesOf, act, allied, areaAround, ATTACK_AP, blastedIn, CENTRE, CENTRE_SCORES_FROM_ROUND, centrePoints, check, fighterById, isStanding,
    moveAp, movementOf, reachOf, ROLL_SIDES, shotOdds, watchedSquares, weaponOf, weaponReaches,
    type Action, type BattleEvent, type BattleState, type Fighter,
} from "./rules";
import { ACTION_AIMS, rangeSquares, reactionPreviews, shotOf, standingAt, targetsOf, type ActionKind, type TargetKind } from "./tactics";

/**
 * What each term of a battle's score is worth (§29.7): the same for every
 * character, whose weapon already says how it fights. Strength is counted in
 * points' worth, so the rest are weighed against a character's cost.
 */
const WEIGHTS = {
    /** Each point its side scores, less each the team does: a knock-out, and the centre at the end of the turn. */
    points: 1,
    /** Each point's worth standing on its side, less the team's, scaled by the HP each has left. */
    strength: 1,
    /** Each point's worth of its characters that the enemy could take off them next turn. */
    exposure: 0.5,
    /** Each point's worth of the enemy that its characters could take off them from where they stand. */
    threat: 0.5,
    /** Each AP of walking between its characters and the centre, once the centre scores. */
    objective: 1,
};

/** How much of its Threat a character with no attack left this turn still counts: where it stands, it covers the ground. */
const SPENT_THREAT = 0.25;

/** How many of a character's reachable squares are played out as moves: the best by `standingTerms`, which is quicker. */
const MOVES_PLAYED_OUT = 12;

/** What an action has to gain over stopping to be worth taking, so rounding never sends a pointless move. */
const LEAST_GAIN = 1e-6;

/** What a warband plans with: its side's view, whose turn it is, and the round. */
interface Plan {
    /** The view it was handed. */
    state: BattleState;
    owner: string;
    round: number;
    /** How far a character stands from the centre, in movement points. */
    toCentre: (fighter: Fighter) => number;
}

/**
 * The warband's next action: the one whose played-out battle scores best, or
 * undefined when nothing scores better than stopping — which ends its turn.
 * `view` is the battle as `owner`'s side sees it (`viewOf`), and `round` the
 * battle round, counted from 1. Never anything `check` refuses.
 */
export function nextAction(view: BattleState, owner: string, round: number): Action | undefined {
    const plan = planFor(view, owner, round);
    let best: Action | undefined;
    let bestScore = score(plan, plan.state, []) + LEAST_GAIN;
    const ready = plan.state.fighters.filter(fighter => fighter.owner === owner && isStanding(fighter) && fighter.ap > 0).sort((a, b) => a.id - b.id);
    for (const fighter of ready) {
        for (const action of optionsFor(plan, fighter)) {
            const value = judge(plan, action);
            if (value > bestScore) {
                best = action;
                bestScore = value;
            }
        }
    }
    return best;
}

function planFor(view: BattleState, owner: string, round: number): Plan {
    // A view is already only what its side can see, and seeing it again
    // changes nothing (`viewOf`): dropping the fog spares every `check` the
    // planner asks from working that out again. It adds nothing it didn't see.
    const { fog: _fog, ...state } = view;
    const { field } = state;
    const centre = new Set(field.objectives[CENTRE] ?? []);
    const toCentre = (fighter: Fighter): number => {
        if (centre.size === 0 || centre.has(fighter.square)) return 0;
        const cost = centreWalk(field, CHARACTERS[fighter.character].climb ?? DEFAULT_CLIMB)[fighter.square];
        return Number.isFinite(cost) ? cost : field.width + field.height;
    };
    return { state, owner, round, toCentre };
}

/**
 * The walk from the middle of a battlefield's centre to every square of it,
 * for a character that climbs this far, by battlefield: the same for every
 * plan on it, and a search of the whole map, so it's made once. Walked out
 * from the centre rather than in to it, which is near enough: a step costs
 * what the square it lands on does.
 */
const CENTRE_WALKS = new WeakMap<Battlefield, Map<number, Float64Array>>();

function centreWalk(field: Battlefield, climb: number): Float64Array {
    const walks = CENTRE_WALKS.get(field) ?? new Map<number, Float64Array>();
    CENTRE_WALKS.set(field, walks);
    let costs = walks.get(climb);
    if (!costs) {
        const goal = middleOf(field, field.objectives[CENTRE] ?? []);
        costs = goal === undefined ? new Float64Array(field.tiles.length) : reachFrom(field, goal, Infinity, { climb }).costs;
        walks.set(climb, costs);
    }
    return costs;
}

/** The square of an area nearest its middle that a character could stand on, or undefined for an area with none. */
function middleOf(field: Battlefield, area: readonly Square[]): Square | undefined {
    const coords = area.map(square => coordsOf(field, square));
    const col = coords.reduce((total, at) => total + at.col, 0) / coords.length;
    const row = coords.reduce((total, at) => total + at.row, 0) / coords.length;
    const away = (square: Square) => {
        const at = coordsOf(field, square);
        return (at.col - col) ** 2 + (at.row - row) ** 2;
    };
    return area.filter(square => field.tiles[square].terrain.standable).sort((a, b) => away(a) - away(b) || a - b)[0];
}

// ─── What it could do ───────────────────────────────────────────────────────

/**
 * Every single action a character could take now (§29.7), by what each kind
 * is aimed at (`ACTION_AIMS`), that `check` allows: each enemy or ally it
 * could be aimed at, each square with someone in reach of it, the best dozen
 * squares it could move to, and what goes at once. In `ACTION_AIMS` order,
 * then by target or square.
 */
function optionsFor(plan: Plan, fighter: Fighter): Action[] {
    const { state, owner } = plan;
    return (Object.keys(ACTION_AIMS) as ActionKind[]).flatMap((kind): Action[] => {
        if (Object.hasOwn(ABILITIES, kind) && !abilitiesOf(fighter).includes(kind as AbilityId)) return [];
        const aim = ACTION_AIMS[kind];
        const allowed = (actions: Action[]) => actions.filter(action => !("refused" in check(state, owner, action)));
        switch (aim.at) {
            case "path":
                return movesFor(plan, fighter, kind as "move" | "sneak");
            case "self":
                return allowed([{ kind, fighter: fighter.id } as Action]);
            case "enemy":
            case "ally":
                return targetsOf(state, owner, fighter, kind as TargetKind).map(target => ({ kind, fighter: fighter.id, target }) as Action);
            case "enemies":
                return allowed(groupsOf(targetsOf(state, owner, fighter, aim.each), aim.count)
                    .map(targets => ({ kind, fighter: fighter.id, targets }) as Action));
            case "square": {
                // Somewhere it would land on someone: a blast on empty ground does nothing a stop doesn't.
                const someone = new Set(state.fighters.filter(isStanding).map(one => one.square));
                const squares = [...rangeSquares(state, fighter, aim.range)].filter(at => areaAround(state.field, at).some(square => someone.has(square)));
                return allowed(squares.map(at => ({ kind, fighter: fighter.id, at }) as Action));
            }
        }
    });
}

/** Every way to pick `count` of a list, in order. */
function groupsOf<T>(list: readonly T[], count: number): T[][] {
    if (count === 0) return [[]];
    return list.flatMap((first, i) => groupsOf(list.slice(i + 1), count - 1).map(rest => [first, ...rest]));
}

/**
 * The moves worth playing out (§29.7, *Thinking fast enough*): every square
 * the character could stop on this turn, ranked by the terms of its own the
 * square changes — with it standing there and the AP it would have left — and
 * the best dozen sent the cheapest way there. Where that way sets off a
 * reaction, the cheapest way round every square a watcher it can see would
 * react on is sent too, if there is one: a covered way round an overwatch
 * lane. Ties go to the lower square, and so does the order they're played out
 * in.
 */
function movesFor(plan: Plan, fighter: Fighter, kind: "move" | "sneak"): Action[] {
    const { state, owner } = plan;
    const sneaking = kind === "sneak";
    const reach = reachOf(state, fighter, sneaking);
    // A sneak sets nothing off, so has no way round to look for.
    const watched = sneaking ? new Set<Square>() : watchedSquares(state, fighter);
    const covered = watched.size > 0 ? reachOf(state, fighter, false, watched) : undefined;
    const taken = new Set(state.fighters.filter(isStanding).map(one => one.square));
    const ranked: { square: Square; value: number }[] = [];
    reach.costs.forEach((cost, square) => {
        if (cost === Infinity || square === reach.from || taken.has(square) || !state.field.tiles[square].terrain.standable) return;
        const { battle, moved } = standingAt(state, { ...fighter, ap: fighter.ap - moveAp(fighter, cost, sneaking) }, square);
        ranked.push({ square, value: standingTerms(plan, battle, moved) });
    });
    ranked.sort((a, b) => b.value - a.value || a.square - b.square);
    const moves: Action[] = [];
    const allowed = (path: Square[] | undefined): Action[] => {
        const move: Action | undefined = path && { kind, fighter: fighter.id, path };
        return move && !("refused" in check(state, owner, move)) ? [move] : [];
    };
    for (let i = 0, squares = 0; i < ranked.length && squares < MOVES_PLAYED_OUT; i++) {
        const { square } = ranked[i];
        const cheapest = allowed(pathTo(reach, square)?.squares);
        if (cheapest.length === 0) continue;
        squares++;
        moves.push(...cheapest);
        if (covered && cheapest[0].kind === kind && "path" in cheapest[0] && cheapest[0].path.some(step => watched.has(step))) {
            moves.push(...allowed(pathTo(covered, square)?.squares));
        }
    }
    return moves.sort((a, b) => lastSquare(a) - lastSquare(b));
}

const lastSquare = (action: Action): Square => "path" in action ? action.path[action.path.length - 1] : -1;

// ─── Judging an action ──────────────────────────────────────────────────────

/**
 * What an action is worth: the score of the battle it leaves (§29.7). A shot
 * is played out hitting, grazing and missing, weighed by the odds of each. A
 * move is played out with every reaction it sets off missing, less what the
 * overwatch on its path could be expected to take off the mover — a guard
 * rolls nothing, so it's in the played-out battle already. Anything else rolls
 * nothing, and is played out once.
 */
function judge(plan: Plan, action: Action): number {
    const { state, owner } = plan;
    let value = 0;
    for (const { roll, weight } of rollsFor(state, action)) {
        const { fighters, events } = act(state, owner, action, () => roll);
        const blasted = blastedIn(events);
        const field = blasted.length > 0 ? battlefieldWith(state.field, blasted) : state.field;
        value += weight * score(plan, { ...state, field, fighters }, events);
    }
    if (!("path" in action)) return value;
    const mover = fighterById(state, action.fighter);
    if (!mover) return value;
    for (const reaction of reactionPreviews(state, mover, action.path)) {
        if (reaction.kind !== "overwatch" || !reaction.odds) continue;
        const { chance, grazeChance, damage, grazeDamage } = reaction.odds;
        value -= WEIGHTS.strength * worthOf(mover, (chance * Math.min(damage, mover.hp) + grazeChance * Math.min(grazeDamage, mover.hp)) / ROLL_SIDES);
    }
    return value;
}

/**
 * The rolls an action is played out with, and how likely each is: a shot's
 * hit, graze and miss, by its odds, and for anything else one roll that misses
 * whatever it's asked for — the overwatch a move sets off.
 */
function rollsFor(state: BattleState, action: Action): { roll: number; weight: number }[] {
    const shot = shotOf(action.kind);
    const actor = fighterById(state, action.fighter);
    const target = "target" in action ? fighterById(state, action.target) : undefined;
    const odds = shot && actor && target ? shotOdds(state, actor, target, shot) : undefined;
    if (!odds) return [{ roll: ROLL_SIDES, weight: 1 }];
    const { chance, grazeChance } = odds;
    return [
        { roll: 1, weight: chance },
        { roll: chance + 1, weight: grazeChance },
        { roll: ROLL_SIDES, weight: ROLL_SIDES - chance - grazeChance },
    ].filter(({ weight }) => weight > 0).map(({ roll, weight }) => ({ roll, weight: weight / ROLL_SIDES }));
}

// ─── The score of a battle ──────────────────────────────────────────────────

/**
 * A battle as the warband sees it (§29.7): its side's points less the team's,
 * from the knock-outs in `events` and the centre each will score at the end of
 * its turn; the points' worth standing on each side; and, for each of the
 * warband's own characters, the terms where it stands changes.
 */
function score(plan: Plan, battle: BattleState, events: readonly BattleEvent[]): number {
    const { owner, round } = plan;
    const side = (player: string) => allied(battle, player, owner) ? 1 : -1;
    let total = 0;
    for (const event of events) {
        if (event.kind === "scored") total += side(event.player) * event.points * WEIGHTS.points;
    }
    for (const player of new Set(battle.fighters.map(fighter => fighter.owner))) {
        total += side(player) * centrePoints(battle, player, round) * WEIGHTS.points;
    }
    for (const fighter of battle.fighters) {
        if (!isStanding(fighter)) continue;
        total += side(fighter.owner) * worthOf(fighter, fighter.hp) * WEIGHTS.strength;
        if (fighter.owner === owner) total += standingTerms(plan, battle, fighter);
    }
    return total;
}

/**
 * The terms of a battle's score one of the warband's characters changes by
 * where it stands (§29.7): less its Exposure — the worst one enemy could
 * expect to do it next turn, from where that enemy stands — plus its Threat —
 * the most it could expect to do one enemy from here, all of it while it has
 * the AP to attack and `SPENT_THREAT` of it once it hasn't — less how far it
 * has to walk to the centre, weighing more as the round the centre scores
 * from comes nearer.
 */
function standingTerms(plan: Plan, battle: BattleState, fighter: Fighter): number {
    let exposure = 0, threat = 0;
    for (const enemy of battle.fighters) {
        if (!isStanding(enemy) || allied(battle, enemy.owner, fighter.owner)) continue;
        exposure = Math.max(exposure, expectedHarm(battle, enemy, fighter));
        threat = Math.max(threat, expectedHarm(battle, fighter, enemy));
    }
    const armed = fighter.ap >= ATTACK_AP ? 1 : SPENT_THREAT;
    const urgency = Math.min(1, plan.round / CENTRE_SCORES_FROM_ROUND);
    return -WEIGHTS.exposure * exposure
        + WEIGHTS.threat * armed * threat
        - WEIGHTS.objective * urgency * plan.toCentre(fighter) / movementOf(fighter);
}

/**
 * The points' worth one attack by `attacker` on `target` could be expected to
 * take off it from where the two stand: a shot by its odds, a strike in full,
 * and nothing when its weapon doesn't reach. Never more than the target has.
 */
function expectedHarm(battle: BattleState, attacker: Fighter, target: Fighter): number {
    const weapon = weaponOf(attacker);
    if (weapon.kind === "melee") return weaponReaches(battle, attacker, target.square) ? worthOf(target, Math.min(weapon.damage, target.hp)) : 0;
    const odds = shotOdds(battle, attacker, target);
    if (!odds) return 0;
    return worthOf(target, (odds.chance * Math.min(odds.damage, target.hp) + odds.grazeChance * Math.min(odds.grazeDamage, target.hp)) / ROLL_SIDES);
}

/** What `hp` of a character is worth, in points: its cost, a share for each HP. */
function worthOf(fighter: Fighter, hp: number): number {
    const { points, hp: full } = CHARACTERS[fighter.character];
    return points * hp / full;
}
