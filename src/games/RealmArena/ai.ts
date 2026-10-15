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

import { costsFrom, DEFAULT_CLIMB, reachFrom, pathTo, type Reach } from "@/utils/games/battlefield/pathfinding";
import { battlefieldWith, coordsOf, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, type AbilityId } from "./characters";
import {
    abilitiesOf, act, holdsShieldWall, allied, areaAround, ATTACK_AP, blastedIn, CENTRE, CENTRE_SCORES_FROM_ROUND, centrePoints, check, fighterById, isStanding, landedSmoke,
    damageTo, maxHpOf, moveAp, movementOf, reachOf, ROLL_SIDES, shotOdds, squadSight, strikeChance, watchedSquares, weaponOf, weaponReaches,
    type Action, type BattleEvent, type BattleState, type Fighter, type FogGhost, type ShotOdds,
} from "./rules";
import { ACTION_AIMS, rangeSquares, reactionPreviews, rollsToHit, shotOf, targetKindOf, targetsOf, type ActionKind } from "./tactics";

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

/**
 * What the warband's own characters are worth to it in Hold Out (§30.3), as a
 * share of the team's: each wave brings back every character it has lost, and
 * the score doesn't decide the battle, so losing one costs it far less than
 * the team losing one. Weighed in full, a cheap character would never step up
 * to a Knight that hits harder than it does, and a warband would ring the
 * team just out of its reach rather than close in.
 */
const HOLD_OUT_OWN_WORTH = 0.25;

/** How much of its Threat a character with no attack left this turn still counts: where it stands, it covers the ground. */
const SPENT_THREAT = 0.25;

/** How many of a character's reachable squares are played out as moves: the best by `standingTerms`, which is quicker. */
const MOVES_PLAYED_OUT = 12;

/** What an action has to gain over stopping to be worth taking, so rounding never sends a pointless move. */
const LEAST_GAIN = 1e-6;

/**
 * What a warband's turn keeps from one plan to the next (§29.7): planned
 * again after every action, it would otherwise work out much the same things
 * again each time. Made for each turn (`turnMemo`) and handed to every
 * `nextAction` in it; a plan with one chooses exactly what a plan without it
 * would, only sooner.
 */
export interface TurnMemo {
    /**
     * Each square's Exposure and Threat for a character standing on it
     * (`harmAt`), by everything they read but where it stands now and the AP
     * it has (`harmKnown`): neither of which they read, so they last while it
     * moves, until it or an enemy is hurt, an enemy moves or comes into
     * sight, a shield wall or a smoke cloud goes up or down, or the ground is
     * blasted.
     */
    harm: Map<string, Map<Square, Harm>>;
    /** The last walk from the squares hunted (§30.3), for each climb: the team stands still through a warband's turn, so plan after plan hunts the same squares. */
    hunts: Map<number, { hunted: string; costs: Float64Array }>;
    /** Each battlefield seen this turn, numbered by its place here for the keys above: a blast makes a new one. */
    fields: Battlefield[];
}

export const turnMemo = (): TurnMemo => ({ harm: new Map(), hunts: new Map(), fields: [] });

/**
 * The number a turn knows a battlefield by: the same for the same ground.
 * Once anything is blasted, every plan is handed a new copy of the map
 * (`battlefieldWith`), so it's told by its squares rather than by which copy
 * it is.
 */
function fieldId(memo: TurnMemo, field: Battlefield): number {
    const same = (seen: Battlefield) => seen === field || (seen.width === field.width && seen.tiles.length === field.tiles.length
        && seen.tiles.every((tile, square) => tile.terrain === field.tiles[square].terrain && tile.elevation === field.tiles[square].elevation));
    const id = memo.fields.findIndex(same);
    if (id >= 0) return id;
    memo.fields.push(field);
    return memo.fields.length - 1;
}

