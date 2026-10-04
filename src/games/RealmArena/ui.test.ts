import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { ACTION_POINTS, newFighter, reachOf, type BattleEvent, type Fighter } from "./rules";
import { ABILITIES, kitOf, type CharacterId } from "./characters";
import { EFFECT_ART, ITEM_ART } from "./art";
import { abilityWait, actionSquares, apPips, areaRect, attackOptions, battleCues, canAct, effectsOn, eventLines, facingOf, fighterName, fighterStatus, focusOn, handItem, handOut, hpFraction, itemsOf, NO_ITEMS, numberedName, placeTap, rangeSquares, reachFocus, reachShading, reactionPreviews, squadCounts, squadOf, targetsOf, whoseName, FLIGHT_MS, HIT_TEXT_MS, PLAYBACK_MS, type BattleCue, type Placement } from "./ui";

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

describe("facingOf", () => {
    it("faces the way a character last stepped, and towards the middle of the map before it has moved", () => {
        // The Ruined Fort is 36 squares across and 48 down: its middle is (18, 24).
        expect(facingOf(RUINED_FORT, { square: squareAt(RUINED_FORT, 18, 30)!, facing: 0 })).toBe(0);
        expect(facingOf(RUINED_FORT, { square: squareAt(RUINED_FORT, 18, 30)! })).toBe(6);
        expect(facingOf(RUINED_FORT, { square: squareAt(RUINED_FORT, 2, 2)! })).toBe(1);
        expect(facingOf(RUINED_FORT, { square: squareAt(RUINED_FORT, 30, 24)! })).toBe(4);
    });

    it("falls back to facing the middle for a stored facing that isn't one", () => {
        for (const facing of [8, -1, 2.5, NaN, "2", null]) {
            expect(facingOf(RUINED_FORT, { square: squareAt(RUINED_FORT, 18, 30)!, facing: facing as never })).toBe(6);
        }
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

    it("names the effects after the watch, in the order the marks are drawn", () => {
        expect(fighterStatus({ ...knight, banked: 2, effects: { marked: 2, burning: 1 } })).toEqual(["On watch (2 AP banked)", "Burning", "Marked"]);
    });

    it("names the item it carries last, and none once it's down", () => {
        expect(fighterStatus({ ...knight, effects: { burning: 1 }, item: "smokePot" })).toEqual(["Burning", "Carrying a smoke pot"]);
        expect(fighterStatus({ ...knight, hp: 0, item: "smokePot" })).toEqual(["Down"]);
    });
});

describe("effectsOn", () => {
    const knight = newFighter(0, "alice", "knight", 0);

    it("lists what the board marks a figure with, in EFFECT_IDS order, leaving out a count run down", () => {
        expect(effectsOn({ ...knight, effects: { shieldWall: 1, slowed: 0, burning: 2 } })).toEqual(["burning", "shieldWall"]);
        expect(effectsOn(knight)).toEqual([]);
    });

    it("marks nothing on a character that's down", () => {
        expect(effectsOn({ ...knight, hp: 0, effects: { burning: 2 } })).toEqual([]);
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

describe("itemsOf, handOut and handItem", () => {
    const placed = [{ character: "knight", square: 0 }, { character: "archer", square: 1 }, { character: "cleric", square: 2 }] as const;
    const bought = { ...NO_ITEMS, smokePot: 1, fireFlask: 1 };

    it("list the items bought in the muster's order", () => {
        expect(itemsOf(bought)).toEqual(["fireFlask", "smokePot"]);
        expect(itemsOf(NO_ITEMS)).toEqual([]);
    });

    it("hand the items bought down the squad, one each, leaving the rest empty-handed", () => {
        expect(handOut([...placed], bought)).toEqual([
            { character: "knight", square: 0, item: "fireFlask" },
            { character: "archer", square: 1, item: "smokePot" },
            { character: "cleric", square: 2 },
        ]);
    });

    it("give a character an item, swapping it for whatever it carried", () => {
        const picks = handOut([...placed], bought);
        expect(handItem(picks, 1, "fireFlask").map(pick => pick.item)).toEqual(["smokePot", "fireFlask", undefined]);
    });

    it("move an item to an empty-handed character, leaving its old carrier with nothing", () => {
        const moved = handItem(handOut([...placed], bought), 2, "smokePot");
        expect(moved.map(pick => pick.item)).toEqual(["fireFlask", undefined, "smokePot"]);
        expect(moved[1]).not.toHaveProperty("item");
    });

    it("change nothing for an item it already carries, or one nobody carries", () => {
        const picks = handOut([...placed], bought);
        expect(handItem(picks, 0, "fireFlask")).toBe(picks);
        expect(handItem(picks, 2, "thunderFlask")).toBe(picks);
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
        expect(rangeSquares(state, mage, ABILITIES.fireball.range).has(at(field, 12, 0))).toBe(true);
        expect(rangeSquares(state, mage, ABILITIES.fireball.range).has(at(field, 13, 0))).toBe(false);
    });

    it("draws a throw out to the item's range, in sight", () => {
        const field = buildBattlefield({ name: "Wall", rows: ["......#..."], deployments: [], objectives: {} });
        const archer = ready(0, "a", "archer", at(field, 0, 0));
        // Six squares, the wall among them: a thrown item can land on anything it can see.
        expect(named(field, rangeSquares({ field, fighters: [archer] }, archer, 6))).toEqual(["1,0", "2,0", "3,0", "4,0", "5,0", "6,0"]);
    });

    it("draws a heal's range as the squares next to it", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 0));
        expect(named(OPEN, rangeSquares({ field: OPEN, fighters: [cleric] }, cleric, "nextTo"))).toEqual(["0,1", "1,0", "1,1"]);
    });

    it("draws a Demolish's range as the low cover next to it, and nothing else (§23.2)", () => {
        const field = buildBattlefield({ name: "Cover", rows: [",.o.,", "..#..", "....."], deployments: [], objectives: {} });
        const knight = ready(0, "a", "knight", at(field, 1, 1), { option: "demolish" });
        expect(named(field, rangeSquares({ field, fighters: [knight] }, knight, "cover"))).toEqual(["0,0", "2,0"]);
    });
});

describe("fighterName and whoseName", () => {
    const fighters = [ready(0, "a", "manAtArms", 0), ready(1, "a", "manAtArms", 1), ready(2, "b", "manAtArms", 2), ready(3, "b", "archer", 3)];

    it("number a character only where its owner has more than one of it", () => {
        expect(fighters.map(one => fighterName(fighters, one))).toEqual(["Man-at-arms 1", "Man-at-arms 2", "Man-at-arms", "Archer"]);
    });

    it("number a squad still being placed the same way, however many of one it has", () => {
        const picks = (["manAtArms", "archer", "manAtArms", "manAtArms"] as const).map(character => ({ character }));
        expect(picks.map((_, i) => numberedName(picks, i))).toEqual(["Man-at-arms 1", "Archer", "Man-at-arms 2", "Man-at-arms 3"]);
    });

    it("say whose a character is from where the viewer sits", () => {
        expect(whoseName(fighters, 1, "a", nameFor)).toBe("your Man-at-arms 2");
        expect(whoseName(fighters, 3, "a", nameFor)).toBe("Bob's Archer");
        expect(whoseName(fighters, 9, "a", nameFor)).toBe("a character out of sight");
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

    it("tells the low cover a blast cleared, after what the blast did (§22)", () => {
        const events: BattleEvent[] = [
            { kind: "fireball", fighter: 0, at: 5, targets: [], damage: 3 },
            { kind: "blasted", fighter: 0, squares: [4, 6] },
        ];
        expect(eventLines(events, fighters, "a", nameFor).at(-1)).toEqual({ icon: "💥", title: "2 squares of low cover blasted away", sub: "Open ground now" });
    });

    it("leads an effect put on, cleared or burning with the effect's mark", () => {
        const events: BattleEvent[] = [
            { kind: "effect", fighter: 0, effect: "burning", change: "applied" },
            { kind: "burned", fighter: 0, damage: 1 },
            { kind: "effect", fighter: 0, effect: "burning", change: "cleared" },
        ];
        expect(eventLines(events, fighters, "a", nameFor)).toEqual([
            { mark: EFFECT_ART.burning, title: "Your Archer is burning" },
            { mark: EFFECT_ART.burning, title: "Your Archer burned for 1" },
            { mark: EFFECT_ART.burning, title: "Your Archer is no longer burning" },
        ]);
    });

    it("leads what an item did with the item's mark", () => {
        const events: BattleEvent[] = [
            { kind: "thrown", fighter: 0, item: "fireFlask", at: 5, targets: [1], damage: 2 },
            { kind: "thrown", fighter: 0, item: "smokePot", at: 5, targets: [], damage: 0 },
            { kind: "healed", fighter: 0, target: 0, hp: 3, via: "draught" },
        ];
        expect(eventLines(events, fighters, "a", nameFor)).toEqual([
            { mark: ITEM_ART.fireFlask, title: "Fire flask: Bob's Knight", sub: "2 damage each" },
            { mark: ITEM_ART.smokePot, title: "Your Archer threw a smoke pot" },
            { mark: ITEM_ART.healingDraught, title: "Your Archer healed for 3", sub: "Healing draught" },
        ]);
    });

    it("tells the options' own events, and a Purify as it reaches each ally (§23.2)", () => {
        const events: BattleEvent[] = [
            { kind: "demolished", fighter: 0, at: 5, targets: [1], damage: 2 },
            { kind: "demolished", fighter: 0, at: 5, targets: [], damage: 2 },
            { kind: "marked", fighter: 0, target: 1 },
            { kind: "healed", fighter: 0, target: 0, hp: 2, via: "purify" },
            { kind: "healed", fighter: 0, target: 0, hp: 0, via: "purify" },
        ];
        expect(eventLines(events, fighters, "a", nameFor)).toEqual([
            { icon: "💥", title: "Demolish: Bob's Knight", sub: "2 damage each" },
            { icon: "💥", title: "Demolish: nobody hit" },
            { icon: "◎", title: "Your Archer used Hunter's mark on Bob's Knight" },
            { icon: "✚", title: "Your Archer purified for 2", sub: "Purify" },
            { icon: "✚", title: "Your Archer purified", sub: "Purify" },
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

describe("battleCues", () => {
    const before = [ready(0, "a", "knight", 10), ready(1, "b", "archer", 50), ready(2, "b", "archer", 60), ready(3, "b", "mage", 70)];
    /** Every cue of one kind. */
    const only = <K extends BattleCue["kind"]>(cues: BattleCue[], kind: K) => cues.filter((cue): cue is Extract<BattleCue, { kind: K }> => cue.kind === kind);
    /** Each piece of hit text as "who@square value/label at start", to read the order by. */
    const told = (cues: BattleCue[]) => only(cues, "text")
        .map(cue => `${cue.fighter}@${cue.square} ${cue.value}${cue.label ? `/${cue.label}` : ""} ${cue.start}`);

    it("flies a move's overwatch shots one after another, each to where the mover had got to, its text rising as it lands", () => {
        const cues = battleCues([
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "moved", fighter: 0, path: [12, 13, 14], sneaking: false },
            { kind: "shot", fighter: 2, target: 0, chance: 60, result: "graze", damage: 2, reaction: true },
            { kind: "moved", fighter: 0, path: [14, 15], sneaking: false },
        ], before);
        expect(only(cues, "flight")).toMatchObject([
            { missile: "arrow", from: 50, to: 12, result: "hit", start: 0, land: FLIGHT_MS.arrow },
            // Setting off once the first has landed, and landing far enough after it to be seen.
            { missile: "arrow", from: 60, to: 14, result: "graze", start: 450, land: FLIGHT_MS.arrow },
        ]);
        expect(told(cues)).toEqual(["0@12 \u22123 400", "0@14 \u22122/Graze 850"]);
    });

    it("calls a miss a miss, on the target where it stood, as the arrow flies past", () => {
        const cues = battleCues([{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "miss", damage: 0, reaction: false }], before);
        expect(only(cues, "flight")).toMatchObject([{ missile: "arrow", from: 50, to: 10, result: "miss" }]);
        expect(only(cues, "text")).toMatchObject([{ fighter: 0, square: 10, value: "Miss", tone: "miss", start: FLIGHT_MS.arrow, length: HIT_TEXT_MS }]);
    });

    it("flies the Mage's shot as a bolt, quicker than an arrow", () => {
        const cues = battleCues([{ kind: "shot", fighter: 3, target: 0, chance: 60, result: "hit", damage: 3, reaction: false }], before);
        expect(only(cues, "flight")).toMatchObject([{ missile: "bolt", from: 70, to: 10, start: 0, land: FLIGHT_MS.bolt }]);
        expect(only(cues, "text")[0].start).toBe(FLIGHT_MS.bolt);
    });

    it("slashes across the cover a Demolish blasts, striking everyone beside it at once, the cover going after", () => {
        const cues = battleCues([
            { kind: "demolished", fighter: 0, at: 11, targets: [1, 2], damage: 2 },
            { kind: "blasted", fighter: 0, squares: [11] },
        ], before);
        const [slash] = only(cues, "slash");
        expect(slash).toMatchObject({ square: 11, start: 0 });
        const texts = only(cues, "text");
        expect(texts.map(text => [text.fighter, text.value])).toEqual([[1, "−2"], [2, "−2"]]);
        expect(new Set(texts.map(text => text.start)).size).toBe(1);
        expect(only(cues, "scorch")[0].start).toBeGreaterThan(texts[0].start);
    });

    it("slashes across a struck target, and its damage rises as the slash lands", () => {
        const cues = battleCues([{ kind: "struck", fighter: 0, target: 1, damage: 4, reaction: false }], before);
        const [slash] = only(cues, "slash");
        expect(slash).toMatchObject({ square: 50, start: 0 });
        expect(only(cues, "text")[0].start).toBeGreaterThan(slash.start);
    });

    it("flies a fireball to its square and bursts it over the 3×3, hitting everyone at once, and downs after the damage", () => {
        const cues = battleCues([
            { kind: "fireball", fighter: 3, at: 55, targets: [1, 2], damage: 3 },
            { kind: "downed", fighter: 1, by: 3 },
            { kind: "scored", player: "b", points: 4, reason: "knockout" },
            { kind: "effect", fighter: 2, effect: "burning", change: "applied" },
            { kind: "blasted", fighter: 3, squares: [56] },
        ], before);
        const land = FLIGHT_MS.fireball;
        expect(only(cues, "flight")).toMatchObject([{ missile: "fireball", from: 70, to: 55, result: "landed", start: 0, land }]);
        expect(only(cues, "burst")).toMatchObject([{ burst: "fire", at: 55, radius: 1, start: land }]);
        expect(told(cues)).toEqual([`1@50 \u22123 ${land}`, `2@60 \u22123/Burning ${land}`, `1@50 Down ${land + 450}`]);
        // The one it downs stands as it was until the fireball lands on it.
        const [fall] = only(cues, "fall");
        expect(fall).toMatchObject({ fighter: { id: 1, character: "archer", hp: before[1].hp, square: 50 }, start: land });
        // And the cover it blasts goes as the burst fades.
        const [scorch] = only(cues, "scorch");
        expect(scorch.squares).toEqual([56]);
        expect(scorch.start).toBeGreaterThan(land);
        expect(scorch.start).toBeLessThan(land + only(cues, "burst")[0].length);
    });

    it("downs a mover where an overwatch shot caught it, standing until the arrow lands", () => {
        const cues = battleCues([
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "downed", fighter: 0, by: 1 },
        ], before);
        expect(only(cues, "fall")).toMatchObject([{ fighter: { id: 0, square: 12 }, start: FLIGHT_MS.arrow }]);
    });

    it("names what a flask that does no damage puts on, on everyone it lands on at once, as it bursts", () => {
        const cues = battleCues([
            { kind: "thrown", fighter: 0, item: "thunderFlask", at: 55, targets: [1, 2], damage: 0 },
            { kind: "effect", fighter: 1, effect: "stunned", change: "applied" },
            { kind: "effect", fighter: 2, effect: "stunned", change: "refreshed" },
        ], before);
        const land = FLIGHT_MS.thunderFlask;
        expect(only(cues, "burst")).toMatchObject([{ burst: "thunder", at: 55, radius: 1, start: land }]);
        expect(told(cues)).toEqual([`1@50 Stunned ${land}`, `2@60 Stunned ${land}`]);
    });

    it("bursts a fire flask over its one square, and a smoke pot that hits nobody still flies and puffs", () => {
        const fire = battleCues([{ kind: "thrown", fighter: 0, item: "fireFlask", at: 55, targets: [], damage: 2 }], before);
        expect(only(fire, "burst")).toMatchObject([{ burst: "fire", radius: 0 }]);
        const smoke = battleCues([{ kind: "thrown", fighter: 0, item: "smokePot", at: 55, targets: [], damage: 0 }], before);
        expect(only(smoke, "flight")).toMatchObject([{ missile: "smokePot", from: 10, to: 55 }]);
        expect(only(smoke, "burst")).toMatchObject([{ burst: "smoke", radius: 1 }]);
        expect(only(smoke, "text")).toEqual([]);
    });

    it("shows a heal in green, curing what it clears, and burning with its mark", () => {
        const cues = battleCues([
            { kind: "burned", fighter: 0, damage: 1 },
            { kind: "healed", fighter: 3, target: 0, hp: 4 },
            { kind: "effect", fighter: 0, effect: "burning", change: "cleared" },
        ], before);
        expect(cues).toMatchObject([
            { fighter: 0, value: "\u22121", tone: "hit", mark: "burning", start: 0 },
            { fighter: 0, value: "+4", label: "Cured", tone: "heal", start: 450 },
        ]);
    });

    it("plays nothing for a move, a stance, a watch or a score", () => {
        expect(battleCues([
            { kind: "moved", fighter: 0, path: [10, 11], sneaking: true },
            { kind: "hunkered", fighter: 0 },
            { kind: "watching", fighter: 1, banked: 4 },
            { kind: "scored", player: "a", points: 5, reason: "centre" },
        ], before)).toEqual([]);
    });

    it("fits however much an action set off into three seconds, every flight still landing as its text rises", () => {
        const shots: BattleEvent[] = Array.from({ length: 12 }, () => ({ kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: true }));
        const cues = battleCues(shots, before);
        expect(Math.max(...cues.map(cue => cue.start + cue.length))).toBeLessThanOrEqual(PLAYBACK_MS);
        const flights = only(cues, "flight"), texts = only(cues, "text");
        expect(texts).toHaveLength(12);
        flights.forEach((flight, i) => expect(Math.abs(flight.start + flight.land - texts[i].start)).toBeLessThanOrEqual(1));
        // Still in order, and still one after another.
        expect(texts.every((cue, i) => i === 0 || cue.start > texts[i - 1].start)).toBe(true);
    });
});
