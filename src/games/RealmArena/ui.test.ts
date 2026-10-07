import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { at, fieldOf, hillOf } from "@/utils/games/battlefield/testFixtures";
import { ACTION_POINTS, isWarband, newFighter, reachOf, warbandOwner, type BattleEvent, type Fighter, type ToldEvent } from "./rules";
import { ABILITIES, kitOf, type CharacterId } from "./characters";
import { EFFECT_ART, ITEM_ART, type Missile } from "./art";
import { abilityWait, actionFollow, aimFocus, coopColourOf, ALLY_COLOUR, ENEMY_COLOUR, TEAM_COLOUR, actionSquares, apPips, friendlySquares, spreadWide, areaRect, battleCues, canAct, effectsOn, eventLines, facingOf, fighterName, fighterStatus, focusOn, handItem, handOut, hpFraction, itemsOf, NO_ITEMS, numberedName, placeTap, reachFocus, reachShading, squadCounts, squadOf, whoseName, FLIGHT_PACE, CLIMB_LEG, DIAGONAL_LEG, flightMs, legWeight, HIT_TEXT_MS, PLAYBACK_MS, WALK_STEP_MS, moveFrame, isUnplaced, type BattleCue, type Placement, waveLineOf, partDurationMs, reviewParts, reviewStepMs, withPartState, STEP_BEAT_MS, STEP_MIN_MS, FOLLOW_GLIDE_MS, partLabel, HP_CHIP_MS, HP_TWEEN_MS, stepped, toldAt, toldOf, type TextCue, IMPACT_MS, KNOCK, LUNGE, SHAKE, SHAKE_MS, WALK_BOB, WALK_HOP, shakeAt, shakeUntil, shoveAt, shovesOf, toldOffsetAt, walkEase, walkerAt, walkLift, type FlightCue, type SlashCue, type WalkCue } from "./ui";
import type { IRealmArenaStepOutcome, RealmArenaPartState } from "./apiModels";

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

    it("doesn't count a turn's fresh AP as anyone doing anything", () => {
        const spent = before.map(fighter => ({ ...fighter, ap: 0 }));
        const refreshed = spent.map(fighter => ({ ...fighter, ap: ACTION_POINTS }));
        expect(actionSquares(spent, refreshed)).toEqual([]);
    });

    it("still follows AP spent, and AP banked or used by a watcher", () => {
        const fresh = before.map(fighter => ({ ...fighter, ap: ACTION_POINTS }));
        expect(actionSquares(fresh, [{ ...fresh[0], ap: 1 }, fresh[1], fresh[2]])).toEqual([from]);
        expect(actionSquares(fresh, [fresh[0], { ...fresh[1], ap: 0, banked: 4 }, fresh[2]])).toEqual([far]);
        const watching = fresh.map((fighter, i) => i === 1 ? { ...fighter, banked: 4 } : fighter);
        expect(actionSquares(watching, [watching[0], { ...watching[1], banked: 2 }, watching[2]])).toEqual([far]);
    });
});

describe("friendlySquares", () => {
    const a = squareAt(RUINED_FORT, 4, 40)!, b = squareAt(RUINED_FORT, 8, 41)!, c = squareAt(RUINED_FORT, 30, 6)!, ai = squareAt(RUINED_FORT, 20, 4)!;
    const fighters = [
        newFighter(0, "alice", "knight", a),
        newFighter(1, "bob", "archer", b),
        newFighter(2, "alice", "mage", c),
        newFighter(3, warbandOwner(0), "knight", ai),
    ].map(fighter => ({ ...fighter }));
    const down = (fighter: Fighter): Fighter => ({ ...fighter, hp: 0 });

    it("is the viewer's own squad in a free-for-all", () => {
        expect(friendlySquares(fighters, "alice", false)).toEqual([a, c]);
        expect(friendlySquares(fighters, "bob", false)).toEqual([b]);
    });

    it("is the whole team in co-op, never a warband", () => {
        expect(friendlySquares(fighters, "alice", true)).toEqual([a, b, c]);
    });

    it("leaves out anyone fallen", () => {
        expect(friendlySquares([down(fighters[0]), ...fighters.slice(1)], "alice", false)).toEqual([c]);
    });

    it("is nowhere with nobody on the field, or for a viewer with no squad", () => {
        expect(friendlySquares([], "alice", true)).toEqual([]);
        expect(friendlySquares(fighters, "carol", false)).toEqual([]);
        expect(friendlySquares(fighters.map(down), "alice", true)).toEqual([]);
    });
});