/** What a warband plans with: its side's view, whose turn it is, and the round. */
interface Plan {
    /** The view it was handed. */
    state: BattleState;
    owner: string;
    round: number;
    memo: TurnMemo;
    /** What its own characters' worth counts for: in full, or in Hold Out `HOLD_OUT_OWN_WORTH` of it. */
    ownWorth: number;
    /** Whether the centre scores for it: not in Hold Out, which the team, not the keep, decides (§30.3). */
    centreCounts: boolean;
    /** How far a character stands from the centre, in movement points. */
    toCentre: (fighter: Fighter) => number;
    /** Every square a move by one of its characters would set off a reaction on (`watchedSquares`): worked out once, when a move first asks. */
    watched: () => ReadonlySet<Square>;
}

/**
 * The warband's next action: the one whose played-out battle scores best, or
 * undefined when nothing scores better than stopping — which ends its turn.
 * `view` is the battle as `owner`'s side sees it (`viewOf`), and `round` the
 * battle round, counted from 1. Never anything `check` refuses.
 */
export function nextAction(view: BattleState, owner: string, round: number, hunt?: readonly FogGhost[], memo: TurnMemo = turnMemo()): Action | undefined {
    // A round that isn't one would score every battle NaN, which nothing beats.
    const plan = planFor(view, owner, Number.isFinite(round) ? Math.max(1, round) : 1, memo, hunt);
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

function planFor(view: BattleState, owner: string, round: number, memo: TurnMemo, hunt?: readonly FogGhost[]): Plan {
    // A view is already only what its side can see, and seeing it again
    // changes nothing (`viewOf`): dropping the fog spares every `check` the
    // planner asks from working that out again. It adds nothing it didn't see.
    const { fog: _fog, ...state } = view;
    const { field } = state;
    // In Hold Out (`hunt` given) the Objective is the team rather than the
    // keep (§30.3): the enemies it sees, else where it last saw them, else
    // where it hasn't looked for them yet (`searched`), else the keep after
    // all. It keeps the keep's urgency, so a warband closes in gently in the
    // first rounds and in earnest from round CENTRE_SCORES_FROM_ROUND on
    // (`standingTerms`).
    const seenEnemies = state.fighters.filter(fighter => isStanding(fighter) && !allied(state, fighter.owner, owner));
    const hunted = hunt === undefined ? []
        : seenEnemies.length > 0 ? seenEnemies.map(fighter => fighter.square)
        : hunt.length > 0 ? hunt.map(ghost => ghost.square)
        : view.fog ? searched(state, owner) : [];
    const objective = hunted.length > 0 ? hunted : field.objectives[CENTRE] ?? [];
    const centre = new Set(objective);
    const huntKey = `${fieldId(memo, field)}:${[...hunted].sort((a, b) => a - b).join()}`;
    const toCentre = (fighter: Fighter): number => {
        if (centre.size === 0 || centre.has(fighter.square)) return 0;
        const climb = CHARACTERS[fighter.character].climb ?? DEFAULT_CLIMB;
        const cost = (hunted.length > 0 ? huntWalk(memo, field, hunted, huntKey, climb) : centreWalk(field, climb))[fighter.square];
        return Number.isFinite(cost) ? cost : field.width + field.height;
    };
    let watched: ReadonlySet<Square> | undefined;
    const holdOut = hunt !== undefined;
    return {
        state, owner, round, memo, toCentre, watched: () => watched ??= watchedSquares(state, owner),
        ownWorth: holdOut ? HOLD_OUT_OWN_WORTH : 1, centreCounts: !holdOut,
    };
}

/**
 * Where a warband in Hold Out looks for a team it neither sees nor remembers
 * (§30.3): the squares of the keep and of the team's deployment zones that its
 * side can't see now, where the team is likeliest to be; and once it has all
 * of those in sight, every square it can't see. So it sweeps on from the keep
 * rather than standing in it waiting for a team that isn't there.
 */
function searched(state: BattleState, owner: string): Square[] {
    const { field } = state;
    const seen = squadSight(state, owner);
    // The sides are in seat order, the team's first, as the deployment zones are (`battleFrom`).
    const teamZones = Object.keys(state.sides ?? {}).flatMap((player, seat) => allied(state, player, owner) ? [] : field.deployments[seat] ?? []);
    const likely = [...field.objectives[CENTRE] ?? [], ...teamZones].filter(square => !seen(square));
    if (likely.length > 0) return likely;
    return field.tiles.flatMap((tile, square) => tile.terrain.standable && !seen(square) ? [square] : []);
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

/**
 * The walk to every square of a battlefield from the nearest of the squares a
 * warband hunts (§30.3), for a character that climbs this far: a search of the
 * whole map, like the centre's, so the turn keeps the last one it made. `key`
 * names the battlefield (`fieldId`), which a blast changes, and the squares
 * hunted, in any order they come in.
 */
function huntWalk(memo: TurnMemo, field: Battlefield, hunted: readonly Square[], key: string, climb: number): Float64Array {
    let last = memo.hunts.get(climb);
    if (last?.hunted !== key) {
        last = { hunted: key, costs: costsFrom(field, hunted, { climb }) };
        memo.hunts.set(climb, last);
    }
    return last.costs;
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
        const target = targetKindOf(kind);
        switch (aim.at) {
            case "path":
                return movesFor(plan, fighter, kind as "move" | "sneak");
            case "self":
                return allowed(plan, [{ kind, fighter: fighter.id } as Action]);
            case "enemy":
            case "ally":
                return target ? targetsOf(state, owner, fighter, target).map(id => ({ kind, fighter: fighter.id, target: id }) as Action) : [];
            case "enemies":
                return allowed(plan, groupsOf(target ? targetsOf(state, owner, fighter, target) : [], aim.count)
                    .map(targets => ({ kind, fighter: fighter.id, targets }) as Action));
            case "square": {
                // Somewhere it would land on someone: a blast on empty ground does nothing a stop doesn't.
                const someone = new Set(state.fighters.filter(isStanding).map(one => one.square));
                const squares = [...rangeSquares(state, fighter, aim.range)].filter(at => areaAround(state.field, at).some(square => someone.has(square)));
                return allowed(plan, squares.map(at => ({ kind, fighter: fighter.id, at }) as Action));
            }
        }
    });
}

