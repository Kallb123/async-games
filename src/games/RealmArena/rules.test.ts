import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { battlefieldWith, buildBattlefield, TERRAIN, type Battlefield } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, ITEMS, kitOf, musterBudget, OPTIONS, REALM, THROW_RANGE, type CharacterId, type ItemId, type OptionId } from "./characters";
import { RUINED_FORT } from "./maps/ruinedFort";
import {
    abilitiesOf, ACTION_POINTS, act, afflicted, areaAround, blastedBy, blastedIn, centreHolders, centrePoints, check, endTurn, fixedRolls, isBattleOver, moveAp, movementOf, musterPoints, musterRefusal,
    newFighter, pickOf, purified, reachOf, reactionsTo, readyMadeMuster, shotOdds, shotResult, smokeSquares, standings, startTurn, storedFighter, watchedSquares, weaponOf,
    type Action, type BattleState, type Fighter, type MusterPick,
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
        expect(refusal({ kind: "fireball", fighter: 1, at: 5 })).toBe("This Man-at-arms can't use Fireball");
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

    it("never writes to anything inside the fighters it was given: cooldowns, effects, the spent and the hurt", () => {
        const field = fieldOf();
        const deepFreeze = <T>(value: T): T => {
            if (value && typeof value === "object") Object.values(Object.freeze(value)).forEach(deepFreeze);
            return value;
        };
        const state: BattleState = deepFreeze({ field, fighters: [
            fighter(1, "a", "manAtArms", at(field, 0, 0), { option: "shieldBash" }),
            fighter(2, "b", "archer", at(field, 1, 0), { woundedBy: ["c"] }),
            fighter(3, "a", "cleric", at(field, 0, 1)),
            fighter(4, "a", "knight", at(field, 1, 1), { hp: 0 }),
        ] });
        // A frozen fighter throws on any write, so these only pass on a copy.
        const bashed = run(state, "a", { kind: "shieldBash", fighter: 1, target: 2 });
        expect(bashed.byId(1).cooldowns.shieldBash).toBeGreaterThan(0);
        expect(bashed.byId(2).effects.stunned).toBeGreaterThan(0);
        expect(bashed.byId(2).woundedBy).toEqual(["c", "a"]);
        expect(run(state, "a", { kind: "raise", fighter: 3, target: 4 }).byId(3).spent).toEqual(["raise"]);
    });

    it("turns a mover to face the way it last stepped, and leaves anyone else facing as they were", () => {
        const field = fieldOf();
        const state: BattleState = { field, fighters: [fighter(1, "a", "scout", at(field, 0, 0)), fighter(2, "a", "knight", at(field, 5, 4), { facing: 6 })] };
        // Along the columns, then down a diagonal: it ends facing the diagonal.
        const path = [at(field, 0, 0), at(field, 1, 0), at(field, 2, 1)];
        const { byId } = run(state, "a", { kind: "move", fighter: 1, path });
        expect(byId(1).facing).toBe(1);
        expect(byId(2).facing).toBe(6);
        expect(run(state, "a", { kind: "hunker", fighter: 1 }).byId(1)).not.toHaveProperty("facing");
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
        // Up the board, then back along the columns: the shot doesn't stop it turning.
        expect(byId(2)).toMatchObject({ hp: 4, square: path[3], facing: 4 });
    });

    it("fires down the side of full cover directly beside the overwatcher", () => {
        const lane = fieldOf([".#...", "....."]);
        const archer = fighter(1, "b", "archer", at(lane, 0, 0), { ap: 0, banked: 2 });
        const mover = fighter(2, "a", "manAtArms", at(lane, 4, 1));
        const path = [mover.square, at(lane, 3, 1)];

        expect(reactionsTo({ field: lane, fighters: [archer, mover] }, mover, path)).toEqual([{ watcher: 1, step: 1 }]);
        expect(shotOdds({ field: lane, fighters: [archer, mover] }, archer, { ...mover, square: path[1] }, "overwatch")).toBeDefined();
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

    it("come from every square watchedSquares names, and no other: what a way round keeps out of", () => {
        // A guard reaches the squares beside it; an Archer on overwatch the column it sees down, and nobody stops on low cover.
        const walled = fieldOf(["..o.#.....", "....#.....", "....#.....", "..........", ".........."]);
        const knight = fighter(1, "b", "knight", at(walled, 8, 1), { banked: 4 });
        const archer = fighter(3, "b", "archer", at(walled, 0, 0), { banked: 2 });
        const spent = fighter(4, "b", "mage", at(walled, 9, 4), { banked: 1 });
        const ally = fighter(5, "a", "archer", at(walled, 5, 4), { banked: 4 });
        const mover = fighter(2, "a", "scout", at(walled, 9, 0));
        const state = { field: walled, fighters: [knight, archer, spent, ally, mover] };
        const watched = watchedSquares(state, "a");
        walled.tiles.forEach((_, square) => {
            expect(watched.has(square)).toBe(reactionsTo(state, mover, [mover.square, square]).length > 0);
        });
        expect(watched.has(at(walled, 9, 2))).toBe(true);
        expect(watched.has(at(walled, 2, 0))).toBe(false);
        expect(watchedSquares({ field: walled, fighters: [spent, ally, mover] }, "a").size).toBe(0);
    });

    it("are kept clear of by a reach avoiding the squares watched, which goes round them", () => {
        const knight = fighter(1, "b", "knight", at(field, 5, 2), { banked: 4 });
        const mover = fighter(2, "a", "manAtArms", at(field, 4, 2), { ap: 1 });
        const state = { field, fighters: [knight, mover] };
        // Its own square is watched, and it can still leave it.
        const round = reachOf(state, mover, false, watchedSquares(state, "a"));
        expect(round.costs[at(field, 3, 2)]).toBe(1);
        expect(round.costs[at(field, 4, 1)]).toBe(Infinity);
        expect(reachOf(state, mover).costs[at(field, 4, 1)]).toBe(1);
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

    it("heal reaches an ally the Cleric can see within 12 squares, not only one next to it", () => {
        const wide = fieldOf(["..............."]);
        const cleric = fighter(1, "a", "cleric", at(wide, 0, 0));
        const heal = (x: number) => check({ field: wide, fighters: [cleric, fighter(2, "a", "knight", at(wide, x, 0), { hp: 5 })] }, "a", { kind: "heal", fighter: 1, target: 2 });
        expect(heal(12)).toEqual({ ap: 2 });
        expect(heal(13)).toEqual({ refused: "Out of range or out of sight" });
        const walled = fieldOf(["...#..."]);
        const blocked = [fighter(1, "a", "cleric", at(walled, 0, 0)), fighter(2, "a", "knight", at(walled, 6, 0), { hp: 5 })];
        expect(check({ field: walled, fighters: blocked }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ refused: "Out of range or out of sight" });
    });

    it("heal restores up to 4 HP to an ally, but never past full", () => {
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
    const budget = musterBudget(2, false);
    const zone = RUINED_FORT.deployments[0];

    it("places the ready-made squad legally for either seat on the Ruined Fort", () => {
        for (const seat of [0, 1]) {
            const picks = readyMadeMuster(RUINED_FORT, seat, REALM.readyMade[100]);
            expect(picks.map(pick => pick.character)).toEqual(REALM.readyMade[100]);
            expect(musterRefusal(RUINED_FORT, seat, picks, budget, {}, REALM)).toBeUndefined();
        }
    });

    it("spreads a ready-made squad over the whole zone when one row is too narrow", () => {
        const narrow = buildBattlefield({ name: "Narrow", rows: ["...", "...", "..."], deployments: [{ col: 0, row: 0, width: 2, height: 3 }], objectives: {} });
        const squad = REALM.readyMade[100];
        const picks = readyMadeMuster(narrow, 0, squad);
        expect(musterRefusal(narrow, 0, picks, budget, {}, REALM)).toBeUndefined();
        expect(() => readyMadeMuster(narrow, 0, [...squad, "scout", "scout"])).toThrow("too small");
    });

    it("deals a ready-made squad round a zone drawn in parts, along the middle of each (§30.9)", () => {
        // A row along the top and a column down the right: the squad alternates between them.
        const parts = [{ col: 0, row: 0, width: 6, height: 3 }, { col: 7, row: 0, width: 3, height: 9 }];
        const field = buildBattlefield({ name: "Edges", rows: Array(9).fill(".".repeat(10)), deployments: [parts], objectives: {} });
        const picks = readyMadeMuster(field, 0, ["knight", "archer", "scout", "mage", "cleric"]);
        expect(picks.map(pick => [pick.square % 10, Math.floor(pick.square / 10)])).toEqual([[1, 1], [8, 2], [3, 1], [8, 6], [5, 1]]);
        expect(musterRefusal(field, 0, picks, 200, {}, REALM)).toBeUndefined();
        // More than a part's middle line holds, and it spreads over the whole zone as a narrow one does.
        const crowded = readyMadeMuster(field, 0, Array(14).fill("manAtArms"));
        expect(new Set(crowded.map(pick => pick.square)).size).toBe(14);
        expect(crowded.every(pick => field.deployments[0].includes(pick.square))).toBe(true);
    });

    it("takes as many of any one character as the budget buys (§13.6)", () => {
        const sixMen = Array.from({ length: 6 }, (_, i) => ({ character: "manAtArms", square: zone[i] }));
        expect(musterRefusal(RUINED_FORT, 0, sixMen, budget, {}, REALM)).toBeUndefined();
        expect(musterRefusal(RUINED_FORT, 0, [...sixMen, { character: "manAtArms", square: zone[6] }], budget, {}, REALM))
            .toBe("That squad costs 105 points, and the budget is 100");
    });

    it("refuses a squad that breaks the rules", () => {
        const pick = (character: string, i: number) => ({ character, square: zone[i] });
        expect(musterRefusal(RUINED_FORT, 0, [], budget, {}, REALM)).toBe("Muster at least one character");
        expect(musterRefusal(RUINED_FORT, 0, "squad", budget, {}, REALM)).toBe("Muster at least one character");
        expect(musterRefusal(RUINED_FORT, 0, [pick("dragon", 0)], budget, {}, REALM)).toBe("That isn't a character");
        expect(musterRefusal(RUINED_FORT, 0, [null], budget, {}, REALM)).toBe("That isn't a character");
        expect(musterRefusal(RUINED_FORT, 0, [pick("scout", 0)], budget, {}, { ...REALM, characters: ["knight"] })).toBe("That character isn't in your faction");
        expect(musterRefusal(RUINED_FORT, 0, ["mage", "mage", "knight", "knight"].map(pick), budget, {}, REALM)).toBe("That squad costs 110 points, and the budget is 100");
        expect(musterRefusal(RUINED_FORT, 0, [{ character: "scout", square: zone[0] }, { character: "mage", square: zone[0] }], budget, {}, REALM))
            .toBe("Each character needs its own square in your deployment zone");
        expect(musterRefusal(RUINED_FORT, 1, [pick("scout", 0)], budget, {}, REALM)).toBe("Each character needs its own square in your deployment zone");
        expect(musterRefusal(RUINED_FORT, 5, [pick("scout", 0)], budget, {}, REALM)).toBe("Each character needs its own square in your deployment zone");
    });

    it("musters each character at full HP with nothing to spend until its owner's turn", () => {
        expect(newFighter(7, "a", "cleric", 3)).toEqual({
            id: 7, owner: "a", character: "cleric", square: 3, hp: CHARACTERS.cleric.hp,
            ap: 0, banked: 0, effects: {}, cooldowns: {}, spent: [], item: null,
        });
        expect(newFighter(7, "a", "cleric", 3, "healingDraught").item).toBe("healingDraught");
    });

    describe("with items (§21.1)", () => {
        const pick = (character: CharacterId, i: number, item?: ItemId): MusterPick => ({ character, square: zone[i], ...(item === undefined ? {} : { item }) });

        it("counts each item's points against the budget with the characters", () => {
            // 25 + 25 + 30 + 15 = 95, so one 5-point item fits and a second doesn't.
            const squad = (["knight", "knight", "mage", "manAtArms"] as const).map((character, i) => pick(character, i));
            expect(musterRefusal(RUINED_FORT, 0, squad, budget, {}, REALM)).toBeUndefined();
            const one = [pick("knight", 0, "fireFlask"), ...squad.slice(1)];
            expect(musterPoints(one)).toBe(100);
            expect(musterRefusal(RUINED_FORT, 0, one, budget, {}, REALM)).toBeUndefined();
            const two = [pick("knight", 0, "fireFlask"), pick("knight", 1, "smokePot"), ...squad.slice(2)];
            expect(musterRefusal(RUINED_FORT, 0, two, budget, {}, REALM)).toBe("That squad costs 105 points, and the budget is 100");
        });

        it("refuses anything but one item's id, and takes null for none", () => {
            for (const item of ["sword", ["fireFlask", "smokePot"], 5, { id: "fireFlask" }]) {
                expect(musterRefusal(RUINED_FORT, 0, [{ ...pick("scout", 0), item }], budget, {}, REALM), JSON.stringify(item)).toBe("That isn't an item");
            }
            expect(musterRefusal(RUINED_FORT, 0, [{ ...pick("scout", 0), item: null }], budget, {}, REALM)).toBeUndefined();
        });

        it("keeps a pick's item, and nothing else it carried", () => {
            expect(pickOf({ ...pick("scout", 0, "smokePot"), hp: 99 } as never)).toEqual({ character: "scout", square: zone[0], item: "smokePot" });
            expect(pickOf({ ...pick("scout", 0), item: null } as never)).toEqual({ character: "scout", square: zone[0] });
        });

        it("leaves the ready-made squad carrying none, and spending the whole budget still", () => {
            const picks = readyMadeMuster(RUINED_FORT, 0, REALM.readyMade[100]);
            expect(picks.every(one => one.item === undefined)).toBe(true);
            expect(musterPoints(picks)).toBe(budget);
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

describe("items (§21)", () => {
    const field = fieldOf(["..........", "..........", "..........", "..........", "..........", ".........."]);
    const carrying = (id: number, owner: string, character: CharacterId, square: number, item: ItemId, extra: Partial<Fighter> = {}) =>
        fighter(id, owner, character, square, { item, ...extra });

    describe("throwing", () => {
        it("needs the square in range and in sight, as a fireball does, but only 6 squares away", () => {
            const wide = fieldOf(["..............", "..............", "......#......."]);
            const scout = carrying(1, "a", "scout", at(wide, 0, 0), "thunderFlask");
            const state = { field: wide, fighters: [scout] };
            expect(check(state, "a", { kind: "throw", fighter: 1, at: at(wide, THROW_RANGE, 0) })).toEqual({ ap: 2 });
            expect(check(state, "a", { kind: "throw", fighter: 1, at: at(wide, THROW_RANGE + 1, 0) })).toEqual({ refused: "Out of range or out of sight" });
            const behind = { field: wide, fighters: [{ ...scout, square: at(wide, 5, 2) }] };
            expect(check(behind, "a", { kind: "throw", fighter: 1, at: at(wide, 7, 2) })).toEqual({ refused: "Out of range or out of sight" });
            expect(check(state, "a", { kind: "throw", fighter: 1, at: -1 })).toEqual({ refused: "Out of range or out of sight" });
        });

        it("needs something to throw: not nothing, and not a healing draught", () => {
            const throwFrom = (item: Fighter["item"]) => check({ field, fighters: [fighter(1, "a", "scout", 0, { item })] }, "a", { kind: "throw", fighter: 1, at: 2 });
            expect(throwFrom(null)).toEqual({ refused: "They have nothing to throw" });
            expect(throwFrom("healingDraught")).toEqual({ refused: "They have nothing to throw" });
            expect(throwFrom("smokePot")).toEqual({ ap: 1 });
        });

        it("uses the item up, whatever it hit, so it can't be thrown twice", () => {
            const scout = carrying(1, "a", "scout", at(field, 0, 0), "fireFlask");
            const { byId, events } = run({ field, fighters: [scout] }, "a", { kind: "throw", fighter: 1, at: at(field, 3, 0) });
            expect(byId(1)).toMatchObject({ item: null, ap: 2 });
            expect(events).toEqual([{ kind: "thrown", fighter: 1, item: "fireFlask", at: at(field, 3, 0), targets: [], damage: 2 }]);
            expect(check({ field, fighters: [byId(1)] }, "a", { kind: "throw", fighter: 1, at: at(field, 3, 0) })).toEqual({ refused: "They have nothing to throw" });
        });
    });

    describe("the fire flask", () => {
        it("does 2 damage to whoever is on the one square, friend or foe, and sets them burning", () => {
            const scout = carrying(1, "a", "scout", at(field, 0, 0), "fireFlask");
            const ally = fighter(2, "a", "knight", at(field, 3, 0));
            const beside = fighter(3, "b", "knight", at(field, 4, 0));
            const { byId, events } = run({ field, fighters: [scout, ally, beside] }, "a", { kind: "throw", fighter: 1, at: at(field, 3, 0) });
            expect(byId(2)).toMatchObject({ hp: 10, effects: { burning: 2 }, burnedBy: 1 });
            expect(byId(3)).toMatchObject({ hp: 12, effects: {} });
            expect(events).toEqual([
                { kind: "thrown", fighter: 1, item: "fireFlask", at: at(field, 3, 0), targets: [2], damage: 2 },
                { kind: "effect", fighter: 2, effect: "burning", change: "applied" },
            ]);
        });

        it("scores the knock-out for the thrower, and leaves nobody it downed burning", () => {
            const scout = carrying(1, "a", "scout", at(field, 0, 0), "fireFlask");
            const mage = fighter(2, "b", "mage", at(field, 3, 0), { hp: 2 });
            const { byId, events } = run({ field, fighters: [scout, mage] }, "a", { kind: "throw", fighter: 1, at: at(field, 3, 0) });
            expect(byId(2)).toMatchObject({ hp: 0, effects: {} });
            expect(events).toContainEqual({ kind: "scored", player: "a", points: 6, reason: "knockout" });
            expect(events.some(event => event.kind === "effect")).toBe(false);
        });
    });

    describe("the thunder flask", () => {
        it("stuns everyone in the 3×3, friend or foe, losing what they banked, and does no damage", () => {
            const scout = carrying(1, "a", "scout", at(field, 0, 0), "thunderFlask");
            const ally = fighter(2, "a", "knight", at(field, 3, 1));
            const watcher = fighter(3, "b", "archer", at(field, 5, 3), { banked: 4 });
            const outside = fighter(4, "b", "knight", at(field, 6, 2));
            const { byId, events } = run({ field, fighters: [scout, ally, watcher, outside] }, "a", { kind: "throw", fighter: 1, at: at(field, 4, 2) });
            expect(byId(2)).toMatchObject({ hp: 12, effects: { stunned: 1 } });
            expect(byId(3)).toMatchObject({ hp: 6, banked: 0, effects: { stunned: 1 } });
            expect(byId(4)).toMatchObject({ effects: {} });
            expect(events).toEqual([
                { kind: "thrown", fighter: 1, item: "thunderFlask", at: at(field, 4, 2), targets: [2, 3], damage: 0 },
                { kind: "effect", fighter: 2, effect: "stunned", change: "applied" },
                { kind: "effect", fighter: 3, effect: "stunned", change: "applied" },
            ]);
            expect(areaAround(field, at(field, 4, 2))).toHaveLength(9);
        });
    });

    describe("the smoke pot", () => {
        const archer = fighter(1, "a", "archer", at(field, 0, 0));
        const thrower = carrying(2, "b", "scout", at(field, 9, 5), "smokePot");
        const smoked = run({ field, fighters: [archer, thrower] }, "b", { kind: "throw", fighter: 2, at: at(field, 6, 2) });

        it("leaves a cloud on the 3×3 for 1 AP, hitting nobody", () => {
            expect(smoked.byId(2)).toMatchObject({ item: null, smoke: at(field, 6, 2), ap: 3 });
            expect(smoked.events).toEqual([{ kind: "thrown", fighter: 2, item: "smokePot", at: at(field, 6, 2), targets: [], damage: 0 }]);
            expect(smokeSquares({ field, fighters: smoked.fighters })).toEqual(new Set(areaAround(field, at(field, 6, 2))));
        });

        it("takes 20 off a shot at anyone standing in it, friend or foe of the thrower, and nobody outside it", () => {
            const inside = fighter(3, "b", "knight", at(field, 7, 3));
            const outside = fighter(4, "b", "knight", at(field, 8, 3));
            const state = { field, fighters: [...smoked.fighters, inside, outside] };
            expect(shotOdds(state, archer, inside)?.chance).toBe(60);
            expect(shotOdds(state, archer, outside)?.chance).toBe(80);
            const own = fighter(5, "a", "knight", at(field, 5, 1));
            expect(shotOdds({ field, fighters: [...state.fighters, own] }, fighter(6, "b", "archer", at(field, 9, 0)), own)?.chance).toBe(60);
        });

        it("stops overwatch firing at a mover stepping into it, but not a guard striking, nor a shot as it steps out", () => {
            const watcher = fighter(3, "b", "archer", at(field, 9, 0), { banked: 4 });
            const mover = fighter(1, "a", "manAtArms", at(field, 4, 2));
            const state = { field, fighters: [...smoked.fighters.filter(one => one.id !== 1), watcher, mover] };
            expect(reactionsTo(state, mover, [at(field, 4, 2), at(field, 5, 2), at(field, 6, 2)])).toEqual([]);
            expect(reactionsTo(state, mover, [at(field, 4, 2), at(field, 5, 2), at(field, 5, 3), at(field, 5, 4)])).toEqual([{ watcher: 3, step: 3 }]);
            const guard = fighter(4, "b", "knight", at(field, 7, 1), { banked: 4 });
            expect(reactionsTo({ ...state, fighters: [...state.fighters, guard] }, mover, [at(field, 4, 2), at(field, 5, 2), at(field, 6, 2)]))
                .toEqual([{ watcher: 4, step: 2 }]);
        });

        it("clears at the start of the thrower's next turn, and not before", () => {
            const state = { field, fighters: smoked.fighters };
            expect(startTurn(state, "a").fighters.find(one => one.id === 2)?.smoke).toBe(at(field, 6, 2));
            const next = startTurn(state, "b").fighters;
            expect(next.find(one => one.id === 2)).not.toHaveProperty("smoke");
            expect(smokeSquares({ field, fighters: next }).size).toBe(0);
        });

        it("goes with a thrower who is downed", () => {
            const knight = fighter(3, "a", "knight", at(field, 8, 5));
            const thrown = { ...smoked.byId(2), hp: 1 };
            const { byId } = run({ field, fighters: [knight, thrown] }, "a", { kind: "attack", fighter: 3, target: 2 });
            expect(byId(2)).toMatchObject({ hp: 0 });
            expect(byId(2)).not.toHaveProperty("smoke");
        });
    });

    describe("the healing draught", () => {
        it("gives 3 HP back to the carrier or an ally next to it, never past full, for 1 AP", () => {
            const carrier = carrying(1, "a", "archer", at(field, 0, 0), "healingDraught", { hp: 2 });
            const ally = fighter(2, "a", "knight", at(field, 1, 0), { hp: 11 });
            const self = run({ field, fighters: [carrier, ally] }, "a", { kind: "draught", fighter: 1, target: 1 });
            expect(self.byId(1)).toMatchObject({ hp: 5, ap: 3, item: null });
            expect(self.events).toEqual([{ kind: "healed", fighter: 1, target: 1, hp: 3, via: "draught" }]);
            const other = run({ field, fighters: [carrier, ally] }, "a", { kind: "draught", fighter: 1, target: 2 });
            expect(other.byId(2).hp).toBe(12);
            expect(other.events).toEqual([{ kind: "healed", fighter: 1, target: 2, hp: 1, via: "draught" }]);
        });

        it("puts out burning and clears slowed and stunned, as a heal does", () => {
            const carrier = carrying(1, "a", "archer", at(field, 0, 0), "healingDraught", { effects: { burning: 2, slowed: 2, marked: 2 }, burnedBy: 9 });
            const { byId, events } = run({ field, fighters: [carrier] }, "a", { kind: "draught", fighter: 1, target: 1 });
            expect(byId(1)).toMatchObject({ effects: { marked: 2 } });
            expect(byId(1)).not.toHaveProperty("burnedBy");
            expect(events.slice(1)).toEqual([
                { kind: "effect", fighter: 1, effect: "burning", change: "cleared" },
                { kind: "effect", fighter: 1, effect: "slowed", change: "cleared" },
            ]);
        });

        it("is for the carrier or an ally next to it that is hurt or has something to clear", () => {
            const carrier = carrying(1, "a", "archer", at(field, 0, 0), "healingDraught", { hp: 5 });
            const draught = (target: Fighter) => check({ field, fighters: [carrier, target] }, "a", { kind: "draught", fighter: 1, target: target.id });
            expect(draught(fighter(2, "a", "knight", at(field, 2, 0), { hp: 5 }))).toEqual({ refused: "Too far away to heal" });
            expect(draught(fighter(2, "b", "knight", at(field, 1, 0), { hp: 5 }))).toEqual({ refused: "Pick an ally to heal" });
            expect(draught(fighter(2, "a", "knight", at(field, 1, 0), { hp: 0 }))).toEqual({ refused: "Pick an ally to heal" });
            expect(draught(fighter(2, "a", "knight", at(field, 1, 0)))).toEqual({ refused: "Already at full health" });
            expect(check({ field, fighters: [{ ...carrier, hp: 6 }] }, "a", { kind: "draught", fighter: 1, target: 1 })).toEqual({ refused: "Already at full health" });
        });

        it("needs a healing draught, which a Cleric's Heal still doesn't stretch to the Cleric itself", () => {
            const flask = carrying(1, "a", "archer", at(field, 0, 0), "fireFlask", { hp: 2 });
            expect(check({ field, fighters: [flask] }, "a", { kind: "draught", fighter: 1, target: 1 })).toEqual({ refused: "They have no healing draught" });
            const cleric = fighter(1, "a", "cleric", at(field, 0, 0), { hp: 2 });
            expect(check({ field, fighters: [cleric] }, "a", { kind: "heal", fighter: 1, target: 1 })).toEqual({ refused: "Pick an ally to heal" });
        });
    });

    it("are public on the battlefield: a fighter read back from before items carries none", () => {
        const { item: _, ...old } = fighter(1, "a", "scout", 0);
        expect(storedFighter(old as Fighter).item).toBeNull();
    });
});

describe("blasting low cover (§22)", () => {
    // Rubble and a low wall to either side of (4, 2), a wall above it, and
    // more rubble out of reach of anything aimed there.
    const field = fieldOf(["..........", "....#.....", "...,.o....", "..........", "........,."]);
    const fireball = (target: number): Action => ({ kind: "fireball", fighter: 1, at: target });

    it("a fireball blasts every square of low cover in its 3×3, and never a wall", () => {
        const mage = fighter(1, "a", "mage", at(field, 0, 2));
        const { events } = run({ field, fighters: [mage] }, "a", fireball(at(field, 4, 2)));
        expect(blastedIn(events)).toEqual([at(field, 3, 2), at(field, 5, 2)]);
        expect(events.at(-1)).toEqual({ kind: "blasted", fighter: 1, squares: [at(field, 3, 2), at(field, 5, 2)] });
    });

    it("happens after the damage, so it's told last, and blasts nothing that's already gone", () => {
        const mage = fighter(1, "a", "mage", at(field, 0, 2));
        const enemy = fighter(2, "b", "scout", at(field, 4, 3), { hp: 2 });
        const { events } = run({ field, fighters: [mage, enemy] }, "a", fireball(at(field, 4, 2)));
        expect(events.map(event => event.kind)).toEqual(["fireball", "downed", "scored", "blasted"]);

        const cleared = battlefieldWith(field, [at(field, 3, 2), at(field, 5, 2)]);
        const again = run({ field: cleared, fighters: [mage] }, "a", fireball(at(field, 4, 2)));
        expect(again.events.some(event => event.kind === "blasted")).toBe(false);
    });

    it("a fire flask blasts the low cover on and next to the square it lands on, though it only hurts whoever is on that one", () => {
        const scout = fighter(1, "a", "scout", at(field, 4, 4), { item: "fireFlask" });
        const { events } = run({ field, fighters: [scout] }, "a", { kind: "throw", fighter: 1, at: at(field, 4, 3) });
        expect(events).toEqual([
            { kind: "thrown", fighter: 1, item: "fireFlask", at: at(field, 4, 3), targets: [], damage: 2 },
            { kind: "blasted", fighter: 1, squares: [at(field, 3, 2), at(field, 5, 2)] },
        ]);
    });

    it("nothing else blasts: not a thunder flask, nor a smoke pot", () => {
        const state = (item: ItemId): BattleState => ({ field, fighters: [fighter(1, "a", "scout", at(field, 4, 4), { item })] });
        for (const item of ["thunderFlask", "smokePot"] as const) {
            expect(blastedBy(field, ITEMS[item], at(field, 4, 2))).toEqual([]);
            expect(blastedIn(run(state(item), "a", { kind: "throw", fighter: 1, at: at(field, 4, 3) }).events)).toEqual([]);
        }
    });

    it("leaves the target its cover for the shot that blasted it, and takes it away for the next", () => {
        // A Knight behind the rubble at (3, 2), from an archer due west of it.
        const archer = fighter(1, "a", "archer", at(field, 0, 2));
        const knight = fighter(2, "b", "knight", at(field, 4, 2));
        expect(shotOdds({ field, fighters: [archer, knight] }, archer, knight, "attack")).toMatchObject({ cover: "half" });
        const cleared = battlefieldWith(field, [at(field, 3, 2)]);
        expect(cleared.tiles[at(field, 3, 2)].terrain).toBe(TERRAIN["_"]);
        expect(shotOdds({ field: cleared, fighters: [archer, knight] }, archer, knight, "attack")).toMatchObject({ flanked: true });
    });
});

describe("options (§23.2)", () => {
    const field = fieldOf(["..........", "....#.....", "...,.o....", "..........", "........,."]);
    const with_ = (option: OptionId, id: number, owner: string, square: number, extra: Partial<Fighter> = {}) =>
        fighter(id, owner, OPTIONS[option].character, square, { option, ...extra });

    describe("the kit", () => {
        it("swaps the one ability or the weapon each option replaces, and nothing else", () => {
            expect(kitOf("manAtArms", "shieldBash").abilities).toEqual(["shieldBash"]);
            expect(kitOf("knight", "demolish").abilities).toEqual(["demolish"]);
            expect(kitOf("archer", "cripplingShot").abilities).toEqual(["cripplingShot"]);
            expect(kitOf("scout", "huntersMark").abilities).toEqual(["huntersMark"]);
            expect(kitOf("cleric", "purify").abilities).toEqual(["heal", "purify"]);
            expect(kitOf("mage", "frostBolt")).toEqual({ weapon: { ...CHARACTERS.mage.weapon, name: "Frost bolt", damage: 2, effect: "slowed" }, abilities: ["fireball"] });
            for (const option of Object.keys(OPTIONS) as OptionId[]) {
                const { character } = OPTIONS[option];
                if (option !== "frostBolt") expect(kitOf(character, option).weapon).toBe(CHARACTERS[character].weapon);
            }
        });

        it("is the starter kit with no option, or with another character's", () => {
            expect(kitOf("knight")).toEqual({ weapon: CHARACTERS.knight.weapon, abilities: CHARACTERS.knight.abilities });
            expect(kitOf("knight", "shieldBash")).toEqual(kitOf("knight"));
        });

        it("is what the rules read: a starter character can't use an option's ability, nor one with the option the ability it gave up", () => {
            const bash = with_("shieldBash", 1, "a", at(field, 0, 0));
            expect(abilitiesOf(bash)).toEqual(["shieldBash"]);
            const enemy = fighter(2, "b", "knight", at(field, 1, 0));
            const enemy2 = fighter(3, "b", "scout", at(field, 0, 1));
            expect(check({ field, fighters: [bash, enemy, enemy2] }, "a", { kind: "cleave", fighter: 1, targets: [2, 3] })).toEqual({ refused: "This Man-at-arms can't use Cleave" });
            const starter = fighter(1, "a", "manAtArms", at(field, 0, 0));
            expect(check({ field, fighters: [starter, enemy] }, "a", { kind: "shieldBash", fighter: 1, target: 2 })).toEqual({ refused: "This Man-at-arms can't use Shield bash" });
        });
    });

    describe("mustering with one", () => {
        const zone = RUINED_FORT.deployments[0];
        const budget = musterBudget(2, false);
        const pick = (character: CharacterId, option?: unknown): MusterPick => ({ character, square: zone[0], ...(option === undefined ? {} : { option }) } as MusterPick);

        it("needs the rank the battle snapshotted with that character", () => {
            expect(musterRefusal(RUINED_FORT, 0, [pick("knight", "demolish")], budget, {}, REALM)).toBe("That option isn't unlocked yet");
            expect(musterRefusal(RUINED_FORT, 0, [pick("knight", "demolish")], budget, { archer: 3 }, REALM)).toBe("That option isn't unlocked yet");
            expect(musterRefusal(RUINED_FORT, 0, [pick("knight", "demolish")], budget, { knight: 1 }, REALM)).toBeUndefined();
            expect(musterRefusal(RUINED_FORT, 0, [pick("knight", "demolish")], budget, { knight: 3 }, REALM)).toBeUndefined();
        });

        it("refuses another character's option, and anything that isn't one", () => {
            for (const option of ["shieldBash", "fireball", "cleave", "__proto__", "constructor", "toString", "", ["demolish"], 1, { id: "demolish" }]) {
                expect(musterRefusal(RUINED_FORT, 0, [pick("knight", option)], budget, { knight: 3 }, REALM), JSON.stringify(option)).toBe("That isn't an option for that character");
            }
            expect(musterRefusal(RUINED_FORT, 0, [pick("knight", null)], budget, {}, REALM)).toBeUndefined();
        });

        it("costs what the kit it replaces does", () => {
            const squad = REALM.readyMade[100].map((character, i) => ({ character, square: zone[i] }));
            const options = squad.map(one => ({ ...one, option: (Object.keys(OPTIONS) as OptionId[]).find(id => OPTIONS[id].character === one.character) }));
            expect(musterPoints(options)).toBe(musterPoints(squad));
            expect(musterRefusal(RUINED_FORT, 0, options, budget, { knight: 1, manAtArms: 1, archer: 1, cleric: 1 }, REALM)).toBeUndefined();
        });

        it("is kept on the pick, and carried onto the battlefield", () => {
            expect(pickOf({ ...pick("knight", "demolish"), item: "smokePot", hp: 1 } as never)).toEqual({ character: "knight", square: zone[0], item: "smokePot", option: "demolish" });
            expect(newFighter(1, "a", "knight", 3, null, "demolish")).toMatchObject({ option: "demolish" });
            expect(newFighter(1, "a", "knight", 3)).not.toHaveProperty("option");
            expect(storedFighter(newFighter(1, "a", "knight", 3, null, "demolish")).option).toBe("demolish");
        });
    });

    describe("Shield bash", () => {
        it("strikes an enemy in melee reach for 2, not the sword's 4, stuns it, and cools down for 3 turns", () => {
            const fighters = [with_("shieldBash", 1, "a", at(field, 0, 0)), fighter(2, "b", "archer", at(field, 1, 0), { banked: 4 })];
            const { byId, events } = run({ field, fighters }, "a", { kind: "shieldBash", fighter: 1, target: 2 });
            expect(byId(2)).toMatchObject({ hp: 4, banked: 0, effects: { stunned: 1 } });
            expect(byId(1)).toMatchObject({ ap: 2, cooldowns: { shieldBash: 3 } });
            expect(events).toEqual([
                { kind: "struck", fighter: 1, target: 2, damage: 2, reaction: false },
                { kind: "effect", fighter: 2, effect: "stunned", change: "applied" },
            ]);
        });

        it("stuns nobody it downs, and needs an enemy next to it", () => {
            const fighters = [with_("shieldBash", 1, "a", at(field, 0, 0)), fighter(2, "b", "archer", at(field, 1, 0), { hp: 2 }), fighter(3, "b", "scout", at(field, 3, 0))];
            expect(run({ field, fighters }, "a", { kind: "shieldBash", fighter: 1, target: 2 }).events.map(event => event.kind)).toEqual(["struck", "downed", "scored"]);
            expect(check({ field, fighters }, "a", { kind: "shieldBash", fighter: 1, target: 3 })).toEqual({ refused: "Too far away to strike" });
        });

        it("guards with the sword as ever", () => {
            const bash = with_("shieldBash", 1, "a", at(field, 2, 3), { ap: 0, banked: 2 });
            const mover = fighter(2, "b", "scout", at(field, 0, 3));
            const { byId } = run({ field, fighters: [bash, mover] }, "b", { kind: "move", fighter: 2, path: [at(field, 0, 3), at(field, 1, 3)] });
            expect(byId(2)).toMatchObject({ hp: 2, effects: {} });
        });
    });

    describe("Demolish", () => {
        // The Knight at (4, 3), below the rubble's neighbour (4, 2), beside the rubble at (3, 2).
        const knight = with_("demolish", 1, "a", at(field, 4, 3));
        const rubble = at(field, 3, 2);

        it("blasts one square of low cover next to the Knight, after striking everyone else beside it for 2, friend or foe", () => {
            const fighters = [knight, fighter(2, "b", "scout", at(field, 2, 2)), fighter(3, "a", "archer", at(field, 3, 3)), fighter(4, "b", "mage", at(field, 2, 1), { hp: 2 }), fighter(5, "b", "cleric", at(field, 1, 2))];
            const { byId, events } = run({ field, fighters }, "a", { kind: "demolish", fighter: 1, at: rubble });
            expect([1, 2, 3, 4, 5].map(id => byId(id).hp)).toEqual([12, 4, 4, 0, 7]);
            expect(byId(1)).toMatchObject({ ap: 2, cooldowns: { demolish: 2 } });
            expect(events).toEqual([
                { kind: "demolished", fighter: 1, at: rubble, targets: [2, 3, 4], damage: 2 },
                { kind: "downed", fighter: 4, by: 1 },
                { kind: "scored", player: "a", points: 6, reason: "knockout" },
                { kind: "blasted", fighter: 1, squares: [rubble] },
            ]);
            expect(blastedIn(events)).toEqual([rubble]);
        });

        it("needs low cover next to the Knight: not open ground, a wall, cover further off, or cover already gone", () => {
            const state = (onField = field): BattleState => ({ field: onField, fighters: [knight] });
            const demolish = (square: number, onField = field) => check(state(onField), "a", { kind: "demolish", fighter: 1, at: square });
            expect(demolish(rubble)).toEqual({ ap: 2 });
            expect(demolish(at(field, 5, 2))).toEqual({ ap: 2 });
            for (const square of [at(field, 4, 2), at(field, 4, 1), at(field, 8, 4), -1, 999]) {
                expect(demolish(square), String(square)).toEqual({ refused: "Pick low cover next to them" });
            }
            expect(demolish(rubble, battlefieldWith(field, [rubble]))).toEqual({ refused: "Pick low cover next to them" });
        });
    });

    describe("Crippling shot", () => {
        const archer = with_("cripplingShot", 1, "a", at(field, 0, 3));
        const target = fighter(2, "b", "knight", at(field, 5, 3));

        it("is shot at the bow's usual odds, and slows only on a hit", () => {
            const fighters = [archer, target];
            const hit = run({ field, fighters }, "a", { kind: "cripplingShot", fighter: 1, target: 2 }, [80]);
            expect(hit.events[0]).toMatchObject({ kind: "shot", chance: 80, result: "hit" });
            expect(hit.byId(2)).toMatchObject({ hp: 8, effects: { slowed: 2 } });
            expect(hit.byId(1)).toMatchObject({ ap: 1, cooldowns: { cripplingShot: 2 } });
            expect(run({ field, fighters }, "a", { kind: "cripplingShot", fighter: 1, target: 2 }, [81]).byId(2)).toMatchObject({ hp: 10, effects: {} });
            expect(run({ field, fighters }, "a", { kind: "cripplingShot", fighter: 1, target: 2 }, [100]).byId(2)).toMatchObject({ hp: 12, effects: {} });
        });

        it("leaves the Archer's ordinary shot alone", () => {
            expect(run({ field, fighters: [archer, target] }, "a", { kind: "attack", fighter: 1, target: 2 }, [1]).byId(2).effects).toEqual({});
            expect(check({ field, fighters: [archer, target] }, "a", { kind: "aimedShot", fighter: 1, target: 2 })).toEqual({ refused: "This Archer can't use Aimed shot" });
        });
    });

    describe("Hunter's mark", () => {
        const wide = fieldOf(["...............", "..............."]);
        const scout = with_("huntersMark", 1, "a", at(wide, 0, 0));

        it("marks an enemy it can see within 12 squares, for 1 AP", () => {
            const fighters = [scout, fighter(2, "b", "knight", at(wide, 12, 0))];
            const { byId, events } = run({ field: wide, fighters }, "a", { kind: "huntersMark", fighter: 1, target: 2 });
            expect(byId(2).effects).toEqual({ marked: 2 });
            expect(byId(1)).toMatchObject({ ap: 3, cooldowns: { huntersMark: 2 } });
            expect(events).toEqual([
                { kind: "marked", fighter: 1, target: 2 },
                { kind: "effect", fighter: 2, effect: "marked", change: "applied" },
            ]);
        });

        it("needs a standing enemy, in range and in sight", () => {
            const mark = (target: Fighter, onField = wide) => check({ field: onField, fighters: [scout, target] }, "a", { kind: "huntersMark", fighter: 1, target: 2 });
            expect(mark(fighter(2, "b", "knight", at(wide, 13, 0)))).toEqual({ refused: "Out of range or out of sight" });
            expect(mark(fighter(2, "a", "knight", at(wide, 3, 0)))).toEqual({ refused: "Pick an enemy" });
            expect(mark(fighter(2, "b", "knight", at(wide, 3, 0), { hp: 0 }))).toEqual({ refused: "Pick an enemy" });
            const walled = fieldOf(["..#.."]);
            expect(check({ field: walled, fighters: [{ ...scout, square: 0 }, fighter(2, "b", "knight", 4)] }, "a", { kind: "huntersMark", fighter: 1, target: 2 }))
                .toEqual({ refused: "Out of range or out of sight" });
        });

        it("costs the Scout its sneak", () => {
            const { refused } = check({ field: wide, fighters: [scout] }, "a", { kind: "sneak", fighter: 1, path: [at(wide, 0, 0), at(wide, 1, 0)] }) as { refused: string };
            expect(refused).toBe("This Scout can't use Sneak");
        });
    });

    describe("Frost bolt", () => {
        const mage = with_("frostBolt", 1, "a", at(field, 0, 3));
        const target = fighter(2, "b", "knight", at(field, 5, 3));

        it("does 2 instead of 3, at the bolt's odds, and slows on a hit", () => {
            expect(weaponOf(mage)).toMatchObject({ damage: 2, accuracy: 70, range: 10 });
            const hit = run({ field, fighters: [mage, target] }, "a", { kind: "attack", fighter: 1, target: 2 }, [70]);
            expect(hit.events[0]).toMatchObject({ chance: 70, damage: 3, result: "hit" });
            expect(hit.byId(2)).toMatchObject({ hp: 9, effects: { slowed: 2 } });
            expect(run({ field, fighters: [mage, target] }, "a", { kind: "attack", fighter: 1, target: 2 }, [71]).byId(2).effects).toEqual({});
        });

        it("slows on overwatch too", () => {
            const watching = { ...mage, ap: 0, banked: 2 };
            const mover = fighter(2, "b", "scout", at(field, 6, 3));
            const { byId } = run({ field, fighters: [watching, mover] }, "b", { kind: "move", fighter: 2, path: [at(field, 6, 3), at(field, 6, 4)] }, [1]);
            expect(byId(2)).toMatchObject({ hp: 3, effects: { slowed: 2 } });
        });
    });

    describe("Purify", () => {
        const cleric = with_("purify", 1, "a", at(field, 1, 3), { hp: 5, effects: { marked: 1 } });

        it("clears every affliction, a mark among them, from the Cleric and each ally next to it, with 2 HP each, never past full", () => {
            const fighters = [
                cleric,
                fighter(2, "a", "knight", at(field, 2, 4), { hp: 11, effects: { burning: 2, stunned: 1, slowed: 2, marked: 2, shieldWall: 1 }, burnedBy: 9 }),
                fighter(3, "a", "archer", at(field, 0, 3), { effects: { hunkered: 1 } }),
                fighter(4, "a", "scout", at(field, 3, 3), { hp: 1 }),
                fighter(5, "b", "mage", at(field, 1, 4), { hp: 1, effects: { slowed: 1 } }),
            ];
            expect(purified({ field, fighters }, cleric).map(one => one.id)).toEqual([1, 2]);
            const { byId, events } = run({ field, fighters }, "a", { kind: "purify", fighter: 1 });
            expect(byId(1)).toMatchObject({ hp: 7, effects: {}, ap: 2, cooldowns: { purify: 3 } });
            expect(byId(2)).toMatchObject({ hp: 12, effects: { shieldWall: 1 } });
            expect(byId(2)).not.toHaveProperty("burnedBy");
            expect([byId(3).hp, byId(4).hp, byId(5).hp]).toEqual([6, 1, 1]);
            expect(events).toEqual([
                { kind: "healed", fighter: 1, target: 1, hp: 2, via: "purify" },
                { kind: "effect", fighter: 1, effect: "marked", change: "cleared" },
                { kind: "healed", fighter: 1, target: 2, hp: 1, via: "purify" },
                ...(["burning", "stunned", "slowed", "marked"] as const).map(effect => ({ kind: "effect", fighter: 2, effect, change: "cleared" })),
            ]);
        });

        it("needs someone beside the Cleric it would do something for, and costs the Cleric its Raise", () => {
            const well = { ...cleric, hp: CHARACTERS.cleric.hp, effects: { hunkered: 1 } };
            const fighters = [well, fighter(2, "a", "knight", at(field, 2, 3), { effects: { shieldWall: 1 } }), fighter(3, "b", "scout", at(field, 0, 3), { hp: 1 })];
            expect(check({ field, fighters }, "a", { kind: "purify", fighter: 1 })).toEqual({ refused: "Nobody beside them needs it" });
            expect(check({ field, fighters: [well, fighter(2, "a", "knight", at(field, 2, 3), { hp: 0 })] }, "a", { kind: "raise", fighter: 1, target: 2 }))
                .toEqual({ refused: "This Cleric can't use Raise" });
            expect(ABILITIES.purify.hp).toBe(2);
        });
    });
});

describe("the Swarm (§31)", () => {
    const field = fieldOf();

    describe("Corroded", () => {
        it("is left by a Spitter's acid on a hit, and adds 10 to every shot at it until it wears off", () => {
            const spitter = fighter(1, "a", "spitter", at(field, 0, 3));
            const knight = fighter(2, "b", "knight", at(field, 6, 3));
            const { byId, events } = run({ field, fighters: [spitter, knight] }, "a", { kind: "attack", fighter: 1, target: 2 }, [1]);
            expect(byId(2)).toMatchObject({ hp: CHARACTERS.knight.hp - 3, effects: { corroded: 2 } });
            expect(events.at(-1)).toEqual({ kind: "effect", fighter: 2, effect: "corroded", change: "applied" });
            const archer = fighter(3, "b", "archer", at(field, 0, 0));
            const before = shotOdds({ field, fighters: [archer, spitter] }, archer, spitter)!.chance;
            const corroded = { ...spitter, effects: { corroded: 2 } };
            expect(shotOdds({ field, fighters: [archer, corroded] }, archer, corroded)!.chance).toBe(before + 10);
            const both = { ...spitter, effects: { corroded: 2, marked: 2 } };
            expect(shotOdds({ field, fighters: [archer, both] }, archer, both)!.chance).toBe(Math.min(100, before + 25));
        });

        it("is washed off by a heal", () => {
            const cleric = fighter(1, "a", "cleric", at(field, 0, 0));
            const knight = fighter(2, "a", "knight", at(field, 3, 0), { effects: { corroded: 2 } });
            const { byId } = run({ field, fighters: [cleric, knight] }, "a", { kind: "heal", fighter: 1, target: 2 });
            expect(byId(2).effects).toEqual({});
        });
    });

    describe("Rend", () => {
        it("tears into one enemy next to the Ravager for 6, always, and goes on cooldown", () => {
            const ravager = fighter(1, "a", "ravager", at(field, 0, 0));
            const knight = fighter(2, "b", "knight", at(field, 1, 0));
            const { byId, events } = run({ field, fighters: [ravager, knight] }, "a", { kind: "rend", fighter: 1, target: 2 });
            expect(events).toEqual([{ kind: "struck", fighter: 1, target: 2, damage: ABILITIES.rend.damage, reaction: false }]);
            expect(byId(2).hp).toBe(CHARACTERS.knight.hp - 6);
            expect(byId(1)).toMatchObject({ ap: ACTION_POINTS - ABILITIES.rend.ap, cooldowns: { rend: 3 } });
        });

        it("needs an enemy next to it, and a Ravager to use it", () => {
            const fighters = [fighter(1, "a", "ravager", at(field, 0, 0)), fighter(2, "b", "knight", at(field, 3, 0)), fighter(3, "a", "skitterling", at(field, 0, 1))];
            expect(check({ field, fighters }, "a", { kind: "rend", fighter: 1, target: 2 })).toEqual({ refused: "Too far away to strike" });
            expect(check({ field, fighters }, "a", { kind: "rend", fighter: 3, target: 2 })).toEqual({ refused: "This Skitterling can't use Rend" });
        });
    });

    describe("Regrowth", () => {
        it("mends an ally the Broodmother can see within 8 squares, and clears what a heal does", () => {
            const mother = fighter(1, "a", "broodmother", at(field, 0, 0));
            const ravager = fighter(2, "a", "ravager", at(field, 6, 0), { hp: 4, effects: { corroded: 1 } });
            const { byId } = run({ field, fighters: [mother, ravager] }, "a", { kind: "regrowth", fighter: 1, target: 2 });
            expect(byId(2)).toMatchObject({ hp: 7, effects: {} });
            expect(byId(1)).toMatchObject({ cooldowns: { regrowth: 2 } });
            const far = fighter(2, "a", "ravager", at(field, 9, 0), { hp: 4 });
            expect(check({ field, fighters: [mother, far] }, "a", { kind: "regrowth", fighter: 1, target: 2 })).toEqual({ refused: "Out of range or out of sight" });
        });
    });

    describe("Burst", () => {
        it("splashes everyone next to the Bloater, friend or foe, corrodes whoever stands, and downs the Bloater for nobody's points", () => {
            const bloater = fighter(1, "a", "bloater", at(field, 1, 1));
            const knight = fighter(2, "b", "knight", at(field, 2, 1));
            const archer = fighter(3, "b", "archer", at(field, 0, 0), { hp: 2 });
            const skitterling = fighter(4, "a", "skitterling", at(field, 1, 2));
            const away = fighter(5, "b", "scout", at(field, 5, 1));
            const { byId, events } = run({ field, fighters: [bloater, knight, archer, skitterling, away] }, "a", { kind: "burst", fighter: 1 });
            expect(events[0]).toEqual({ kind: "burst", fighter: 1, targets: [2, 3, 4], damage: 3 });
            expect(byId(2)).toMatchObject({ hp: CHARACTERS.knight.hp - 3, effects: { corroded: 2 } });
            expect(byId(3).hp).toBe(0);
            expect(byId(4)).toMatchObject({ hp: 1, effects: { corroded: 2 } });
            expect(byId(5).hp).toBe(CHARACTERS.scout.hp);
            expect(byId(1).hp).toBe(0);
            expect(events.filter(event => event.kind === "scored")).toEqual([{ kind: "scored", player: "a", points: CHARACTERS.archer.points / 5, reason: "knockout" }]);
            expect(events.at(-1)).toEqual({ kind: "downed", fighter: 1, by: 1 });
        });

        it("needs an enemy next to it", () => {
            const fighters = [fighter(1, "a", "bloater", at(field, 1, 1)), fighter(2, "a", "skitterling", at(field, 2, 1)), fighter(3, "b", "knight", at(field, 5, 1))];
            expect(check({ field, fighters }, "a", { kind: "burst", fighter: 1 })).toEqual({ refused: "No enemy next to them" });
        });
    });
});
