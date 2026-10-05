import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import { findPath, pathCost, pathTo } from "@/utils/games/battlefield/pathfinding";
import { buildBattlefield, distance, type Battlefield } from "@/utils/games/battlefield/terrain";
import { ABILITIES, CHARACTERS, ITEMS, kitOf, OPTIONS, type Ability, type CharacterId, type Kit, type OptionId } from "./characters";
import { CHARACTER_IDS } from "./roster";
import { RealmArenaGameDataModel, stepOutcomeToModel, stepSummary } from "./RealmArenaModels";
import { RealmArenaAct, RealmArenaUndo } from "./RealmArenaLogic";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { battleCues, eventLines, unseenSquares } from "./ui";
import {
    ACTION_POINTS, act, check, fixedRolls, moveAp, newFighter, reachOf, SIGHT_RANGE, sightOf, smokeSquares, squadSight, viewOf,
    type BattleEvent, type BattleState, type Fighter,
} from "./rules";
import { actBy, battleOf, cmd, endTurnBy, makeGame, musterAll, play, type RealmArenaTestGame, responseFor } from "./testFixtures";

// docs/games/realm-arena.md §27: fog of war. A player sees what their squad
// sees — each character as far as its `sightOf`, wherever its line of sight
// is clear — and the server sends them nothing else of anyone else's, live or
// in a review, until the battle is over. It changes what's known, never what can be done, except
// that an enemy out of sight in a path is found, and the mover goes round it.

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

/** A Man-at-arms, who sees as far as most (`SIGHT_RANGE`), ready to act. */
function fighter(id: number, owner: string, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, "manAtArms", square), ap: ACTION_POINTS, ...extra };
}

const fogged = (fighters: Fighter[], field = FIELD): BattleState => ({ field, fighters, fog: true });
const ids = (state: BattleState) => state.fighters.map(one => one.id);