/** The actions `check` allows. */
function allowed({ state, owner }: Plan, actions: Action[]): Action[] {
    return actions.filter(action => !("refused" in check(state, owner, action)));
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
    const { state } = plan;
    const sneaking = kind === "sneak";
    const reach = reachOf(state, fighter, sneaking);
    // A sneak sets nothing off, so has no way round to look for.
    const watched = sneaking ? new Set<Square>() : plan.watched();
    let covered: Reach | undefined;
    const taken = new Set(state.fighters.filter(isStanding).map(one => one.square));
    const ranked: { square: Square; value: number }[] = [];
    const enemies = enemiesOf(state, fighter.owner);
    const known = harmKnown(plan, fighter, enemies);
    reach.costs.forEach((cost, square) => {
        if (cost === Infinity || square === reach.from || taken.has(square) || !state.field.tiles[square].terrain.standable) return;
        // Read against the battle as it stands rather than one with the
        // character moved (`standingAt`), which costs a copy of every fighter
        // a square: its terms read the others' squares, and nobody else's
        // reads where it stands — its own shield wall shelters whoever stands next to it,
        // never itself.
        const moved = { ...fighter, square, ap: fighter.ap - moveAp(fighter, cost, sneaking) };
        let harm = known.get(square);
        if (!harm) known.set(square, harm = harmAt(state, moved, enemies));
        ranked.push({ square, value: standingTerms(plan, state, moved, enemies, harm) });
    });
    ranked.sort((a, b) => b.value - a.value || a.square - b.square);
    const moves: Action[] = [];
    const along = (path: Square[] | undefined): Action[] => path ? allowed(plan, [{ kind, fighter: fighter.id, path }]) : [];
    let squares = 0;
    for (const { square } of ranked) {
        if (squares === MOVES_PLAYED_OUT) break;
        const cheapest = pathTo(reach, square)?.squares;
        const sent = along(cheapest);
        if (sent.length === 0) continue;
        squares++;
        moves.push(...sent);
        if (cheapest?.some(step => watched.has(step))) moves.push(...along(pathTo(covered ??= reachOf(state, fighter, false, watched), square)?.squares));
    }
    return moves.sort((a, b) => lastSquare(a) - lastSquare(b));
}

