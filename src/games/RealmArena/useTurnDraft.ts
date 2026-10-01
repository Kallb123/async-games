import { useResettingState } from "@/utils/hooks/useResettingState";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import type { Square } from "@/utils/games/battlefield/terrain";
import { check, fighterById, fireballArea, isStanding, reachOf, type Action, type BattleState, type Check, type Fighter } from "./rules";
import { reachLayers, reactionPreviews, targetsOf } from "./ui";

/** What the board is armed for: a tap on a square or a character lines up one of these. */
export type Aim = "move" | "sneak" | "attack" | "aimedShot" | "cleave" | "fireball" | "heal" | "raise";

/** The actions that need nothing aimed, and go the moment they're tapped. */
export type InstantKind = "hunker" | "watch" | "shieldWall";

interface Draft {
    aim: Aim;
    /** The square a move or a fireball is lined up on. */
    square: Square | null;
    /** The characters an attack, a heal, a raise or a cleave is lined up on. */
    targets: number[];
}

const MOVE: Draft = { aim: "move", square: null, targets: [] };

/** The aims a tap on one character lines up, and the `check` kind that says who it can be. */
const TARGETED: Partial<Record<Aim, "attack" | "aimedShot" | "heal" | "raise">> = {
    attack: "attack",
    aimedShot: "aimedShot",
    heal: "heal",
    raise: "raise",
    // Cleave strikes where an attack could: next to the Man-at-arms.
    cleave: "attack",
};

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
 * this device alone, and dropped whenever the character changes: a move, a
 * shot, a turn handed on.
 *
 * `fighter` is null when the viewer can't act with the selected character: it
 * isn't theirs, it's down, or it isn't their turn.
 */
export function useTurnDraft(battle: BattleState, player: string, fighter: Fighter | null, turnKey: string, onAct: (action: Action) => void) {
    const key = fighter ? `${turnKey}:${fighter.id}:${fighter.square}:${fighter.ap}:${fighter.hp}` : turnKey;
    const [draft, setDraft] = useResettingState<Draft>(MOVE, key);
    if (!fighter) return null;

    const { aim, square, targets } = draft;
    const moving = aim === "move" || aim === "sneak";
    const reach = moving ? reachOf(battle, fighter, aim === "sneak") : null;
    const path = reach && square !== null ? pathTo(reach, square)?.squares : undefined;
    const action = actionOf(fighter, draft, path);
    const verdict: Check | null = action ? check(battle, player, action) : null;
    const targetKind = TARGETED[aim];
    const candidates = targetKind ? targetsOf(battle, player, fighter, targetKind) : [];

    const send = () => {
        if (action && verdict && !("refused" in verdict)) onAct(action);
    };
    /** A second tap on what's already lined up sends it; a tap on anything else lines that up instead. */
    const lineUp = (next: Draft, same: boolean) => {
        if (same && action) send();
        else setDraft(next);
    };

    return {
        fighter,
        aim,
        arm: (next: Aim) => setDraft({ aim: next, square: null, targets: [] }),
        /** Lets go of whatever is lined up, back to moving. */
        clear: () => setDraft(MOVE),
        now: (kind: InstantKind) => onAct({ kind, fighter: fighter.id }),
        square,
        targets,
        /** Who a tap can line this aim up on. */
        candidates,
        reach: reach ? reachLayers(battle.field, fighter, reach, aim === "sneak") : null,
        path: path ?? null,
        reactions: path && aim === "move" ? reactionPreviews(battle, fighter, path) : [],
        area: aim === "fireball" && square !== null ? fireballArea(battle.field, square) : null,
        action,
        verdict,
        send,

        /** A tap on a square of the board. */
        tapSquare: (tapped: Square) => {
            if (moving && reach && tapped !== reach.from && reach.costs[tapped] !== Infinity) lineUp({ ...draft, square: tapped }, tapped === square);
            if (aim === "fireball") lineUp({ ...draft, square: tapped }, tapped === square);
        },

        /**
         * A tap on a character. Answers whether it was taken as aiming; if not,
         * the board selects the character instead.
         */
        tapFighter: (id: number): boolean => {
            const target = fighterById(battle, id);
            if (!target) return false;
            // A fireball is aimed at a square, whoever stands on it.
            if (aim === "fireball") {
                lineUp({ ...draft, square: target.square }, target.square === square);
                return true;
            }
            if (target.id === fighter.id) return false;
            const enemy = target.owner !== fighter.owner && isStanding(target);
            if (aim === "cleave") {
                if (!candidates.includes(id)) return enemy;
                const kept = targets.filter(one => one !== id);
                if (kept.length < targets.length) setDraft({ ...draft, targets: kept });
                else lineUp({ ...draft, targets: [...targets.slice(-1), id] }, false);
                return true;
            }
            // An enemy tapped while moving lines up an attack on it, with the
            // odds — or the reason there's none — before anything is sent.
            if (enemy && moving) {
                setDraft({ aim: "attack", square: null, targets: [id] });
                return true;
            }
            if (enemy && (aim === "attack" || aim === "aimedShot")) {
                lineUp({ ...draft, targets: [id] }, targets[0] === id);
                return true;
            }
            if (candidates.includes(id)) {
                lineUp({ ...draft, targets: [id] }, targets[0] === id);
                return true;
            }
            return false;
        },
    };
}

export type TurnDraft = NonNullable<ReturnType<typeof useTurnDraft>>;
