import { useMemo } from "react";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { pathTo, type Reach } from "@/utils/games/battlefield/pathfinding";
import type { Square } from "@/utils/games/battlefield/terrain";
import { ABILITIES, ITEMS, type Ability, type Item } from "./characters";
import { allied, blastedBy, check, demolishArea, fighterById, areaAround, isStanding, itemOf, reachOf, shotOdds, weaponOf, type Action, type BattleState, type Check, type Fighter } from "./rules";
import { ACTION_AIMS, attackOptions, hitChance, rangeKindOf, rangeSquares, reactionPreviews, rollsToHit, shotOf, targetKindOf, targetsOf, type AttackOption } from "./tactics";
import { reachShading } from "./ui";

/** What the board is armed for: a tap on a square or a character lines up one of these. */
export type Aim =
    | "move" | "sneak" | "attack" | "aimedShot" | "cleave" | "fireball" | "heal" | "raise" | "throw" | "draught"
    | "shieldBash" | "cripplingShot" | "huntersMark" | "demolish" | "rend" | "regrowth";

/** The actions that need nothing aimed, and go the moment they're tapped. */
export const INSTANT_KINDS = ["hunker", "watch", "shieldWall", "purify", "burst"] as const;
export type InstantKind = typeof INSTANT_KINDS[number];

export interface Draft {
    aim: Aim;
    /** The square a move, a fireball, a throw or a Demolish is lined up on. */
    square: Square | null;
    /** The characters an attack, a heal, a raise, a draught or a cleave is lined up on. */
    targets: number[];
}

export const MOVE: Draft = { aim: "move", square: null, targets: [] };

/** One character the armed aim could be lined up on, and its chance to land on an enemy. */
export interface TargetOption {
    target: Fighter;
    /** Percent to land, 0–100: undefined for help given to an ally, which has none. */
    chance?: number;
}

/**
 * Everyone the armed aim could be lined up on (its `candidates`), the enemies
 * likeliest first: the turn sheet's list of targets. A shot's chance is its
 * odds and a strike's its own, 80% to hit; a Hunter's mark lands every time.
 */
export function targetOptions(battle: BattleState, fighter: Fighter, aim: Aim, candidates: readonly number[]): TargetOption[] {
    const shot = shotOf(aim);
    return candidates.flatMap((id): TargetOption[] => {
        const target = fighterById(battle, id);
        if (!target) return [];
        if (allied(battle, target.owner, fighter.owner)) return [{ target }];
        return [{ target, chance: rollsToHit(aim) ? hitChance(battle, fighter, target, shot) : 100 }];
    }).sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0));
}

const isMoving = (aim: Aim) => ACTION_AIMS[aim].at === "path";
type AtSquare = "fireball" | "throw" | "demolish";

/** A fireball, a throw or a Demolish is aimed at a square, whoever stands on it. */
const isAtSquare = (aim: Aim): aim is AtSquare => ACTION_AIMS[aim].at === "square";

/**
 * Every square what's aimed at `at` lands on: the 3×3 for a fireball or an
 * item with an area, everyone beside the cover but the Knight for a Demolish,
 * else that square alone.
 */
function landing(state: BattleState, fighter: Fighter, aim: AtSquare, at: Square): Square[] {
    if (aim === "demolish") return demolishArea(state.field, fighter.square, at);
    return aim === "fireball" || itemOf(fighter)?.area ? areaAround(state.field, at) : [at];
}

/** What blasts away low cover where it's aimed (§22): the ability, or the item thrown. */
const BLASTER: Readonly<Record<Exclude<AtSquare, "throw">, Ability>> = { fireball: ABILITIES.fireball, demolish: ABILITIES.demolish };

/** What lands where a fireball, a throw or a Demolish is aimed: the ability, or the item thrown. */
const landsOf = (fighter: Fighter, aim: AtSquare): Ability | Item | undefined => aim === "throw" ? itemOf(fighter) : BLASTER[aim];

