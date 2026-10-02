import { useMemo } from "react";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { pathTo, type Reach } from "@/utils/games/battlefield/pathfinding";
import type { Square } from "@/utils/games/battlefield/terrain";
import { check, fighterById, fireballArea, isStanding, reachOf, type Action, type BattleState, type Check, type Fighter } from "./rules";
import { reachLayers, reactionPreviews, targetsOf, type TargetKind } from "./ui";

/** What the board is armed for: a tap on a square or a character lines up one of these. */
export type Aim = "move" | "sneak" | "attack" | "aimedShot" | "cleave" | "fireball" | "heal" | "raise";

/** The actions that need nothing aimed, and go the moment they're tapped. */
export const INSTANT_KINDS = ["hunker", "watch", "shieldWall"] as const;
export type InstantKind = typeof INSTANT_KINDS[number];

export interface Draft {
    aim: Aim;
    /** The square a move or a fireball is lined up on. */
    square: Square | null;
    /** The characters an attack, a heal, a raise or a cleave is lined up on. */
    targets: number[];
}

export const MOVE: Draft = { aim: "move", square: null, targets: [] };

/** The aims a tap on one character lines up, and the `check` kind that says who it can be. */
const TARGETED: Partial<Record<Aim, TargetKind>> = {
    attack: "attack",
    aimedShot: "aimedShot",
    heal: "heal",
    raise: "raise",
    // Cleave strikes where an attack could: next to the Man-at-arms.
    cleave: "attack",
};

const isMoving = (aim: Aim) => aim === "move" || aim === "sneak";

/** The action a draft has lined up, once it has everything the action needs. */
function actionOf(fighter: Fighter, { aim, square, targets }: Draft, path: Square[] | undefined): Action | null {
    switch (aim) {
        case "move":
        case "sneak": return path ? { kind: aim, fighter: fighter.id, path } : null;
        case "fireball": return square === null ? null : { kind: "fireball", fighter: fighter.id, at: square };
        case "cleave": return targets.length === 2 ? { kind: "cleave", fighter: fighter.id, targets } : null;
        default: return targets.length === 1 ? { kind: aim, fighter: fighter.id, target: targets[0] } : null;
    }
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

/** A tap on a square: a move's destination, or a fireball's centre. */
export function tapSquare({ draft, reach }: TapContext, tapped: Square): TapResult {
    if (draft.aim === "fireball") return lineUp({ ...draft, square: tapped }, tapped === draft.square);
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
    // A fireball is aimed at a square, whoever stands on it.
    if (aim === "fireball") return tapSquare(context, target.square);
    if (target.id === fighter.id) return undefined;
    const enemy = target.owner !== fighter.owner && isStanding(target);

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
    if ((enemy && (aim === "attack" || aim === "aimedShot")) || candidates.includes(id)) {
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
    const { field, fighters } = battle;
    const aim = draft.aim;
    // The reach is a search over every square of the map, so it's worked out
    // once per character and aim rather than on every render.
    const reach = useMemo(
        () => fighter && isMoving(aim) ? reachOf({ field, fighters }, fighter, aim === "sneak") : null,
        [field, fighters, fighter, aim],
    );
    const shading = useMemo(() => fighter && reach ? reachLayers(field, fighter, reach, aim === "sneak") : null, [field, fighter, reach, aim]);
    if (!fighter) return null;

    const path = reach && draft.square !== null ? pathTo(reach, draft.square)?.squares : undefined;
    const action = actionOf(fighter, draft, path);
    const verdict: Check | null = action ? check(battle, player, action) : null;
    const targetKind = TARGETED[aim];
    const candidates = targetKind ? targetsOf(battle, player, fighter, targetKind) : [];
    const context: TapContext = { battle, fighter, draft, reach, candidates };

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
        reach: shading,
        path: path ?? null,
        /** Where the character would stand, and with what AP, once a lined-up move is made. */
        after: afterMove(fighter, path, verdict),
        reactions: path && aim === "move" ? reactionPreviews(battle, fighter, path) : [],
        area: aim === "fireball" && draft.square !== null ? fireballArea(field, draft.square) : null,
        action,
        verdict,
        send,
        /** A tap on a square of the board. */
        tapSquare: (square: Square) => { apply(tapSquare(context, square)); },
        /** A tap on a character: answers whether it was taken as aiming, or the board should select it instead. */
        tapFighter: (id: number): boolean => apply(tapFighter(context, id)),
    };
}

export type TurnDraft = NonNullable<ReturnType<typeof useTurnDraft>>;
