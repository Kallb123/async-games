import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { ABILITIES, type CharacterId } from "./characters";
import { ACTION_POINTS, check, newFighter, type Action, type Fighter } from "./rules";
import { CURRENT_RULESET_VERSION, ruleValuesOf } from "./rulesets";
import { ACTION_AIMS, attackOptions, rangeSquares, reactionPreviews, shotOf, targetsOf } from "./tactics";

/** Squares as "col,row", sorted, to read a test's expectations by. */
function named(field: { width: number }, squares: Iterable<number>): string[] {
    return [...squares].map(square => `${square % field.width},${Math.floor(square / field.width)}`).sort();
}

const OPEN = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });

/** A character ready to act, as at the start of its owner's turn. */
function ready(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

describe("ACTION_AIMS (§29.3)", () => {
    it("aims every ability, so a new one is usable by a player and the computer the day it's added", () => {
        for (const ability of Object.keys(ABILITIES)) expect(ACTION_AIMS).toHaveProperty(ability);
    });

    it("aims every kind of action check takes", () => {
        // A kind check doesn't know is refused as "That isn't an action"; every kind aimed here is one it knows.
        const knight = ready(0, "a", "knight", at(OPEN, 0, 0));
        for (const kind of Object.keys(ACTION_AIMS)) {
            const verdict = check({ field: OPEN, fighters: [knight] }, "a", { kind, fighter: 0 } as unknown as Action);
            expect(verdict).not.toEqual({ refused: "That isn't an action" });
        }
    });

    it("names the shot each kind takes, and none for one that always lands", () => {
        expect(shotOf("attack")).toBe("attack");
        expect(shotOf("aimedShot")).toBe("aimedShot");
        expect(shotOf("cripplingShot")).toBe("cripplingShot");
        expect(shotOf("shieldBash")).toBeUndefined();
        expect(shotOf("fireball")).toBeUndefined();
    });
});

describe("rangeSquares", () => {
    it("draws a melee weapon's range as the squares next to it, not its own", () => {
        const knight = ready(0, "a", "knight", at(OPEN, 5, 2));
        const range = rangeSquares({ field: OPEN, fighters: [knight] }, knight, "weapon");
        expect(named(OPEN, range)).toEqual(["4,1", "4,2", "4,3", "5,1", "5,3", "6,1", "6,2", "6,3"]);
    });

    it("draws a ranged weapon's range only as far as it can see, and only where someone could stand", () => {
        const field = buildBattlefield({ name: "Wall", rows: ["....#....."], deployments: [], objectives: {} });
        const archer = ready(0, "a", "archer", at(field, 0, 0));
        expect(named(field, rangeSquares({ field, fighters: [archer] }, archer, "weapon"))).toEqual(["1,0", "2,0", "3,0"]);
    });

    it("draws a fireball out to its own range, whatever the weapon's", () => {
        const field = buildBattlefield({ name: "Row", rows: [".".repeat(14)], deployments: [], objectives: {} });
        const mage = ready(0, "a", "mage", at(field, 0, 0));
        const state = { field, fighters: [mage] };
        // The Bolt reaches 10 squares, a fireball 12.
        expect(rangeSquares(state, mage, "weapon").has(at(field, 11, 0))).toBe(false);
        expect(rangeSquares(state, mage, ABILITIES.fireball.range).has(at(field, 12, 0))).toBe(true);
        expect(rangeSquares(state, mage, ABILITIES.fireball.range).has(at(field, 13, 0))).toBe(false);
    });

    it("draws a throw out to the item's range, in sight", () => {
        const field = buildBattlefield({ name: "Wall", rows: ["......#..."], deployments: [], objectives: {} });
        const archer = ready(0, "a", "archer", at(field, 0, 0), { item: "fireFlask" });
        // Six squares, the wall among them: a thrown item can land on anything it can see.
        expect(named(field, rangeSquares({ field, fighters: [archer] }, archer, "item"))).toEqual(["1,0", "2,0", "3,0", "4,0", "5,0", "6,0"]);
        // Nothing, for a character carrying nothing it can throw.
        expect(rangeSquares({ field, fighters: [archer] }, { ...archer, item: "healingDraught" }, "item").size).toBe(0);
        expect(rangeSquares({ field, fighters: [archer] }, { ...archer, item: null }, "item").size).toBe(0);
    });

    it("draws a raise's range as the squares next to it", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 0));
        expect(named(OPEN, rangeSquares({ field: OPEN, fighters: [cleric] }, cleric, "nextTo"))).toEqual(["0,1", "1,0", "1,1"]);
    });

    it("draws a Demolish's range as the low cover next to it, and nothing else (§23.2)", () => {
        const field = buildBattlefield({ name: "Cover", rows: [",.o.,", "..#..", "....."], deployments: [], objectives: {} });
        const knight = ready(0, "a", "knight", at(field, 1, 1), { option: "demolish" });
        expect(named(field, rangeSquares({ field, fighters: [knight] }, knight, "cover"))).toEqual(["0,0", "2,0"]);
    });
});

