import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { buildBattlefield, type Battlefield } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, ITEMS } from "./characters";
import { RealmArenaGameDataModel, stepOutcomeToModel } from "./RealmArenaModels";
import { RealmArenaUndo } from "./RealmArenaLogic";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { battleCues, eventLines, unseenSquares } from "./ui";
import {
    ACTION_POINTS, act, check, fixedRolls, moveAp, newFighter, reachOf, SIGHT_RANGE, smokeSquares, squadSight, viewOf,
    type BattleEvent, type BattleState, type Fighter,
} from "./rules";
import { actBy, battleOf, cmd, makeGame, musterAll, play, type RealmArenaTestGame, responseFor } from "./testFixtures";

// docs/games/realm-arena.md §27: fog of war. A player sees what their squad
// sees — SIGHT_RANGE squares, wherever its line of sight is clear — and the
// server sends them nothing else of anyone else's, live or in a review, until
// the battle is over. It changes what's known, never what can be done, except
// that an enemy out of sight in a path stops the mover short of it.

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

/** A long open strip with a wall across it at column 10, rows 0–3; row 4 is open all the way. */
const FIELD: Battlefield = buildBattlefield({
    name: "Fog field",
    rows: [
        "..........#..............",
        "..........#..............",
        "..........#..............",
        "..........#..............",
        ".........................",
    ],
    deployments: [],
    objectives: {},
});

function fighter(id: number, owner: string, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, "archer", square), ap: ACTION_POINTS, ...extra };
}

const fogged = (fighters: Fighter[], field = FIELD): BattleState => ({ field, fighters, fog: true });
const ids = (state: BattleState) => state.fighters.map(one => one.id);

describe("what a squad sees (§27)", () => {
    it("sees as far as anything reaches, so fog never takes away a shot, an aim or a throw", () => {
        const ranges = [
            ...Object.values(CHARACTERS).map(character => character.weapon.kind === "ranged" ? character.weapon.range : 1),
            ...Object.values(ABILITIES).map(ability => ("range" in ability ? ability.range : undefined) ?? 0),
            ...Object.values(ITEMS).map(item => ("range" in item ? item.range : undefined) ?? 0),
        ];
        expect(Math.max(...ranges)).toBeLessThanOrEqual(SIGHT_RANGE);
    });

    it("is the whole battle without fog", () => {
        const state: BattleState = { field: FIELD, fighters: [fighter(0, "a", at(FIELD, 0, 0)), fighter(1, "b", at(FIELD, 20, 0))] };
        expect(viewOf(state, "a")).toBe(state);
    });

    it("keeps the player's own squad and every other character it sees, standing or fallen", () => {
        const state = fogged([
            fighter(0, "a", at(FIELD, 0, 0)),
            fighter(1, "a", at(FIELD, 24, 4), { hp: 0 }),
            fighter(2, "b", at(FIELD, 5, 0)),
            fighter(3, "b", at(FIELD, 6, 1), { hp: 0 }),
            // Behind the wall.
            fighter(4, "b", at(FIELD, 12, 0)),
            // Open ground, but past SIGHT_RANGE.
            fighter(5, "b", at(FIELD, 24, 3)),
        ]);
        expect(ids(viewOf(state, "a"))).toEqual([0, 1, 2, 3]);
        // A fallen character sees nothing: b's fighter 5 stands right by a's fallen one.
        expect(squadSight(state, "a")(at(FIELD, 24, 3))).toBe(false);
    });

    it("sees nobody else for a player with nobody standing, or for no player at all", () => {
        const state = fogged([fighter(0, "a", at(FIELD, 0, 0), { hp: 0 }), fighter(1, "b", at(FIELD, 1, 0))]);
        expect(ids(viewOf(state, "a"))).toEqual([0]);
        expect(ids(viewOf(state, null))).toEqual([]);
    });

    it("changes nothing read again, so the board's view of its view is the server's", () => {
        const state = fogged([fighter(0, "a", at(FIELD, 0, 0)), fighter(1, "b", at(FIELD, 5, 0)), fighter(2, "b", at(FIELD, 12, 0))]);
        const view = viewOf(state, "a");
        expect(viewOf(view, "a")).toEqual(view);
    });

    it("keeps a cloud it can see whose thrower it can't, and no other", () => {
        const state = fogged([
            fighter(0, "a", at(FIELD, 0, 0)),
            // Behind the wall, its cloud thrown back over it onto open ground a sees.
            fighter(1, "b", at(FIELD, 12, 0), { smoke: at(FIELD, 8, 2) }),
            // Behind the wall, its cloud behind the wall too.
            fighter(2, "b", at(FIELD, 13, 1), { smoke: at(FIELD, 14, 1) }),
        ]);
        const view = viewOf(state, "a");
        expect(ids(view)).toEqual([0]);
        expect(view.clouds).toEqual([at(FIELD, 8, 2)]);
        expect(smokeSquares(view).has(at(FIELD, 8, 2))).toBe(true);
    });

    it("dims every square the squad can't see, and none without fog", () => {
        const state = fogged([fighter(0, "a", at(FIELD, 0, 0))]);
        const unseen = unseenSquares(state, "a")!;
        expect(unseen.has(at(FIELD, 5, 3))).toBe(false);
        expect(unseen.has(at(FIELD, 12, 0))).toBe(true);
        expect(unseen.has(at(FIELD, 24, 4))).toBe(true);
        expect(unseenSquares({ field: FIELD, fighters: state.fighters }, "a")).toBeNull();
    });
});