const lastSquare = (action: Action): Square => "path" in action ? action.path[action.path.length - 1] : -1;

// ─── Judging an action ──────────────────────────────────────────────────────

/**
 * What an action is worth: the score of the battle it leaves (§29.7). A shot
 * is played out hitting, grazing and missing, weighed by the odds of each, and
 * a melee strike hitting and missing. A move is played out with every reaction
 * it sets off missing, less what the overwatch on its path could be expected
 * to take off the mover — and, where a strike rolls, the guard too; before
 * strikes rolled a guard was in the played-out battle already. Anything else
 * rolls nothing, and is played out once.
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
        if (reaction.kind === "overwatch" && reaction.odds) value -= WEIGHTS.strength * plan.ownWorth * worthOf(mover, expectedDamage(reaction.odds, mover.hp));
        if (reaction.kind === "guard" && state.balanced) value -= WEIGHTS.strength * plan.ownWorth * worthOf(mover, reaction.chance * Math.min(reaction.damage, mover.hp) / ROLL_SIDES);
    }
    return value;
}

/**
 * The rolls an action is played out with, and how likely each is: a shot's
 * hit, graze and miss, by its odds; a melee strike's hit and miss, by
 * `strikeChance` — a cleave's two blows played out together, at its first
 * target's chance; and for anything else one roll that misses whatever it's
 * asked for — the overwatch or guard a move sets off. That one is past the
 * dice, so even an overwatch shot that can't miss outright doesn't graze:
 * it's only ever played out, never rolled.
 */
