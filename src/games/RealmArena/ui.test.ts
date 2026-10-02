import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { ACTION_POINTS, newFighter, reachOf, type BattleEvent, type Fighter } from "./rules";
import type { CharacterId } from "./characters";
import {
    abilityWait, actionSquares, apPips, areaRect, attackOptions, canAct, eventLines, fighterName, fighterStatus, focusOn, hpFraction, placeTap, rangeSquares, reachFocus, reachShading,
    reactionPreviews, squadCounts, squadOf, targetsOf, whoseName, type Placement,
} from "./ui";

/** Squares as "col,row", sorted, to read a test's expectations by. */
function named(field: { width: number }, squares: Iterable<number>): string[] {
    return [...squares].map(square => `${square % field.width},${Math.floor(square / field.width)}`).sort();
}

describe("areaRect", () => {
    it("bounds the centre of the Ruined Fort", () => {
        expect(areaRect(RUINED_FORT, RUINED_FORT.objectives.centre)).toEqual({ x: 15, y: 21, width: 6, height: 6 });
    });
});

describe("focusOn", () => {
    it("frames seven squares across, centred on the character", () => {
        expect(focusOn(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!)).toEqual({ x: 7, y: 17, width: 7, height: 7 });
    });

    it("frames every square it's given, with the same margin round them all", () => {
        expect(focusOn(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!, squareAt(RUINED_FORT, 14, 18)!))
            .toEqual({ x: 7, y: 15, width: 11, height: 9 });
    });
});

describe("actionSquares", () => {
    const from = squareAt(RUINED_FORT, 10, 20)!, to = squareAt(RUINED_FORT, 12, 20)!, far = squareAt(RUINED_FORT, 30, 40)!;
    const before = [newFighter(0, "a", "knight", from), newFighter(1, "b", "archer", far), newFighter(2, "b", "mage", 0)];

    it("is where everyone the step changed stood, before and after", () => {
        const after = [{ ...before[0], square: to, ap: 2 }, { ...before[1], hp: before[1].hp - 3 }, before[2]];
        expect(actionSquares(before, after)).toEqual([from, to, far]);
    });

    it("is nowhere for a step that changed nobody, or that put the squads on the field", () => {
        expect(actionSquares(before, before.map(fighter => ({ ...fighter })))).toEqual([]);
        expect(actionSquares([], before)).toEqual([]);
    });
});

describe("fighterStatus", () => {
    const knight = newFighter(0, "alice", "knight", 0);

    it("says nothing for a character doing nothing in particular", () => {
        expect(fighterStatus(knight)).toEqual([]);
    });

    it("names the watch, hunkering down and the shield wall", () => {
        expect(fighterStatus({ ...knight, banked: 4, effects: { hunkered: 1, shieldWall: 1 } }))
            .toEqual(["On watch (4 AP banked)", "Hunkered down", "Shield wall"]);
    });

    it("says only that a fallen character is down", () => {
        expect(fighterStatus({ ...knight, hp: 0, banked: 4 })).toEqual(["Down"]);
    });
});

describe("canAct, apPips and hpFraction", () => {
    const knight = { ...newFighter(0, "alice", "knight", 0), ap: 3 };

    it("counts a standing character with AP left as ready, and not one spent or down", () => {
        expect(canAct(knight)).toBe(true);
        expect(canAct({ ...knight, ap: 0 })).toBe(false);
        expect(canAct({ ...knight, hp: 0 })).toBe(false);
    });

    it("lights a pip for each AP left, out of the full allowance", () => {
        expect(apPips(knight)).toEqual([true, true, true, false]);
        expect(apPips({ ...knight, ap: 0 })).toHaveLength(ACTION_POINTS);
    });

    it("reads the HP bar against the character's own maximum", () => {
        expect(hpFraction(knight)).toBe(1);
        expect(hpFraction({ ...knight, hp: 0 })).toBe(0);
    });
});

