import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, distance, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import type { CharacterId } from "./characters";
import { nextAction } from "./ai";
import { gameStateToModel } from "./RealmArenaModels";
import { ACTION_POINTS, act, check, isStanding, newFighter, viewOf, type Action, type BattleState, type Fighter, type FogGhost } from "./rules";
import { swarmAction, swarmMemo } from "./swarm";
import { coopBattle, recordedWarbandActions } from "./testFixtures";

// docs/games/realm-arena-hold-out.md §4.5: the Brood's minions take a swarm
// step instead of the planner's search. Each puzzle is a small battle at rules
// version 13 with the warband "ai:0" to move; "a" and "b" are the team.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

const AI = "ai:0";
const SIDES = { a: "team", b: "team", [AI]: "enemy" };
const CONTEXT = { rulesVersion: 13 };

function piece(id: number, owner: string, character: CharacterId, square: Square, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square, null, undefined, undefined, false, CONTEXT), ap: ACTION_POINTS, ...extra };
}

type Area = { col: number; row: number; width: number; height: number };

const fieldOf = (width: number, centre?: Area, deployments: Area[] = []): Battlefield =>
    buildBattlefield({ name: "Swarm", rows: Array(9).fill(".".repeat(width)), deployments, objectives: centre ? { centre } : {} });

const battle = (field: Battlefield, fighters: Fighter[], fog = false): BattleState => ({ field, fighters, sides: SIDES, rulesVersion: 13, ...(fog ? { fog: true } : {}) });

/** The whole swarm step the warband takes in `state`: every action, each one checked and played out, with the battle it leaves. */
function swarmStep(state: BattleState, hunt?: readonly FogGhost[]): { actions: Action[]; after: BattleState } {
    const memo = swarmMemo();
    const actions: Action[] = [];
    for (let guard = 0; guard < 100; guard++) {
        const action = swarmAction(viewOf(state, AI), AI, hunt, memo);
        if (!action) break;
        expect(check(state, AI, action)).not.toHaveProperty("refused");
        actions.push(action);
        state = { ...state, fighters: act(state, AI, action, () => 1).fighters };
    }
    return { actions, after: state };
}

const byId = (state: BattleState, id: number) => state.fighters.find(fighter => fighter.id === id)!;
const endOf = (action: Action | undefined): Square => (action as { path: Square[] }).path.at(-1)!;

describe("the swarm step (§4.5)", () => {
    it("strikes the most hurt team character it reaches, moving to where it can", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 8, 4)),
            piece(1, "a", "knight", at(field, 6, 4)),
            piece(2, "b", "archer", at(field, 10, 4), { hp: 2 }),
        ]);
        const { actions, after } = swarmStep(state);
        const strike = actions.find(action => action.kind === "attack");
        expect(strike).toMatchObject({ fighter: 0, target: 2 });
        expect(actions[0].kind).toBe("move");
        expect(byId(after, 2).hp).toBeLessThan(2);
        expect(byId(after, 1).hp).toBe(byId(state, 1).hp);
    });

    it("steps toward the nearest team character it sees when nothing is in reach", () => {
        const field = fieldOf(30);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 29, 4), { ap: 1 }),
            piece(1, "a", "knight", at(field, 0, 4)),
            piece(2, "b", "archer", at(field, 20, 1)),
        ]);
        const { actions } = swarmStep(state);
        expect(actions.map(action => action.kind)).toEqual(["move"]);
        // Eight a turn, toward the archer, the nearer of the two.
        expect(distance(field, endOf(actions[0]), at(field, 20, 1))).toBeLessThan(distance(field, at(field, 29, 4), at(field, 20, 1)) - 4);
    });

    it("heads for where it last saw the team, and else for the team's zone", () => {
        const field = fieldOf(40, { col: 30, row: 4, width: 1, height: 1 }, [{ col: 0, row: 0, width: 2, height: 9 }, { col: 0, row: 0, width: 2, height: 9 }]);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 30, 4), { ap: 1 }),
            piece(1, "a", "knight", at(field, 0, 4)),
        ], true);
        expect(viewOf(state, AI).fighters.some(fighter => fighter.id === 1)).toBe(false);
        const start = at(field, 30, 4);
        const ghost = { id: 1, owner: "a", character: "knight", square: at(field, 37, 4) } satisfies FogGhost;
        const toGhost = swarmStep(state, [ghost]).actions;
        expect(distance(field, endOf(toGhost[0]), ghost.square)).toBeLessThan(distance(field, start, ghost.square));
        const toZone = swarmStep(state, []).actions;
        expect(endOf(toZone[0])).toBeLessThan(start);
        expect(distance(field, endOf(toZone[0]), at(field, 0, 4))).toBeLessThan(distance(field, start, at(field, 0, 4)));
    });

    it("has a Spitter shoot the nearest team character it sees, not the most hurt", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodSpitter", at(field, 8, 4)),
            piece(1, "a", "knight", at(field, 2, 4), { hp: 1 }),
            piece(2, "b", "archer", at(field, 13, 4)),
        ]);
        const { actions } = swarmStep(state);
        expect(actions).toEqual([{ kind: "attack", fighter: 0, target: 2 }]);
    });

    it("walks a Bloater to put the most of the team in its burst, and bursts", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodBloater", at(field, 4, 4)),
            piece(1, "a", "knight", at(field, 9, 3)),
            piece(2, "b", "archer", at(field, 9, 5)),
        ]);
        const { actions, after } = swarmStep(state);
        expect(actions.map(action => action.kind)).toEqual(["move", "burst"]);
        expect(endOf(actions[0])).toBe(at(field, 9, 4));
        expect(isStanding(byId(after, 0))).toBe(false);
        expect(byId(after, 1).hp).toBeLessThan(byId(state, 1).hp);
        expect(byId(after, 2).hp).toBeLessThan(byId(state, 2).hp);
    });

    it("keeps a Bloater from bursting where it would catch more of its own side", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodBloater", at(field, 8, 4)),
            piece(3, AI, "broodSkitterling", at(field, 9, 3), { ap: 0 }),
            piece(4, AI, "broodSkitterling", at(field, 9, 5), { ap: 0 }),
            piece(1, "a", "knight", at(field, 9, 4)),
        ]);
        const { actions } = swarmStep(state);
        expect(actions.some(action => action.kind === "burst")).toBe(false);
        expect(actions.some(action => action.kind === "attack" && action.fighter === 0)).toBe(true);
    });

    it("plays every minion's move before any minion's strike", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 2, 2)),
            piece(1, AI, "broodSkitterling", at(field, 2, 6)),
            piece(2, AI, "broodSpitter", at(field, 3, 4)),
            piece(3, "a", "knight", at(field, 9, 4)),
            piece(4, "b", "archer", at(field, 12, 3)),
        ]);
        const { actions } = swarmStep(state);
        const kinds = actions.map(action => action.kind);
        expect(kinds).toContain("attack");
        expect(kinds.lastIndexOf("move")).toBeLessThan(kinds.indexOf("attack"));
        // In id order within each phase.
        const strikers = actions.filter(action => action.kind === "attack").map(action => action.fighter);
        expect(strikers).toEqual([...strikers].sort((a, b) => a - b));
    });

    it("is deterministic: the same view, the same actions", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 2, 2)),
            piece(1, AI, "broodBloater", at(field, 2, 6)),
            piece(2, AI, "broodSpitter", at(field, 3, 4)),
            piece(3, "a", "knight", at(field, 9, 4)),
            piece(4, "b", "archer", at(field, 12, 3)),
        ]);
        expect(swarmStep(state).actions).toEqual(swarmStep(state).actions);
    });

    it("does nothing for a warband with no minion, or no team in sight", () => {
        const field = fieldOf(16);
        expect(swarmStep(battle(field, [piece(0, AI, "broodRavager", at(field, 2, 2)), piece(1, "a", "knight", at(field, 9, 4))])).actions).toEqual([]);
        expect(swarmStep(battle(field, [piece(0, AI, "broodSkitterling", at(field, 2, 2))])).actions).toEqual([]);
    });
});

