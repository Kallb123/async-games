import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import type { CharacterId } from "./characters";
import { ACTION_POINTS, newFighter, reachOf, type BattleState, type Fighter } from "./rules";
import { targetsOf } from "./ui";
import { afterMove, MOVE, reachAfter, tapFighter, tapSquare, type Draft, type TapContext } from "./useTurnDraft";

// The tap decisions behind lining up an action on the board (§17.3 PR 7):
// what a tap on a square or a character does, for each aim.

const field = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });

function ready(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

const manAtArms = ready(0, "a", "manAtArms", at(field, 4, 2));
const ally = ready(1, "a", "cleric", at(field, 0, 0), { hp: 3 });
const near = ready(2, "b", "knight", at(field, 5, 2));
const nearToo = ready(3, "b", "archer", at(field, 4, 3));
const far = ready(4, "b", "mage", at(field, 9, 4));
const body = ready(5, "b", "scout", at(field, 2, 2), { hp: 0 });
const battle: BattleState = { field, fighters: [manAtArms, ally, near, nearToo, far, body] };

/** The context a tap is read in, for the Man-at-arms with `draft` lined up. */
function context(draft: Draft): TapContext {
    const moving = draft.aim === "move" || draft.aim === "sneak";
    const kind = draft.aim === "cleave" || draft.aim === "attack" ? "attack" : undefined;
    return {
        battle,
        fighter: manAtArms,
        draft,
        reach: moving ? reachOf(battle, manAtArms) : null,
        candidates: kind ? targetsOf(battle, "a", manAtArms, kind) : [],
    };
}

describe("tapSquare", () => {
    it("lines up a move on a square in reach, and sends it on a second tap", () => {
        const square = at(field, 6, 0);
        const lined = tapSquare(context(MOVE), square);
        expect(lined).toEqual({ ...MOVE, square });
        expect(tapSquare(context(lined as Draft), square)).toBe("send");
    });

    it("ignores where the character stands, and a square a move can't stop on", () => {
        expect(tapSquare(context(MOVE), manAtArms.square)).toBeUndefined();
        expect(tapSquare(context(MOVE), ally.square)).toBeUndefined();
    });

    it("centres a fireball anywhere, and does nothing for an aim at a character", () => {
        const fireball: Draft = { aim: "fireball", square: null, targets: [] };
        expect(tapSquare(context(fireball), at(field, 9, 0))).toEqual({ ...fireball, square: at(field, 9, 0) });
        expect(tapSquare(context({ aim: "attack", square: null, targets: [] }), at(field, 9, 0))).toBeUndefined();
    });
});

describe("tapFighter", () => {
    it("lines up an attack on an enemy tapped while moving, in reach or not", () => {
        expect(tapFighter(context(MOVE), near.id)).toEqual({ aim: "attack", square: null, targets: [near.id] });
        expect(tapFighter(context(MOVE), far.id)).toEqual({ aim: "attack", square: null, targets: [far.id] });
    });

    it("sends an attack on a second tap on its target", () => {
        expect(tapFighter(context({ aim: "attack", square: null, targets: [near.id] }), near.id)).toBe("send");
    });

    it("leaves a tap on one of your own squad, or the character acting, to select", () => {
        expect(tapFighter(context(MOVE), ally.id)).toBeUndefined();
        expect(tapFighter(context({ aim: "attack", square: null, targets: [] }), manAtArms.id)).toBeUndefined();
    });

    it("takes a tap on a body while moving as a tap on its square", () => {
        expect(tapFighter(context(MOVE), body.id)).toEqual({ ...MOVE, square: body.square });
    });

    it("picks two enemies for a cleave, a third tap swapping out the first, and a tap on a chosen one letting it go", () => {
        const cleave: Draft = { aim: "cleave", square: null, targets: [] };
        const one = tapFighter(context(cleave), near.id) as Draft;
        const two = tapFighter(context(one), nearToo.id) as Draft;
        expect(two.targets).toEqual([near.id, nearToo.id]);
        expect((tapFighter(context(two), near.id) as Draft).targets).toEqual([nearToo.id]);
        // An enemy out of reach is ignored rather than selected.
        expect(tapFighter(context(two), far.id)).toEqual(two);
    });

    it("centres a fireball on whoever is tapped", () => {
        const fireball: Draft = { aim: "fireball", square: null, targets: [] };
        expect(tapFighter(context(fireball), far.id)).toEqual({ ...fireball, square: far.square });
    });
});

describe("afterMove", () => {
    const path = [at(field, 4, 2), at(field, 4, 1), at(field, 4, 0)];

    it("stands where it is with what it has, until a move is lined up", () => {
        expect(afterMove(manAtArms, undefined, null)).toEqual({ square: manAtArms.square, ap: ACTION_POINTS });
    });

    it("stands at the end of a move check allows, with what the move leaves", () => {
        expect(afterMove(manAtArms, path, { ap: 1 })).toEqual({ square: at(field, 4, 0), ap: ACTION_POINTS - 1 });
    });

    it("goes nowhere on a move check refuses", () => {
        expect(afterMove(manAtArms, path, { refused: "Not enough AP" })).toEqual({ square: manAtArms.square, ap: ACTION_POINTS });
    });
});

describe("reachAfter", () => {
    const targets = (reach: ReturnType<typeof reachAfter>) => reach.options.map(({ target, chance }) => ({ target: target.id, chance }));

    it("reads from where the character stands with no move lined up, or off its turn", () => {
        const reach = reachAfter(battle, manAtArms, undefined);
        expect(targets(reach)).toEqual([{ target: 2, chance: 100 }, { target: 3, chance: 100 }]);
        expect(reach).toMatchObject({ previewing: false, ap: undefined });
    });

    it("reads from the end of a lined-up move, with the AP it leaves", () => {
        const reach = reachAfter(battle, manAtArms, { square: at(field, 8, 4), ap: 1 });
        expect(targets(reach)).toEqual([{ target: 4, chance: 100 }]);
        expect(reach).toMatchObject({ previewing: true, ap: 1 });
    });
});
