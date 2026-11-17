import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { at, fieldOf } from "@/utils/games/battlefield/testFixtures";
import { type CharacterId } from "./characters";
import { gameStateToModel } from "./RealmArenaModels";
import { playScriptedBattle } from "./testFixtures";
import { act, burstArea, endTurn, fixedRolls, knockoutPoints, newFighter, startTurn, type Action, type BattleEvent, type BattleState, type Fighter } from "./rules";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

// A Bloater downed by anything but its own Burst bursts where it falls, from
// rules version 12 (§39.3): Burst's area, damage and Corroded, friend or foe.

const field = fieldOf(...Array(10).fill("................"));
const point = (col: number, row = 3) => at(field, col, row);
const BURST_DAMAGE = 3;

function fighter(rulesVersion: number, id: number, character: CharacterId, col: number, owner: string, row = 3, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, point(col, row), null, undefined, false, { rulesVersion }), ap: 4, ...extra };
}
const battleOf = (rulesVersion: number, ...fighters: Fighter[]): BattleState => ({ field, fighters, rulesVersion, sides: { a: "team", b: "enemy" } });
const get = (state: Pick<BattleState, "fighters">, id: number) => state.fighters.find(one => one.id === id)!;
const bursts = (events: readonly BattleEvent[]) => events.filter((event): event is Extract<BattleEvent, { kind: "burst" }> => event.kind === "burst");
const scores = (events: readonly BattleEvent[]) => events.filter(event => event.kind === "scored");

/** a's Archer at the west edge shoots a 1 HP Bloater (b) with an enemy and an ally of its own beside it. */
const shotBattle = (rulesVersion: number) => battleOf(rulesVersion,
    fighter(rulesVersion, 0, "archer", 0, "a"),
    fighter(rulesVersion, 1, "bloater", 4, "b", 3, { hp: 1 }),
    fighter(rulesVersion, 2, "knight", 5, "a"),
    fighter(rulesVersion, 3, "manAtArms", 4, "b", 4),
    fighter(rulesVersion, 4, "knight", 9, "a", 8));
const shoot: Action = { kind: "attack", fighter: 0, target: 1 };

describe("a Bloater downed by a shot (§39.3)", () => {
    const state = shotBattle(12);
    const outcome = act(state, "a", shoot, fixedRolls([1]));
    const result = { ...state, ...outcome };

    it("bursts where it fell, on friend and foe, corroding them, and not on anyone out of reach", () => {
        const [burst] = bursts(outcome.events);
        expect(burst).toEqual({ kind: "burst", fighter: 1, targets: [2, 3], damage: BURST_DAMAGE, downed: true });
        expect(get(result, 2).hp).toBe(get(state, 2).hp - BURST_DAMAGE);
        expect(get(result, 3).hp).toBe(get(state, 3).hp - BURST_DAMAGE);
        expect(get(result, 2).effects.corroded).toBeGreaterThan(0);
        expect(get(result, 4).hp).toBe(get(state, 4).hp);
        expect(get(result, 1).spent).toContain("burst");
    });

    it("tells the blow, then the fall, then the burst", () => {
        const kinds = outcome.events.map(event => event.kind);
        expect(kinds.slice(0, 4)).toEqual(["shot", "downed", "scored", "burst"]);
        expect(outcome.events.find(event => event.kind === "downed")).toEqual({ kind: "downed", fighter: 1, by: 0 });
    });

    it("does nothing at version 11, where the Bloater falls quietly", () => {
        const old = act(shotBattle(11), "a", shoot, fixedRolls([1]));
        expect(bursts(old.events)).toEqual([]);
        expect(get(old, 2).hp).toBe(get(shotBattle(11), 2).hp);
        expect(get(old, 1).hp).toBe(0);
    });

    it("is the same outcome when played again from the same rolls", () => {
        expect(act(state, "a", shoot, fixedRolls([1]))).toEqual(outcome);
    });
});

