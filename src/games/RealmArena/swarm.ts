// Realm Arena's swarm step (docs/games/realm-arena-hold-out.md §4.5): how the
// Brood's minions take their turn, in place of the planner's search.
//
// **No search.** A minion is worth very little (§4.2) and there may be sixteen
// of them to a warband, so the planner never plans for one (`nextAction` leaves
// them out of what it asks about) and they take a step of their own, one pass
// in id order, deterministic and over in microseconds a minion. The turn loop
// (`warbandTurn`) plays it first and the planner's characters after it.
//
// **Two phases, so the board can play them as two beats.** Every minion's
// *move* comes first, in id order, so the horde moves together; then every
// minion's *strike*, one after another. `swarmAction` is asked for one action
// at a time like `nextAction`, and tells the phases apart by what its memo has
// seen, so asking again from the battle an action left carries on.
//
// **A player's rules and view.** Like the planner it reads only the warband's
// view (`viewOf`) and offers only what `check` allows, so a minion can do
// nothing a player couldn't. It rolls nothing, draws no random number, and ties
// go to the lower id, then the lower square: the same view always gets the same
// actions.
//
// **Where a minion is headed** is one function, `goalOf`: the team it sees,
// else the Shrine (§5.2), else where it hunts the team.
//
// Pure and browser-safe, like rules.ts and ai.ts.