describe("moving into the fog (§27)", () => {
    /** Along the open row from its first square, `length` squares long. */
    const run = (length: number) => Array.from({ length }, (_, col) => at(FIELD, col, 4));
    const mover = fighter(0, "a", at(FIELD, 0, 4));
    const eye = fighter(9, "a", at(FIELD, 0, 0));
    // b stands 21 squares off down the open row: out of sight from where a starts.
    const hidden = fighter(1, "b", at(FIELD, 21, 4));
    const long = { kind: "move" as const, fighter: 0, path: run(23) };

    it("lets a path run through an enemy out of sight, and stops the mover short of it", () => {
        const state = fogged([mover, eye, hidden]);
        expect(check(state, "a", long)).not.toHaveProperty("refused");
        const { fighters, events } = act(state, "a", long, fixedRolls([]));
        expect(fighters.find(one => one.id === 0)!.square).toBe(at(FIELD, 20, 4));
        expect(events.at(-1)).toEqual({ kind: "blocked", fighter: 0, by: 1 });
    });

    it("stops on the last square it could stop on, never on low cover", () => {
        const rubble = buildBattlefield({ name: "Rubble", rows: [".".repeat(25), "......................,.."], deployments: [], objectives: {} });
        // A Scout, to get that far in a turn.
        const scout = { ...newFighter(0, "a", "scout", at(rubble, 0, 1)), ap: ACTION_POINTS };
        const state = fogged([scout, fighter(1, "b", at(rubble, 23, 1))], rubble);
        const walk = Array.from({ length: 24 }, (_, col) => at(rubble, col, 1));
        const { fighters, events } = act(state, "a", { kind: "move", fighter: 0, path: walk }, fixedRolls([]));
        expect(fighters.find(one => one.id === 0)!.square).toBe(at(rubble, 21, 1));
        expect(events.map(event => event.kind)).toEqual(["moved", "blocked"]);
    });

    it("refuses the same path through an enemy it can see, and through anyone without fog", () => {
        const seen = fighter(1, "b", at(FIELD, 3, 4));
        expect(check(fogged([mover, seen]), "a", { kind: "move", fighter: 0, path: run(5) })).toEqual({ refused: "An enemy is in the way" });
        expect(check({ field: FIELD, fighters: [mover, hidden] }, "a", long)).toEqual({ refused: "An enemy is in the way" });
    });
});

describe("the wire in fog of war (§27)", () => {
    it("sends each player their own squad and nobody they can't see, and everyone once the battle is over", async () => {
        const game = makeGame(undefined, undefined, true);
        await musterAll(game);
        const everyone = game.specificGameState.fighters.length;
        for (const viewer of ["a", "b"]) {
            const { specificGameState } = await responseFor(game, viewer);
            expect(specificGameState.fog).toBe(true);
            expect(specificGameState.fighters.length).toBeGreaterThan(0);
            expect(specificGameState.fighters.every(fighter => fighter.owner === viewer)).toBe(true);
        }
        expect((await responseFor(game, null)).specificGameState.fighters).toEqual([]);

        game.complete = true;
        expect((await responseFor(game, "a")).specificGameState.fighters).toHaveLength(everyone);
    });

    it("sends everyone everything in a battle without it", async () => {
        const game = makeGame();
        await musterAll(game);
        const { specificGameState } = await responseFor(game, "a");
        expect(specificGameState.fog).toBe(false);
        expect(specificGameState.fighters).toHaveLength(game.specificGameState.fighters.length);
    });
});

describe("undo in fog of war (§27)", () => {
    /**
     * a's first turn in a fogged battle with one of b's characters stood where
     * a single move by a's first character would see it, and nobody of a's
     * sees it yet. Returns that move.
     */
    async function lookout() {
        const game = makeGame(undefined, undefined, true);
        await musterAll(game);
        const battle = battleOf(game);
        const scout = battle.fighters.find(one => one.owner === "a")!;
        const seen = squadSight(battle, "a");
        const reach = reachOf(battle, scout);
        const taken = new Set(battle.fighters.map(one => one.square));
        for (let step = 0; step < reach.costs.length; step++) {
            const cost = reach.costs[step];
            if (cost === 0 || cost === Infinity || moveAp(scout, cost) > 1) continue;
            const from = squadSight({ ...battle, fighters: [{ ...scout, square: step }] }, "a");
            const spot = battle.field.tiles.findIndex((tile, square) => tile.terrain.standable && !taken.has(square) && !seen(square) && from(square));
            if (spot < 0) continue;
            game.specificGameState.fighters.find(one => one.owner === "b")!.square = spot;
            return { game, move: { kind: "move" as const, fighter: scout.id, path: pathTo(reach, step)!.squares } };
        }
        throw new Error("nowhere to look out from");
    }

    it("won't take back a move that showed the player an enemy", async () => {
        const { game, move } = await lookout();
        expect((await play(game, actBy("a", move))).outcome.validMove).toBe(true);
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
    });

    it("still takes back one that showed nobody new", async () => {
        const game = makeGame(undefined, undefined, true);
        await musterAll(game);
        const battle = battleOf(game);
        const scout = battle.fighters.find(one => one.owner === "a")!;
        const reach = reachOf(battle, scout);
        const step = reach.costs.findIndex(cost => cost > 0 && cost !== Infinity);
        const { outcome } = await play(game, actBy("a", { kind: "move", fighter: scout.id, path: pathTo(reach, step)!.squares }));
        expect(outcome.validMove).toBe(true);
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(true);
    });
});