describe("a Bloater's burst scores for whoever downed it (§39.3)", () => {
    // The Bloater is b's, and so is the Man-at-arms beside it with 3 HP: the burst downs it,
    // and so does a's Mage on the other side; a's Archer shot the Bloater.
    const state = battleOf(12,
        fighter(12, 0, "archer", 0, "a"),
        fighter(12, 1, "bloater", 4, "b", 3, { hp: 1 }),
        fighter(12, 2, "manAtArms", 4, "b", 4, { hp: 3 }),
        fighter(12, 3, "mage", 5, "a", 3, { hp: 3 }));
    const outcome = act(state, "a", shoot, fixedRolls([1]));

    it("scores the Archer's side for the enemy it burst, and nobody for the ally it burst", () => {
        expect(outcome.events.filter(event => event.kind === "downed")).toEqual([
            { kind: "downed", fighter: 1, by: 0 },
            { kind: "downed", fighter: 2, by: 0 },
            { kind: "downed", fighter: 3, by: 0 },
        ]);
        expect(scores(outcome.events)).toEqual([
            { kind: "scored", player: "a", points: knockoutPoints("bloater", state), reason: "knockout" },
            { kind: "scored", player: "a", points: knockoutPoints("manAtArms", state), reason: "knockout" },
        ]);
    });
});

describe("a Bloater downed by a Shove's collision (§39.3)", () => {
    it("bursts beside whoever it was pushed into", () => {
        const state = battleOf(12,
            fighter(12, 0, "knight", 2, "a"),
            fighter(12, 1, "bloater", 3, "b", 3, { hp: 3 }),
            fighter(12, 2, "manAtArms", 4, "b"));
        const outcome = act(state, "a", { kind: "shove", fighter: 0, target: 1 }, fixedRolls([1]));
        const [burst] = bursts(outcome.events);
        expect(burst).toMatchObject({ fighter: 1, downed: true, damage: BURST_DAMAGE });
        expect(burst.targets.sort()).toEqual([0, 2]);
        expect(get(outcome, 1).hp).toBe(0);
        expect(get(outcome, 0).hp).toBe(get(state, 0).hp - BURST_DAMAGE);
    });
});

describe("a Bloater downed by burning (§39.3)", () => {
    const burning = (rulesVersion: number) => battleOf(rulesVersion,
        fighter(rulesVersion, 0, "mage", 0, "a"),
        fighter(rulesVersion, 1, "bloater", 4, "b", 3, { hp: 1, effects: { burning: 2 }, burnedBy: 0 }),
        fighter(rulesVersion, 2, "knight", 5, "a"));

    it("bursts as its turn begins, and the fire's thrower scores the knock-out", () => {
        const outcome = startTurn(burning(12), "b");
        expect(outcome.events.map(event => event.kind).slice(0, 4)).toEqual(["burned", "downed", "scored", "burst"]);
        expect(outcome.events.find(event => event.kind === "scored")).toMatchObject({ player: "a" });
        expect(bursts(outcome.events)[0].targets).toEqual([2]);
    });

    it("bursts as its turn ends, for burning that ticks then", () => {
        const state = burning(12);
        get(state, 1).effects = { burning: 2 };
        expect(bursts(endTurn(state, "b", 1).events).length + bursts(startTurn(state, "b").events).length).toBe(1);
    });

    it("falls quietly at version 11", () => {
        const outcome = startTurn(burning(11), "b");
        expect(bursts(outcome.events)).toEqual([]);
        expect(get(outcome, 2).hp).toBe(get(burning(11), 2).hp);
    });
});

