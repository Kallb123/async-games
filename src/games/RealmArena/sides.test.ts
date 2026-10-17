import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, type Battlefield } from "@/utils/games/battlefield/terrain";
import type { CharacterId } from "./characters";
import { battleRecorder } from "./battleRecord";
import { buildInitialRealmArenaState, type IRealmArenaSpecificGameState } from "./RealmArenaModels";
import {
    ACTION_POINTS, act, allied, battleFrom, centreHolders, centrePoints, check, fixedRolls, isBattleOver, knockoutPoints, newFighter, purified,
    reactionsTo, shotOdds, sideOf, squadSight, standings, viewOf,
    type BattleEvent, type BattleState, type Fighter,
} from "./rules";
import { targetsOf } from "./tactics";
import { MOVE, tapFighter, targetOptions } from "./useTurnDraft";

// docs/games/realm-arena.md §29.6: sides. Every "is this an enemy?" is asked
// by side, so two owners can fight as one — the teammates of co-op (B8) and of
// teams (B3). Here "a" and "b" are a side and "x" fights them; a free-for-all,
// with no `sides`, is every battle fought so far, and the rest of the suite
// shows it unchanged.

const SIDES = { a: "team", b: "team" };

const OPEN = buildBattlefield({
    name: "Open",
    rows: ["..........", "..........", "..........", "..........", ".........."],
    deployments: [],
    objectives: { centre: { col: 4, row: 1, width: 2, height: 2 } },
});

