import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, type Battlefield } from "@/utils/games/battlefield/terrain";
import { CHARACTERS, POINTS_BUDGET, REALM, type CharacterId } from "./characters";
import { RUINED_FORT } from "./maps/ruinedFort";
import {
    ACTION_POINTS, act, afflicted, centreHolders, centrePoints, check, endTurn, fixedRolls, isBattleOver, moveAp, movementOf, musterRefusal, newFighter, reachOf,
    reactionsTo, readyMadeMuster, shotOdds, shotResult, standings, startTurn,
    type Action, type BattleState, type Fighter,
} from "./rules";

const OPEN = ["..........", "..........", "..........", "..........", ".........."];

function fieldOf(rows: string[] = OPEN, centre?: { col: number; row: number; width: number; height: number }): Battlefield {
    return buildBattlefield({ name: "Test field", rows, deployments: [], objectives: centre ? { centre } : {} });
}

/** A character ready to act: full AP, as at the start of its owner's turn. */
function fighter(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

const noRolls = fixedRolls([]);

/** Runs an action, failing the test with its refusal if it's refused. */
function run(state: BattleState, player: string, action: Action, rolls: number[] = []) {
    const outcome = act(state, player, action, fixedRolls(rolls));
    const byId = (id: number) => outcome.fighters.find(one => one.id === id)!;
    return { ...outcome, byId };
}

describe("hitting (§13.3)", () => {
    it("hits an 80% shot on 1–80, grazes on 81–90 and misses on 91–100", () => {
        expect([1, 80].map(roll => shotResult({ chance: 80, grazeChance: 10 }, roll))).toEqual(["hit", "hit"]);
        expect([81, 90].map(roll => shotResult({ chance: 80, grazeChance: 10 }, roll))).toEqual(["graze", "graze"]);
        expect([91, 100].map(roll => shotResult({ chance: 80, grazeChance: 10 }, roll))).toEqual(["miss", "miss"]);
    });

    const field = fieldOf(["..........", "..........", "....,.....", "..........", ".........."]);
    const archer = fighter(1, "a", "archer", at(field, 0, 2));
    const odds = (target: Fighter, from: Fighter = archer, others: Fighter[] = [], kind?: "attack" | "aimedShot" | "overwatch", onField = field) =>
        shotOdds({ field: onField, fighters: [from, target, ...others] }, from, target, kind);

    it("takes 20 off for half cover, and flanking adds 1 damage where there's none", () => {
        expect(odds(fighter(2, "b", "knight", at(field, 5, 2)))).toMatchObject({ chance: 60, cover: "half", flanked: false, damage: 3, grazeDamage: 2 });
        expect(odds(fighter(2, "b", "knight", at(field, 5, 3)))).toMatchObject({ chance: 80, cover: "none", flanked: true, damage: 4, grazeDamage: 2 });
    });

    it("takes 40 off for full cover, from a wall whose corner the shot passes", () => {
        const walled = fieldOf(["..........", "..........", "....#.....", "..........", "..........", ".........."]);
        const target = fighter(2, "b", "knight", at(walled, 5, 2));
        expect(odds(target, fighter(1, "a", "archer", at(walled, 2, 5)), [], "attack", walled)).toMatchObject({ chance: 40, cover: "full" });
    });

    it("grazes only on a miss by 10 or less, counted before the chance stops at 0", () => {
        const walled = fieldOf(["..........", "..........", "....#.....", "..........", "..........", ".........."]);
        const target = fighter(2, "b", "knight", at(walled, 5, 2), { effects: { hunkered: 1 } });
        const archerOdds = odds(target, fighter(1, "a", "archer", at(walled, 2, 5)), [], "attack", walled);
        const mageOdds = odds(target, fighter(1, "a", "mage", at(walled, 2, 5)), [], "attack", walled);
        expect(archerOdds).toMatchObject({ chance: 0, grazeChance: 10 });
        expect(mageOdds).toMatchObject({ chance: 0, grazeChance: 0 });
        expect(shotResult(mageOdds!, 1)).toBe("miss");
    });

    it("doubles the cover of a hunkered target", () => {
        expect(odds(fighter(2, "b", "knight", at(field, 5, 2), { effects: { hunkered: 1 } }))?.chance).toBe(40);
    });

    it("adds 10 from high ground, 20 for an aimed shot, and takes 15 off overwatch", () => {
        const tower = fieldOf(["..........", "..........", "^...,.....", "..........", ".........."]);
        const target = fighter(2, "b", "knight", at(tower, 5, 2));
        expect(odds(target, archer, [], "attack", tower)?.chance).toBe(70);
        expect(odds(fighter(2, "b", "knight", at(field, 5, 2)), archer, [], "aimedShot")?.chance).toBe(80);
        expect(odds(fighter(2, "b", "knight", at(field, 5, 2)), archer, [], "overwatch")?.chance).toBe(45);
    });

    it("gives the high ground to an attacker half a height above its target, and not a quarter", () => {
        const hill = (ground: string) => buildBattlefield({ name: "Hill", rows: [".".repeat(10)], elevation: [ground], deployments: [], objectives: {} });
        const from = (ground: string) => {
            const field = hill(ground);
            return odds(fighter(2, "b", "knight", 5), fighter(1, "a", "archer", 0), [], "attack", field)?.chance;
        };
        expect(from("2000000000")).toBe(90);
        expect(from("1000000000")).toBe(80);
        // A target as high as the attacker is no lower for it.
        expect(from("2222222222")).toBe(80);
    });

    it("never goes past certain, and then never grazes", () => {
        const target = fighter(2, "b", "knight", at(field, 5, 3));
        expect(odds(target, archer, [], "aimedShot")).toMatchObject({ chance: 100, grazeChance: 0 });
    });

    it("gives an ally beside a Knight's shield wall half cover, even when flanked", () => {
        const target = fighter(2, "b", "mage", at(field, 5, 3));
        const knight = fighter(3, "b", "knight", at(field, 6, 3), { effects: { shieldWall: 1 } });
        expect(odds(target, archer, [knight])).toMatchObject({ chance: 60, cover: "half", flanked: false });
        expect(odds(target, archer, [{ ...knight, owner: "a" }])).toMatchObject({ chance: 80 });
    });

    it("can't be taken out of range, out of sight, or with a melee weapon", () => {
        const far = fieldOf(["......................"]);
        expect(odds(fighter(2, "b", "knight", at(far, 21, 0)), fighter(1, "a", "archer", at(far, 0, 0)), [], "attack", far)).toBeUndefined();
        expect(odds(fighter(2, "b", "knight", at(far, 20, 0)), fighter(1, "a", "archer", at(far, 0, 0)), [], "attack", far)).toBeDefined();
        const walled = fieldOf(["..#.."]);
        expect(odds(fighter(2, "b", "knight", at(walled, 4, 0)), fighter(1, "a", "archer", at(walled, 0, 0)), [], "attack", walled)).toBeUndefined();
        expect(odds(fighter(2, "b", "knight", at(field, 1, 2)), fighter(1, "a", "knight", at(field, 0, 2)))).toBeUndefined();
    });
});

describe("the AP a move costs (§13.2)", () => {
    it("rounds the movement points up to whole AP, each buying the character's allowance", () => {
        expect(moveAp(newFighter(0, "a", "knight", 0), 4)).toBe(1);
        expect(moveAp(newFighter(0, "a", "knight", 0), 4.5)).toBe(2);
        expect(moveAp(newFighter(0, "a", "manAtArms", 0), 12)).toBe(2);
        expect(moveAp(newFighter(0, "a", "scout", 0), 8)).toBe(1);
    });

    it("costs a sneak 2 AP an allowance", () => {
        expect(moveAp(newFighter(0, "a", "scout", 0), 8, true)).toBe(2);
        expect(moveAp(newFighter(0, "a", "scout", 0), 9, true)).toBe(4);
    });

    it("shades as far as the AP left will go", () => {
        const field = fieldOf(["................................"]);
        const scout = fighter(1, "a", "scout", at(field, 0, 0), { ap: 3 });
        const reach = reachOf({ field, fighters: [scout] }, scout);
        expect(reach.costs[at(field, 24, 0)]).toBe(24);
        expect(reach.costs[at(field, 25, 0)]).toBe(Infinity);
        expect(reachOf({ field, fighters: [scout] }, scout, true).costs[at(field, 9, 0)]).toBe(Infinity);
    });

    it("lets a Scout climb a full height that nobody else can, and no higher (§25.2)", () => {
        const ledge = (ground: string) => buildBattlefield({ name: "Ledge", rows: ["...."], elevation: [ground], deployments: [], objectives: {} });
        const top = (ground: string, character: "scout" | "knight") => {
            const field = ledge(ground);
            const mover = fighter(1, "a", character, 0);
            return reachOf({ field, fighters: [mover] }, mover).costs[3];
        };
        expect(top("0004", "scout")).toBeLessThan(Infinity);
        expect(top("0004", "knight")).toBe(Infinity);
        expect(top("0005", "scout")).toBe(Infinity);
    });

    it("refuses a path climbing further than the character can", () => {
        const field = buildBattlefield({ name: "Ledge", rows: ["...."], elevation: ["0004"], deployments: [], objectives: {} });
        const knight = fighter(1, "a", "knight", 2, { ap: ACTION_POINTS });
        const scout = fighter(2, "a", "scout", 2, { ap: ACTION_POINTS });
        expect(check({ field, fighters: [knight] }, "a", { kind: "move", fighter: 1, path: [2, 3] })).toMatchObject({ refused: "That path can't be walked" });
        expect(check({ field, fighters: [scout] }, "a", { kind: "move", fighter: 2, path: [2, 3] })).not.toHaveProperty("refused");
    });
});

describe("check", () => {
    const field = fieldOf(["....,.....", "..........", "....#....."]);
    const mine = fighter(1, "a", "manAtArms", at(field, 0, 0));
    const enemy = fighter(2, "b", "archer", at(field, 2, 1));
    const state: BattleState = { field, fighters: [mine, enemy, fighter(3, "a", "knight", at(field, 2, 0))] };
    const refusal = (action: unknown, on = state, player = "a") => {
        const checked = check(on, player, action);
        return "refused" in checked ? checked.refused : undefined;
    };

    it("refuses anything that isn't an action", () => {
        for (const action of [null, undefined, "move", 7, {}, { kind: "fly", fighter: 1 }]) expect(refusal(action)).toBeDefined();
        expect(refusal({ kind: "move", fighter: 1, path: "east" })).toBe("That isn't a path");
        expect(refusal({ kind: "move", fighter: 1, path: [0, 1.5] })).toBe("That isn't a path");
        expect(refusal({ kind: "move", fighter: 1, path: [0, -1] })).toBe("That isn't a path");
    });

    it("refuses another player's character, and a downed one", () => {
        expect(refusal({ kind: "hunker", fighter: 2 })).toBe("That isn't one of your characters");
        expect(refusal({ kind: "hunker", fighter: 1 }, { field, fighters: [{ ...mine, hp: 0 }] })).toBe("That character is down");
    });

    it("prices a move by its path, through allies but not enemies, and never stopping on low cover", () => {
        expect(check(state, "a", { kind: "move", fighter: 1, path: [at(field, 0, 0), at(field, 1, 0)] })).toEqual({ ap: 1 });
        expect(refusal({ kind: "move", fighter: 1, path: [at(field, 1, 0), at(field, 0, 0)] })).toBe("A path starts where the character stands");
        expect(refusal({ kind: "move", fighter: 1, path: [at(field, 0, 0), at(field, 1, 0), at(field, 2, 0)] })).toBe("Nobody can stop there");
        expect(check(state, "a", { kind: "move", fighter: 1, path: [0, 1, 2, 3].map(col => at(field, col, 0)) })).toEqual({ ap: 1 });
        expect(refusal({ kind: "move", fighter: 1, path: [at(field, 0, 0), at(field, 1, 1), at(field, 2, 1), at(field, 3, 1)] })).toBe("An enemy is in the way");
        expect(refusal({ kind: "move", fighter: 1, path: [0, 1, 2, 3, 4].map(col => at(field, col, 0)) })).toBe("Nobody can stop there");
        expect(refusal({ kind: "move", fighter: 1, path: [at(field, 0, 0), at(field, 0, 2)] })).toBe("That path can't be walked");
        expect(check(state, "a", { kind: "move", fighter: 1, path: [0, 1, 2, 3, 4, 5].map(col => at(field, col, 0)) })).toEqual({ ap: 2 });
    });

    it("refuses what the AP left can't pay for", () => {
        const tired = { field, fighters: [{ ...mine, ap: 1 }, { ...enemy, square: at(field, 1, 1) }] };
        expect(refusal({ kind: "attack", fighter: 1, target: 2 }, tired)).toBe("Not enough AP");
        expect(refusal({ kind: "watch", fighter: 1 }, tired)).toBe("Going on watch needs at least 2 AP");
        expect(check(tired, "a", { kind: "hunker", fighter: 1 })).toEqual({ ap: 1 });
    });

    it("strikes only an enemy next to it", () => {
        expect(refusal({ kind: "attack", fighter: 1, target: 3 })).toBe("Pick an enemy");
        expect(refusal({ kind: "attack", fighter: 1, target: 2 })).toBe("Too far away to strike");
        expect(check({ field, fighters: [mine, { ...enemy, square: at(field, 1, 1) }] }, "a", { kind: "attack", fighter: 1, target: 2 })).toEqual({ ap: 2 });
    });

    it("lets a character use only its own abilities, and only when they're ready", () => {
        expect(refusal({ kind: "fireball", fighter: 1, at: 5 })).toBe("A Man-at-arms can't use Fireball");
        const knight = fighter(3, "a", "knight", at(field, 2, 0));
        expect(check({ field, fighters: [knight] }, "a", { kind: "shieldWall", fighter: 3 })).toEqual({ ap: 2 });
        expect(refusal({ kind: "shieldWall", fighter: 3 }, { field, fighters: [{ ...knight, cooldowns: { shieldWall: 1 } }] })).toBe("Shield wall isn't ready yet");
    });
});

describe("act", () => {
    it("spends the AP and moves the character, leaving the state it was given alone", () => {
        const field = fieldOf();
        const state: BattleState = { field, fighters: [fighter(1, "a", "knight", at(field, 0, 0))] };
        const before = structuredClone(state.fighters);
        const path = [at(field, 0, 0), at(field, 1, 0), at(field, 2, 0)];
        const { byId, events } = run(state, "a", { kind: "move", fighter: 1, path });
        expect(byId(1)).toMatchObject({ square: at(field, 2, 0), ap: 3 });
        expect(events).toEqual([{ kind: "moved", fighter: 1, path, sneaking: false }]);
        expect(state.fighters).toEqual(before);
    });

    it("throws on an action check refuses", () => {
        const field = fieldOf();
        expect(() => act({ field, fighters: [fighter(1, "a", "knight", 0)] }, "b", { kind: "hunker", fighter: 1 }, noRolls)).toThrow("That isn't one of your characters");
    });

    it("rolls a shot, and a graze does half damage, rounded up", () => {
        const field = fieldOf();
        const state: BattleState = { field, fighters: [fighter(1, "a", "archer", at(field, 0, 0)), fighter(2, "b", "knight", at(field, 5, 0))] };
        const graze = run(state, "a", { kind: "attack", fighter: 1, target: 2 }, [85]);
        expect(graze.events).toEqual([{ kind: "shot", fighter: 1, target: 2, chance: 80, roll: 85, result: "graze", damage: 2, reaction: false }]);
        expect(graze.byId(2).hp).toBe(10);
        expect(graze.byId(1).ap).toBe(2);
        expect(run(state, "a", { kind: "attack", fighter: 1, target: 2 }, [95]).byId(2).hp).toBe(12);
    });

    it("strikes in melee without a roll, and may attack twice in a turn", () => {
        const field = fieldOf();
        const state: BattleState = { field, fighters: [fighter(1, "a", "manAtArms", at(field, 0, 0)), fighter(2, "b", "mage", at(field, 1, 1))] };
        const first = run(state, "a", { kind: "attack", fighter: 1, target: 2 });
        expect(first.byId(2).hp).toBe(1);
        const second = run({ field, fighters: first.fighters }, "a", { kind: "attack", fighter: 1, target: 2 });
        expect(second.byId(2)).toMatchObject({ hp: 0, ap: 0 });
        expect(second.events).toEqual([
            { kind: "struck", fighter: 1, target: 2, damage: 4, reaction: false },
            { kind: "downed", fighter: 2, by: 1 },
            { kind: "scored", player: "a", points: 6, reason: "knockout" },
        ]);
    });

    it("hunkers down for 1 AP, ending the character's turn", () => {
        const field = fieldOf();
        const { byId } = run({ field, fighters: [fighter(1, "a", "knight", 0)] }, "a", { kind: "hunker", fighter: 1 });
        expect(byId(1)).toMatchObject({ ap: 0, effects: { hunkered: 1 } });
    });

    it("banks all the AP left on watch", () => {
        const field = fieldOf();
        const { byId, events } = run({ field, fighters: [fighter(1, "a", "archer", 0, { ap: 3 })] }, "a", { kind: "watch", fighter: 1 });
        expect(byId(1)).toMatchObject({ ap: 0, banked: 3 });
        expect(events).toEqual([{ kind: "watching", fighter: 1, banked: 3 }]);
    });
});

describe("melee across a height (§25.2)", () => {
    const step = (ground: string) => buildBattlefield({ name: "Step", rows: [".."], elevation: [ground], deployments: [], objectives: {} });
    const strike = (ground: string) => {
        const field = step(ground);
        const knight = fighter(1, "a", "knight", 0, { ap: ACTION_POINTS });
        return check({ field, fighters: [knight, fighter(2, "b", "archer", 1)] }, "a", { kind: "attack", fighter: 1, target: 2 });
    };

    it("strikes an enemy beside it a quarter above or below, and not half a height", () => {
        expect(strike("01")).not.toHaveProperty("refused");
        expect(strike("10")).not.toHaveProperty("refused");
        expect(strike("02")).toEqual({ refused: "Too far above or below to strike" });
        expect(strike("20")).toEqual({ refused: "Too far above or below to strike" });
    });

    it("cleaves only enemies within a quarter of its height", () => {
        const field = buildBattlefield({ name: "Step", rows: ["..."], elevation: ["002"], deployments: [], objectives: {} });
        const man = fighter(1, "a", "manAtArms", 1, { ap: ACTION_POINTS });
        const state = { field, fighters: [man, fighter(2, "b", "archer", 0), fighter(3, "b", "archer", 2)] };
        expect(check(state, "a", { kind: "cleave", fighter: 1, targets: [2, 3] })).toEqual({ refused: "Both enemies must be next to them, within a quarter of their height" });
    });
});

describe("reactions (§13.4)", () => {
    const field = fieldOf();
    const path = [at(field, 9, 4), at(field, 9, 3), at(field, 9, 2), at(field, 8, 2)];

    it("shoot at an enemy that moves where an overwatcher can see, at −15, once per move", () => {
        const archer = fighter(1, "b", "archer", at(field, 0, 0), { ap: 0, banked: 4 });
        const mover = fighter(2, "a", "manAtArms", path[0]);
        const { byId, events } = run({ field, fighters: [archer, mover] }, "a", { kind: "move", fighter: 2, path }, [1]);
        expect(events).toEqual([
            { kind: "moved", fighter: 2, path: path.slice(0, 2), sneaking: false },
            { kind: "shot", fighter: 1, target: 2, chance: 65, roll: 1, result: "hit", damage: 4, reaction: true },
            { kind: "moved", fighter: 2, path: path.slice(1), sneaking: false },
        ]);
        expect(byId(1).banked).toBe(2);
        expect(byId(2)).toMatchObject({ hp: 4, square: path[3] });
    });

    it("come nearest watcher first, and not from one without 2 AP banked", () => {
        const archer = fighter(1, "b", "archer", at(field, 0, 0), { banked: 4 });
        const mage = fighter(3, "b", "mage", at(field, 9, 0), { banked: 2 });
        const spent = fighter(4, "b", "archer", at(field, 0, 4), { banked: 1 });
        const mover = fighter(2, "a", "manAtArms", path[0]);
        expect(reactionsTo({ field, fighters: [archer, mage, spent, mover] }, mover, path)).toEqual([{ watcher: 3, step: 1 }, { watcher: 1, step: 1 }]);
    });

    it("strike from guard at an enemy that steps next to it", () => {
        const knight = fighter(1, "b", "knight", at(field, 5, 2), { banked: 4 });
        const scout = fighter(2, "a", "scout", at(field, 8, 2));
        const steps = [at(field, 8, 2), at(field, 7, 2), at(field, 6, 1), at(field, 6, 0)];
        expect(reactionsTo({ field, fighters: [knight, scout] }, scout, steps)).toEqual([{ watcher: 1, step: 2 }]);
        const { byId } = run({ field, fighters: [knight, scout] }, "a", { kind: "move", fighter: 2, path: steps });
        expect(byId(2)).toMatchObject({ hp: 2, square: steps[3] });
    });

    it("strike from guard only at an enemy within a quarter of its height (§25.2)", () => {
        const ledge = buildBattlefield({ name: "Ledge", rows: [".........."], elevation: ["0000220000"], deployments: [], objectives: {} });
        const knight = fighter(1, "b", "knight", 3, { banked: 4 });
        const scout = fighter(2, "a", "scout", 6);
        // Along the ledge, half a height above the Knight, past it, and back down to the ground beyond it.
        expect(reactionsTo({ field: ledge, fighters: [knight, scout] }, scout, [6, 5, 4])).toEqual([]);
        const low = buildBattlefield({ name: "Ledge", rows: [".........."], elevation: ["0000110000"], deployments: [], objectives: {} });
        expect(reactionsTo({ field: low, fighters: [knight, scout] }, scout, [6, 5, 4])).toEqual([{ watcher: 1, step: 2 }]);
    });

    it("stop the mover where one downs it, and score the knock-out", () => {
        const archers = [fighter(1, "b", "archer", at(field, 0, 0), { banked: 2 }), fighter(3, "b", "archer", at(field, 0, 4), { banked: 2 })];
        const mover = fighter(2, "a", "mage", path[0], { hp: 4 });
        const { byId, events } = run({ field, fighters: [...archers, mover] }, "a", { kind: "move", fighter: 2, path }, [1]);
        // The archer at the bottom is the nearer, so it shoots first, and the other never does.
        expect(byId(2)).toMatchObject({ hp: 0, square: path[1] });
        expect([byId(3).banked, byId(1).banked]).toEqual([0, 2]);
        expect(events.slice(-2)).toEqual([{ kind: "downed", fighter: 2, by: 3 }, { kind: "scored", player: "b", points: 6, reason: "knockout" }]);
    });

    it("never come mid-climb, only as the mover lands where it could stop", () => {
        const rubble = fieldOf(["..........", ".....,....", ".........."]);
        const knight = fighter(1, "b", "knight", at(rubble, 6, 0), { banked: 4 });
        const scout = fighter(2, "a", "scout", at(rubble, 3, 1), { hp: 1 });
        const steps = [3, 4, 5, 6].map(col => at(rubble, col, 1));
        expect(reactionsTo({ field: rubble, fighters: [knight, scout] }, scout, steps)).toEqual([{ watcher: 1, step: 3 }]);
        expect(run({ field: rubble, fighters: [knight, scout] }, "a", { kind: "move", fighter: 2, path: steps }).byId(2)).toMatchObject({ hp: 0, square: steps[3] });
    });

    it("aren't set off by a sneaking Scout", () => {
        const archer = fighter(1, "b", "archer", at(field, 0, 0), { banked: 4 });
        const scout = fighter(2, "a", "scout", path[0]);
        const { byId, events } = run({ field, fighters: [archer, scout] }, "a", { kind: "sneak", fighter: 2, path });
        expect(events).toEqual([{ kind: "moved", fighter: 2, path, sneaking: true }]);
        expect(byId(2).ap).toBe(2);
        expect(byId(1).banked).toBe(4);
    });
});

describe("abilities (§13.5, §13.6)", () => {
    const field = fieldOf();

    it("cleave strikes two different enemies next to the Man-at-arms, then cools down", () => {
        const fighters = [fighter(1, "a", "manAtArms", at(field, 1, 1)), fighter(2, "b", "knight", at(field, 2, 1)), fighter(3, "b", "scout", at(field, 0, 0))];
        expect(check({ field, fighters }, "a", { kind: "cleave", fighter: 1, targets: [2, 2] })).toEqual({ refused: "Pick two enemies" });
        const { byId } = run({ field, fighters }, "a", { kind: "cleave", fighter: 1, targets: [2, 3] });
        expect([byId(2).hp, byId(3).hp]).toEqual([8, 2]);
        expect(byId(1)).toMatchObject({ ap: 2, cooldowns: { cleave: 3 } });
    });

    it("aimed shot adds 20 to hit, for 3 AP", () => {
        const fighters = [fighter(1, "a", "archer", at(field, 0, 0)), fighter(2, "b", "knight", at(field, 5, 0), { effects: { hunkered: 1 } })];
        const { byId, events } = run({ field, fighters }, "a", { kind: "aimedShot", fighter: 1, target: 2 }, [100]);
        expect(events[0]).toMatchObject({ chance: 100, result: "hit" });
        expect(byId(1)).toMatchObject({ ap: 1, cooldowns: { aimedShot: 2 } });
    });

    it("fireball hits every character in the 3×3, friend or foe, and downing a friend scores nobody", () => {
        const fighters = [
            fighter(1, "a", "mage", at(field, 0, 2)),
            fighter(2, "b", "manAtArms", at(field, 5, 2)),
            fighter(3, "a", "knight", at(field, 6, 3)),
            fighter(4, "a", "scout", at(field, 4, 1), { hp: 2 }),
            fighter(5, "b", "archer", at(field, 7, 2)),
        ];
        const { byId, events } = run({ field, fighters }, "a", { kind: "fireball", fighter: 1, at: at(field, 5, 2) });
        expect([2, 3, 4, 5].map(id => byId(id).hp)).toEqual([5, 9, 0, 6]);
        expect(events).toEqual([
            { kind: "fireball", fighter: 1, at: at(field, 5, 2), targets: [2, 3, 4], damage: 3 },
            { kind: "downed", fighter: 4, by: 1 },
            { kind: "effect", fighter: 2, effect: "burning", change: "applied" },
            { kind: "effect", fighter: 3, effect: "burning", change: "applied" },
        ]);
        expect(byId(2)).toMatchObject({ effects: { burning: 2 }, burnedBy: 1 });
        expect(byId(4).effects).toEqual({});
    });

    it("fireball can't be aimed more than 12 squares away", () => {
        const wide = fieldOf(["..............."]);
        const mage = fighter(1, "a", "mage", at(wide, 0, 0));
        expect(check({ field: wide, fighters: [mage] }, "a", { kind: "fireball", fighter: 1, at: at(wide, 12, 0) })).toEqual({ ap: 3 });
        expect(check({ field: wide, fighters: [mage] }, "a", { kind: "fireball", fighter: 1, at: at(wide, 13, 0) })).toEqual({ refused: "Out of range or out of sight" });
    });

    it("heal restores up to 4 HP to an ally next to the Cleric, but never past full", () => {
        const fighters = [fighter(1, "a", "cleric", at(field, 1, 1)), fighter(2, "a", "knight", at(field, 2, 2), { hp: 10 })];
        const { byId, events } = run({ field, fighters }, "a", { kind: "heal", fighter: 1, target: 2 });
        expect(byId(2).hp).toBe(12);
        expect(events).toEqual([{ kind: "healed", fighter: 1, target: 2, hp: 2 }]);
        expect(check({ field, fighters: [fighters[0], { ...fighters[1], hp: 12 }] }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ refused: "Already at full health" });
        expect(check({ field, fighters }, "a", { kind: "heal", fighter: 1, target: 1 })).toEqual({ refused: "Pick an ally to heal" });
    });

    it("raise brings a downed ally back at half HP, once per battle", () => {
        const fighters = [fighter(1, "a", "cleric", at(field, 1, 1)), fighter(2, "a", "knight", at(field, 2, 2), { hp: 0, ap: 0 })];
        const { byId, events } = run({ field, fighters }, "a", { kind: "raise", fighter: 1, target: 2 });
        expect(byId(2)).toMatchObject({ hp: 6, ap: 0 });
        expect(byId(1).spent).toEqual(["raise"]);
        expect(events).toEqual([{ kind: "raised", fighter: 1, target: 2, hp: 6 }]);
        const again = { field, fighters: [{ ...byId(1), ap: 4 }, { ...byId(2), hp: 0 }] };
        expect(check(again, "a", { kind: "raise", fighter: 1, target: 2 })).toEqual({ refused: "Raise has been used this battle" });
    });

    it("raise needs room for the fallen to stand", () => {
        const fighters = [fighter(1, "a", "cleric", at(field, 1, 1)), fighter(2, "a", "knight", at(field, 2, 2), { hp: 0 }), fighter(3, "b", "scout", at(field, 2, 2))];
        expect(check({ field, fighters }, "a", { kind: "raise", fighter: 1, target: 2 })).toEqual({ refused: "There's no room to stand there" });
    });
});

describe("turns", () => {
    const field = fieldOf(OPEN, { col: 4, row: 1, width: 2, height: 2 });

    it("start with fresh AP, losing what was banked, dropping stances and counting cooldowns down", () => {
        const before = [
            fighter(1, "a", "knight", 0, { ap: 0, banked: 2, effects: { hunkered: 1, shieldWall: 1 }, cooldowns: { shieldWall: 1 } }),
            fighter(2, "a", "archer", 1, { ap: 0, cooldowns: { aimedShot: 2 } }),
            fighter(3, "b", "archer", 2, { ap: 0, banked: 4 }),
        ];
        const { fighters: after, events } = startTurn({ field, fighters: before }, "a");
        expect(after[0]).toMatchObject({ ap: 4, banked: 0, effects: {}, cooldowns: {} });
        expect(events).toEqual([]);
        expect(after[1].cooldowns).toEqual({ aimedShot: 1 });
        expect(after[2]).toEqual(before[2]);
    });

    it("end with every character that has 2 AP left on watch, unless kept still", () => {
        const fighters = [
            fighter(1, "a", "archer", 0, { ap: 3 }),
            fighter(2, "a", "knight", 1, { ap: 4 }),
            fighter(3, "a", "scout", 2, { ap: 1 }),
        ];
        const { fighters: after, events } = endTurn({ field, fighters }, "a", 1, [2]);
        expect(after.map(one => [one.ap, one.banked])).toEqual([[0, 3], [0, 0], [0, 0]]);
        expect(events).toEqual([{ kind: "watching", fighter: 1, banked: 3 }]);
        expect(endTurn({ field, fighters }, "a", 1, { length: 1 }).fighters.map(one => one.banked)).toEqual([3, 4, 0]);
    });

    it("score the centre for a player alone in it, from round 3 (§13.7, §15.3)", () => {
        const holder = fighter(1, "a", "knight", at(field, 4, 1));
        expect(centrePoints({ field, fighters: [holder] }, "a", 2)).toBe(0);
        expect(centrePoints({ field, fighters: [holder] }, "a", 3)).toBe(5);
        expect(centrePoints({ field, fighters: [holder] }, "b", 3)).toBe(0);
        expect(centrePoints({ field, fighters: [holder, fighter(2, "b", "scout", at(field, 5, 2))] }, "a", 3)).toBe(0);
        expect(centrePoints({ field, fighters: [holder, fighter(2, "b", "scout", at(field, 5, 2), { hp: 0 })] }, "a", 3)).toBe(5);
        expect(endTurn({ field, fighters: [holder] }, "a", 3).events).toContainEqual({ kind: "scored", player: "a", points: 5, reason: "centre" });
    });

    it("name each player standing in the centre once, leaving out the fallen", () => {
        const fighters = [
            fighter(1, "a", "knight", at(field, 4, 1)),
            fighter(2, "a", "archer", at(field, 5, 1)),
            fighter(3, "b", "scout", at(field, 5, 2), { hp: 0 }),
        ];
        expect(centreHolders({ field, fighters })).toEqual(["a"]);
        expect(centreHolders({ field, fighters: [...fighters, fighter(4, "b", "mage", at(field, 4, 2))] })).toEqual(["a", "b"]);
    });
});

describe("the end of the battle (§5.1)", () => {
    const field = fieldOf();
    const players = ["a", "b"];

    it("comes at the turn limit, or when one squad is left", () => {
        const both = { field, fighters: [fighter(1, "a", "knight", 0), fighter(2, "b", "knight", 1)] };
        expect(isBattleOver(both, players, 14)).toBe(false);
        expect(isBattleOver(both, players, 15)).toBe(true);
        expect(isBattleOver({ field, fighters: [both.fighters[0], { ...both.fighters[1], hp: 0 }] }, players, 1)).toBe(true);
    });

    it("goes to the higher score, then the more points standing, then the later seat", () => {
        const fighters = [fighter(1, "a", "knight", 0), fighter(2, "b", "knight", 1)];
        expect(standings({ field, fighters }, players, { a: 10, b: 5 })).toEqual(["a", "b"]);
        expect(standings({ field, fighters }, players, { a: 5, b: 5 })).toEqual(["b", "a"]);
        expect(standings({ field, fighters: [...fighters, fighter(3, "a", "scout", 2)] }, players, { a: 5, b: 5 })).toEqual(["a", "b"]);
        expect(standings({ field, fighters: [...fighters, fighter(3, "a", "scout", 2, { hp: 0 })] }, players, {})).toEqual(["b", "a"]);
    });
});

describe("mustering", () => {
    const budget = POINTS_BUDGET[2];
    const zone = RUINED_FORT.deployments[0];

    it("places the ready-made squad legally for either seat on the Ruined Fort", () => {
        for (const seat of [0, 1]) {
            const picks = readyMadeMuster(RUINED_FORT, seat, REALM.readyMade[2]);
            expect(picks.map(pick => pick.character)).toEqual(REALM.readyMade[2]);
            expect(musterRefusal(RUINED_FORT, seat, picks, budget)).toBeUndefined();
        }
    });

    it("spreads a ready-made squad over the whole zone when one row is too narrow", () => {
        const narrow = buildBattlefield({ name: "Narrow", rows: ["...", "...", "..."], deployments: [{ col: 0, row: 0, width: 2, height: 3 }], objectives: {} });
        const squad = REALM.readyMade[2];
        const picks = readyMadeMuster(narrow, 0, squad);
        expect(musterRefusal(narrow, 0, picks, budget)).toBeUndefined();
        expect(() => readyMadeMuster(narrow, 0, [...squad, "scout", "scout"])).toThrow("too small");
    });

    it("refuses a squad that breaks the rules", () => {
        const pick = (character: string, i: number) => ({ character, square: zone[i] });
        expect(musterRefusal(RUINED_FORT, 0, [], budget)).toBe("Muster at least one character");
        expect(musterRefusal(RUINED_FORT, 0, "squad", budget)).toBe("Muster at least one character");
        expect(musterRefusal(RUINED_FORT, 0, [pick("dragon", 0)], budget)).toBe("That isn't a character");
        expect(musterRefusal(RUINED_FORT, 0, [null], budget)).toBe("That isn't a character");
        expect(musterRefusal(RUINED_FORT, 0, ["scout", "scout", "scout"].map(pick), budget)).toBe("No more than 2 of any one character");
        expect(musterRefusal(RUINED_FORT, 0, ["mage", "mage", "knight", "knight"].map(pick), budget)).toBe("That squad costs 110 points, and the budget is 100");
        expect(musterRefusal(RUINED_FORT, 0, [{ character: "scout", square: zone[0] }, { character: "mage", square: zone[0] }], budget))
            .toBe("Each character needs its own square in your deployment zone");
        expect(musterRefusal(RUINED_FORT, 1, [pick("scout", 0)], budget)).toBe("Each character needs its own square in your deployment zone");
        expect(musterRefusal(RUINED_FORT, 5, [pick("scout", 0)], budget)).toBe("Each character needs its own square in your deployment zone");
    });

    it("musters each character at full HP with nothing to spend until its owner's turn", () => {
        expect(newFighter(7, "a", "cleric", 3)).toEqual({
            id: 7, owner: "a", character: "cleric", square: 3, hp: CHARACTERS.cleric.hp,
            ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [],
        });
    });
});

describe("status effects (§20)", () => {
    const field = fieldOf();
    /** `fighter` after one start of its owner's turn, and what happened. */
    const turnStart = (fighters: Fighter[], player = "a") => {
        const outcome = startTurn({ field, fighters }, player);
        return { ...outcome, byId: (id: number) => outcome.fighters.find(one => one.id === id)! };
    };

    describe("burning", () => {
        const mage = fighter(9, "b", "mage", at(field, 9, 4));

        it("does 1 damage at the start of each of its owner's next two turns, then goes out", () => {
            const knight = fighter(1, "a", "knight", 0, { ap: 0, effects: { burning: 2 }, burnedBy: 9 });
            const first = turnStart([knight, mage]);
            expect(first.byId(1)).toMatchObject({ hp: 11, ap: ACTION_POINTS, effects: { burning: 1 }, burnedBy: 9 });
            expect(first.events).toEqual([{ kind: "burned", fighter: 1, damage: 1 }]);
            const second = turnStart(first.fighters);
            expect(second.byId(1)).toMatchObject({ hp: 10, effects: {} });
            expect(second.byId(1)).not.toHaveProperty("burnedBy");
            const third = turnStart(second.fighters);
            expect(third.byId(1).hp).toBe(10);
            expect(third.events).toEqual([]);
        });

        it("burns only on its owner's turn", () => {
            const knight = fighter(1, "a", "knight", 0, { effects: { burning: 2 }, burnedBy: 9 });
            expect(turnStart([knight, mage], "b").byId(1)).toEqual(knight);
        });

        it("scores a knock-out for the owner of whoever set it alight", () => {
            const scout = fighter(1, "a", "scout", 0, { hp: 1, effects: { burning: 1, slowed: 2 }, burnedBy: 9 });
            const { byId, events } = turnStart([scout, mage]);
            expect(byId(1)).toMatchObject({ hp: 0, ap: 0, effects: {} });
            expect(events).toEqual([
                { kind: "burned", fighter: 1, damage: 1 },
                { kind: "downed", fighter: 1, by: 9 },
                { kind: "scored", player: "b", points: 4, reason: "knockout" },
            ]);
        });

        it("scores nobody when a player's own fire downs their character, or the one who set it has left", () => {
            const scout = fighter(1, "a", "scout", 0, { hp: 1, effects: { burning: 1 }, burnedBy: 2 });
            const ownMage = fighter(2, "a", "mage", 1);
            expect(turnStart([scout, ownMage]).events.map(event => event.kind)).toEqual(["burned", "downed"]);
            expect(turnStart([scout]).events.map(event => event.kind)).toEqual(["burned", "downed"]);
        });

        it("is set by a fireball on everyone it doesn't down, and burns longer rather than harder when set again", () => {
            const fighters = [fighter(1, "a", "mage", at(field, 0, 2)), fighter(2, "b", "knight", at(field, 5, 2), { effects: { burning: 1 }, burnedBy: 7 })];
            const { byId, events } = run({ field, fighters }, "a", { kind: "fireball", fighter: 1, at: at(field, 5, 2) });
            expect(byId(2)).toMatchObject({ hp: 9, effects: { burning: 2 }, burnedBy: 1 });
            expect(events).toContainEqual({ kind: "effect", fighter: 2, effect: "burning", change: "refreshed" });
        });
    });

    describe("stunned", () => {
        it("loses whatever was banked as it's stunned", () => {
            const archer = fighter(1, "a", "archer", 0, { ap: 0, banked: 4 });
            expect(afflicted(archer, "stunned", 9)).toEqual({
                fighter: { ...archer, banked: 0, effects: { stunned: 1 } },
                event: { kind: "effect", fighter: 1, effect: "stunned", change: "applied" },
            });
        });

        it("starts its owner's next turn with 2 AP, then lifts", () => {
            const { byId } = turnStart([fighter(1, "a", "archer", 0, { ap: 0, effects: { stunned: 1 } })]);
            expect(byId(1)).toMatchObject({ ap: 2, effects: {} });
            expect(turnStart([byId(1)]).byId(1).ap).toBe(ACTION_POINTS);
        });

        it("can't go on watch, at the end of a turn or by choice", () => {
            const archer = fighter(1, "a", "archer", 0, { effects: { stunned: 1 } });
            expect(check({ field, fighters: [archer] }, "a", { kind: "watch", fighter: 1 })).toEqual({ refused: "A stunned character can't go on watch" });
            expect(endTurn({ field, fighters: [archer] }, "a", 1).fighters[0]).toMatchObject({ ap: 0, banked: 0 });
        });
    });

    describe("slowed", () => {
        it("halves the movement allowance, rounded up", () => {
            const slowed = (character: CharacterId) => movementOf(fighter(1, "a", character, 0, { effects: { slowed: 2 } }));
            expect([slowed("knight"), slowed("manAtArms"), slowed("scout")]).toEqual([2, 3, 4]);
            expect(moveAp(fighter(1, "a", "manAtArms", 0, { effects: { slowed: 1 } }), 6)).toBe(2);
        });

        it("shades only as far as the halved allowance goes", () => {
            const wide = fieldOf(["................................"]);
            const scout = fighter(1, "a", "scout", 0, { effects: { slowed: 1 } });
            const reach = reachOf({ field: wide, fighters: [scout] }, scout);
            expect(reach.costs[16]).toBe(16);
            expect(reach.costs[17]).toBe(Infinity);
        });

        it("lasts through its owner's next turn, and lifts at the start of the one after", () => {
            const first = turnStart([fighter(1, "a", "scout", 0, { effects: { slowed: 2 } })]);
            expect(movementOf(first.byId(1))).toBe(4);
            expect(movementOf(turnStart(first.fighters).byId(1))).toBe(8);
        });
    });

    describe("marked", () => {
        const archer = fighter(1, "a", "archer", at(field, 0, 0));

        it("adds 15 to hit it, for every attacker, reactions included", () => {
            const target = fighter(2, "b", "knight", at(field, 5, 0), { effects: { marked: 2 } });
            const state = { field, fighters: [archer, target] };
            expect(shotOdds(state, archer, target)?.chance).toBe(95);
            expect(shotOdds(state, archer, target, "overwatch")?.chance).toBe(80);
        });

        it("is counted on the target's turns, so it survives its next turn start", () => {
            const first = turnStart([fighter(2, "b", "knight", at(field, 5, 0), { effects: { marked: 2 } })], "b");
            expect(first.byId(2).effects).toEqual({ marked: 1 });
            expect(turnStart(first.fighters, "b").byId(2).effects).toEqual({});
        });
    });

    describe("healing (§20.2)", () => {
        const cleric = fighter(1, "a", "cleric", at(field, 0, 0));

        it("puts out burning and clears slowed and stunned, but not a mark or a stance", () => {
            const knight = fighter(2, "a", "knight", at(field, 1, 0), { hp: 9, effects: { burning: 2, slowed: 2, stunned: 1, marked: 2, shieldWall: 1 }, burnedBy: 9 });
            const { byId, events } = run({ field, fighters: [cleric, knight] }, "a", { kind: "heal", fighter: 1, target: 2 });
            expect(byId(2)).toMatchObject({ hp: 12, effects: { marked: 2, shieldWall: 1 } });
            expect(byId(2)).not.toHaveProperty("burnedBy");
            expect(events).toEqual([
                { kind: "healed", fighter: 1, target: 2, hp: 3 },
                { kind: "effect", fighter: 2, effect: "burning", change: "cleared" },
                { kind: "effect", fighter: 2, effect: "stunned", change: "cleared" },
                { kind: "effect", fighter: 2, effect: "slowed", change: "cleared" },
            ]);
        });

        it("is for an ally that is hurt or has something to clear", () => {
            const slowed = fighter(2, "a", "knight", at(field, 1, 0), { effects: { slowed: 1 } });
            expect(check({ field, fighters: [cleric, slowed] }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ ap: 2 });
            const marked = { ...slowed, effects: { marked: 1 } };
            expect(check({ field, fighters: [cleric, marked] }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ refused: "Already at full health" });
        });
    });

    it("leave a downed character, which a raise brings back clear", () => {
        const fighters = [fighter(1, "a", "manAtArms", at(field, 0, 0)), fighter(2, "b", "scout", at(field, 1, 0), { hp: 4, effects: { marked: 2, burning: 1 }, burnedBy: 1 })];
        const { byId } = run({ field, fighters }, "a", { kind: "attack", fighter: 1, target: 2 });
        expect(byId(2)).toMatchObject({ hp: 0, effects: {} });
        expect(byId(2)).not.toHaveProperty("burnedBy");
        const cleric = fighter(3, "b", "cleric", at(field, 2, 0));
        expect(run({ field, fighters: [byId(1), byId(2), cleric] }, "b", { kind: "raise", fighter: 3, target: 2 }).byId(2).effects).toEqual({});
    });

    it("can't be put on a character that's down", () => {
        expect(afflicted(fighter(1, "a", "knight", 0, { hp: 0 }), "marked", 9)).toBeUndefined();
    });

    it("hold the stances too, which end at the start of their owner's next turn", () => {
        const knight = fighter(1, "a", "knight", 0);
        const hunkered = run({ field, fighters: [knight] }, "a", { kind: "hunker", fighter: 1 }).byId(1);
        expect(hunkered.effects).toEqual({ hunkered: 1 });
        expect(turnStart([hunkered]).byId(1).effects).toEqual({});
    });
});