/** The action a draft has lined up, once it has everything the action needs. */
function actionOf(fighter: Fighter, { aim, square, targets }: Draft, path: Square[] | undefined): Action | null {
    switch (aim) {
        case "move":
        case "sneak": return path ? { kind: aim, fighter: fighter.id, path } : null;
        case "fireball":
        case "throw":
        case "demolish": return square === null ? null : { kind: aim, fighter: fighter.id, at: square };
        case "cleave": return targets.length === 2 ? { kind: "cleave", fighter: fighter.id, targets } : null;
        default: return targets.length === 1 ? { kind: aim, fighter: fighter.id, target: targets[0] } : null;
    }
}

/** The aims that heal the one they're lined up on, and by how much (before it's capped at full). */
export const HEAL_HP: Partial<Record<Aim, number>> = { heal: ABILITIES.heal.hp, regrowth: ABILITIES.regrowth.hp, draught: ITEMS.healingDraught.hp };

/**
 * What a lined-up action would do to the HP of each character it touches, by
 * id: less a shot's damage at its odds on a hit, a strike's, or what a
 * fireball, a throw or a Demolish lands on everyone standing in `area`; more
 * what a heal or a draught gives back. What the board flashes on their HP
 * bars, which never run past empty or full.
 */
export function hpPreview(battle: BattleState, fighter: Fighter, { aim, targets }: Draft, area: readonly Square[] | null): ReadonlyMap<number, number> {
    if (area && isAtSquare(aim)) {
        const damage = landsOf(fighter, aim)?.damage ?? 0;
        const caught = damage > 0 ? battle.fighters.filter(one => isStanding(one) && area.includes(one.square)) : [];
        return new Map(caught.map(one => [one.id, -damage]));
    }
    const heals = HEAL_HP[aim];
    if (heals !== undefined) return new Map(targets.map(id => [id, heals]));
    // The aims that strike or shoot the characters they're lined up on.
    if (!rollsToHit(aim)) return new Map();
    return new Map(targets.flatMap((id): [number, number][] => {
        const target = fighterById(battle, id);
        if (!target) return [];
        if (aim === "shieldBash" || aim === "rend") return [[id, -(ABILITIES[aim].damage ?? 0)]];
        const shot = shotOf(aim);
        return [[id, -((shot && shotOdds(battle, fighter, target, shot)?.damage) ?? weaponOf(fighter).damage)]];
    }));
}

/** Where a character would stand once the move lined up is made, and the AP it would have left there. */
export interface AfterMove {
    square: Square;
    ap: number;
}

/**
 * Where a character would stand, and with what AP, once a lined-up move is
 * made — or where it stands now, with what it has, when no move is lined up
 * or `check` refuses the one that is: a refused move goes nowhere.
 */
export function afterMove(fighter: Fighter, path: readonly Square[] | undefined, verdict: Check | null): AfterMove {
    if (!path || !verdict || "refused" in verdict) return { square: fighter.square, ap: fighter.ap };
    return { square: path[path.length - 1], ap: fighter.ap - verdict.ap };
}

/** What a selected character could hit, and from where: the board's list of targets and the odds over each enemy. */
export interface ReachAfter {
    options: AttackOption[];
    /** Read from the end of a lined-up move rather than where it stands. */
    previewing: boolean;
    /** The AP it would have left to attack with, on its owner's turn. */
    ap?: number;
}

/**
 * Every enemy a character could hit once the move lined up for it is made —
 * or from where it stands, with no move lined up, or off its owner's turn.
 */
export function reachAfter(battle: BattleState, fighter: Fighter, after: AfterMove | undefined): ReachAfter {
    const square = after?.square ?? fighter.square;
    return { options: attackOptions(battle, fighter, square), previewing: square !== fighter.square, ap: after?.ap };
}