function rollsFor(state: BattleState, action: Action): { roll: number; weight: number }[] {
    const shot = shotOf(action.kind);
    const actor = fighterById(state, action.fighter);
    const aimed = "target" in action ? action.target : "targets" in action ? action.targets[0] : undefined;
    const target = aimed !== undefined ? fighterById(state, aimed) : undefined;
    const odds = shot && actor && target ? shotOdds(state, actor, target, shot) : undefined;
    if (!odds && state.balanced && rollsToHit(action.kind) && target) {
        const landed = strikeChance(state, target);
        return [{ roll: 1, weight: landed }, { roll: ROLL_SIDES, weight: ROLL_SIDES - landed }].filter(({ weight }) => weight > 0).map(({ roll, weight }) => ({ roll, weight: weight / ROLL_SIDES }));
    }
    if (!odds) return [{ roll: ROLL_SIDES + 1, weight: 1 }];
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
    const { owner, round, ownWorth } = plan;
    const side = (player: string) => allied(battle, player, owner) ? 1 : -1;
    let total = 0;
    for (const event of events) {
        // What the team scores, it scores by downing one of the warband's.
        if (event.kind === "scored") total += side(event.player) * event.points * WEIGHTS.points * (side(event.player) < 0 ? ownWorth : 1);
    }
    if (plan.centreCounts) {
        for (const player of new Set(battle.fighters.map(fighter => fighter.owner))) {
            total += side(player) * centrePoints(battle, player, round) * WEIGHTS.points;
        }
    }
    const enemies = enemiesOf(battle, owner);
    for (const fighter of battle.fighters) {
        if (!isStanding(fighter)) continue;
        total += side(fighter.owner) * worthOf(fighter, fighter.hp) * WEIGHTS.strength * (side(fighter.owner) > 0 ? ownWorth : 1);
        if (fighter.owner === owner) total += standingTerms(plan, battle, fighter, enemies);
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
function standingTerms(plan: Plan, battle: BattleState, fighter: Fighter, enemies: readonly Fighter[], harm = harmAt(battle, fighter, enemies)): number {
    const { exposure, threat } = harm;
    const armed = fighter.ap >= ATTACK_AP ? 1 : SPENT_THREAT;
    const urgency = Math.min(1, plan.round / CENTRE_SCORES_FROM_ROUND);
    return -WEIGHTS.exposure * plan.ownWorth * exposure
        + WEIGHTS.threat * armed * threat
        - WEIGHTS.objective * urgency * plan.toCentre(fighter) / movementOf(fighter);
}

/** A character's Exposure and Threat where it stands (`standingTerms`). */
interface Harm {
    exposure: number;
    threat: number;
}

function harmAt(battle: BattleState, fighter: Fighter, enemies: readonly Fighter[]): Harm {
    let exposure = 0, threat = 0;
    for (const enemy of enemies) {
        exposure = Math.max(exposure, expectedHarm(battle, enemy, fighter));
        threat = Math.max(threat, expectedHarm(battle, fighter, enemy));
    }
    return { exposure, threat };
}

/**
 * Where a turn keeps a character's `harmAt` for each square (`TurnMemo`):
 * named by everything `expectedHarm` reads but the character's square and
 * AP — the character, every enemy, the shield walls and smoke clouds that
 * change a shot's odds, the sides, and the battlefield. Anything that reads
 * more must name it here too, which the memo's test holds.
 */
function harmKnown(plan: Plan, fighter: Fighter, enemies: readonly Fighter[]): Map<Square, Harm> {
    const { state, memo } = plan;
    // Of each character, only what a shot or a strike reads: not the way it
    // faces, or what it has banked or spent, which every action changes, the
    // overwatch a move sets off among them. Of the character itself, not
    // where it stands either.
    const read = ({ id, owner, character, option, hp, maxHp, effects }: Fighter) => [id, owner, character, option ?? null, hp, maxHp ?? null, effects];
    const walls = state.fighters.filter(holdsShieldWall).map(({ id, owner, square }) => [id, owner, square]);
    const key = JSON.stringify([fieldId(memo, state.field), read(fighter), enemies.map(enemy => [...read(enemy), enemy.square]), walls, state.clouds ?? [], landedSmoke(state.fighters), state.sides ?? null, state.balanced ?? false, state.armoured ?? false]);
    let known = memo.harm.get(key);
    if (!known) memo.harm.set(key, known = new Map());
    return known;
}

/** The enemies of a player standing in a battle: whoever its characters' Exposure and Threat are read against. */
function enemiesOf(battle: BattleState, player: string): Fighter[] {
    return battle.fighters.filter(enemy => isStanding(enemy) && !allied(battle, enemy.owner, player));
}

/**
 * The points' worth one attack by `attacker` on `target` could be expected to
 * take off it from where the two stand: a shot by its odds, a strike by its
 * chance to land, and nothing when its weapon doesn't reach. Never more than
 * the target has.
 */
function expectedHarm(battle: BattleState, attacker: Fighter, target: Fighter): number {
    const weapon = weaponOf(battle, attacker);
    if (weapon.kind === "melee") return weaponReaches(battle, attacker, target.square) ? worthOf(target, strikeChance(battle, target) * Math.min(damageTo(battle, attacker, target), target.hp) / ROLL_SIDES) : 0;
    const odds = shotOdds(battle, attacker, target);
    if (!odds) return 0;
    return worthOf(target, expectedDamage(odds, target.hp));
}

/** The damage a shot could be expected to do a character with `hp` left, by its odds: never more than it has. */
function expectedDamage({ chance, grazeChance, damage, grazeDamage }: ShotOdds, hp: number): number {
    return (chance * Math.min(damage, hp) + grazeChance * Math.min(grazeDamage, hp)) / ROLL_SIDES;
}

/** What `hp` of a character is worth, in points: its cost, a share for each HP. */
function worthOf(fighter: Fighter, hp: number): number {
    return CHARACTERS[fighter.character].points * hp / maxHpOf(fighter);
}