function ready(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

/** The same fighters as a team battle, and as a free-for-all. */
const team = (fighters: Fighter[], field: Battlefield = OPEN): BattleState => ({ field, fighters, sides: SIDES });
const solo = (fighters: Fighter[], field: Battlefield = OPEN): BattleState => ({ field, fighters });

describe("sideOf and allied (§29.6)", () => {
    it("makes every owner a side of its own in a free-for-all, and groups the owners a battle's sides name", () => {
        expect(sideOf({}, "a")).toBe("a");
        expect(allied({}, "a", "b")).toBe(false);
        expect(allied({}, "a", "a")).toBe(true);
        expect(sideOf({ sides: SIDES }, "a")).toBe("team");
        expect(allied({ sides: SIDES }, "a", "b")).toBe(true);
        expect(allied({ sides: SIDES }, "a", "x")).toBe(false);
        // An owner the sides don't name is its own side, whatever it's called.
        expect(sideOf({ sides: SIDES }, "constructor")).toBe("constructor");
    });

    it("builds a free-for-all with no sides, and nothing for fog off or no clouds", () => {
        expect(battleFrom(OPEN, { fighters: [], fog: false, clouds: [] })).toEqual({ field: OPEN, fighters: [] });
        expect(battleFrom(OPEN, { fighters: [], fog: true, clouds: [3] })).toEqual({ field: OPEN, fighters: [], fog: true, clouds: [3] });
    });
});

describe("an ally is no enemy (§29.1)", () => {
    const mover = ready(0, "a", "manAtArms", at(OPEN, 0, 2));
    const mate = ready(1, "b", "knight", at(OPEN, 1, 2));

    it("may be walked through but not stopped on, as one of your own", () => {
        const through = { kind: "move", fighter: 0, path: [at(OPEN, 0, 2), at(OPEN, 1, 2), at(OPEN, 2, 2)] };
        expect(check(team([mover, mate]), "a", through)).toEqual({ ap: 1 });
        expect(check(solo([mover, mate]), "a", through)).toEqual({ refused: "An enemy is in the way" });
        expect(check(team([mover, mate]), "a", { kind: "move", fighter: 0, path: [at(OPEN, 0, 2), at(OPEN, 1, 2)] })).toEqual({ refused: "Nobody can stop there" });
    });

    it("can't be attacked, cleaved or marked", () => {
        const enemy = ready(2, "x", "knight", at(OPEN, 0, 1));
        expect(check(team([mover, mate, enemy]), "a", { kind: "attack", fighter: 0, target: 1 })).toEqual({ refused: "Pick an enemy" });
        expect(check(team([mover, mate, enemy]), "a", { kind: "attack", fighter: 0, target: 2 })).toEqual({ ap: 2 });
        expect(check(team([mover, mate, enemy]), "a", { kind: "cleave", fighter: 0, targets: [1, 2] })).toEqual({ refused: "Pick two enemies" });
        expect(check(solo([mover, mate]), "a", { kind: "attack", fighter: 0, target: 1 })).toEqual({ ap: 2 });
    });

    it("is healed, raised and purified as one of your own", () => {
        const cleric = ready(0, "a", "cleric", at(OPEN, 0, 2));
        const hurt = ready(1, "b", "knight", at(OPEN, 1, 2), { hp: 5 });
        const fallen = ready(2, "b", "scout", at(OPEN, 0, 3), { hp: 0 });
        expect(check(team([cleric, hurt, fallen]), "a", { kind: "heal", fighter: 0, target: 1 })).toEqual({ ap: 2 });
        expect(check(team([cleric, hurt, fallen]), "a", { kind: "raise", fighter: 0, target: 2 })).toEqual({ ap: 3 });
        expect(purified(team([cleric, hurt]), cleric).map(one => one.id)).toEqual([1]);
        expect(check(solo([cleric, hurt, fallen]), "a", { kind: "heal", fighter: 0, target: 1 })).toEqual({ refused: "Pick an ally to heal" });
        expect(check(solo([cleric, hurt, fallen]), "a", { kind: "raise", fighter: 0, target: 2 })).toEqual({ refused: "Pick a downed ally" });
        expect(purified(solo([cleric, hurt]), cleric)).toEqual([]);
    });

    it("is covered by a teammate's shield wall", () => {
        const archer = ready(0, "x", "archer", at(OPEN, 0, 0));
        const target = ready(1, "a", "manAtArms", at(OPEN, 6, 2));
        const wall = ready(2, "b", "knight", at(OPEN, 7, 2), { effects: { shieldWall: 1 } });
        expect(shotOdds(team([archer, target, wall]), archer, target)?.cover).toBe("half");
        expect(shotOdds(solo([archer, target, wall]), archer, target)?.cover).toBe("none");
    });

    it("never sets off a teammate's overwatch or guard", () => {
        const watcher = ready(1, "b", "archer", at(OPEN, 9, 0), { ap: 0, banked: 4 });
        const path = [at(OPEN, 0, 2), at(OPEN, 1, 2)];
        expect(reactionsTo(team([mover, watcher]), mover, path)).toEqual([]);
        expect(reactionsTo(solo([mover, watcher]), mover, path)).toEqual([{ watcher: 1, step: 1 }]);
    });

    it("scores nobody for downing a teammate's character with a blast, and still does for an enemy's", () => {
        const mage = ready(0, "a", "mage", at(OPEN, 0, 2));
        const mateScout = ready(1, "b", "scout", at(OPEN, 5, 2), { hp: 2 });
        const enemyScout = ready(2, "x", "scout", at(OPEN, 6, 2), { hp: 2 });
        const { events } = act(team([mage, mateScout, enemyScout]), "a", { kind: "fireball", fighter: 0, at: at(OPEN, 5, 2) }, fixedRolls([]));
        expect(events.flatMap(event => event.kind === "downed" ? [event.fighter] : [])).toEqual([1, 2]);
        expect(events.filter(event => event.kind === "scored")).toEqual([{ kind: "scored", player: "a", points: knockoutPoints("scout"), reason: "knockout" }]);
    });
});

describe("a side shares its sight in fog of war (§27, §29.1)", () => {
    /** A wall across the middle, so "a" on the left can't see past it, and "b" on the right can. */
    const WALLED = buildBattlefield({
        name: "Walled",
        rows: ["..........#..........", "..........#..........", "..........#..........", "..........#..........", "....................."],
        deployments: [],
        objectives: {},
    });
    const fighters = [
        ready(0, "a", "manAtArms", at(WALLED, 0, 0)),
        ready(1, "b", "manAtArms", at(WALLED, 14, 0)),
        ready(2, "x", "manAtArms", at(WALLED, 18, 1)),
    ];
    const fogged = (sides?: Record<string, string>): BattleState => ({ field: WALLED, fighters, fog: true, ...(sides ? { sides } : {}) });

    it("sees what an ally sees", () => {
        expect(squadSight(fogged(SIDES), "a")(at(WALLED, 18, 1))).toBe(true);
        expect(squadSight(fogged(), "a")(at(WALLED, 18, 1))).toBe(false);
        expect(viewOf(fogged(SIDES), "a").fighters.map(one => one.id)).toEqual([0, 1, 2]);
        expect(viewOf(fogged(), "a").fighters.map(one => one.id)).toEqual([0]);
    });

    it("keeps the sides in a view, so the rules read a view as they read the battle", () => {
        expect(viewOf(fogged(SIDES), "a").sides).toEqual(SIDES);
        expect(viewOf(fogged(SIDES), "x").fighters.map(one => one.id)).toEqual([1, 2]);
    });
});

describe("the centre, the end and the standings, by side (§13.7, §5.1)", () => {
    const inCentre = (id: number, owner: string) => ready(id, owner, "knight", at(OPEN, 4 + (id % 2), 1 + Math.floor(id / 2) % 2));

    it("is held by a side, and scores each player of it who has someone there", () => {
        const both = [inCentre(0, "a"), inCentre(1, "b")];
        expect(centreHolders(team(both))).toEqual(["team"]);
        expect(centreHolders(solo(both))).toEqual(["a", "b"]);
        expect(centrePoints(team(both), "a", 3)).toBe(5);
        expect(centrePoints(team(both), "b", 3)).toBe(5);
        expect(centrePoints(solo(both), "a", 3)).toBe(0);
        // An ally's character alone holds it for the side, but scores only its own player.
        expect(centrePoints(team([inCentre(1, "b")]), "a", 3)).toBe(0);
        // An enemy contests it.
        expect(centrePoints(team([...both, inCentre(2, "x")]), "a", 3)).toBe(0);
    });

    it("ends when one side is left standing", () => {
        const standing = [ready(0, "a", "knight", 0), ready(1, "b", "knight", 1), ready(2, "x", "knight", 2, { hp: 0 })];
        expect(isBattleOver(team(standing), ["a", "x", "b"], 0)).toBe(true);
        expect(isBattleOver(solo(standing), ["a", "x", "b"], 0)).toBe(false);
    });

    it("ranks by the side's score, its players together", () => {
        const fighters = [ready(0, "a", "knight", 0), ready(1, "b", "knight", 1), ready(2, "x", "knight", 2)];
        const players = ["a", "x", "b"];
        expect(standings(team(fighters), players, { a: 3, b: 4, x: 6 })).toEqual(["b", "a", "x"]);
        expect(standings(solo(fighters), players, { a: 3, b: 4, x: 6 })).toEqual(["x", "b", "a"]);
        // Level scores go to the side with more standing, a squad of two against one.
        expect(standings(team(fighters), players, { a: 3, b: 3, x: 6 })).toEqual(["b", "a", "x"]);
    });
});

describe("the battle record, by side (§28)", () => {
    const seats = ["a", "x", "b"];
    const battle = (fighters: Fighter[]): IRealmArenaSpecificGameState => ({ ...buildInitialRealmArenaState(seats, {}), phase: "battle", fighters });
    const step = (id: string, events: BattleEvent[]) => ({ command: { className: "RealmArenaAct", id } as never, outcome: { validMove: true, turnOver: false, events } });

    it("counts a blast on a teammate as friendly fire, and credits no knock-out for one", () => {
        const mage = newFighter(0, "a", "mage", 0);
        const mate = newFighter(1, "b", "scout", 1);
        const enemy = newFighter(2, "x", "archer", 2);
        const recorder = battleRecorder(seats, SIDES);
        recorder.observe(step("0", []), battle([mage, { ...mate, hp: 2 }, enemy]));
        recorder.observe(step("1", [
            { kind: "fireball", fighter: mage.id, at: 1, targets: [mate.id, enemy.id], damage: 3 },
            { kind: "downed", fighter: mate.id, by: mage.id },
        ]), battle([mage, { ...mate, hp: 0 }, { ...enemy, hp: enemy.hp - 3 }]));

        const { fighting, losses } = recorder.result();
        expect(fighting.find(row => row.character === "mage")).toMatchObject({ dealt: 3, friendlyFire: 2, knockouts: 0 });
        expect(losses).toEqual([{ turnIndex: 0, icon: "knockout", title: "Scout downed by an allied Mage", seriesKey: "b" }]);
    });
});

describe("lining up an action on the board, by side (§17.3 PR 7)", () => {
    const manAtArms = ready(0, "a", "manAtArms", at(OPEN, 4, 2));
    const mate = ready(1, "b", "knight", at(OPEN, 5, 2), { hp: 5 });
    const battle = team([manAtArms, mate]);

    it("leaves a tap on a teammate to select rather than lining up an attack on it", () => {
        expect(tapFighter({ battle, fighter: manAtArms, draft: MOVE, reach: null, candidates: [] }, mate.id)).toBeUndefined();
    });

    it("lists a teammate as help given, with no chance to land", () => {
        const cleric = ready(2, "a", "cleric", at(OPEN, 4, 3));
        const withCleric = team([manAtArms, mate, cleric]);
        const candidates = targetsOf(withCleric, "a", cleric, "heal");
        expect(candidates).toEqual([mate.id]);
        expect(targetOptions(withCleric, cleric, "heal", candidates)).toEqual([{ target: mate }]);
    });
});
