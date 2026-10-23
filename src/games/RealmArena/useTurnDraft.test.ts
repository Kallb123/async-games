import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import type { CharacterId } from "./characters";
import { ABILITIES, ITEMS } from "./characters";
import { rulesetFor } from "./rulesets";
import { ACTION_POINTS, leapLanding, leapSplash, newFighter, reachOf, shotOdds, weaponOf, type BattleState, type Fighter } from "./rules";
import { targetsOf } from "./tactics";
import { afterMove, hpPreview, landing, MOVE, reachAfter, tapFighter, tapSquare, targetOptions, type Draft, type TapContext } from "./useTurnDraft";

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

describe("tapSquare, for a Demolish (§23.2)", () => {
    it("lines up the cover tapped, whoever is beside it", () => {
        const demolish: Draft = { aim: "demolish", square: null, targets: [] };
        expect(tapSquare(context(demolish), at(field, 3, 1))).toEqual({ ...demolish, square: at(field, 3, 1) });
    });
});

describe("tapFighter", () => {
    it("lines up an option's ability on an enemy out of reach, so the sheet can say why it can't be (§23.2)", () => {
        for (const aim of ["shieldBash", "cripplingShot", "huntersMark"] as const) {
            const draft: Draft = { aim, square: null, targets: [] };
            expect(tapFighter(context(draft), far.id), aim).toEqual({ ...draft, targets: [far.id] });
            expect(tapFighter(context(draft), ally.id), aim).toBeUndefined();
        }
    });

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

    it("throws an item at the square of whoever is tapped, the thrower's own included", () => {
        const thrown: Draft = { aim: "throw", square: null, targets: [] };
        expect(tapFighter(context(thrown), near.id)).toEqual({ ...thrown, square: near.square });
        expect(tapFighter(context(thrown), manAtArms.id)).toEqual({ ...thrown, square: manAtArms.square });
    });

    it("lines a draught up on the carrier when it can drink it, and leaves the tap to select when it can't", () => {
        const draught: Draft = { aim: "draught", square: null, targets: [] };
        const hurt = { ...manAtArms, hp: 2, item: "healingDraught" as const };
        const drinking = (carrier: Fighter): TapContext => {
            const state = { ...battle, fighters: battle.fighters.map(one => one.id === carrier.id ? carrier : one) };
            return { battle: state, fighter: carrier, draft: draught, reach: null, candidates: targetsOf(state, "a", carrier, "draught") };
        };
        expect(tapFighter(drinking(hurt), hurt.id)).toEqual({ ...draught, targets: [hurt.id] });
        expect(tapFighter(drinking({ ...hurt, hp: 8 }), hurt.id)).toBeUndefined();
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

describe("targetOptions", () => {
    const listed = (options: ReturnType<typeof targetOptions>) => options.map(({ target, chance }) => ({ target: target.id, chance }));

    it("lists everyone the aim could land on, a strike always hitting", () => {
        const candidates = targetsOf(battle, "a", manAtArms, "attack");
        expect(listed(targetOptions(battle, manAtArms, "cleave", candidates))).toEqual([{ target: 2, chance: 100 }, { target: 3, chance: 100 }]);
    });

    it("gives a shot its odds, likeliest first", () => {
        const archer = ready(6, "a", "archer", at(field, 0, 4));
        const marked = ready(7, "b", "knight", at(field, 6, 0), { effects: { marked: 1 } });
        const shooting: BattleState = { field, fighters: [...battle.fighters, archer, marked] };
        const options = targetOptions(shooting, archer, "attack", targetsOf(shooting, "a", archer, "attack"));
        expect(options[0].target.id).toBe(marked.id);
        for (const { target, chance } of options) expect(chance).toBe(shotOdds(shooting, archer, target)?.chance);
        expect(options[0].chance).toBeGreaterThan(options[1].chance ?? 0);
    });

    it("gives help for an ally no chance to hit", () => {
        expect(listed(targetOptions(battle, manAtArms, "heal", [ally.id]))).toEqual([{ target: 1, chance: undefined }]);
    });
});

describe("hpPreview", () => {
    const strike = weaponOf({}, manAtArms).damage;

    it("takes a strike off each character a cleave is lined up on", () => {
        const draft: Draft = { aim: "cleave", square: null, targets: [near.id, nearToo.id] };
        expect([...hpPreview(battle, manAtArms, draft, null)]).toEqual([[near.id, -strike], [nearToo.id, -strike]]);
    });

    it("takes a shot's damage on a hit", () => {
        const archer = ready(6, "a", "archer", at(field, 0, 4));
        const shooting: BattleState = { field, fighters: [...battle.fighters, archer] };
        const draft: Draft = { aim: "attack", square: null, targets: [far.id] };
        expect(hpPreview(shooting, archer, draft, null).get(far.id)).toBe(-(shotOdds(shooting, archer, far)?.damage ?? 0));
    });

    it("lands a fireball on everyone standing in the blast, allies included", () => {
        const mage = ready(6, "a", "mage", at(field, 0, 4));
        const draft: Draft = { aim: "fireball", square: manAtArms.square, targets: [] };
        const area = [manAtArms.square, near.square, body.square];
        expect([...hpPreview(battle, mage, draft, area)]).toEqual([[manAtArms.id, -ABILITIES.fireball.damage], [near.id, -ABILITIES.fireball.damage]]);
    });

    it("splashes a leap's whole ring, less what a pinch of walls shelters, but hurts only the enemies in it", () => {
        // Leap is a rules-v9 ability, so the fighters and the battle are made in v9.
        const version = { rulesVersion: 9 };
        const walled = buildBattlefield({ name: "Pinched", rows: ["..........", "..........", "....#.....", "...#......", ".........."], deployments: [], objectives: {} });
        const made = (id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter =>
            ({ ...newFighter(id, owner, character, square, null, undefined, false, version), ap: ACTION_POINTS, ...extra });
        // The leaper starts beside its landing (a one-square leap), with a mate and a downed enemy there too.
        const leaper = made(0, "a", "manAtArms", at(walled, 2, 2)), mate = made(1, "a", "cleric", at(walled, 2, 3));
        const hit = made(2, "b", "knight", at(walled, 3, 1)), hitToo = made(3, "b", "archer", at(walled, 4, 1));
        const fallen = made(4, "b", "scout", at(walled, 2, 1), { hp: 0 }), sheltered = made(5, "b", "mage", at(walled, 4, 3));
        const leapBattle: BattleState = { field: walled, fighters: [leaper, mate, hit, hitToo, fallen, sheltered], ...version };

        const down = at(walled, 3, 2);
        expect(leapLanding(leapBattle, leaper, down)).toBe(true);
        // The ring is what's shaded: every square it reaches, the sheltered corner and the landing not among them.
        const area = landing(leapBattle, leaper, "leap", down);
        expect(area).toEqual(leapSplash(walled, down));
        expect(area).toContain(leaper.square);
        expect(area).not.toContain(sheltered.square);
        expect(area).not.toContain(down);
        // The damage is the enemies' alone: not the mate or the leaper in the ring, nor the fallen or the sheltered.
        const draft: Draft = { aim: "leap", square: down, targets: [] };
        const damage = rulesetFor(9).ABILITIES.leap!.damage!;
        expect([...hpPreview(leapBattle, leaper, draft, area)].sort()).toEqual([[hit.id, -damage], [hitToo.id, -damage]]);
        // A landing with no enemy beside it still shades its ring, and previews no blow.
        const quiet = at(walled, 8, 1), ring = landing(leapBattle, leaper, "leap", quiet);
        expect(ring).toHaveLength(8);
        expect(hpPreview(leapBattle, leaper, { ...draft, square: quiet }, ring).size).toBe(0);
    });

    it("gives back what a heal or a draught restores", () => {
        expect([...hpPreview(battle, manAtArms, { aim: "heal", square: null, targets: [ally.id] }, null)]).toEqual([[ally.id, ABILITIES.heal.hp]]);
        expect([...hpPreview(battle, manAtArms, { aim: "draught", square: null, targets: [ally.id] }, null)]).toEqual([[ally.id, ITEMS.healingDraught.hp]]);
    });

    it("touches nobody with a mark or a move", () => {
        expect(hpPreview(battle, manAtArms, { aim: "huntersMark", square: null, targets: [near.id] }, null).size).toBe(0);
        expect(hpPreview(battle, manAtArms, MOVE, null).size).toBe(0);
    });
});