import { costsFrom, DEFAULT_CLIMB, pathTo, type Reach } from "@/utils/games/battlefield/pathfinding";
import { distance, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { searched } from "./ai";
import { ruleValuesOf, rulesetOf } from "./rulesets";
import {
    allied, burstArea, canAct, CENTRE, check, isCombatant, isMinion, isStanding, moveApAt, movementOf, reachOf, shotOdds, SHRINE_OWNER, weaponOf, weaponReaches,
    type Action, type BattleState, type Fighter, type FogGhost,
} from "./rules";

/** What one warband's swarm step has done so far this turn: made for each turn, and handed to every `swarmAction` of it. */
export interface SwarmMemo {
    /** The minions whose move has been decided, whether it was a move or staying put. */
    moved: Set<number>;
    /** The minions whose strike has been decided, whether it was one or none. */
    struck: Set<number>;
    /** The walk to every square from the goal, by the battlefield it was made on, the goal and how far the walker climbs: the same for every minion with that goal, and a search of the whole map. */
    walks: { field: Battlefield; costs: Map<string, Float64Array> } | undefined;
    /** Whether the warband is seeing through fog, which the goal it searches by depends on: set by the first `swarmAction`. */
    fogged: boolean;
}

export const swarmMemo = (): SwarmMemo => ({ moved: new Set(), struck: new Set(), walks: undefined, fogged: false });

/** The warband's minions that can act, in id order. */
const minionsOf = (view: BattleState, owner: string): Fighter[] =>
    view.fighters.filter(fighter => fighter.owner === owner && isMinion(fighter, view) && canAct(fighter, view)).sort((a, b) => a.id - b.id);

/** The team, as far as the warband sees it: every enemy combatant in its view. */
const teamOf = (view: BattleState, owner: string): Fighter[] =>
    view.fighters.filter(fighter => isCombatant(fighter, view) && !allied(view, fighter.owner, owner)).sort((a, b) => a.id - b.id);

/** The team's Shrine (§5.2), if one stands: always in a warband's view, since where it stands is no secret. */
const shrineOf = (view: BattleState): Fighter | undefined => view.fighters.find(fighter => fighter.owner === SHRINE_OWNER && isStanding(fighter));

/**
 * The next action of the warband's swarm step, or undefined once it is over:
 * every minion's move, then every minion's strike. `hunt` is where the warband
 * last saw the team (Hold Out's sightings), as it is for the planner.
 */
export function swarmAction(view: BattleState, owner: string, hunt: readonly FogGhost[] | undefined, done: SwarmMemo): Action | undefined {
    const { fog: _fog, ...state } = view;
    done.fogged = view.fog === true;
    const team = teamOf(state, owner);
    const shrine = shrineOf(state);
    for (const minion of minionsOf(state, owner)) {
        if (done.moved.has(minion.id)) continue;
        done.moved.add(minion.id);
        const move = moveOf(state, owner, minion, team, shrine, hunt, done);
        if (move) return move;
    }
    for (const minion of minionsOf(state, owner)) {
        if (done.struck.has(minion.id)) continue;
        done.struck.add(minion.id);
        const strike = strikeOf(state, owner, minion, team, shrine);
        if (strike) return strike;
    }
    return undefined;
}

/**
 * The squares a minion walks toward: the team it sees, else the Shrine (§5.2),
 * else where it last saw the team, else where the team is likeliest to be
 * (`searched`) — the keep and the team's zones — as the planner hunts them
 * (`planFor`). This is the one place a minion's goal is decided.
 */
function goalOf(state: BattleState, owner: string, team: readonly Fighter[], shrine: Fighter | undefined, hunt: readonly FogGhost[] | undefined, fogged: boolean): readonly Square[] {
    if (team.length > 0) return team.map(fighter => fighter.square);
    if (shrine) return [shrine.square];
    if (hunt && hunt.length > 0) return hunt.map(ghost => ghost.square);
    return fogged ? searched(state, owner) : state.field.objectives[CENTRE] ?? [];
}

/** The walk to every square from the nearest of `goal`, for a walker that climbs this far. */
function walkTo(done: SwarmMemo, field: Battlefield, goal: readonly Square[], climb: number): Float64Array {
    if (done.walks?.field !== field) done.walks = { field, costs: new Map() };
    const key = `${climb}:${[...goal].sort((a, b) => a - b).join()}`;
    let costs = done.walks.costs.get(key);
    if (!costs) done.walks.costs.set(key, costs = costsFrom(field, goal, { climb }));
    return costs;
}

/** Whether a fighter standing on `square` could hit `target`: in reach for a blow, in range and sight for a shot. */
function strikesFrom(state: BattleState, fighter: Fighter, square: Square, target: Fighter): boolean {
    const there = square === fighter.square ? fighter : { ...fighter, square };
    return weaponOf(state, fighter).kind === "ranged" ? shotOdds(state, there, target) !== undefined : weaponReaches(state, there, target.square);
}

/** Who a minion would hit first, in order: a Spitter the nearest, the rest the most hurt, ties the lower id; the Shrine (§5.2) after every one of the team. */
function priorityOf(state: BattleState, minion: Fighter, team: readonly Fighter[], shrine: Fighter | undefined): Fighter[] {
    const nearest = weaponOf(state, minion).kind === "ranged";
    const key = (target: Fighter) => nearest ? distance(state.field, minion.square, target.square) : target.hp;
    return [...[...team].sort((a, b) => key(a) - key(b) || a.id - b.id), ...shrine ? [shrine] : []];
}

const moveBy = (state: BattleState, owner: string, minion: Fighter, to: Square, reach: Reach): Action | undefined => {
    const path = pathTo(reach, to)?.squares;
    if (!path || path.length < 2) return undefined;
    const action: Action = { kind: "move", fighter: minion.id, path };
    return "refused" in check(state, owner, action) ? undefined : action;
};

/** Whether a minion bursts (the Bloater's Burst). */
const bursts = (state: BattleState, minion: Fighter): boolean => rulesetOf(state).CHARACTERS[minion.character].abilities.includes("burst");

/** What a minion's burst from `square` would take with it: how many of the team, and how many of its own side but itself. */
function burstHaul(state: BattleState, owner: string, minion: Fighter, square: Square, team: readonly Fighter[]): { caught: number; own: number } {
    const area = new Set(burstArea(state.field, square));
    return {
        caught: team.filter(fighter => area.has(fighter.square)).length,
        own: state.fighters.filter(fighter => fighter.id !== minion.id && isStanding(fighter) && allied(state, fighter.owner, owner) && area.has(fighter.square)).length,
    };
}

/** A minion's move: to where it strikes from, to where its burst lands best, or toward its goal; or none, when it stays where it is. */
function moveOf(state: BattleState, owner: string, minion: Fighter, team: readonly Fighter[], shrine: Fighter | undefined, hunt: readonly FogGhost[] | undefined, done: SwarmMemo): Action | undefined {
    const reach = reachOf(state, minion);
    const movement = movementOf(minion, state);
    const costOf = (square: Square) => moveApAt(movement, reach.costs[square], false, state);
    const stops: Square[] = [];
    reach.costs.forEach((cost, square) => { if (cost !== Infinity) stops.push(square); });
    const { ATTACK_AP } = ruleValuesOf(state);
    const walk = walkTo(done, state.field, goalOf(state, owner, team, shrine, hunt, done.fogged), rulesetOf(state).CHARACTERS[minion.character].climb ?? DEFAULT_CLIMB);
    const toGoal = (square: Square) => walk[square];
    const nearer = (a: Square, b: Square) => reach.costs[a] - reach.costs[b] || a - b;

    // A Bloater goes where its burst takes the most of the team with it.
    if (bursts(state, minion)) {
        const left = minion.ap - rulesetOf(state).ABILITIES.burst.ap;
        let best: { square: Square; caught: number; own: number } | undefined;
        for (const square of stops) {
            if (costOf(square) > left) continue;
            const { caught, own } = burstHaul(state, owner, minion, square, team);
            if (caught === 0) continue;
            if (!best || caught > best.caught || (caught === best.caught && (own < best.own
                || (own === best.own && (toGoal(square) < toGoal(best.square) || (toGoal(square) === toGoal(best.square) && square < best.square)))))) {
                best = { square, caught, own };
            }
        }
        if (best) return best.square === minion.square ? undefined : moveBy(state, owner, minion, best.square, reach);
    }

    // Anyone it can hit after a move: the first in its order it has a square to hit from, the nearest by walk.
    const striking = stops.filter(square => costOf(square) <= minion.ap - ATTACK_AP).sort(nearer);
    for (const target of priorityOf(state, minion, team, shrine)) {
        const square = striking.find(from => strikesFrom(state, minion, from, target));
        if (square !== undefined) return square === minion.square ? undefined : moveBy(state, owner, minion, square, reach);
    }

    // Nobody in reach: as near its goal as it can get this turn.
    let nearest = minion.square;
    for (const square of stops) if (toGoal(square) < toGoal(nearest)) nearest = square;
    return nearest === minion.square ? undefined : moveBy(state, owner, minion, nearest, reach);
}

/** A minion's strike from where it stands: a Bloater's burst when it takes more of the team than of its own side, else a blow on the first in its order that `check` allows. */
function strikeOf(state: BattleState, owner: string, minion: Fighter, team: readonly Fighter[], shrine: Fighter | undefined): Action | undefined {
    if (!isStanding(minion) || !canAct(minion, state)) return undefined;
    const allowed = (action: Action) => !("refused" in check(state, owner, action));
    if (bursts(state, minion)) {
        const { caught, own } = burstHaul(state, owner, minion, minion.square, team);
        const burst: Action = { kind: "burst", fighter: minion.id };
        if (caught > 0 && caught > own && allowed(burst)) return burst;
    }
    for (const target of priorityOf(state, minion, team, shrine)) {
        const attack: Action = { kind: "attack", fighter: minion.id, target: target.id };
        if (allowed(attack)) return attack;
    }
    return undefined;
}