describe("the planner leaves minions to the swarm step", () => {
    it("never returns an action for a minion, though it plans around them", () => {
        const field = fieldOf(16);
        const state = battle(field, [
            piece(0, AI, "broodSkitterling", at(field, 8, 4)),
            piece(1, AI, "broodSpitter", at(field, 9, 4)),
            piece(2, AI, "broodRavager", at(field, 7, 3)),
            piece(3, "a", "knight", at(field, 6, 4)),
            piece(4, "b", "archer", at(field, 10, 5)),
        ]);
        const action = nextAction(viewOf(state, AI), AI, 1);
        expect(action).toBeDefined();
        expect(action!.fighter).toBe(2);
        const alone = battle(field, [piece(0, AI, "broodSkitterling", at(field, 8, 4)), piece(3, "a", "knight", at(field, 9, 4))]);
        expect(nextAction(viewOf(alone, AI), AI, 1)).toBeUndefined();
    });
});

describe("a Brood battle (§4)", () => {
    it("plays to its end through the turn loop, and replays to the same board", async () => {
        const { game, times } = await coopBattle(["a", "b", "c"], { rulesVersion: 13, coop: { mission: "holdOut", enemy: "brood" } });
        expect(game.complete).toBe(true);
        const names = { a: "Alice", b: "Bob", c: "Cat" };
        const brood = (id: number) => game.specificGameState.fighters.find(fighter => fighter.id === id)?.character.startsWith("brood");
        expect(recordedWarbandActions(game).some(action => brood(action.fighter))).toBe(true);
        const consumed = () => { throw new Error("replay consumed randomness"); };
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
        const random = vi.spyOn(Math, "random").mockImplementation(consumed);
        try {
            const timeline = await buildTimeline(game, names, [], undefined, null);
            const last = timeline.snapshots[timeline.currentIndex];
            // (The finished battle's own response still names the next wave, which a replay's last snapshot doesn't: not the swarm step's to settle.)
            const { nextWave: _wave, ...live } = gameStateToModel(game.specificGameState, null, game.gameState.commandHistory.at(-1)?.id ?? null);
            expect(last.specificGameState).toEqual(live);
        } finally {
            entropy.mockRestore();
            random.mockRestore();
        }
        console.info(`Brood battle: ${times.length} turns, slowest ${Math.max(...times).toFixed(0)} ms, total ${times.reduce((a, b) => a + b, 0).toFixed(0)} ms`);
    }, 120_000);
});