describe("what a squad sees (§27)", () => {
    it("lets each character see as far as anything it can use reaches, so fog never takes away a shot, an aim or a throw", () => {
        const reaches = (kit: Kit) => [
            kit.weapon.kind === "ranged" ? kit.weapon.range : 1,
            ...kit.abilities.map(id => { const ability: Ability = ABILITIES[id]; return ability.range ?? 0; }),
            ...Object.values(ITEMS).map(item => ("range" in item ? item.range : undefined) ?? 0),
        ];
        for (const character of CHARACTER_IDS) {
            const kits = [kitOf(character), ...(Object.keys(OPTIONS) as OptionId[]).filter(id => OPTIONS[id].character === character).map(id => kitOf(character, id))];
            expect(Math.max(...kits.flatMap(reaches)), character).toBeLessThanOrEqual(sightOf({ character }));
        }
    });

    it("sees further from an Archer or a Scout, and less far from a Knight", () => {
        const from = (character: CharacterId, col: number) => squadSight(fogged([{ ...newFighter(0, "a", character, at(FIELD, 0, 4)) }]), "a")(at(FIELD, col, 4));
        expect([from("manAtArms", SIGHT_RANGE), from("manAtArms", SIGHT_RANGE + 1)]).toEqual([true, false]);
        expect([from("archer", 24), from("scout", 24), from("knight", 15), from("knight", 16)]).toEqual([true, true, true, false]);
        expect([sightOf({ character: "archer" }), sightOf({ character: "scout" }), sightOf({ character: "knight" })]).toEqual([25, 25, 15]);
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

    it("keeps a cloud it can't see from a thrower it can", () => {
        const state = fogged([fighter(0, "a", at(FIELD, 0, 0)), fighter(1, "b", at(FIELD, 8, 4), { smoke: at(FIELD, 14, 1) })]);
        const [, thrower] = viewOf(state, "a").fighters;
        expect(thrower.id).toBe(1);
        expect(thrower).not.toHaveProperty("smoke");
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

    const square = (outcome: { fighters: Fighter[] }) => outcome.fighters.find(one => one.id === 0)!.square;

    it("lets a path run through an enemy out of sight, and goes round it to the square it was sent to", () => {
        const state = fogged([mover, eye, hidden]);
        expect(check(state, "a", long)).not.toHaveProperty("refused");
        const outcome = act(state, "a", long, fixedRolls([]));
        expect(square(outcome)).toBe(at(FIELD, 22, 4));
        expect(outcome.events[0]).toEqual({ kind: "spotted", fighter: 0, by: 1 });
        const moved = outcome.events.flatMap(event => event.kind === "moved" ? event.path : []);
        expect(moved).not.toContain(hidden.square);
    });

    it("goes as near as it can when the square it was sent to is the enemy's, and pays for the way it went", () => {
        const onGoal = fighter(1, "b", at(FIELD, 22, 4));
        const outcome = act(fogged([mover, eye, onGoal]), "a", long, fixedRolls([]));
        expect(square(outcome)).toBe(at(FIELD, 21, 4));
        expect(outcome.fighters.find(one => one.id === 0)!.ap).toBe(ACTION_POINTS - moveAp(mover, 21));
    });

    it("goes round another it finds going round the first, and never into one", () => {
        const wall = [hidden, fighter(2, "b", at(FIELD, 21, 3))];
        const outcome = act(fogged([mover, eye, ...wall]), "a", long, fixedRolls([]));
        expect(outcome.events.flatMap(event => event.kind === "spotted" ? [event.by] : [])).toEqual([1, 2]);
        const moved = outcome.events.flatMap(event => event.kind === "moved" ? event.path : []);
        expect(moved.some(at => wall.some(enemy => enemy.square === at))).toBe(false);
        expect(outcome.fighters.find(one => one.id === 0)!.ap).toBeGreaterThanOrEqual(0);
    });

    it("sends a sneak round too, at a sneak's price for the way it went", () => {
        const pocket = buildBattlefield({ name: "Pocket", rows: ["......#..", "......#..", "........."], deployments: [], objectives: {} });
        const scout = { ...newFighter(0, "a", "scout", at(pocket, 0, 0)), ap: ACTION_POINTS };
        // Behind the wall's end, where the Scout can't see.
        const enemy = fighter(1, "b", at(pocket, 7, 0));
        const state = fogged([scout, enemy], pocket);
        expect(squadSight(state, "a")(enemy.square)).toBe(false);
        const sent = findPath(pocket, scout.square, enemy.square)!.squares;
        const outcome = act(state, "a", { kind: "sneak", fighter: 0, path: sent }, fixedRolls([]));
        const walked = outcome.events.flatMap(event => event.kind === "moved" ? event.path : []);
        expect(outcome.events[0]).toEqual({ kind: "spotted", fighter: 0, by: 1 });
        expect(walked).not.toContain(enemy.square);
        expect(walked.at(-1)).toBe(square(outcome));
        expect(outcome.fighters.find(one => one.id === 0)!.ap).toBe(ACTION_POINTS - moveAp(scout, pathCost(pocket, walked, CHARACTERS.scout.climb)!, true));
    });

    it("always sees an enemy on its first step, so a path into one is refused rather than gone round", () => {
        // The mover is a's only standing character: whatever is beside it, it sees.
        const state = fogged([mover, fighter(9, "a", at(FIELD, 0, 0), { hp: 0 }), fighter(1, "b", at(FIELD, 1, 4))]);
        expect(check(state, "a", { kind: "move", fighter: 0, path: run(3) })).toEqual({ refused: "An enemy is in the way" });
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

    it("puts nothing of a squad out of sight anywhere in a player's response or review", async () => {
        const game = makeGame(undefined, undefined, true);
        await musterAll(game);
        for (const [viewer, other] of [["a", "b"], ["b", "a"], [null, "a"], [null, "b"]] as const) {
            const wire = JSON.stringify([await responseFor(game, viewer), await buildTimeline(game, { a: "a", b: "b" }, [], undefined, viewer)]);
            expect(wire, `${viewer} sees ${other}'s squad`).not.toContain(`"owner":"${other}"`);
            if (viewer) expect(wire).toContain(`"owner":"${viewer}"`);
        }
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

    it("tells a viewer with no squad nothing at all", () => {
        const { gs, inSight } = reviewState();
        expect(told([{ kind: "moved", fighter: 1, path: inSight.slice(0, 3), sneaking: false }], gs, null)).toEqual([]);
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

    it("says who a move found in its way, and marks the mover", () => {
        const spotted = { kind: "spotted", fighter: 0, by: 1 } as const;
        expect(battleCues([spotted], before)).toMatchObject([{ kind: "text", fighter: 0, value: "Spotted" }]);
        expect(eventLines([spotted], before, "a", userId => userId === "b" ? "Bob" : userId)[0].title).toBe("Your Man-at-arms found Bob's Man-at-arms in its way");
        expect(eventLines([spotted], before.slice(0, 1), "a", () => "Bob")[0].title).toBe("Your Man-at-arms found a character out of sight in its way");
    });
});

describe("the log, the recap and the review in fog of war (§27.2)", () => {
    const NAMES = { a: "a", b: "b" };
    const texts = async (game: RealmArenaTestGame, viewer: string) => (await responseFor(game, viewer)).gameState.history.map(line => line.text);

    /**
     * A fogged battle on a's turn: a's Archer sees b's Knight, and the Knight,
     * which sees less far, doesn't see the Archer. b's Man-at-arms stands
     * where neither side sees the other, unless `alone` leaves the Knight b's
     * only character — at 1 HP, so a's next hit ends the battle.
     */
    function ambush(alone = false) {
        const game = makeGame(undefined, undefined, true);
        const gs = game.specificGameState;
        gs.phase = "battle";
        const { field } = battleOf(game);
        const free = field.tiles.flatMap((tile, square) => tile.terrain.standable ? [square] : []);
        const ready = (fighter: Fighter): Fighter => ({ ...fighter, ap: ACTION_POINTS });
        for (const knightAt of free.slice(Math.floor(free.length / 3))) {
            for (const archerAt of free.filter(square => { const gap = distance(field, square, knightAt); return gap > 16 && gap <= 22; })) {
                const archer = ready(newFighter(0, "a", "archer", archerAt));
                const knight = ready({ ...newFighter(1, "b", "knight", knightAt), ...alone ? { hp: 1 } : {} });
                const pair = { field, fighters: [archer, knight], fog: true };
                if (squadSight(pair, "b")(archerAt) || "refused" in check(pair, "a", { kind: "attack", fighter: 0, target: 1 })) continue;
                const far = free.find(square => !squadSight(pair, "a")(square) && distance(field, square, archerAt) > 30 && distance(field, square, knightAt) > 30);
                if (far === undefined) continue;
                gs.fighters = alone ? [archer, knight] : [archer, knight, ready(newFighter(2, "b", "manAtArms", far))];
                return game;
            }
        }
        throw new Error("nowhere to lay an ambush");
    }
    const shoot = (game: RealmArenaTestGame) => play(game, cmd(RealmArenaAct, "a", { action: { kind: "attack", fighter: 0, target: 1 }, recordedRolls: [1] }));

    it("keeps an action a player's side saw none of out of their log, their review and their recap", async () => {
        // As the squads take the field, nobody sees anybody.
        const game = makeGame(undefined, undefined, true);
        await musterAll(game);
        const archer = battleOf(game).fighters.find(fighter => fighter.owner === "a")!;
        const hunker = actBy("a", { kind: "hunker", fighter: archer.id });
        expect((await play(game, hunker)).outcome.validMove).toBe(true);
        const [line] = await texts(game, "a");
        expect(line).toMatch(/^a hunkered their \S+ down$/);
        expect(await texts(game, "b")).not.toContain(line);
        expect((await texts(game, "b")).join("\n")).not.toMatch(/hunker/);

        // Nor is there a step for it in b's review, where it would say that a did something, and what.
        const summaries = async (viewer: string) => (await buildTimeline(game, NAMES, [], undefined, viewer)).snapshots.map(step => step.command?.summary ?? null);
        expect(await summaries("a")).toEqual([null, "mustered their squad", "mustered their squad", "hunkered down"]);
        expect(await summaries("b")).toEqual([null, "mustered their squad", "mustered their squad"]);

        // Nor a row in their recap, nor one a reaction could find.
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(JSON.stringify(await buildEventFeed(game, NAMES, "b"))).not.toMatch(/hunker/);
        expect((await buildAllEvents(game, NAMES, "b")).map(event => event.commandId)).not.toContain(hunker.id);
        expect((await buildAllEvents(game, NAMES, "a")).map(event => event.commandId)).toContain(hunker.id);
    });

    it("tells a shot from out of sight at one of theirs, but not who fired it", async () => {
        const game = ambush();
        expect((await shoot(game)).outcome.validMove).toBe(true);
        const [mine] = await texts(game, "a");
        const [theirs] = await texts(game, "b");
        expect(mine).toMatch(/^a shot b's Knight with their Archer \(\d+%\): a hit for \d+$/);
        expect(theirs).toMatch(/^a shot b's Knight with a character out of sight \(\d+%\): a hit for \d+$/);
        expect((await responseFor(game, null)).gameState.history).toEqual([]);
    });

    it("tells taking a move back only to whoever was told the move", async () => {
        const game = ambush();
        const battle = battleOf(game);
        const reach = reachOf(battle, battle.fighters[0]);
        const unseen = squadSight(battle, "b");
        const step = reach.costs.findIndex((cost, square) => cost > 0 && moveAp(battle.fighters[0], cost) <= 1 && !unseen(square));
        expect((await play(game, actBy("a", { kind: "move", fighter: 0, path: pathTo(reach, step)!.squares }))).outcome.validMove).toBe(true);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        expect((await texts(game, "a")).slice(0, 2)).toEqual(["a took back their last move", "a moved their Archer"]);
        expect(await texts(game, "b")).toEqual([]);
    });

    it("never names the action another side took in a review step, while the fog lasts", () => {
        const game = ambush();
        const shot = cmd(RealmArenaAct, "a", { action: { kind: "fireball", fighter: 0, at: 0 } });
        expect(stepSummary(shot, "b", game.specificGameState)).toBe("acted");
        expect(stepSummary(shot, null, game.specificGameState)).toBe("acted");
        expect(stepSummary(shot, "a", game.specificGameState)).toBeUndefined();
        expect(stepSummary(shot, "b", game.specificGameState, true)).toBeUndefined();
        expect(stepSummary(endTurnBy("a"), "b", game.specificGameState)).toBeUndefined();
    });

    it("lifts the fog on the log as the battle ends, for everyone", async () => {
        const game = ambush(true);
        await shoot(game);
        expect(game.complete).toBe(true);
        expect(game.gameState.history.some(line => line.perViewer)).toBe(false);
        for (const viewer of ["a", "b", null]) {
            expect((await responseFor(game, viewer)).gameState.history.map(line => line.text)).toContainEqual(expect.stringMatching(/^a shot b's Knight with their Archer/));
        }
    });
});
