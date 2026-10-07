import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { ACTION_POINTS, isWarband, newFighter, reachOf, warbandOwner, type BattleEvent, type Fighter, type ToldEvent } from "./rules";
import { ABILITIES, kitOf, type CharacterId } from "./characters";
import { EFFECT_ART, ITEM_ART } from "./art";
import { abilityWait, aimFocus, coopColourOf, ALLY_COLOUR, ENEMY_COLOUR, TEAM_COLOUR, actionSquares, apPips, areaRect, battleCues, canAct, effectsOn, eventLines, facingOf, fighterName, fighterStatus, focusOn, handItem, handOut, hpFraction, itemsOf, NO_ITEMS, numberedName, placeTap, reachFocus, reachShading, squadCounts, squadOf, whoseName, FLIGHT_MS, HIT_TEXT_MS, PLAYBACK_MS, WALK_STEP_MS, moveFrame, type BattleCue, type Placement, waveLineOf, partDurationMs, reviewParts, reviewStepMs, withPartState, STEP_BEAT_MS, STEP_MIN_MS, partLabel } from "./ui";
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
        const cues = battleCues([
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 3, reaction: true },
            { kind: "moved", fighter: 0, path: [12, 13, 14], sneaking: false },
            { kind: "shot", fighter: 2, target: 0, chance: 60, result: "graze", damage: 2, reaction: true },
            { kind: "moved", fighter: 0, path: [14, 15], sneaking: false },
        ], before);
        // The first leg walks, then the first shot flies to where the mover stopped, and the next leg walks once it has landed.
        const first = 2 * WALK_STEP_MS, firstLand = first + 450;
        expect(only(cues, "flight")).toMatchObject([
            { missile: "arrow", from: 50, to: 12, result: "hit", start: firstLand - FLIGHT_MS.arrow, land: FLIGHT_MS.arrow },
            // Setting off once the first has landed, and landing far enough after it to be seen.
            { missile: "arrow", from: 60, to: 14, result: "graze", land: FLIGHT_MS.arrow },
        ]);
        const second = firstLand + 2 * WALK_STEP_MS, secondLand = second + 450;
        expect(only(cues, "flight")[1].start).toBe(secondLand - FLIGHT_MS.arrow);
        expect(told(cues)).toEqual([`0@12 \u22123 ${firstLand}`, `0@14 \u22122/Graze ${secondLand}`]);
        expect(only(cues, "walk")).toMatchObject([
            { fighter: { id: 0, square: 10 }, path: [10, 11, 12], start: 0, length: first },
            { path: [12, 13, 14], start: firstLand, length: 2 * WALK_STEP_MS },
            { path: [14, 15], start: secondLand, length: WALK_STEP_MS },
        ]);
    });

    it("walks a move one square at a time along exactly the path it was told, ahead of anything after it", () => {
        const cues = battleCues([
            { kind: "moved", fighter: 0, path: [10, 11, 12, 13], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "miss", damage: 0, reaction: true },
        ], before);
        expect(only(cues, "walk")).toEqual([{ kind: "walk", fighter: before[0], path: [10, 11, 12, 13], start: 0, length: 3 * WALK_STEP_MS }]);
        // Nothing after it starts before it is over.
        const walkEnd = 3 * WALK_STEP_MS;
        expect(only(cues, "flight")[0].start).toBeGreaterThanOrEqual(walkEnd);
        expect(only(cues, "text")[0].start).toBeGreaterThan(walkEnd);
    });

    it("walks a move the viewer only saw the end of as it looks after, and plays nothing for a path of one square or a character in neither", () => {
        const entered = ready(9, "b", "archer", 30);
        const told: ToldEvent[] = [
            { kind: "moved", fighter: 9, path: [30, 31], sneaking: false },
            { kind: "moved", fighter: 0, path: [10], sneaking: false },
            { kind: "moved", fighter: 0, path: [], sneaking: false },
            { kind: "moved", fighter: 8, path: [40, 41], sneaking: false },
        ];
        expect(battleCues(told, before)).toEqual([]);
        expect(battleCues(told, before, [{ ...entered, square: 31 }])).toEqual([
            { kind: "walk", fighter: { ...entered, square: 31 }, path: [30, 31], start: 0, length: WALK_STEP_MS },
        ]);
    });

    it("has a mover downed on its way stand where it fell only once it has walked there", () => {
        const cues = battleCues([
            { kind: "moved", fighter: 0, path: [10, 11, 12], sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 9, reaction: true },
            { kind: "downed", fighter: 0, by: 1 },
        ], before);
        expect(only(cues, "fall")).toMatchObject([{ fighter: { id: 0, square: 12 }, arrives: 2 * WALK_STEP_MS }]);
        expect(only(battleCues([{ kind: "shot", fighter: 1, target: 0, chance: 60, result: "hit", damage: 9, reaction: false }, { kind: "downed", fighter: 0, by: 1 }], before), "fall")[0].arrives).toBeUndefined();
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
        // The arrow sets off once the mover has walked to where it stopped, and the mover is there by then.
        expect(only(cues, "fall")).toMatchObject([{ fighter: { id: 0, square: 12 }, start: 2 * WALK_STEP_MS + 450, arrives: 2 * WALK_STEP_MS }]);
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

    it("plays nothing of its own for a stance, a watch or a score", () => {
        expect(battleCues([
            { kind: "hunkered", fighter: 0 },
            { kind: "watching", fighter: 1, banked: 4 },
            { kind: "scored", player: "a", points: 5, reason: "centre" },
        ], before)).toEqual([]);
    });

    it("fits however much an action set off into the playback cap, every flight still landing as its text rises", () => {
        const shots: BattleEvent[] = Array.from({ length: 12 }, () => ({ kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: true }));
        const cues = battleCues(shots, before);
        expect(Math.max(...cues.map(cue => cue.start + cue.length))).toBeLessThanOrEqual(PLAYBACK_MS);
        const flights = only(cues, "flight"), texts = only(cues, "text");
        expect(texts).toHaveLength(12);
        flights.forEach((flight, i) => expect(Math.abs(flight.start + flight.land - texts[i].start)).toBeLessThanOrEqual(1));
        // Still in order, and still one after another.
        expect(texts.every((cue, i) => i === 0 || cue.start > texts[i - 1].start)).toBe(true);
    });

    it("leaves the longest run, and a shot after it, unshortened, and shortens a longer one with its walk", () => {
        const run = (squares: number): BattleEvent[] => [
            { kind: "moved", fighter: 0, path: Array.from({ length: squares }, (_, i) => 10 + i), sneaking: false },
            { kind: "shot", fighter: 1, target: 0, chance: 60, roll: 10, result: "hit", damage: 1, reaction: true },
        ];
        // Twenty-six squares: twenty-five paces, then a shot.
        const long = battleCues(run(26), before);
        expect(only(long, "walk")[0].length).toBe(25 * WALK_STEP_MS);
        expect(Math.max(...long.map(cue => cue.start + cue.length))).toBeLessThanOrEqual(PLAYBACK_MS);
        const longer = battleCues(run(60), before);
        expect(Math.max(...longer.map(cue => cue.start + cue.length))).toBeLessThanOrEqual(PLAYBACK_MS);
        expect(only(longer, "walk")[0].length).toBeLessThan(59 * WALK_STEP_MS);
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

    it("is null when the mover is missing from before or after, or never moved, or ended where it began", () => {
        expect(moveFrame([move([30, 31])], [], [arrived])).toBeNull();
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

    it("rests on a step for as long as its cues play and a beat more, and never less than the floor", () => {
        const cues = battleCues([shot], start);
        const end = Math.max(...cues.map(cue => cue.start + cue.length));
        expect(partDurationMs(cues)).toBe(Math.max(STEP_MIN_MS, end + STEP_BEAT_MS));
        // A short move walks for a moment, and still gives the board's glide its time.
        expect(partDurationMs(battleCues([moved], start))).toBe(STEP_MIN_MS);
        expect(partDurationMs([])).toBe(STEP_MIN_MS);
    });

    it("rests on a long walk for as long as it takes, and a beat more", () => {
        const run: ToldEvent = { kind: "moved", fighter: 1, path: Array.from({ length: 21 }, (_, i) => 50 + i), sneaking: false };
        expect(partDurationMs(battleCues([run], start))).toBe(20 * WALK_STEP_MS + STEP_BEAT_MS);
        // A step rests on it too, whether or not its board after is told: that is where a move into sight is drawn from.
        const outcome: IRealmArenaStepOutcome = { events: [run] };
        expect(reviewStepMs(outcome, { fighters: start, blasted: [] }, [start[0], { ...start[1], square: 70 }])).toBe(20 * WALK_STEP_MS + STEP_BEAT_MS);
    });

    it("walks a mover who was not on the board before from the board after, for the last part", () => {
        const entered = ready(5, warbandOwner(0), "archer", 80);
        const outcome: IRealmArenaStepOutcome = { events: [{ kind: "moved", fighter: 5, path: [80, 81], sneaking: false }] };
        expect(reviewParts(outcome, { fighters: start, blasted: [] })[0].cues).toEqual([]);
        expect(reviewParts(outcome, { fighters: start, blasted: [] }, [...start, { ...entered, square: 81 }])[0].cues).toMatchObject([{ kind: "walk", path: [80, 81] }]);
    });

    it("keeps a step that took twelve shots within the playback cap and a beat", () => {
        const shots: ToldEvent[] = Array.from({ length: 12 }, () => shot);
        expect(partDurationMs(battleCues(shots, start))).toBeLessThanOrEqual(PLAYBACK_MS + STEP_BEAT_MS);
    });

    it("is a single part for an ordinary step, and one with nothing to play for a step with no outcome", () => {
        const plain: IRealmArenaStepOutcome = { events: [shot] };
        const [only] = reviewParts(plain, { fighters: start, blasted: [] });
        expect(only.cues.length).toBeGreaterThan(0);
        expect(only.state).toBeUndefined();
        expect(reviewStepMs(plain, { fighters: start, blasted: [] })).toBe(only.durationMs);
        expect(reviewParts(undefined, { fighters: start, blasted: [] })).toMatchObject([{ cues: [], durationMs: STEP_MIN_MS }]);
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
        const parts = reviewParts(outcome, { fighters: start, blasted: [] });
        expect(parts).toHaveLength(2);
        expect(parts[0].before).toEqual({ fighters: start, blasted: [] });
        expect(parts[1].before).toEqual({ fighters: [start[0], moved1], blasted: [7] });
        // The second part's shot flies from where the first part left the archer.
        const flight = parts[1].cues.find(cue => cue.kind === "flight");
        expect(flight).toMatchObject({ from: 51, to: 10 });
        expect(reviewStepMs(outcome, { fighters: start, blasted: [] })).toBe(parts[0].durationMs + parts[1].durationMs);
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