describe("squadCounts and squadOf", () => {
    it("count a squad, and list it back in the muster's order", () => {
        const counts = squadCounts(["cleric", "manAtArms", "knight", "manAtArms"]);
        expect(counts).toEqual({ manAtArms: 2, knight: 1, archer: 0, scout: 0, mage: 0, cleric: 1 });
        expect(squadOf(counts)).toEqual(["manAtArms", "manAtArms", "knight", "cleric"]);
    });
});

describe("placeTap", () => {
    const zone = [0, 1, 2, 3];
    const placed: Placement = { picks: [{ character: "knight", square: 0 }, { character: "archer", square: 1 }], selected: null };

    it("picks a character up, and puts it back down on a second tap", () => {
        const holding = placeTap(placed, 1, zone);
        expect(holding).toEqual({ ...placed, selected: 1 });
        expect(placeTap(holding, 1, zone)).toEqual(placed);
    });

    it("does nothing for a tap on an empty square with nobody picked up", () => {
        expect(placeTap(placed, 3, zone)).toEqual(placed);
    });

    it("moves the character picked up to an empty square of the zone", () => {
        expect(placeTap({ ...placed, selected: 0 }, 3, zone)).toEqual({
            picks: [{ character: "knight", square: 3 }, { character: "archer", square: 1 }],
            selected: null,
        });
    });

    it("swaps the character picked up with another", () => {
        expect(placeTap({ ...placed, selected: 0 }, 1, zone)).toEqual({
            picks: [{ character: "knight", square: 1 }, { character: "archer", square: 0 }],
            selected: null,
        });
    });

    it("won't move a character out of the zone", () => {
        expect(placeTap({ ...placed, selected: 0 }, 9, zone)).toEqual({ ...placed, selected: 0 });
    });
});

// ─── Taking a turn (§17.3 PR 7) ─────────────────────────────────────────────

const OPEN = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });

/** A character ready to act, as at the start of its owner's turn. */
function ready(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

const nameFor = (userId: string) => ({ a: "Alice", b: "Bob" })[userId] ?? userId;

describe("reachFocus", () => {
    const LONG = buildBattlefield({ name: "Long", rows: [".".repeat(30), ".".repeat(30), ".".repeat(30)], deployments: [], objectives: {} });

    it("frames two thirds of the reach each way from where the character stands", () => {
        // 4 movement points an AP, so 2 AP reach eight squares either way along the row: cols 7–23.
        const knight = ready(0, "a", "knight", at(LONG, 15, 1));
        const rect = reachFocus({ field: LONG, fighters: [knight] }, knight, 2);
        const centre = 15.5, side = 8.5;
        expect(rect.x).toBeCloseTo(centre - side * 2 / 3);
        expect(rect.width).toBeCloseTo(side * 4 / 3);
    });

    it("never frames less than the squares round the character", () => {
        const knight = ready(0, "a", "knight", at(LONG, 15, 1));
        const state = { field: LONG, fighters: [knight] };
        expect(reachFocus(state, knight, 0)).toEqual(focusOn(LONG, knight.square));
        // The row's three squares of height are less than focusOn's seven, so that's what it keeps.
        expect(reachFocus(state, knight, 2)).toMatchObject({ y: focusOn(LONG, knight.square).y, height: focusOn(LONG, knight.square).height });
    });

    it("reads the AP it's given rather than what the character has left", () => {
        const spent = ready(0, "a", "knight", at(LONG, 15, 1), { ap: 0 });
        expect(reachFocus({ field: LONG, fighters: [spent] }, spent, ACTION_POINTS).width).toBeGreaterThan(focusOn(LONG, spent.square).width);
    });
});

describe("reachShading", () => {
    it("shades every square in reach by the AP it costs to stop there, and not where it stands", () => {
        const knight = ready(0, "a", "knight", at(OPEN, 0, 2), { ap: 2 });
        const shading = reachShading(knight, reachOf({ field: OPEN, fighters: [knight] }, knight), false);
        expect(new Set(shading.values())).toEqual(new Set([1, 2]));
        // 4 movement points an AP: four squares straight along the row.
        expect(shading.get(at(OPEN, 4, 2))).toBe(1);
        expect(shading.get(at(OPEN, 5, 2))).toBe(2);
        expect(shading.has(at(OPEN, 0, 2))).toBe(false);
        expect(shading.get(at(OPEN, 8, 2))).toBe(2);
    });

    it("prices a sneak at double", () => {
        const scout = ready(0, "a", "scout", at(OPEN, 0, 2));
        const shading = reachShading(scout, reachOf({ field: OPEN, fighters: [scout] }, scout, true), true);
        expect(new Set(shading.values())).toEqual(new Set([2, 4]));
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
        expect(rangeSquares(state, mage, "fireball").has(at(field, 12, 0))).toBe(true);
        expect(rangeSquares(state, mage, "fireball").has(at(field, 13, 0))).toBe(false);
    });

    it("draws a heal's range as the squares next to it", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 0));
        expect(named(OPEN, rangeSquares({ field: OPEN, fighters: [cleric] }, cleric, "nextTo"))).toEqual(["0,1", "1,0", "1,1"]);
    });
});