/** What a tap is read against: the battle, who is acting, what's lined up, and where it can reach. */
export interface TapContext {
    battle: BattleState;
    fighter: Fighter;
    draft: Draft;
    /** The acting character's reach, while it's armed to move. */
    reach: Reach | null;
    /** Who a tap can line the draft's aim up on. */
    candidates: readonly number[];
}

/**
 * What a tap does: lines up a new draft, sends what's lined up (`"send"`), or —
 * undefined — isn't taken as aiming at all. A second tap on what's already
 * lined up sends it.
 */
export type TapResult = Draft | "send" | undefined;

const lineUp = (next: Draft, same: boolean): TapResult => same ? "send" : next;

/** A tap on a square: a move's destination, or where a fireball, a throw or a Demolish lands. */
export function tapSquare({ draft, reach }: TapContext, tapped: Square): TapResult {
    if (isAtSquare(draft.aim)) return lineUp({ ...draft, square: tapped }, tapped === draft.square);
    if (isMoving(draft.aim) && reach && tapped !== reach.from && reach.costs[tapped] !== Infinity) {
        return lineUp({ ...draft, square: tapped }, tapped === draft.square);
    }
    return undefined;
}

/**
 * A tap on a character. An enemy tapped while moving lines up an attack on
 * it, with the odds — or the reason there's none — before anything is sent;
 * a fallen one is a square to move onto; one of your own squad isn't aimed
 * at unless the aim is for allies, so the board selects it instead.
 */
export function tapFighter(context: TapContext, id: number): TapResult {
    const { battle, fighter, draft, candidates } = context;
    const { aim, targets } = draft;
    const target = fighterById(battle, id);
    if (!target) return undefined;
    if (isAtSquare(aim)) return tapSquare(context, target.square);
    // Itself, only when it can be the aim's target: a draught it drinks.
    if (target.id === fighter.id && !candidates.includes(id)) return undefined;
    const enemy = !allied(battle, target.owner, fighter.owner) && isStanding(target);

    if (aim === "cleave") {
        if (!candidates.includes(id)) return enemy ? draft : undefined;
        const kept = targets.filter(one => one !== id);
        return { ...draft, targets: kept.length < targets.length ? kept : [...targets.slice(-1), id] };
    }
    if (isMoving(aim)) {
        if (enemy) return { aim: "attack", square: null, targets: [id] };
        // A body can be stood over: the tap meant the square it fell on.
        if (!isStanding(target)) return tapSquare(context, target.square);
        return undefined;
    }
    // An enemy tapped out of reach is lined up anyway, so the sheet can say why it can't be.
    if ((enemy && ACTION_AIMS[aim].at === "enemy") || candidates.includes(id)) {
        return lineUp({ ...draft, targets: [id] }, targets[0] === id);
    }
    return undefined;
}

/**
 * One character's next action, lined up on the board before it's sent
 * (docs/games/realm-arena.md §17.3 PR 7). It starts armed to move, with the
 * character's reach shaded for 1–4 AP. A tap on a square in reach lines a
 * move up there, with the path and every watcher it would set off; a tap on
 * an enemy lines up an attack on it, with the odds. A second tap on the same
 * square or character sends it, as does the sheet's button.
 *
 * Everything it offers is read from rules.ts — the server's own `check`,
 * reach and odds — so nothing the server would refuse can be sent. Held on
 * this device alone.
 *
 * `fighter` is null when the viewer can't act with the selected character: it
 * isn't theirs, it's down, or it isn't their turn.
 */