describe("a review in fog of war (§27)", () => {
    /** A fogged battle under way, b's eye at (0, 4) of the Ruined Fort's columns and a's mover somewhere past it. */
    function reviewState() {
        const game = makeGame(undefined, undefined, true);
        const gs = game.specificGameState;
        gs.phase = "battle";
        const field = battleOf(game).field;
        const free = field.tiles.flatMap((tile, square) => tile.terrain.standable ? [square] : []);
        gs.fighters = [newFighter(0, "b", "archer", free[0]), newFighter(1, "a", "scout", free[free.length - 1])];
        const seen = squadSight(battleOf(game), "b");
        return { gs, field, seen, inSight: free.filter(seen), outOfSight: free.filter(square => !seen(square)) };
    }
    const told = (events: BattleEvent[], gs: ReturnType<typeof reviewState>["gs"], viewer: string | null, complete = false) =>
        stepOutcomeToModel({ events }, viewer, gs, complete)?.events ?? [];

    it("keeps only the squares of someone else's move the viewer saw, and loses a mover that ends out of sight", () => {
        const { gs, inSight, outOfSight } = reviewState();
        const into = [...outOfSight.slice(0, 2), ...inSight.slice(1, 3)];
        const away = [...inSight.slice(1, 3), ...outOfSight.slice(0, 2)];
        expect(told([{ kind: "moved", fighter: 1, path: into, sneaking: false }], gs, "b")).toEqual([{ kind: "moved", fighter: 1, path: inSight.slice(1, 3), sneaking: false }]);
        expect(told([{ kind: "moved", fighter: 1, path: away, sneaking: false }], gs, "b")).toEqual([{ kind: "moved", fighter: 1, path: [], sneaking: false }]);
        // The mover's own player sees all of it; and once the battle is over, so does everyone.
        expect(told([{ kind: "moved", fighter: 1, path: away, sneaking: false }], gs, "a")[0]).toMatchObject({ path: away });
        expect(told([{ kind: "moved", fighter: 1, path: away, sneaking: false }], gs, "b", true)[0]).toMatchObject({ path: away });
    });

    it("tells a fireball only where the viewer sees some of it, or it hit one of theirs", () => {
        const { gs, inSight, outOfSight } = reviewState();
        const far = outOfSight.at(-1)!;
        const fireball = (at: number, targets: number[]): BattleEvent => ({ kind: "fireball", fighter: 1, at, targets, damage: 3 });
        expect(told([fireball(far, [])], gs, "b")).toEqual([]);
        expect(told([fireball(far, [0])], gs, "b")).toHaveLength(1);
        expect(told([fireball(inSight[3], [])], gs, "b")).toHaveLength(1);
        expect(told([fireball(far, [])], gs, "a")).toHaveLength(1);
    });

    it("tells a viewer with no squad nothing of where anything moved", () => {
        const { gs, inSight } = reviewState();
        expect(told([{ kind: "moved", fighter: 1, path: inSight.slice(0, 3), sneaking: false }], gs, null)).toEqual([{ kind: "moved", fighter: 1, path: [], sneaking: false }]);
    });
});

describe("the board playing what it was told (§27)", () => {
    const before = [fighter(0, "a", at(FIELD, 0, 0)), fighter(1, "b", at(FIELD, 5, 0))];

    it("loses a mover told with no path, rather than playing on where it was last seen", () => {
        const events: BattleEvent[] = [
            { kind: "moved", fighter: 1, path: [], sneaking: false },
            { kind: "burned", fighter: 1, damage: 1 },
        ];
        expect(battleCues(events, before)).toEqual([]);
    });

    it("says who a move ran into, and marks the mover", () => {
        const blocked = { kind: "blocked", fighter: 0, by: 1 } as const;
        expect(battleCues([blocked], before)).toMatchObject([{ kind: "text", fighter: 0, value: "Blocked" }]);
        expect(eventLines([blocked], before, "a", userId => userId === "b" ? "Bob" : userId)[0].title).toBe("Your Archer ran into Bob's Archer");
        expect(eventLines([blocked], before.slice(0, 1), "a", () => "Bob")[0].title).toBe("Your Archer ran into a character out of sight");
    });
});