describe("spreadWide", () => {
    // The Ruined Fort is 36 squares across and 48 down.
    const at2 = (col: number, row: number) => squareAt(RUINED_FORT, col, row)!;

    it("is false for squares that stay within half the field either way, or for none", () => {
        expect(spreadWide(RUINED_FORT, [])).toBe(false);
        expect(spreadWide(RUINED_FORT, [at2(2, 2), at2(19, 25)])).toBe(false);
    });

    it("is true once they span more than half the width or the height", () => {
        expect(spreadWide(RUINED_FORT, [at2(2, 2), at2(20, 3)])).toBe(true);
        expect(spreadWide(RUINED_FORT, [at2(2, 2), at2(3, 26)])).toBe(true);
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

    it("reads what the bar would be after a blow, never below empty", () => {
        const max = knight.hp;
        expect(hpFraction(knight, 1)).toBe((max - 1) / max);
        expect(hpFraction(knight, max + 5)).toBe(0);
    });

    it("reads what the bar would be after a heal, never past full", () => {
        const max = knight.hp;
        expect(hpFraction({ ...knight, hp: 1 }, -2)).toBe(3 / max);
        expect(hpFraction({ ...knight, hp: max - 1 }, -5)).toBe(1);
    });
});

describe("squadCounts and squadOf", () => {
    it("count a squad, and list it back in the muster's order", () => {
        const counts = squadCounts(["cleric", "manAtArms", "knight", "manAtArms"]);
        expect(counts).toEqual({ manAtArms: 2, knight: 1, archer: 0, scout: 0, mage: 0, cleric: 1, skitterling: 0, ravager: 0, spitter: 0, bloater: 0, broodmother: 0 });
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

/**
 * A flat battlefield ten squares across, for what a battle plays: square 10 is
 * the second row's first, 55 the sixth row's sixth, and a character at 50 is
 * four squares from one at 10.
 */
const FIELD = fieldOf(...Array(10).fill(".".repeat(10)));
/** One long row, for a walk that has to run straight on for dozens of squares. */
const ROW = fieldOf(".".repeat(100));
/** How long a missile takes to fly from one square of `FIELD` to another. */
const flight = (missile: Missile, from: number, to: number) => flightMs(FIELD, missile, from, to);

describe("aimFocus", () => {
    it("frames the caster and the target with a square and a half round them", () => {
        expect(aimFocus(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!, squareAt(RUINED_FORT, 14, 18)!))
            .toEqual({ x: 8.5, y: 16.5, width: 8, height: 6 });
    });

    it("frames closer than focusOn does", () => {
        const caster = squareAt(RUINED_FORT, 10, 20)!, target = squareAt(RUINED_FORT, 11, 20)!;
        expect(aimFocus(RUINED_FORT, caster, target).width).toBeLessThan(focusOn(RUINED_FORT, caster, target).width);
    });
});

const nameFor = (userId: string) => ({ a: "Alice", b: "Bob" })[userId] ?? userId;

describe("reachFocus", () => {
    const LONG = buildBattlefield({ name: "Long", rows: [".".repeat(30), ".".repeat(30), ".".repeat(30)], deployments: [], objectives: {} });

    it("frames half the reach each way from where the character stands", () => {
        // 4 movement points an AP, so 2 AP reach eight squares either way along the row: cols 7–23.
        const knight = ready(0, "a", "knight", at(LONG, 15, 1));
        const rect = reachFocus({ field: LONG, fighters: [knight] }, knight, 2);
        const centre = 15.5, side = 8.5;
        expect(rect.x).toBeCloseTo(centre - side / 2);
        expect(rect.width).toBeCloseTo(side);
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

    it("number the enemy's warbands as one squad, and name it as the enemy is named (§29.9)", () => {
        const coop = [ready(0, "a", "archer", 0), ready(1, warbandOwner(0), "archer", 1), ready(2, warbandOwner(0), "knight", 2), ready(3, warbandOwner(1), "archer", 3)];
        expect(coop.map(one => fighterName(coop, one))).toEqual(["Archer", "Archer 1", "Knight", "Archer 2"]);
        const enemyFor = (owner: string) => isWarband(owner) ? "the Renegades" : nameFor(owner);
        expect(whoseName(coop, 3, "a", enemyFor)).toBe("the Renegades' Archer 2");
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
        const cues = battleCues(FIELD, [
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "moved", fighter: 0, path: [12, 13, 14], sneaking: false },
            { kind: "shot", fighter: 2, target: 0, chance: 60, result: "graze", damage: 2, reaction: true },
            { kind: "moved", fighter: 0, path: [14, 15], sneaking: false },
        ], before);
        // The first leg walks, then the first shot flies to where the mover stopped, and the next leg walks once it has landed.
        // Each flight is as long as its own distance, and short enough that each shot still lands a beat after the last thing.
        const first = 2 * WALK_STEP_MS, firstLand = first + 450, firstFlight = flight("arrow", 50, 12), secondFlight = flight("arrow", 60, 14);
        expect(secondFlight).toBeGreaterThan(firstFlight);
        expect(only(cues, "flight")).toMatchObject([
            { missile: "arrow", from: 50, to: 12, result: "hit", start: firstLand - firstFlight, land: firstFlight },
            // Setting off once the first has landed, and landing far enough after it to be seen.
            { missile: "arrow", from: 60, to: 14, result: "graze", land: secondFlight },
        ]);
        const second = firstLand + 2 * WALK_STEP_MS, secondLand = second + 450;
        expect(only(cues, "flight")[1].start).toBe(secondLand - secondFlight);
        // Each watcher says "Overwatch" as its arrow is loosed, ahead of the hit that lands on the mover.
        expect(told(cues)).toEqual([
            `1@50 Overwatch ${firstLand - firstFlight}`, `0@12 \u22123 ${firstLand}`,
            `2@60 Overwatch ${secondLand - secondFlight}`, `0@14 \u22122/Graze ${secondLand}`,
        ]);
        expect(only(cues, "walk")).toMatchObject([
            { fighter: { id: 0, square: 10 }, path: [10, 11, 12], start: 0, length: first },
            { path: [12, 13, 14], start: firstLand, length: 2 * WALK_STEP_MS },
            { path: [14, 15], start: secondLand, length: WALK_STEP_MS },
        ]);
    });

    it("walks a move one square at a time along exactly the path it was told, ahead of anything after it", () => {
        const cues = battleCues(FIELD, [
            { kind: "moved", fighter: 0, path: [10, 11, 12, 13], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "miss", damage: 0, reaction: true },
        ], before);
        expect(only(cues, "walk")).toEqual([{ kind: "walk", fighter: before[0], path: [10, 11, 12, 13], start: 0, length: 3 * WALK_STEP_MS }]);
        // Nothing after it starts before it is over.
        const walkEnd = 3 * WALK_STEP_MS;
        expect(only(cues, "flight")[0].start).toBeGreaterThanOrEqual(walkEnd);
        expect(only(cues, "text").every(cue => cue.start > walkEnd)).toBe(true);
    });

    it("walks a move the viewer only saw the end of as it looks after, and plays nothing for a path of one square or a character in neither", () => {
        const entered = ready(9, "b", "archer", 30);
        const told: ToldEvent[] = [
            { kind: "moved", fighter: 9, path: [30, 31], sneaking: false },
            { kind: "moved", fighter: 0, path: [10], sneaking: false },
            { kind: "moved", fighter: 0, path: [], sneaking: false },
            { kind: "moved", fighter: 8, path: [40, 41], sneaking: false },
        ];
        expect(battleCues(FIELD, told, before)).toEqual([]);
        expect(battleCues(FIELD, told, before, [{ ...entered, square: 31 }])).toEqual([
            { kind: "walk", fighter: { ...entered, square: 31 }, path: [30, 31], start: 0, length: WALK_STEP_MS },
        ]);
    });

    it("has a mover downed on its way stand where it fell only once it has walked there", () => {
        const cues = battleCues(FIELD, [
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 9, reaction: true },
            { kind: "downed", fighter: 0, by: 1 },
        ], before);
        expect(only(cues, "fall")).toMatchObject([{ fighter: { id: 0, square: 12 }, arrives: 2 * WALK_STEP_MS }]);
        expect(only(battleCues(FIELD, [{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 9, reaction: false }, { kind: "downed", fighter: 0, by: 1 }], before), "fall")[0].arrives).toBeUndefined();
    });

    it("calls a miss a miss, on the target where it stood, as the arrow flies past", () => {
        const cues = battleCues(FIELD, [{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "miss", damage: 0, reaction: false }], before);
        expect(only(cues, "flight")).toMatchObject([{ missile: "arrow", from: 50, to: 10, result: "miss" }]);
        expect(only(cues, "text")).toMatchObject([{ fighter: 0, square: 10, value: "Miss", tone: "miss", start: flight("arrow", 50, 10), length: HIT_TEXT_MS }]);
    });

    it("flies the Mage's shot as a bolt, quicker than an arrow over the same ground", () => {
        const cues = battleCues(FIELD, [{ kind: "shot", fighter: 3, target: 0, chance: 60, result: "hit", damage: 3, reaction: false }], before);
        expect(only(cues, "flight")).toMatchObject([{ missile: "bolt", from: 70, to: 10, start: 0, land: flight("bolt", 70, 10) }]);
        expect(only(cues, "text")[0].start).toBe(flight("bolt", 70, 10));
        expect(flight("bolt", 70, 10)).toBeLessThan(flight("arrow", 70, 10));
    });

    it("slashes across the cover a Demolish blasts, striking everyone beside it at once, the cover going after", () => {
        const cues = battleCues(FIELD, [
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
        const cues = battleCues(FIELD, [{ kind: "struck", fighter: 0, target: 1, damage: 4, reaction: false }], before);
        const [slash] = only(cues, "slash");
        expect(slash).toMatchObject({ square: 50, start: 0 });
        expect(only(cues, "text")[0].start).toBeGreaterThan(slash.start);
    });

    it("flies a fireball to its square and bursts it over the 3×3, hitting everyone at once, and downs after the damage", () => {
        const cues = battleCues(FIELD, [
            { kind: "fireball", fighter: 3, at: 55, targets: [1, 2], damage: 3 },
            { kind: "downed", fighter: 1, by: 3 },
            { kind: "scored", player: "b", points: 4, reason: "knockout" },
            { kind: "effect", fighter: 2, effect: "burning", change: "applied" },
            { kind: "blasted", fighter: 3, squares: [56] },
        ], before);
        const land = flight("fireball", 70, 55);
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
        const cues = battleCues(FIELD, [
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "downed", fighter: 0, by: 1 },
        ], before);
        // The arrow sets off once the mover has walked to where it stopped, and the mover is there by then.
        expect(only(cues, "fall")).toMatchObject([{ fighter: { id: 0, square: 12 }, start: 2 * WALK_STEP_MS + 450, arrives: 2 * WALK_STEP_MS }]);
    });

    it("names what a flask that does no damage puts on, on everyone it lands on at once, as it bursts", () => {
        const cues = battleCues(FIELD, [
            { kind: "thrown", fighter: 0, item: "thunderFlask", at: 55, targets: [1, 2], damage: 0 },
            { kind: "effect", fighter: 1, effect: "stunned", change: "applied" },
            { kind: "effect", fighter: 2, effect: "stunned", change: "refreshed" },
        ], before);
        const land = flight("thunderFlask", 10, 55);
        expect(only(cues, "burst")).toMatchObject([{ burst: "thunder", at: 55, radius: 1, start: land }]);
        expect(told(cues)).toEqual([`1@50 Stunned ${land}`, `2@60 Stunned ${land}`]);
    });

    it("bursts a fire flask over its one square, and a smoke pot that hits nobody still flies and puffs", () => {
        const fire = battleCues(FIELD, [{ kind: "thrown", fighter: 0, item: "fireFlask", at: 55, targets: [], damage: 2 }], before);
        expect(only(fire, "burst")).toMatchObject([{ burst: "fire", radius: 0 }]);
        const smoke = battleCues(FIELD, [{ kind: "thrown", fighter: 0, item: "smokePot", at: 55, targets: [], damage: 0 }], before);
        expect(only(smoke, "flight")).toMatchObject([{ missile: "smokePot", from: 10, to: 55 }]);
        expect(only(smoke, "burst")).toMatchObject([{ burst: "smoke", radius: 1 }]);
        expect(only(smoke, "text")).toEqual([]);
    });

    it("shows a heal in green, curing what it clears, and burning with its mark", () => {
        const cues = battleCues(FIELD, [
            { kind: "burned", fighter: 0, damage: 1 },
            { kind: "healed", fighter: 3, target: 0, hp: 4 },
            { kind: "effect", fighter: 0, effect: "burning", change: "cleared" },
        ], before);
        expect(cues).toMatchObject([
            { fighter: 0, value: "\u22121", tone: "hit", mark: "burning", start: 0 },
            { fighter: 0, value: "+4", label: "Cured", tone: "heal", start: 450 },
        ]);
    });

    it("says what a stance is as it's taken, with the stance's mark beside it", () => {
        const cues = battleCues(FIELD, [{ kind: "hunkered", fighter: 0 }, { kind: "shieldWall", fighter: 0 }], before);
        expect(cues).toMatchObject([
            { kind: "text", fighter: 0, square: 10, value: "Hunker down", tone: "word", mark: "hunkered", start: 0, length: HIT_TEXT_MS },
            { kind: "text", fighter: 0, square: 10, value: "Shield wall", tone: "word", mark: "shieldWall", start: 450 },
        ]);
    });

    it("says a watch by the weapon it keeps: Overwatch for a ranged one, On guard for a melee one, all of a turn's together", () => {
        expect(told(battleCues(FIELD, [{ kind: "watching", fighter: 1, banked: 4 }], before))).toEqual(["1@50 Overwatch 0"]);
        expect(told(battleCues(FIELD, [{ kind: "watching", fighter: 0, banked: 4 }], before))).toEqual(["0@10 On guard 0"]);
        // The knight's mace is melee; the archer's bow and the mage's bolt are ranged.
        expect(told(battleCues(FIELD, [
            { kind: "watching", fighter: 0, banked: 4 },
            { kind: "watching", fighter: 1, banked: 2 },
            { kind: "watching", fighter: 3, banked: 2 },
        ], before))).toEqual(["0@10 On guard 0", "1@50 Overwatch 0", "3@70 Overwatch 0"]);
        // A watch is a stance's mark-less word: nothing beside it.
        expect(only(battleCues(FIELD, [{ kind: "watching", fighter: 1, banked: 4 }], before), "text")[0].mark).toBeUndefined();
    });

    it("says nothing of a stance or a watch by a character whose square isn't known, and plays nothing of a score", () => {
        expect(battleCues(FIELD, [
            { kind: "hunkered", fighter: 9 },
            { kind: "watching", fighter: 8, banked: 4 },
            { kind: "scored", player: "a", points: 5, reason: "centre" },
        ], before)).toEqual([]);
    });

    it("says Overwatch over a reaction shot's shooter and Guard over a reaction strike's, as each is loosed, not for one taken on the turn", () => {
        const shot = battleCues(FIELD, [{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true }], before);
        expect(told(shot)).toEqual(["1@50 Overwatch 0", `0@10 \u22123 ${flight("arrow", 50, 10)}`]);
        // The hit lands when it always did.
        expect(only(shot, "text")[1].start).toBe(only(shot, "flight")[0].start + flight("arrow", 50, 10));
        const strike = battleCues(FIELD, [{ kind: "struck", fighter: 0, target: 1, damage: 4, reaction: true }], before);
        expect(told(strike)).toEqual(["0@10 Guard 0", "1@50 \u22124 250"]);
        expect(only(strike, "slash")[0].start).toBe(0);
        const turn = [
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: false },
            { kind: "struck", fighter: 0, target: 1, damage: 4, reaction: false },
        ] as const;
        expect(only(battleCues(FIELD, [...turn], before), "text").map(cue => cue.tone)).toEqual(["hit", "hit"]);
    });

    it("leaves a reaction's word out of what a fall starts by and an effect lands under", () => {
        const cues = battleCues(FIELD, [
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "downed", fighter: 1, by: 0 },
        ], before);
        // The archer said Overwatch as it loosed, but that is no blow on it: it falls when the fall is told, not when it spoke.
        const [fall] = only(cues, "fall");
        expect(fall.start).toBe(2 * WALK_STEP_MS + 450 + 450);
    });

    it.each([12, 30])("fits however much an action set off into the playback cap, every flight still landing as its text rises (%i shots)", count => {
        const shots: BattleEvent[] = Array.from({ length: count }, () => ({ kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: true }));
        const cues = battleCues(FIELD, shots, before);
        expect(Math.max(...cues.map(cue => cue.start + cue.length))).toBeLessThanOrEqual(PLAYBACK_MS);
        const flights = only(cues, "flight"), texts = only(cues, "text");
        const hits = texts.filter(cue => cue.tone === "hit"), words = texts.filter(cue => cue.value === "Overwatch");
        expect(hits).toHaveLength(count);
        expect(words).toHaveLength(count);
        flights.forEach((flight, i) => expect(Math.abs(flight.start + flight.land - hits[i].start)).toBeLessThanOrEqual(1));
        // Still in order, and still one after another.
        expect(hits.every((cue, i) => i === 0 || cue.start > hits[i - 1].start)).toBe(true);
    });

    describe("how long a flight and a walk take", () => {
        it("flies a missile for longer the farther it goes, from a base up to the most it takes", () => {
            for (const missile of Object.keys(FLIGHT_PACE) as Missile[]) {
                const { base, perSquare, max } = FLIGHT_PACE[missile];
                // Along a row, a square apart is a square of flight; no distance at all is the base alone.
                expect(flightMs(ROW, missile, 0, 0)).toBe(base);
                expect(flightMs(ROW, missile, 0, 1)).toBe(base + perSquare);
                expect(flightMs(ROW, missile, 0, 5)).toBeGreaterThan(flightMs(ROW, missile, 0, 2));
                // Across the whole map, it stops growing.
                expect(flightMs(ROW, missile, 0, 99)).toBe(max);
                expect(flightMs(ROW, missile, 0, 60)).toBe(max);
            }
            expect(flightMs(ROW, "arrow", 0, 10)).toBe(320);
            expect(flightMs(ROW, "bolt", 0, 10)).toBe(210);
            expect(flightMs(ROW, "fireball", 0, 10)).toBe(500);
        });

        it("measures a flight in a straight line, a diagonal's squares counting longer than a straight one's", () => {
            // Three across and four down is five squares: 180 + 5 × 14.
            expect(flightMs(FIELD, "arrow", at(FIELD, 0, 0), at(FIELD, 3, 4))).toBe(250);
            expect(flightMs(FIELD, "arrow", at(FIELD, 3, 4), at(FIELD, 0, 0))).toBe(250);
            expect(flightMs(FIELD, "arrow", at(FIELD, 0, 0), at(FIELD, 1, 1))).toBeGreaterThan(flightMs(FIELD, "arrow", at(FIELD, 0, 0), at(FIELD, 1, 0)));
        });

        it("lands a farther shot later, its text rising as it does", () => {
            const shoot = (target: number) => battleCues(FIELD, [{ kind: "shot", fighter: 1, target, chance: 60, result: "hit", damage: 2, reaction: false }], [ready(0, "a", "knight", 11), ready(1, "b", "archer", 50), ready(2, "a", "knight", 95)]);
            const [near, far] = [shoot(0), shoot(2)];
            expect(only(far, "flight")[0].land).toBeGreaterThan(only(near, "flight")[0].land);
            expect(only(far, "text")[0].start).toBe(only(far, "flight")[0].land);
            expect(only(far, "text")[0].start).toBe(flight("arrow", 50, 95));
        });

        it("weighs a straight leg one step, a diagonal one more, and any climb or drop more again", () => {
            const flat = FIELD;
            expect(legWeight(flat, at(flat, 2, 2), at(flat, 3, 2))).toBe(1);
            expect(legWeight(flat, at(flat, 2, 2), at(flat, 2, 1))).toBe(1);
            expect(legWeight(flat, at(flat, 2, 2), at(flat, 3, 3))).toBe(DIAGONAL_LEG);
            // A quarter's rise, then a wall (four quarters) standing on that, then flat ground again.
            const hill = hillOf(["..#..", "....."], ["01000", "00000"]);
            expect(legWeight(hill, 0, 1)).toBe(1 + CLIMB_LEG);
            expect(legWeight(hill, 1, 2)).toBe(1 + 3 * CLIMB_LEG);
            // Down is as steep as up.
            expect(legWeight(hill, 2, 1)).toBe(legWeight(hill, 1, 2));
            expect(legWeight(hill, 2, 3)).toBe(1 + 4 * CLIMB_LEG);
            // A diagonal step across level ground, and one that also drops a quarter.
            expect(legWeight(hill, 0, 6)).toBe(DIAGONAL_LEG);
            expect(legWeight(hill, 1, 5)).toBe(DIAGONAL_LEG + CLIMB_LEG);
        });

        it("takes each leg of a walk by its weight, the whole of it the walk's length", () => {
            const walkOf = (field: typeof FIELD, path: number[], mover = ready(0, "a", "knight", path[0])) =>
                only(battleCues(field, [{ kind: "moved", fighter: 0, path, sneaking: false }], [mover]), "walk")[0].length;
            const straight = walkOf(FIELD, [10, 11, 12]);
            expect(straight).toBe(2 * WALK_STEP_MS);
            // One straight step then one diagonal.
            expect(walkOf(FIELD, [10, 11, 22])).toBe(Math.round((1 + DIAGONAL_LEG) * WALK_STEP_MS));
            expect(walkOf(FIELD, [10, 11, 22])).toBeGreaterThan(straight);
            // Two steps up a hill, each two quarters.
            const hill = hillOf(["....."], ["02468"]);
            expect(walkOf(hill, [0, 1, 2])).toBe(Math.round(2 * (1 + 2 * CLIMB_LEG) * WALK_STEP_MS));
            expect(walkOf(hill, [0, 1, 2])).toBeGreaterThan(walkOf(ROW, [0, 1, 2]));
            // The same steps back down take as long.
            expect(walkOf(hill, [2, 1, 0])).toBe(walkOf(hill, [0, 1, 2]));
        });
    });

    describe("fitting a long action into the playback", () => {
        const run = (squares: number): BattleEvent[] => [
            { kind: "moved", fighter: 0, path: Array.from({ length: squares }, (_, i) => 10 + i), sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: true },
        ];
        const shots = (count: number): BattleEvent[] => Array.from({ length: count }, () => ({ kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: false }));
        /** When each piece of damage lands, in order. */
        const hitStarts = (cues: BattleCue[]) => only(cues, "text").filter(cue => cue.tone === "hit").map(cue => cue.start);
        const endOfAll = (cues: BattleCue[]) => Math.max(...cues.map(cue => cue.start + cue.length));

        it("leaves the longest run, and a shot after it, unshortened", () => {
            // Twenty-six squares: twenty-five paces, then a shot.
            const cues = battleCues(ROW, run(26), before);
            expect(only(cues, "walk")[0].length).toBe(25 * WALK_STEP_MS);
            const [shot] = only(cues, "flight");
            expect(shot.land).toBe(flightMs(ROW, "arrow", 50, 35));
            expect(only(cues, "text").find(cue => cue.tone === "hit")).toMatchObject({ start: 25 * WALK_STEP_MS + 450, length: HIT_TEXT_MS });
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
        });

        it("quickens a longer run's walk first, as little as it takes, leaving its shot's flight, its gap and its text whole", () => {
            // Forty squares walked at full pace, then a shot, would run to 5.7 seconds.
            const cues = battleCues(ROW, run(40), before);
            const [walk] = only(cues, "walk");
            expect(walk.length).toBeLessThan(39 * WALK_STEP_MS);
            expect(walk.length).toBeGreaterThanOrEqual(39 * 70);
            const [shot] = only(cues, "flight");
            expect(shot.land).toBe(flightMs(ROW, "arrow", 50, 49));
            const [hit] = only(cues, "text").filter(cue => cue.tone === "hit");
            expect(hit).toMatchObject({ length: HIT_TEXT_MS, start: walk.length + 450 });
            // Squeezed no further than it had to be.
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
            expect(endOfAll(cues)).toBeGreaterThan(PLAYBACK_MS - 50);
        });

        it("shortens the gaps between landings once its walks are as quick as they go, leaving flights and text whole", () => {
            // Forty-six steps at the quickest, 70ms, and a shot a beat after would still overrun.
            const cues = battleCues(ROW, run(47), before);
            const [walk] = only(cues, "walk");
            expect(walk.length).toBe(46 * 70);
            const [hit] = only(cues, "text").filter(cue => cue.tone === "hit");
            expect(hit.start - walk.length).toBeLessThan(450);
            expect(hit.start - walk.length).toBeGreaterThanOrEqual(200);
            expect(hit.length).toBe(HIT_TEXT_MS);
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
        });

        it("shortens the gaps between a crowd of shots before it shortens their text, and keeps every flight", () => {
            const cues = battleCues(FIELD, shots(12), before);
            const starts = hitStarts(cues);
            expect(starts).toHaveLength(12);
            const gaps = starts.slice(1).map((start, i) => start - starts[i]);
            expect(Math.min(...gaps)).toBeGreaterThanOrEqual(200);
            expect(Math.max(...gaps)).toBeLessThan(450);
            expect(only(cues, "text").every(cue => cue.length === HIT_TEXT_MS)).toBe(true);
            expect(only(cues, "flight").every(cue => cue.land === flight("arrow", 50, 10))).toBe(true);
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
        });

        it("shortens the text last, to no less than 800ms, with the gaps at their least and the flights untouched", () => {
            const cues = battleCues(FIELD, shots(15), before);
            const starts = hitStarts(cues);
            // At their least a gap is as long as the flight before it, which no squeeze touches.
            expect(starts.slice(1).map((start, i) => start - starts[i]).every(gap => gap === flight("arrow", 50, 10))).toBe(true);
            for (const text of only(cues, "text")) {
                expect(text.length).toBeGreaterThanOrEqual(800);
                expect(text.length).toBeLessThan(HIT_TEXT_MS);
            }
            expect(only(cues, "flight").every(cue => cue.land === flight("arrow", 50, 10))).toBe(true);
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
        });

        it("scales whatever still runs over as a whole, as a last resort, so it never plays past the cap", () => {
            const cues = battleCues(ROW, run(60), before);
            expect(only(cues, "walk")[0].length).toBeLessThan(59 * 70);
            expect(endOfAll(cues)).toBeLessThanOrEqual(PLAYBACK_MS);
            const crowd = battleCues(FIELD, shots(30), before);
            expect(Math.min(...only(crowd, "text").map(cue => cue.length))).toBeLessThan(800);
            expect(endOfAll(crowd)).toBeLessThanOrEqual(PLAYBACK_MS);
        });
    });

    it("stands a knock-out's Down a line above the damage that caused it, and a later text back in the usual place", () => {
        const cues = battleCues(FIELD, [
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 9, reaction: false },
            { kind: "downed", fighter: 0, by: 1 },
            { kind: "burned", fighter: 3, damage: 1 },
        ], before);
        const [damage, down] = only(cues, "text");
        expect(damage.lane ?? 0).toBe(0);
        expect(down).toMatchObject({ value: "Down", lane: 1 });
        // Down starts while the damage is still rising.
        expect(down.start).toBeLessThan(damage.start + damage.length);
        // Another fighter's text shares nothing with theirs.
        expect(only(cues, "text")[2].lane ?? 0).toBe(0);
        // Once the first text has gone, the next on that fighter is back on the ground.
        const later = battleCues(FIELD, [
            { kind: "burned", fighter: 0, damage: 1 },
            { kind: "burned", fighter: 0, damage: 1 },
            { kind: "burned", fighter: 0, damage: 1 },
        ], before);
        expect(only(later, "text").map(cue => cue.start)).toEqual([0, 450, 900]);
        // The third starts at 900, while the first (to 1000) and the second (to 1450) are both still showing.
        expect(only(later, "text").map(cue => cue.lane ?? 0)).toEqual([0, 1, 2]);
        const gap = battleCues(FIELD, Array.from({ length: 4 }, () => ({ kind: "burned", fighter: 0, damage: 1 }) as const), before);
        // The fourth starts at 1350, after the first (to 1000) has gone, so it takes the lowest lane again.
        expect(only(gap, "text").map(cue => [cue.start, cue.lane ?? 0])).toEqual([[0, 0], [450, 1], [900, 2], [1350, 0]]);
    });

    it("keeps everyone one fireball hits in the usual place, and gives texts that start together on one fighter lanes of their own", () => {
        const cues = battleCues(FIELD, [{ kind: "fireball", fighter: 3, at: 55, targets: [1, 2], damage: 3 }], before);
        expect(only(cues, "text").map(cue => cue.lane ?? 0)).toEqual([0, 0]);
        const together = battleCues(FIELD, [{ kind: "hunkered", fighter: 0 }, { kind: "watching", fighter: 0, banked: 2 }, { kind: "watching", fighter: 1, banked: 2 }], before);
        const [first, second] = only(together, "text").filter(cue => cue.fighter === 0);
        expect(first.lane ?? 0).not.toBe(second.lane ?? 0);
    });

    it.each([12, 30])("keeps texts that overlap on different lanes when an action is shortened to fit (%i shots)", count => {
        const shots: BattleEvent[] = Array.from({ length: count }, () => ({ kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: false }));
        const texts = only(battleCues(FIELD, [...shots, { kind: "downed", fighter: 0, by: 1 }], before), "text");
        expect(texts).toHaveLength(count + 1);
        expect(Math.max(...texts.map(cue => cue.lane ?? 0))).toBeGreaterThan(0);
        for (const [i, one] of texts.entries()) {
            for (const other of texts.slice(i + 1)) {
                const overlap = Math.min(one.start + one.length, other.start + other.length) - Math.max(one.start, other.start);
                // A millisecond of rounding either side is no overlap.
                if (overlap > 2) expect(one.lane ?? 0).not.toBe(other.lane ?? 0);
            }
        }
    });

    describe("for a player who sees no walk or flight", () => {
        const run: BattleEvent[] = [
            { kind: "moved", fighter: 0, path: Array.from({ length: 11 }, (_, i) => 10 + i), sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 3, reaction: true },
            { kind: "downed", fighter: 0, by: 1 },
        ];

        it("takes no time over a walk, so a shot after it is told at once", () => {
            const walking = battleCues(ROW, run, before), still = battleCues(ROW, run, before, [], { still: true });
            const shot = (cues: BattleCue[]) => only(cues, "text").find(cue => cue.value === "\u22123")!;
            // The mover stops at square 20, thirty squares from the archer who shoots it: an arrow that takes longer than a beat.
            expect(shot(walking).start).toBe(10 * WALK_STEP_MS + Math.max(450, flightMs(ROW, "arrow", 50, 20)));
            expect(shot(still).start).toBe(0);
            expect(shot(still).start).toBeLessThan(shot(walking).start - 1000);
            expect(only(still, "walk")).toMatchObject([{ path: expect.any(Array), start: 0, length: 0 }]);
            // The downed mover is on its square from the moment the walk (such as it is) ends.
            expect(only(still, "fall")).toMatchObject([{ fighter: { id: 0, square: 20 }, arrives: 0 }]);
            expect(partDurationMs(still)).toBeLessThan(partDurationMs(walking));
        });

        it("lands a flight with no lead, and still gives it a moment so it is never drawn landing in no time", () => {
            const [flight] = only(battleCues(FIELD, [run[1]], before, [], { still: true }), "flight");
            expect(flight).toMatchObject({ start: 0, land: 1 });
            expect(flight.length).toBeGreaterThanOrEqual(flight.land);
            const [fireball] = only(battleCues(FIELD, [{ kind: "fireball", fighter: 3, at: 55, targets: [1], damage: 3 }], before, [], { still: true }), "burst");
            expect(fireball.start).toBe(0);
        });

        it("leaves the timeline as it was without the option, and carries it through a review's parts and step", () => {
            expect(battleCues(ROW, run, before, [], {})).toEqual(battleCues(ROW, run, before));
            expect(battleCues(ROW, run, before, [], { still: false })).toEqual(battleCues(ROW, run, before));
            const outcome = { events: run } as IRealmArenaStepOutcome;
            const board = { fighters: before, blasted: [] };
            expect(reviewParts(ROW, outcome, board, [], { still: true })[0].cues).toEqual(battleCues(ROW, run, before, [], { still: true }));
            expect(reviewStepMs(ROW, outcome, board, [], { still: true })).toBeLessThan(reviewStepMs(ROW, outcome, board));
        });
    });
});

describe("moveFrame", () => {
    const mover = ready(0, "a", "knight", 10);
    const arrived = { ...mover, square: 31 };
    const move = (path: number[], fighter = 0): ToldEvent => ({ kind: "moved", fighter, path, sneaking: false });

    it("is where the mover stood before and where it stands after", () => {
        expect(moveFrame([move([10, 20, 31])], [mover], [arrived])).toEqual([10, 31]);
    });

    it("runs a move split by an overwatch shot as one, from where it began to where it ended", () => {
        const shot: ToldEvent = { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 1, reaction: true };
        expect(moveFrame([move([10, 20]), shot, move([20, 31])], [mover], [arrived])).toEqual([10, 31]);
    });

    it("frames the part of the move the viewer saw when it came into sight or went out of it", () => {
        // Out of the fog: from where it was first seen to where it stands.
        expect(moveFrame([move([30, 31])], [], [arrived])).toEqual([30, 31]);
        // Into the fog: from where it stood to the last square it was seen on.
        expect(moveFrame([move([10, 20, 25])], [mover], [])).toEqual([10, 25]);
        // Through the viewer's sight and out again: just the stretch they saw.
        expect(moveFrame([move([40, 41]), move([41, 42])], [], [])).toEqual([40, 42]);
    });

    it("is null when nothing of the move was seen, there was none, or it ended where it began", () => {
        expect(moveFrame([move([])], [], [])).toBeNull();
        expect(moveFrame([move([10])], [mover], [])).toBeNull();
        expect(moveFrame([{ kind: "hunkered", fighter: 0 }], [mover], [arrived])).toBeNull();
        expect(moveFrame([move([10, 11, 10])], [mover], [mover])).toBeNull();
    });
});

describe("the next wave on the scoreboard (§30.11)", () => {
    it("says when it lands, and how many it brings or could", () => {
        expect(waveLineOf({ round: 7, arriving: 3 }, 4)).toBe("next wave 7 · 3 coming");
        expect(waveLineOf({ round: 7, arriving: 10, upTo: true }, 6)).toBe("wave next round · up to 10 coming");
        expect(waveLineOf({ round: 4 }, 1)).toBe("next wave 4");
        expect(waveLineOf(undefined, 14)).toBe("final wave landed");
    });
});

describe("coopColourOf", () => {
    it("colours the viewer's own green, a teammate's blue and a warband's red", () => {
        expect(coopColourOf("alice", "alice")).toBe(TEAM_COLOUR);
        expect(coopColourOf("alice", "bob")).toBe(ALLY_COLOUR);
        expect(coopColourOf("alice", warbandOwner(0))).toBe(ENEMY_COLOUR);
    });
});

describe("a review step's parts", () => {
    const start = [ready(0, "a", "knight", 10), ready(1, warbandOwner(0), "archer", 50)];
    const board = (fighters: Fighter[], blasted: number[] = []): RealmArenaPartState => ({ fighters, ghosts: [], clouds: [], blasted, scores: {} });
    const shot: ToldEvent = { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: false };
    const moved: ToldEvent = { kind: "moved", fighter: 1, path: [50, 51], sneaking: false };

    it("rests on a step for the glide to it, as long as its cues play and a beat more, and never less than the floor", () => {
        const cues = battleCues(FIELD, [shot], start);
        const end = Math.max(...cues.map(cue => cue.start + cue.length));
        expect(partDurationMs(cues)).toBe(Math.max(STEP_MIN_MS, FOLLOW_GLIDE_MS + end + STEP_BEAT_MS));
        // A short move walks for a moment, and still gives the board's glide its time.
        expect(partDurationMs(battleCues(FIELD, [moved], start))).toBe(STEP_MIN_MS);
        expect(partDurationMs([])).toBe(STEP_MIN_MS);
    });

    it("rests on a long walk for the glide to it, as long as it takes, and a beat more", () => {
        const run: ToldEvent = { kind: "moved", fighter: 1, path: Array.from({ length: 21 }, (_, i) => 50 + i), sneaking: false };
        expect(partDurationMs(battleCues(ROW, [run], start))).toBe(FOLLOW_GLIDE_MS + 20 * WALK_STEP_MS + STEP_BEAT_MS);
        // A step rests on it too, whether or not its board after is told: that is where a move into sight is drawn from.
        const outcome: IRealmArenaStepOutcome = { events: [run] };
        expect(reviewStepMs(ROW, outcome, { fighters: start, blasted: [] }, [start[0], { ...start[1], square: 70 }])).toBe(FOLLOW_GLIDE_MS + 20 * WALK_STEP_MS + STEP_BEAT_MS);
    });

    it("walks a mover who was not on the board before from the board after, for the last part", () => {
        const entered = ready(5, warbandOwner(0), "archer", 80);
        const outcome: IRealmArenaStepOutcome = { events: [{ kind: "moved", fighter: 5, path: [80, 81], sneaking: false }] };
        expect(reviewParts(FIELD, outcome, { fighters: start, blasted: [] })[0].cues).toEqual([]);
        expect(reviewParts(FIELD, outcome, { fighters: start, blasted: [] }, [...start, { ...entered, square: 81 }])[0].cues).toMatchObject([{ kind: "walk", path: [80, 81] }]);
    });

    it("keeps a step that took twelve shots within the playback cap and a beat", () => {
        const shots: ToldEvent[] = Array.from({ length: 12 }, () => shot);
        expect(partDurationMs(battleCues(FIELD, shots, start))).toBeLessThanOrEqual(FOLLOW_GLIDE_MS + PLAYBACK_MS + STEP_BEAT_MS);
    });

    it("is a single part for an ordinary step, and one with nothing to play for a step with no outcome", () => {
        const plain: IRealmArenaStepOutcome = { events: [shot] };
        const [only] = reviewParts(FIELD, plain, { fighters: start, blasted: [] });
        expect(only.cues.length).toBeGreaterThan(0);
        expect(only.state).toBeUndefined();
        expect(reviewStepMs(FIELD, plain, { fighters: start, blasted: [] })).toBe(only.durationMs);
        expect(reviewParts(FIELD, undefined, { fighters: start, blasted: [] })).toMatchObject([{ cues: [], durationMs: STEP_MIN_MS }]);
    });

    it("plays each part from the board the one before left, and a step's time is its parts' added up", () => {
        const moved1 = { ...start[1], square: 51 };
        const outcome: IRealmArenaStepOutcome = {
            events: [moved, shot, shot],
            parts: [
                { kind: "ended", events: [moved], state: board([start[0], moved1], [7]) },
                { kind: "enemy", events: [shot] },
            ],
        };
        const parts = reviewParts(FIELD, outcome, { fighters: start, blasted: [] });
        expect(parts).toHaveLength(2);
        expect(parts[0].before).toEqual({ fighters: start, blasted: [] });
        expect(parts[1].before).toEqual({ fighters: [start[0], moved1], blasted: [7] });
        // The second part's shot flies from where the first part left the archer.
        const flight = parts[1].cues.find(cue => cue.kind === "flight");
        expect(flight).toMatchObject({ from: 51, to: 10 });
        expect(reviewStepMs(FIELD, outcome, { fighters: start, blasted: [] })).toBe(parts[0].durationMs + parts[1].durationMs);
    });

    it("draws a part's board over the snapshot's, leaving out an enemy the part had not met", () => {
        const snapshot = { ...board([start[0]]), enemy: "swarm" as const, round: 3 };
        const part = board([start[1]], [4]);
        expect(withPartState(snapshot, part)).toEqual({ ...snapshot, fighters: [start[1]], blasted: [4], enemy: undefined });
        expect(withPartState(snapshot, undefined)).toBe(snapshot);
    });

    it("names each part for the dock: the End turn, the enemy's actions in order, the turn passing on", () => {
        const parts = [{ kind: "ended" as const }, { kind: "enemy" as const }, { kind: "enemy" as const }, { kind: "enemy" as const }, { kind: "handOff" as const }];
        const labels = parts.map((_, index) => partLabel(parts, index, "the Renegades"));
        expect(labels).toEqual(["ending the turn", "the Renegades' action 1 of 3", "the Renegades' action 2 of 3", "the Renegades' action 3 of 3", "the turn passes on"]);
    });

    it("names a part by its kind, not its place, when fog left the End turn's own part out", () => {
        const parts = [{ kind: "enemy" as const }, { kind: "enemy" as const }];
        expect(parts.map((_, index) => partLabel(parts, index, "the enemy"))).toEqual(["the enemy's action 1 of 2", "the enemy's action 2 of 2"]);
        expect(partLabel([{}], 0, "the enemy")).toBeUndefined();
    });
});

describe("isUnplaced", () => {
    const start = [ready(0, "a", "knight", 10), ready(1, warbandOwner(0), "archer", 50)];
    const part = (events: ToldEvent[], before: Fighter[] = start) => ({ events, cues: battleCues(FIELD, events, before), before: { fighters: before, blasted: [] } });
    const hunkered: ToldEvent = { kind: "hunkered", fighter: 5 };
    const scored: ToldEvent = { kind: "scored", player: "a", points: 2, reason: "centre" };

    it("is a followed step that told of something and can be placed nowhere: no move, no change, no cue", () => {
        expect(isUnplaced(part([hunkered]), start, true)).toBe(true);
        // A cost the viewer was told of with no one to point to is the same.
        expect(isUnplaced(part([hunkered, scored]), start, true)).toBe(true);
    });

    it("is not one a cue, a move or a changed character can place", () => {
        // A shot at someone the viewer sees plays a cue.
        expect(isUnplaced(part([{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: false }]), start, true)).toBe(false);
        // A stance by a character the viewer sees does too.
        expect(isUnplaced(part([{ kind: "hunkered", fighter: 0 }]), start, true)).toBe(false);
        // A move with something to frame.
        const moved: ToldEvent = { kind: "moved", fighter: 0, path: [10, 11], sneaking: false };
        expect(isUnplaced(part([moved]), [{ ...start[0], square: 11 }, start[1]], true)).toBe(false);
        // A character that is different after: spent AP, say, which `actionSquares` follows.
        expect(isUnplaced(part([hunkered]), [{ ...start[0], ap: start[0].ap - 1 }, start[1]], true)).toBe(false);
    });

    it("is not one when nothing was told of it but a score, or nothing at all", () => {
        expect(isUnplaced(part([scored]), start, true)).toBe(false);
        expect(isUnplaced(part([]), start, true)).toBe(false);
    });

    it("is not one that isn't followed, such as the turn passing on", () => {
        expect(isUnplaced(part([hunkered]), start, false)).toBe(false);
    });
});

describe("actionFollow", () => {
    const mover = ready(0, "a", "knight", 10);
    const arrived = { ...mover, square: 31 };
    const move = (path: number[]): ToldEvent => ({ kind: "moved", fighter: 0, path, sneaking: false });
    const at2 = (col: number, row: number) => squareAt(RUINED_FORT, col, row)!;

    it("frames a move exactly, from where it began to where it ended", () => {
        expect(actionFollow(RUINED_FORT, [move([10, 20, 31])], [mover], [arrived], "k")).toEqual({ squares: [10, 31], key: "k", exact: true });
    });

    it("goes to what a step touched, as deep as it fits, when it was no move", () => {
        const hurt = { ...mover, hp: mover.hp - 1 };
        expect(actionFollow(RUINED_FORT, [], [mover], [hurt], "k")).toEqual({ squares: [10], key: "k" });
    });

    it("is null when nothing changed or what changed is spread over more than half the field", () => {
        expect(actionFollow(RUINED_FORT, [], [mover], [{ ...mover }], "k")).toBeNull();
        const near = ready(1, "b", "archer", at2(2, 2)), far = ready(2, "b", "mage", at2(30, 40));
        const hurt = [near, far].map(fighter => ({ ...fighter, hp: fighter.hp - 1 }));
        expect(actionFollow(RUINED_FORT, [], [near, far], hurt, "k")).toBeNull();
    });
});

describe("an HP bar through an action", () => {
    const before = ready(0, "a", "knight", 10);
    const max = before.hp;
    const text = (start: number, hpChange?: number): TextCue => ({ kind: "text", fighter: 0, square: 10, value: "−", tone: "hit", start, length: HIT_TEXT_MS, hpChange });
    const told = (cues: TextCue[], after: Fighter, still = false) => toldOf(cues, before, after, still)!;
    const hurt = (hp: number): Fighter => ({ ...before, hp });

    it("holds the HP it was found at until its cue, then tweens to the new HP over the tween", () => {
        const one = told([text(500, -4)], hurt(max - 4));
        expect(toldAt(one, hurt(max - 4), 499).drawn.hp).toBe(max);
        expect(toldAt(one, hurt(max - 4), 500 + HP_TWEEN_MS / 2).drawn.hp).toBe(max - 2);
        expect(toldAt(one, hurt(max - 4), 500 + HP_TWEEN_MS).drawn.hp).toBe(max - 4);
    });

    it("carries a second blow on from where the first had got to", () => {
        const after = hurt(max - 6);
        const two = told([text(500, -4), text(500 + HP_TWEEN_MS / 2, -2)], after);
        // Halfway through the first tween the second lands: it starts from max - 2.
        expect(toldAt(two, after, 500 + HP_TWEEN_MS / 2).drawn.hp).toBe(max - 2);
        expect(toldAt(two, after, 500 + HP_TWEEN_MS).drawn.hp).toBe(max - 4);
        expect(toldAt(two, after, 500 + HP_TWEEN_MS * 2).drawn.hp).toBe(max - 6);
    });

    it("always ends the last step on the fighter's real HP, even if the cues don't add up", () => {
        const after = hurt(max - 3);
        const lying = told([text(0, -1)], after);
        expect(lying.steps.at(-1)!.to).toBe(max - 3);
        expect(toldAt(lying, after, 10000).drawn.hp).toBe(max - 3);
    });

    it("drains the chip after the fill, which it lags", () => {
        const after = hurt(max - 4);
        const one = told([text(0, -4)], after);
        expect(toldAt(one, after, -1).chip).toBe(max);
        expect(toldAt(one, after, HP_TWEEN_MS).drawn.hp).toBe(max - 4);
        expect(toldAt(one, after, HP_TWEEN_MS).chip).toBe(max);
        expect(toldAt(one, after, HP_TWEEN_MS + HP_CHIP_MS / 2).chip).toBe(max - 2);
        expect(toldAt(one, after, HP_TWEEN_MS + HP_CHIP_MS).chip).toBe(max - 4);
        expect(one.until).toBe(HP_TWEEN_MS + HP_CHIP_MS);
    });

    it("jumps with reduced motion, and leaves no chip", () => {
        const after = hurt(max - 4);
        const one = told([text(500, -4)], after, true);
        expect(toldAt(one, after, 499).drawn.hp).toBe(max);
        expect(toldAt(one, after, 500).drawn.hp).toBe(max - 4);
        expect(toldAt(one, after, 500).chip).toBeUndefined();
        expect(one.until).toBe(500);
    });

    it("draws the marks as `before` had them until the first cue lands", () => {
        const after = { ...hurt(max - 4), banked: 2 };
        const one = told([text(500, -4)], after);
        expect(toldAt(one, after, 499).drawn.banked).toBe(before.banked);
        expect(toldAt(one, after, 500).drawn.banked).toBe(2);
    });

    it("tells nothing of a fighter with no cue, not there before, down, or unchanged", () => {
        expect(toldOf([], before, hurt(max - 1), false)).toBeNull();
        expect(toldOf([text(0, -1)], undefined, hurt(max - 1), false)).toBeNull();
        expect(toldOf([text(0, -1)], before, hurt(0), false)).toBeNull();
        expect(toldOf([text(0, 0)], before, { ...before }, false)).toBeNull();
    });

    it("steps a value through each step, jumping when there's no tween", () => {
        const steps = [{ at: 100, to: 6 }, { at: 200, to: 3 }];
        expect(stepped(10, steps, 0, 0, 99)).toBe(10);
        expect(stepped(10, steps, 0, 0, 150)).toBe(6);
        expect(stepped(10, steps, 0, 0, 200)).toBe(3);
    });
});

describe("a walk on screen", () => {
    const fighter = ready(0, "a", "knight", 0);
    const walk = (path: number[], length = 1000, start = 0): WalkCue => ({ kind: "walk", fighter, path, start, length });
    /** One unit a square along a row, so a leg's length is the gap between its squares. */
    const gap = (from: number, to: number) => Math.abs(to - from);

    it("eases in and out and is steady between", () => {
        // Four legs: the ramps are each a quarter of the time.
        expect(walkEase(0, 0.25, 0.25)).toBe(0);
        expect(walkEase(1, 0.25, 0.25)).toBeCloseTo(1, 10);
        expect(walkEase(0.5, 0.25, 0.25)).toBeCloseTo(0.5, 10);
        // Continuous where the ramp meets the steady part.
        expect(walkEase(0.25 - 1e-9, 0.25, 0.25)).toBeCloseTo(walkEase(0.25 + 1e-9, 0.25, 0.25), 6);
        // Slower than a straight line at the start, quicker in the middle.
        expect(walkEase(0.1, 0.25, 0.25)).toBeLessThan(0.1);
        const steady = walkEase(0.6, 0.25, 0.25) - walkEase(0.5, 0.25, 0.25);
        expect(walkEase(0.4, 0.25, 0.25) - walkEase(0.3, 0.25, 0.25)).toBeCloseTo(steady, 10);
    });

    it("is a plain ease in and out over one or two legs", () => {
        expect(walkEase(0.5, 1, 1)).toBeCloseTo(0.5, 10);
        expect(walkEase(0.25, 1, 1)).toBeCloseTo(0.125, 10);
        expect(walkEase(0.75, 1, 1)).toBeCloseTo(0.875, 10);
        expect(walkEase(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 10);
    });

    it("shares a walk's time out over its legs by how long each is", () => {
        // A short leg then a long one: legs of 1 and 3, so the first is a quarter of the way.
        const walks = [walk([0, 1, 4])];
        const at = (ms: number) => walkerAt(walks, ms, gap)!;
        // Eased over two legs, the quarter-way mark is at the time the ease reaches 0.25.
        expect(walkEase(0.5, 0.25, 0.5)).toBeGreaterThan(0.25);
        const first = at(0), later = at(999);
        expect([first.from, first.to]).toEqual([0, 1]);
        expect([later.from, later.to]).toEqual([1, 4]);
        expect(later.across).toBeGreaterThan(0.9);
    });

    it("moves at an even pace across legs of different lengths in the steady part", () => {
        // Eleven legs: the ramps are a ninth of the walk each at most, so the middle is steady.
        const path = [0, 1, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14];
        const walks = [walk(path, 10000)];
        const distance = (ms: number) => {
            const leg = walkerAt(walks, ms, gap)!;
            return leg.from + (leg.to - leg.from) * leg.across;
        };
        // The path is a line along a row, so where the walker is is how far it has got.
        const step = distance(5000) - distance(4000);
        expect(distance(6000) - distance(5000)).toBeCloseTo(step, 6);
        expect(distance(4000) - distance(3000)).toBeCloseTo(step, 6);
    });

    it("ends exactly on the last square, and is gone after", () => {
        const walks = [walk([0, 1, 2, 3], 1000, 200)];
        const near = walkerAt(walks, 1199.9, gap)!;
        expect(near.to).toBe(3);
        expect(near.across).toBeCloseTo(1, 3);
        expect(walkerAt(walks, 1200, gap)).toBeNull();
    });

    it("stands at the start before a walk and at the end between two", () => {
        const walks = [walk([0, 1, 2], 1000, 500), walk([2, 3], 1000, 2000)];
        expect(walkerAt(walks, 0, gap)).toEqual({ from: 0, to: 1, across: 0 });
        expect(walkerAt(walks, 1800, gap)).toEqual({ from: 1, to: 2, across: 1 });
        expect(walkerAt(walks, 2000, gap)).toEqual({ from: 2, to: 3, across: 0 });
    });

    it("copes with legs that measure nothing", () => {
        const walks = [walk([0, 1, 2])];
        const now = walkerAt(walks, 500, () => 0)!;
        expect(Number.isFinite(now.across)).toBe(true);
        expect(now.across).toBeGreaterThanOrEqual(0);
        expect(now.across).toBeLessThanOrEqual(1);
        expect(walkerAt([walk([5])], 100, gap)).toEqual({ from: 5, to: 5, across: 0 });
    });

    it("bobs a little every step, and hops a leg that changes height", () => {
        const flat = () => 0;
        const hill = (square: number) => square === 1 ? 2 : 0;
        expect(walkLift({ from: 0, to: 2, across: 0.5 }, flat)).toBeCloseTo(-WALK_BOB, 10);
        expect(walkLift({ from: 0, to: 1, across: 0.5 }, hill)).toBeCloseTo(-(WALK_BOB + WALK_HOP), 10);
        expect(walkLift({ from: 1, to: 0, across: 0.5 }, hill)).toBeCloseTo(-(WALK_BOB + WALK_HOP), 10);
        // On the ground at either end of a leg.
        expect(Math.abs(walkLift({ from: 0, to: 1, across: 0 }, hill))).toBeLessThan(1e-9);
        expect(Math.abs(walkLift({ from: 0, to: 1, across: 1 }, hill))).toBeLessThan(1e-9);
    });
});

describe("impact", () => {
    const knight = ready(0, "a", "knight", 11);
    const archer = ready(1, "b", "archer", 10);
    /** Squares on a row 10 units apart, so one square away along it is straight right. */
    const project = (square: number) => ({ x: square * 10, y: 0 });
    const blow = (start: number, extra: Partial<TextCue> = {}): TextCue => ({ kind: "text", fighter: 0, square: 11, value: "−3", tone: "hit", start, length: HIT_TEXT_MS, hpChange: -3, from: 10, ...extra });
    const slash = (start = 100, length = 250): SlashCue => ({ kind: "slash", square: 11, striker: 1, from: 10, start, length });
    const hurt = { ...knight, hp: knight.hp - 3 };

    it("knocks a target away from where the blow came from, peaking mid-way", () => {
        const shoves = shovesOf([blow(500)], 0, false);
        expect(shoves).toHaveLength(1);
        const at = (ms: number) => shoveAt(shoves, ms, project);
        expect(at(499)).toEqual({ x: 0, y: 0 });
        expect(at(500).x).toBeCloseTo(0, 10);
        expect(at(500 + IMPACT_MS / 2)).toEqual({ x: KNOCK, y: 0 });
        expect(at(500 + IMPACT_MS).x).toBeCloseTo(0, 10);
        expect(at(500 + IMPACT_MS + 1)).toEqual({ x: 0, y: 0 });
    });

    it("knocks straight up for a blow from its own square, and not at all for one that takes no HP", () => {
        const burst = shovesOf([blow(0, { from: 11 })], 0, false);
        expect(shoveAt(burst, IMPACT_MS / 2, project)).toEqual({ x: 0, y: -KNOCK });
        expect(shovesOf([blow(0, { hpChange: 0 })], 0, false)).toEqual([]);
        expect(shovesOf([blow(0, { hpChange: 2 })], 0, false)).toEqual([]);
        expect(shovesOf([blow(0, { from: undefined })], 0, false)).toEqual([]);
        expect(shovesOf([blow(0, { fighter: 7 })], 0, false)).toEqual([]);
    });

    it("lunges a striker towards the square it strikes, out and back across the slash", () => {
        const shoves = shovesOf([slash(100, 250)], 1, false);
        const at = (ms: number) => shoveAt(shoves, ms, project);
        expect(at(99)).toEqual({ x: 0, y: 0 });
        expect(at(225)).toEqual({ x: LUNGE, y: 0 });
        expect(at(350).x).toBeCloseTo(0, 10);
        expect(at(351)).toEqual({ x: 0, y: 0 });
        expect(at(162.5).x).toBeGreaterThan(0);
        expect(at(162.5).x).toBeLessThan(LUNGE);
    });

    it("adds the pushes up when they overlap, and goes the other way when the view is turned", () => {
        const both = shovesOf([blow(0), blow(0)], 0, false);
        expect(shoveAt(both, IMPACT_MS / 2, project).x).toBeCloseTo(2 * KNOCK, 10);
        const turned = shoveAt(shovesOf([blow(0)], 0, false), IMPACT_MS / 2, square => ({ x: 0, y: -square }));
        expect(turned.x).toBeCloseTo(0, 10);
        expect(turned.y).toBeCloseTo(-KNOCK, 10);
    });

    it("tells a striker whose own bar and marks don't change, and no one else without a cue", () => {
        const told = toldOf([slash()], archer, archer, false);
        expect(told).not.toBeNull();
        expect(told!.steps).toEqual([]);
        expect(told!.until).toBe(350);
        // The striker draws as it is, with nothing held back.
        expect(toldAt(told!, archer, 0).drawn).toEqual(archer);
        expect(toldOffsetAt(told!, 225, project).x).toBeCloseTo(LUNGE, 10);
        // Someone else with the same cues, and nothing changing, is told nothing.
        expect(toldOf([slash()], knight, knight, false)).toBeNull();
        expect(toldOf([], archer, archer, false)).toBeNull();
    });

    it("carries a target's knock and runs its clock until the knock is over", () => {
        const told = toldOf([blow(0)], knight, hurt, false)!;
        expect(toldOffsetAt(told, IMPACT_MS / 2, project).x).toBeCloseTo(KNOCK, 10);
        expect(told.until).toBeGreaterThanOrEqual(IMPACT_MS);
    });

    it("moves nothing with reduced motion", () => {
        expect(shovesOf([blow(0), slash()], 0, true)).toEqual([]);
        expect(shovesOf([blow(0), slash()], 1, true)).toEqual([]);
        expect(toldOf([slash()], archer, archer, true)).toBeNull();
        const told = toldOf([blow(0)], knight, hurt, true)!;
        expect(told.shoves).toEqual([]);
        expect(toldOffsetAt(told, IMPACT_MS / 2, project)).toEqual({ x: 0, y: 0 });
    });
});

describe("shaking the battlefield", () => {
    const flight = (missile: FlightCue["missile"], start = 100, land = 600): FlightCue => ({ kind: "flight", missile, from: 0, to: 1, result: "landed", start, length: land + 350, land });

    it("shakes as a fireball or a thunder flask lands, and dies away to nothing", () => {
        for (const missile of ["fireball", "thunderFlask"] as const) {
            const cues = [flight(missile)];
            const lands = 700;
            expect(shakeAt(cues, lands - 1)).toEqual({ x: 0, y: 0 });
            expect(shakeAt(cues, lands)).toEqual({ x: 0, y: 0 });
            const moved = Array.from({ length: 30 }, (_, step) => shakeAt(cues, lands + step * SHAKE_MS / 30));
            expect(moved.some(point => point.x !== 0)).toBe(true);
            expect(moved.every(point => Math.abs(point.x) <= SHAKE && Math.abs(point.y) <= SHAKE)).toBe(true);
            expect(shakeAt(cues, lands + SHAKE_MS)).toEqual({ x: 0, y: 0 });
            expect(shakeAt(cues, lands + SHAKE_MS + 500)).toEqual({ x: 0, y: 0 });
            expect(shakeUntil(cues)).toBe(lands + SHAKE_MS);
        }
    });

    it("is stronger early than late in the shake", () => {
        const cues = [flight("fireball", 0, 0)];
        const peak = (from: number, to: number) => Math.max(...Array.from({ length: 50 }, (_, step) => Math.abs(shakeAt(cues, from + (to - from) * step / 50).x)));
        expect(peak(0, SHAKE_MS / 3)).toBeGreaterThan(peak(SHAKE_MS * 2 / 3, SHAKE_MS));
    });

    it("leaves every other missile and every other cue still", () => {
        for (const missile of ["arrow", "bolt", "fireFlask", "smokePot", "acid"] as const) {
            const cues = [flight(missile)];
            expect(shakeUntil(cues)).toBe(0);
            for (const ms of [0, 700, 750, 800]) expect(shakeAt(cues, ms)).toEqual({ x: 0, y: 0 });
        }
        expect(shakeUntil([])).toBe(0);
    });
});