describe("targetsOf", () => {
    it("lists who an attack could be aimed at, by the server's own check", () => {
        const archer = ready(0, "a", "archer", at(OPEN, 0, 0));
        const near = ready(1, "b", "knight", at(OPEN, 5, 0));
        const ally = ready(2, "a", "knight", at(OPEN, 1, 0));
        const down = ready(3, "b", "mage", at(OPEN, 6, 0), { hp: 0 });
        expect(targetsOf({ field: OPEN, fighters: [archer, near, ally, down] }, "a", archer, "attack")).toEqual([1]);
    });

    it("lists the hurt allies a Cleric could heal", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 0));
        const hurt = ready(1, "a", "knight", at(OPEN, 1, 0), { hp: 5 });
        const fine = ready(2, "a", "archer", at(OPEN, 0, 1));
        const far = ready(3, "a", "mage", at(OPEN, 4, 0), { hp: 1 });
        expect(targetsOf({ field: OPEN, fighters: [cleric, hurt, fine, far] }, "a", cleric, "heal")).toEqual([1, 3]);
    });
});

describe("attackOptions", () => {
    // A low wall in column 4 gives whoever crouches behind it half cover from the west.
    const WALLED = buildBattlefield({ name: "Walled", rows: ["....o.....", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });
    const options = (...args: Parameters<typeof attackOptions>) =>
        attackOptions(...args).map(({ target, chance }) => ({ target: target.id, chance }));

    it("lists every standing enemy a shot could reach, likeliest first, whatever AP is left", () => {
        const archer = ready(0, "a", "archer", at(WALLED, 0, 0), { ap: 0 });
        const covered = ready(1, "b", "knight", at(WALLED, 5, 0));
        const open = ready(2, "b", "mage", at(WALLED, 9, 4));
        const ally = ready(3, "a", "knight", at(WALLED, 1, 1));
        const down = ready(4, "b", "scout", at(WALLED, 6, 3), { hp: 0 });
        expect(options({ field: WALLED, fighters: [archer, covered, open, ally, down] }, archer)).toEqual([
            { target: 2, chance: 80 },
            { target: 1, chance: 60 },
        ]);
    });

    it("says which shots would flank a target with no cover, and never a strike", () => {
        const archer = ready(0, "a", "archer", at(WALLED, 0, 0));
        const covered = ready(1, "b", "knight", at(WALLED, 5, 0));
        const open = ready(2, "b", "mage", at(WALLED, 9, 4));
        const flanks = (...args: Parameters<typeof attackOptions>) => attackOptions(...args).map(({ target, flanked }) => [target.id, flanked]);
        expect(flanks({ field: WALLED, fighters: [archer, covered, open] }, archer)).toEqual([[2, true], [1, false]]);
        // From the far side of the wall it covers nothing, so a move there lines up a flanking shot.
        expect(flanks({ field: WALLED, fighters: [archer, covered] }, archer, at(WALLED, 9, 0))).toEqual([[1, true]]);
        const knight = ready(3, "a", "knight", at(WALLED, 8, 4));
        expect(flanks({ field: WALLED, fighters: [knight, open] }, knight)).toEqual([[2, false]]);
    });

    it("reads from the square a lined-up move would end on", () => {
        const archer = ready(0, "a", "archer", at(WALLED, 0, 0));
        const covered = ready(1, "b", "knight", at(WALLED, 5, 0));
        expect(options({ field: WALLED, fighters: [archer, covered] }, archer, at(WALLED, 9, 0))).toEqual([{ target: 1, chance: 80 }]);
    });

    it("gives a strike 100%, and only at an enemy next to it", () => {
        const knight = ready(0, "a", "knight", at(WALLED, 0, 2));
        const near = ready(1, "b", "archer", at(WALLED, 1, 2));
        const far = ready(2, "b", "archer", at(WALLED, 3, 2));
        const battle = { field: WALLED, fighters: [knight, near, far] };
        expect(options(battle, knight)).toEqual([{ target: 1, chance: 100 }]);
        expect(options(battle, knight, at(WALLED, 2, 3))).toEqual([{ target: 1, chance: 100 }, { target: 2, chance: 100 }]);
    });

    it("ignores the turn's attack quota, so a character that has used it still shows who is in reach", () => {
        // Rules before release 9 have no quota; between turns a shooter under one has none left, and `check` alone refuses every shot.
        const rulesVersion = CURRENT_RULESET_VERSION;
        const limit = ruleValuesOf({ rulesVersion }).MAX_ATTACKS_PER_TURN;
        expect(limit).not.toBeNull();
        const fighters = (extra: Partial<Fighter>) => [
            ready(0, "a", "archer", at(WALLED, 0, 0), extra),
            ready(1, "b", "knight", at(WALLED, 5, 0)),
            ready(2, "b", "mage", at(WALLED, 9, 4)),
        ];
        const fresh = { field: WALLED, rulesVersion, fighters: fighters({}) };
        const spent = { field: WALLED, rulesVersion, fighters: fighters({ ap: 0, attacksThisTurn: limit! }) };
        expect(check(spent, "a", { kind: "attack", fighter: 0, target: 2 })).toEqual({ refused: `At most ${limit} attacks per turn` });
        expect(options(fresh, fresh.fighters[0])).toHaveLength(2);
        expect(options(spent, spent.fighters[0])).toEqual(options(fresh, fresh.fighters[0]));
        // And from a square a lined-up move would end on.
        expect(options(spent, spent.fighters[0], at(WALLED, 9, 0))).toEqual(options(fresh, fresh.fighters[0], at(WALLED, 9, 0)));
    });

    it("finds nothing for a character that's down", () => {
        const archer = ready(0, "a", "archer", at(WALLED, 0, 0), { hp: 0 });
        expect(options({ field: WALLED, fighters: [archer, ready(1, "b", "knight", at(WALLED, 2, 0))] }, archer)).toEqual([]);
    });
});

describe("reactionPreviews", () => {
    it("flags each watcher a move sets off, with an overwatch shot's odds from where the mover is when it comes", () => {
        const path = [at(OPEN, 9, 4), at(OPEN, 9, 3), at(OPEN, 9, 2), at(OPEN, 8, 2)];
        const archer = ready(1, "b", "archer", at(OPEN, 0, 0), { ap: 0, banked: 4 });
        const knight = ready(3, "b", "knight", at(OPEN, 7, 2), { ap: 0, banked: 2 });
        const mover = ready(2, "a", "manAtArms", path[0]);
        const previews = reactionPreviews({ field: OPEN, fighters: [archer, knight, mover] }, mover, path);
        expect(previews.map(({ watcher, kind, odds, damage }) => ({ watcher: watcher.id, kind, chance: odds?.chance, damage }))).toEqual([
            { watcher: 1, kind: "overwatch", chance: 65, damage: 4 },
            { watcher: 3, kind: "guard", chance: undefined, damage: 4 },
        ]);
    });
});