export function useTurnDraft(battle: BattleState, player: string, fighter: Fighter | null, turnKey: string, onAct: (action: Action) => void) {
    // Any change to the character — a move, a shot, a heal, its AP spent —
    // drops what was lined up, so a path or a target from before it can't be
    // sent again from where it no longer stands.
    const key = fighter ? `${turnKey}:${fighter.id}:${fighter.square}:${fighter.ap}:${fighter.hp}` : turnKey;
    const [draft, setDraft] = useResettingState<Draft>(MOVE, key);
    // The pieces the searches read, sides among them, so a teammate is passed through as the server's `check` would (§29.6).
    const { field, fighters, sides } = battle;
    const aim = draft.aim;
    // The reach is a search over every square of the map, so it's worked out
    // once per character and aim rather than on every render.
    const reach = useMemo(
        () => fighter && isMoving(aim) ? reachOf({ field, fighters, sides }, fighter, aim === "sneak") : null,
        [field, fighters, sides, fighter, aim],
    );
    const shading = useMemo(() => fighter && reach ? reachShading(fighter, reach, aim === "sneak") : null, [fighter, reach, aim]);
    // Aimed at anything else, the shading is where it could land instead: its range.
    const rangeKind = rangeKindOf(aim);
    const range = useMemo(() => fighter && rangeKind ? rangeSquares({ field, fighters, sides }, fighter, rangeKind) : null, [field, fighters, sides, fighter, rangeKind]);
    if (!fighter) return null;

    const path = reach && draft.square !== null ? pathTo(reach, draft.square)?.squares : undefined;
    const action = actionOf(fighter, draft, path);
    const verdict: Check | null = action ? check(battle, player, action) : null;
    const targetKind = targetKindOf(aim);
    const candidates = targetKind ? targetsOf(battle, player, fighter, targetKind) : [];
    const context: TapContext = { battle, fighter, draft, reach, candidates };
    const area = isAtSquare(aim) && draft.square !== null ? landing(battle, fighter, aim, draft.square) : null;

    const send = () => {
        if (action && verdict && !("refused" in verdict)) onAct(action);
    };
    const apply = (result: TapResult): boolean => {
        if (result === "send") send();
        else if (result) setDraft(result);
        return result !== undefined;
    };

    return {
        fighter,
        aim,
        arm: (next: Aim) => setDraft({ aim: next, square: null, targets: [] }),
        /** Lets go of whatever is lined up, back to moving. */
        clear: () => setDraft(MOVE),
        /** Sends an action that needs nothing aimed, if `check` allows it. */
        now: (kind: InstantKind) => {
            const instant: Action = { kind, fighter: fighter.id };
            if (!("refused" in check(battle, player, instant))) onAct(instant);
        },
        targets: draft.targets,
        /** Who a tap can line this aim up on. */
        candidates,
        /** The same, with each enemy's chance to be hit: the sheet's list of targets. */
        options: targetOptions(battle, fighter, aim, candidates),
        reach: shading,
        /** Every square the aim could land on, were someone there to aim at. */
        range,
        path: path ?? null,
        /** Where the character would stand, and with what AP, once a lined-up move is made. */
        after: afterMove(fighter, path, verdict),
        reactions: path && aim === "move" ? reactionPreviews(battle, fighter, path) : [],
        /** Every square a lined-up fireball, throw or Demolish lands on. */
        area,
        /** What the action lined up would do to the HP of each character it touches: less on a hit, more for a heal. */
        hpChange: hpPreview(battle, fighter, draft, area),
        /** The low cover a lined-up fireball, fire flask or Demolish would blast away (§22). */
        blasts: isAtSquare(aim) && draft.square !== null ? blastedBy(battle.field, landsOf(fighter, aim), draft.square) : null,
        action,
        verdict,
        send,
        /** A tap on a square of the board. */
        tapSquare: (square: Square) => { apply(tapSquare(context, square)); },
        /** A tap on a character: answers whether it was taken as aiming, or the board should select it instead. */
        tapFighter: (id: number): boolean => apply(tapFighter(context, id)),
        /** A character picked from the sheet's list of targets: lines the aim up on it, but — unlike a second tap on the board — never sends. */
        pick: (id: number) => {
            const result = tapFighter(context, id);
            if (result !== "send") apply(result);
        },
    };
}

export type TurnDraft = NonNullable<ReturnType<typeof useTurnDraft>>;