describe("fighterName and whoseName", () => {
    const fighters = [ready(0, "a", "manAtArms", 0), ready(1, "a", "manAtArms", 1), ready(2, "b", "manAtArms", 2), ready(3, "b", "archer", 3)];

    it("number a character only where its owner has two of it", () => {
        expect(fighters.map(one => fighterName(fighters, one))).toEqual(["Man-at-arms 1", "Man-at-arms 2", "Man-at-arms", "Archer"]);
    });

    it("say whose a character is from where the viewer sits", () => {
        expect(whoseName(fighters, 1, "a", nameFor)).toBe("your Man-at-arms 2");
        expect(whoseName(fighters, 3, "a", nameFor)).toBe("Bob's Archer");
        expect(whoseName(fighters, 9, "a", nameFor)).toBe("a character");
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
        expect(targetsOf({ field: OPEN, fighters: [cleric, hurt, fine] }, "a", cleric, "heal")).toEqual([1]);
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

describe("eventLines", () => {
    const fighters = [ready(0, "a", "archer", 0), ready(1, "b", "knight", 1, { hp: 0 })];

    it("tells a move once, however reactions broke it up, and each shot with its roll", () => {
        const events: BattleEvent[] = [
            { kind: "moved", fighter: 0, path: [0, 1], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 65, roll: 70, result: "graze", damage: 2, reaction: true },
            { kind: "moved", fighter: 0, path: [1, 2], sneaking: false },
            { kind: "shot", fighter: 0, target: 1, chance: 80, roll: 12, result: "hit", damage: 4, reaction: false },
            { kind: "downed", fighter: 1, by: 0 },
            { kind: "scored", player: "a", points: 5, reason: "knockout" },
        ];
        expect(eventLines(events, fighters, "a", nameFor)).toEqual([
            { icon: "👣", title: "Your Archer moved" },
            { icon: "🎯", title: "Graze for 2", sub: "Bob's Knight on overwatch at your Archer · 65% to hit", roll: 70 },
            { icon: "🎯", title: "Hit for 4", sub: "Your Archer at Bob's Knight · 80% to hit", roll: 12 },
            { icon: "✕", title: "Bob's Knight is down" },
            { icon: "★", title: "You scored 5", sub: "The knock-out" },
        ]);
    });

    it("calls a missed shot a miss", () => {
        const [line] = eventLines([{ kind: "shot", fighter: 0, target: 1, chance: 80, roll: 95, result: "miss", damage: 0, reaction: false }], fighters, "b", nameFor);
        expect(line).toMatchObject({ title: "Miss", sub: "Alice's Archer at your Knight · 80% to hit" });
    });
});

describe("abilityWait", () => {
    it("says when an ability is back, or that a once-a-battle one is used", () => {
        const cleric = ready(0, "a", "cleric", 0, { cooldowns: { heal: 2 }, spent: ["raise"] });
        expect(abilityWait(cleric, "heal")).toBe("Back in 2 turns");
        expect(abilityWait(cleric, "raise")).toBe("Used");
        expect(abilityWait(ready(1, "a", "cleric", 0), "heal")).toBeUndefined();
    });
});