describe("a Bloater downed by a guard's strike mid-move (§39.3)", () => {
    const state = battleOf(12,
        fighter(12, 0, "knight", 3, "a", 3, { banked: 2, ap: 0 }),
        fighter(12, 1, "bloater", 6, "b", 3, { hp: 1 }),
        fighter(12, 2, "manAtArms", 4, "b", 4),
        fighter(12, 3, "archer", 5, "a", 2, { hp: 2 }),
        fighter(12, 4, "archer", 9, "a", 8));
    const move: Action = { kind: "move", fighter: 1, path: [point(6), point(5), point(4)] };
    const outcome = act(state, "b", move, fixedRolls([1]));

    it("bursts on whoever is beside it where it fell, and the walk stops there", () => {
        const [burst] = bursts(outcome.events);
        expect(burst.fighter).toBe(1);
        expect(burst.downed).toBe(true);
        // The Knight on guard, the Man-at-arms below and the Archer above it, all beside where it fell; not the far Archer.
        expect([...burst.targets].sort()).toEqual([0, 2, 3]);
        expect(burstArea(field, point(4))).toContain(point(3, 2));
        expect(get(outcome, 1).square).toBe(point(4));
        expect(outcome.events.map(event => event.kind)).toContain("struck");
        expect(get(outcome, 0).hp).toBe(get(state, 0).hp - (burst.targets.includes(0) ? BURST_DAMAGE : 0));
    });

    it("keeps the order: the strike, the fall, then the burst", () => {
        const kinds = outcome.events.map(event => event.kind);
        expect(kinds.indexOf("struck")).toBeLessThan(kinds.indexOf("downed"));
        expect(kinds.indexOf("downed")).toBeLessThan(kinds.indexOf("burst"));
    });
});

describe("a chain of Bloaters (§39.3)", () => {
    const chain = (rulesVersion: number) => battleOf(rulesVersion,
        fighter(rulesVersion, 0, "archer", 0, "a"),
        fighter(rulesVersion, 1, "bloater", 4, "b", 3, { hp: 1 }),
        fighter(rulesVersion, 2, "bloater", 5, "b", 3, { hp: 3 }),
        fighter(rulesVersion, 3, "bloater", 6, "b", 3, { hp: 3 }),
        fighter(rulesVersion, 4, "knight", 7, "a", 3, { hp: 12 }));

    it("bursts each once, in the order they fell, every knock-out scoring for the Archer", () => {
        const outcome = act(chain(12), "a", shoot, fixedRolls([1]));
        expect(bursts(outcome.events).map(event => event.fighter)).toEqual([1, 2, 3]);
        expect(outcome.events.filter(event => event.kind === "downed")).toEqual([1, 2, 3].map(fighter => ({ kind: "downed", fighter, by: 0 })));
        expect(scores(outcome.events)).toHaveLength(3);
        expect(scores(outcome.events).every(event => event.player === "a")).toBe(true);
        // The last one's burst reaches the Knight beside it.
        expect(get(outcome, 4).hp).toBe(12 - BURST_DAMAGE);
        expect(bursts(outcome.events).at(-1)!.targets).toEqual([4]);
    });

    it("falls quietly at version 11, the first one only", () => {
        const outcome = act(chain(11), "a", shoot, fixedRolls([1]));
        expect(bursts(outcome.events)).toEqual([]);
        expect(get(outcome, 2).hp).toBe(3);
    });
});

describe("a Bloater that has burst (§39.3)", () => {
    it("doesn't burst again as its own Burst downs it", () => {
        const state = battleOf(12, fighter(12, 0, "bloater", 3, "a"), fighter(12, 1, "manAtArms", 4, "b"));
        const outcome = act(state, "a", { kind: "burst", fighter: 0 }, fixedRolls([]));
        expect(bursts(outcome.events)).toEqual([{ kind: "burst", fighter: 0, targets: [1], damage: BURST_DAMAGE }]);
        expect(get(outcome, 0).hp).toBe(0);
        expect(get(outcome, 1).hp).toBe(get(state, 1).hp - BURST_DAMAGE);
    });

    it("doesn't burst at all if it already did, however it is downed", () => {
        const state = battleOf(12,
            fighter(12, 0, "archer", 0, "a"),
            fighter(12, 1, "bloater", 4, "b", 3, { hp: 1, spent: ["burst"] }),
            fighter(12, 2, "knight", 5, "a"));
        expect(bursts(act(state, "a", shoot, fixedRolls([1])).events)).toEqual([]);
    });
});

describe("a replay of a version-12 Hold Out against the Swarm (§39.3)", () => {
    it("lands on exactly the live state without rolling anything again (a replay runs the same `act`, so a burst replays as the shot test above does)", async () => {
        const game = await playScriptedBattle({ rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" } });
        const history = game.gameState.commandHistory;
        expect(history.length).toBeGreaterThan(0);
        const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
        try {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", history.at(-1)?.id ?? null, true));
        } finally {
            random.mockRestore();
        }
    }, 60_000);
});
