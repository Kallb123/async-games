import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { ACTION_POINTS, newFighter, reachOf, type BattleEvent, type Fighter } from "./rules";
import type { CharacterId } from "./characters";
import {
    CELL, abilityWait, actionSquares, apPips, areaRect, attackOptions, canAct, eventLines, fighterName, fighterStatus, focusOn, groundLayers, hpFraction, pathPoints, placeTap, rangeArea, reachFocus, reachLayers,
    reactionPreviews, runLayers, squadCounts, squadOf, squareAtPoint, targetsOf, whoseName, type Placement,
} from "./ui";

/** Every square a path's rectangles cover, as "col,row". */
function squaresDrawn(d: string): Set<string> {
    const covered = new Set<string>();
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v/g)) {
        for (let col = Number(x) / CELL; col < (Number(x) + Number(w)) / CELL; col++) covered.add(`${col},${Number(y) / CELL}`);
    }
    return covered;
}

describe("groundLayers", () => {
    it("draws one path per kind of terrain, merging a row's run of one kind into one rectangle", () => {
        const field = buildBattlefield({ name: "Test", rows: ["..,,#", "....."], deployments: [], objectives: {} });
        expect(groundLayers(field)).toEqual([
            { letter: ".", d: "M0 0h20v10h-20zM0 10h50v10h-50z" },
            { letter: ",", d: "M20 0h20v10h-20z" },
            { letter: "#", d: "M40 0h10v10h-10z" },
        ]);
    });

    it("covers every square of the Ruined Fort exactly once, in its own terrain's layer", () => {
        const layers = groundLayers(RUINED_FORT);
        const drawn = layers.map(layer => squaresDrawn(layer.d));
        expect(drawn.reduce((total, squares) => total + squares.size, 0)).toBe(RUINED_FORT.width * RUINED_FORT.height);
        expect(new Set(drawn.flatMap(squares => [...squares])).size).toBe(RUINED_FORT.width * RUINED_FORT.height);
    });
});

describe("areaRect", () => {
    it("bounds the centre of the Ruined Fort", () => {
        expect(areaRect(RUINED_FORT, RUINED_FORT.objectives.centre)).toEqual({ x: 15 * CELL, y: 21 * CELL, width: 6 * CELL, height: 6 * CELL });
    });
});

describe("focusOn", () => {
    it("frames seven squares across, centred on the character", () => {
        expect(focusOn(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!)).toEqual({ x: 7 * CELL, y: 17 * CELL, width: 7 * CELL, height: 7 * CELL });
    });

    it("frames every square it's given, with the same margin round them all", () => {
        expect(focusOn(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!, squareAt(RUINED_FORT, 14, 18)!))
            .toEqual({ x: 7 * CELL, y: 15 * CELL, width: 11 * CELL, height: 9 * CELL });
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
        expect(fighterStatus({ ...knight, banked: 4, hunkered: true, shieldWall: true }))
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

describe("runLayers", () => {
    it("draws every square with a key, a path per key, and leaves the rest out", () => {
        const field = { width: 3, height: 2 };
        expect(runLayers(field, square => square === 4 ? undefined : square % 3 === 2 ? "edge" : "inside")).toEqual([
            { key: "inside", d: "M0 0h20v10h-20zM0 10h10v10h-10z" },
            { key: "edge", d: "M20 0h10v10h-10zM20 10h10v10h-10z" },
        ]);
    });
});

describe("squareAtPoint", () => {
    it("finds the square under a point, and nothing off the map", () => {
        expect(squareAtPoint(OPEN, 25, 15)).toBe(at(OPEN, 2, 1));
        expect(squareAtPoint(OPEN, -1, 15)).toBeUndefined();
        expect(squareAtPoint(OPEN, 25, 50)).toBeUndefined();
    });
});

describe("pathPoints", () => {
    it("runs through each square's centre", () => {
        expect(pathPoints(OPEN, [at(OPEN, 0, 0), at(OPEN, 1, 1)])).toBe("5,5 15,15");
    });
});

describe("reachFocus", () => {
    const LONG = buildBattlefield({ name: "Long", rows: [".".repeat(30), ".".repeat(30), ".".repeat(30)], deployments: [], objectives: {} });

    it("frames two thirds of the reach each way from where the character stands", () => {
        // 4 movement points an AP, so 2 AP reach eight squares either way along the row: cols 7–23.
        const knight = ready(0, "a", "knight", at(LONG, 15, 1));
        const rect = reachFocus({ field: LONG, fighters: [knight] }, knight, 2);
        const centre = 15.5 * CELL, side = 8.5 * CELL;
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

describe("reachLayers", () => {
    it("shades every square in reach by the AP it costs to stop there, nearest first, and not where it stands", () => {
        const knight = ready(0, "a", "knight", at(OPEN, 0, 2), { ap: 2 });
        const layers = reachLayers(OPEN, knight, reachOf({ field: OPEN, fighters: [knight] }, knight), false);
        expect(layers.map(layer => layer.key)).toEqual([1, 2]);
        const first = squaresDrawn(layers[0].d);
        // 4 movement points an AP: four squares straight along the row.
        expect(first.has("4,2")).toBe(true);
        expect(first.has("5,2")).toBe(false);
        expect(first.has("0,2")).toBe(false);
        expect(squaresDrawn(layers[1].d).has("8,2")).toBe(true);
    });

    it("prices a sneak at double", () => {
        const scout = ready(0, "a", "scout", at(OPEN, 0, 2));
        const layers = reachLayers(OPEN, scout, reachOf({ field: OPEN, fighters: [scout] }, scout, true), true);
        expect(layers.map(layer => layer.key)).toEqual([2, 4]);
    });
});

describe("rangeArea", () => {
    const drawn = (d: string | null) => d === null ? new Set<string>() : squaresDrawn(d);

    it("draws a melee weapon's range as the squares next to it, not its own", () => {
        const knight = ready(0, "a", "knight", at(OPEN, 5, 2));
        const range = drawn(rangeArea({ field: OPEN, fighters: [knight] }, knight, "weapon"));
        expect([...range].sort()).toEqual(["4,1", "4,2", "4,3", "5,1", "5,3", "6,1", "6,2", "6,3"]);
    });

    it("draws a ranged weapon's range only as far as it can see, and only where someone could stand", () => {
        const field = buildBattlefield({ name: "Wall", rows: ["....#....."], deployments: [], objectives: {} });
        const archer = ready(0, "a", "archer", at(field, 0, 0));
        expect([...drawn(rangeArea({ field, fighters: [archer] }, archer, "weapon"))].sort()).toEqual(["1,0", "2,0", "3,0"]);
    });

    it("draws a fireball out to its own range, whatever the weapon's", () => {
        const field = buildBattlefield({ name: "Row", rows: [".".repeat(14)], deployments: [], objectives: {} });
        const mage = ready(0, "a", "mage", at(field, 0, 0));
        const state = { field, fighters: [mage] };
        // The Bolt reaches 10 squares, a fireball 12.
        expect(drawn(rangeArea(state, mage, "weapon")).has("11,0")).toBe(false);
        expect(drawn(rangeArea(state, mage, "fireball")).has("12,0")).toBe(true);
        expect(drawn(rangeArea(state, mage, "fireball")).has("13,0")).toBe(false);
    });

    it("draws a heal's range as the squares next to it", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 0));
        expect([...drawn(rangeArea({ field: OPEN, fighters: [cleric] }, cleric, "nextTo"))].sort()).toEqual(["0,1", "1,0", "1,1"]);
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
