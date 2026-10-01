import { describe, expect, it, vi } from "vitest";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { distance } from "@/utils/games/battlefield/terrain";
import { CHARACTERS, type CharacterId } from "./characters";
import { buildInitialRealmArenaState, RealmArenaGameDataModel } from "./RealmArenaModels";
import { meta } from "./meta";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { RealmArenaAct, RealmArenaMuster, type IRealmArenaActOutcome } from "./RealmArenaLogic";
import {
    ACTION_POINTS, BATTLE_ROUNDS, centrePoints, check, isStanding, knockoutPoints, moveAp, reachOf,
    type Action, type Fighter,
} from "./rules";
import {
    actBy, battleOf, cmd, endTurnBy, makeGame, muster, musterBoth, play, PLAYERS, readyMadePicks,
    type RealmArenaTestGame,
} from "./testFixtures";

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** What the server sends `viewer`: the game's own `CreateDataResponse`, on a document built from the game in memory. */
async function responseFor(game: RealmArenaTestGame, viewer: string | null) {
    const { markModified: _, ...data } = game;
    return new RealmArenaGameDataModel(structuredClone(data)).CreateDataResponse(viewer) as Promise<IRealmArenaGameDataResponse>;
}

const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);

describe("setting up a match", () => {
    // The setup routes bound the party by `meta` alone, but the map is what
    // can seat it: a party the map has no deployment zone for would be
    // accepted, then fail to start every time its last player accepted.
    it("starts a battle for every party size the setup routes accept", () => {
        for (let size = meta.minPlayers; size <= meta.maxPlayers; size++) {
            const seats = Array.from({ length: size }, (_, seat) => `player${seat}`);
            expect(() => buildInitialRealmArenaState(seats), `${size} players`).not.toThrow();
        }
    });
});

describe("the muster (§17.2)", () => {
    it("goes in seat order, one turn each, and then the battle begins on seat 0's turn", async () => {
        const game = makeGame();
        expect(game.specificGameState.phase).toBe("muster");

        // Not b's turn to muster yet.
        expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(false);

        expect((await play(game, muster("a", readyMadePicks(game, 0)))).outcome).toMatchObject({ validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.phase).toBe("muster");
        expect(game.specificGameState.fighters).toEqual([]);

        await play(game, muster("b", readyMadePicks(game, 1)));
        const gs = game.specificGameState;
        expect(gs.phase).toBe("battle");
        expect(gs.musters).toEqual([]);
        expect(game.currentTurn).toBe("a");
        // Ids in seat order; the first turn's squad gets its AP, the other waits.
        expect(gs.fighters.map(one => one.id)).toEqual([...Array(10).keys()]);
        expect(own(game, "a").every(one => one.ap === ACTION_POINTS)).toBe(true);
        expect(own(game, "b").every(one => one.ap === 0)).toBe(true);
    });

    it("refuses a squad over budget, outside the deployment zone, or of no-one", async () => {
        const game = makeGame();
        const zoneB = readyMadePicks(game, 1).map(pick => pick.square);
        const refused = [
            [],
            [{ character: "mage", square: 0 }, { character: "mage", square: 1 }, { character: "knight", square: 2 }, { character: "knight", square: 3 }],
            [{ character: "knight", square: zoneB[0] }],
            [{ character: "dragon", square: 0 }],
            "a knight",
        ];
        for (const picks of refused) {
            expect((await play(game, cmd(RealmArenaMuster, "a", { picks: picks as never }))).outcome.validMove, JSON.stringify(picks)).toBe(false);
        }
        expect(game.gameState.commandHistory).toEqual([]);
    });

    it("keeps only the character and square of each pick", async () => {
        const game = makeGame();
        const picks = readyMadePicks(game, 0).map(pick => ({ ...pick, hp: 99, owner: "b" }));
        await play(game, muster("a", picks));
        expect(game.specificGameState.musters[0].picks[0]).toEqual({ character: "knight", square: picks[0].square });
    });

    it("sends an opponent nothing of a squad until both have mustered", async () => {
        const game = makeGame();
        // A squad nobody else musters, so any trace of it is unmistakable.
        const picks = readyMadePicks(game, 0).slice(0, 2).map((pick, i) => ({ ...pick, character: (["mage", "scout"] as const)[i] }));
        const command = muster("a", picks);
        const { outcome } = await play(game, command);

        // Everything the muster puts where someone else can read it: the
        // response, the match review's line for it, its outcome and the
        // newest history line (which a push notification quotes).
        const traces = async (viewer: string | null) => [
            JSON.stringify(await responseFor(game, viewer)), command.myString(), JSON.stringify(outcome), game.gameState.history[0].text,
        ];
        for (const viewer of ["b", null, "stranger"]) {
            for (const trace of await traces(viewer)) {
                for (const id of CHARACTER_IDS) expect(trace, `${viewer} sees "${id}"`).not.toContain(`"${id}"`);
                for (const { name } of Object.values(CHARACTERS)) expect(trace, `${viewer} sees ${name}`).not.toContain(name);
                for (const { square } of picks) expect(trace, `${viewer} sees square ${square}`).not.toMatch(new RegExp(`\\b${square}\\b`));
            }
            expect((await responseFor(game, viewer)).specificGameState).toMatchObject({ fighters: [], myMuster: null, mustered: ["a"] });
        }
        // Its owner still sees it.
        expect((await responseFor(game, "a")).specificGameState.myMuster).toEqual(picks);

        await play(game, muster("b", readyMadePicks(game, 1)));
        const view = (await responseFor(game, "b")).specificGameState;
        expect(view.myMuster).toBeNull();
        expect(view.fighters.filter(one => one.owner === "a").map(one => one.character)).toEqual(["mage", "scout"]);
    });
});

describe("a battle turn", () => {
    it("refuses an action out of turn, by someone else's character, or before the battle", async () => {
        const game = makeGame();
        expect((await play(game, actBy("a", { kind: "hunker", fighter: 0 }))).outcome.validMove).toBe(false);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(false);
        await musterBoth(game);
        expect((await play(game, actBy("b", { kind: "hunker", fighter: 5 }))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", { kind: "hunker", fighter: 5 }))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", "hunker" as never))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", { kind: "hunker", fighter: 0 }))).outcome.validMove).toBe(true);
    });

    it("records the rolls a shot used, and a replay uses them rather than rolling again", async () => {
        const game = makeGame();
        await musterBoth(game);
        // Put b's Knight in the a Archer's sights, in the open.
        const gs = game.specificGameState;
        const archer = own(game, "a").find(one => one.character === "archer")!;
        const knight = own(game, "b").find(one => one.character === "knight")!;
        knight.square = archer.square + 36 * 8;
        const action: Action = { kind: "attack", fighter: archer.id, target: knight.id };
        const before = structuredClone(gs);

        const command = actBy("a", action);
        const { outcome } = await play(game, command);
        expect(outcome.validMove).toBe(true);
        expect(command.recordedRolls).toHaveLength(1);
        const [shot] = (outcome as IRealmArenaActOutcome).events;
        expect(shot).toMatchObject({ kind: "shot", roll: command.recordedRolls![0] });

        const replayed = makeGame();
        replayed.specificGameState = before;
        replayed.currentTurn = "a";
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => { throw new Error("rolled again"); });
        try {
            await play(replayed, Object.assign(new RealmArenaAct(), structuredClone(command)));
        } finally {
            entropy.mockRestore();
        }
        expect(replayed.specificGameState.fighters).toEqual(gs.fighters);
    });

    it("keeps nothing of an action but what was checked", async () => {
        const game = makeGame();
        await musterBoth(game);
        const command = actBy("a", { kind: "hunker", fighter: 0, path: [1, 2, 3], junk: "x".repeat(100) } as unknown as Action);
        await play(game, command);
        expect(command.action).toEqual({ kind: "hunker", fighter: 0 });
    });

    it("puts everyone with AP enough on watch at the end of the turn, except those kept still", async () => {
        const game = makeGame();
        await musterBoth(game);
        const [first, second] = own(game, "a");
        await play(game, endTurnBy("a", [second.id, 99, 5]));
        const byId = (id: number) => game.specificGameState.fighters.find(one => one.id === id)!;
        expect(byId(first.id).banked).toBe(ACTION_POINTS);
        expect(byId(second.id).banked).toBe(0);
        expect(game.currentTurn).toBe("b");
        expect(own(game, "b").every(one => one.ap === ACTION_POINTS)).toBe(true);
        // Its banked AP last until a's next turn, which starts afresh.
        await play(game, endTurnBy("b"));
        expect(byId(first.id)).toMatchObject({ ap: ACTION_POINTS, banked: 0 });
    });

    it("ends the battle after the last round, and names a winner", async () => {
        const game = makeGame();
        await musterBoth(game);
        for (let turn = 0; turn < BATTLE_ROUNDS[2] * 2; turn++) {
            expect(game.complete).toBe(false);
            const { outcome } = await play(game, endTurnBy(game.currentTurn));
            expect(outcome.validMove).toBe(true);
        }
        expect(game.complete).toBe(true);
        // Nobody scored and both squads stand untouched, so the later seat wins (§5.1).
        expect(game.winner).toBe("b");
        expect(game.currentTurn).toBe("");
        expect((await responseFor(game, "a")).specificGameState.round).toBe(BATTLE_ROUNDS[2]);
        expect(game.gameState.history[0].text).toBe("{{b}} wins the battle");
    });
});

// ─── A whole battle (§17.3 PR 3, step 6) ─────────────────────────────────────

/** The enemy nearest a fighter, or undefined when none is standing. */
function nearestEnemy(game: RealmArenaTestGame, fighter: Fighter): Fighter | undefined {
    const { field, fighters } = battleOf(game);
    return fighters
        .filter(one => one.owner !== fighter.owner && isStanding(one))
        .sort((x, y) => distance(field, fighter.square, x.square) - distance(field, fighter.square, y.square))[0];
}

/**
 * One action for a fighter, by a simple script: attack whoever it can, and
 * otherwise close on the nearest enemy as far as its AP take it.
 */
function scriptedAction(game: RealmArenaTestGame, fighter: Fighter): Action | undefined {
    const battle = battleOf(game);
    for (const enemy of battle.fighters.filter(one => one.owner !== fighter.owner && isStanding(one))) {
        const attack: Action = { kind: "attack", fighter: fighter.id, target: enemy.id };
        if (!("refused" in check(battle, fighter.owner, attack))) return attack;
    }
    const target = nearestEnemy(game, fighter);
    if (!target || fighter.ap < 1) return undefined;
    const reach = reachOf(battle, fighter);
    const gap = (square: number) => distance(battle.field, square, target.square);
    let best: number | undefined;
    for (let square = 0; square < reach.costs.length; square++) {
        const cost = reach.costs[square];
        if (cost === Infinity || moveAp(fighter.character, cost) > fighter.ap) continue;
        if (best === undefined || gap(square) < gap(best) || (gap(square) === gap(best) && cost < reach.costs[best])) best = square;
    }
    if (best === undefined || gap(best) >= gap(fighter.square)) return undefined;
    return { kind: "move", fighter: fighter.id, path: pathTo(reach, best)!.squares };
}

describe("a whole battle, played by two scripted squads", () => {
    it("keeps AP, HP and scores consistent from the muster to the winner", { timeout: 30_000 }, async () => {
        const game = makeGame();
        await musterBoth(game);
        const expected: Record<string, number> = { a: 0, b: 0 };
        let shots = 0;

        const checkConsistent = () => {
            for (const fighter of game.specificGameState.fighters) {
                const max = CHARACTERS[fighter.character].hp;
                expect(fighter.hp).toBeGreaterThanOrEqual(0);
                expect(fighter.hp).toBeLessThanOrEqual(max);
                expect(fighter.ap).toBeGreaterThanOrEqual(0);
                expect(fighter.ap).toBeLessThanOrEqual(ACTION_POINTS);
                expect(fighter.banked).toBeGreaterThanOrEqual(0);
                expect(fighter.banked).toBeLessThanOrEqual(ACTION_POINTS);
                // Only the player whose turn it is has AP to spend.
                if (fighter.owner !== game.currentTurn) expect(fighter.ap).toBe(0);
                if (!isStanding(fighter)) expect({ ap: fighter.ap, banked: fighter.banked }).toEqual({ ap: 0, banked: 0 });
            }
            expect(game.specificGameState.fighters).toHaveLength(10);
            expect(game.specificGameState.scores).toEqual(expected);
        };

        for (let turn = 0; !game.complete; turn++) {
            expect(turn, "the battle outlasted its turn limit").toBeLessThan(BATTLE_ROUNDS[2] * 2);
            const player = game.currentTurn;
            for (let step = 0; step < 40; step++) {
                const action = own(game, player).filter(isStanding).map(one => scriptedAction(game, one)).find(Boolean);
                if (!action) break;
                const command = actBy(player, action);
                const { outcome } = await play(game, command);
                expect(outcome.validMove, JSON.stringify(action)).toBe(true);
                // Scored independently of the engine's own "scored" events:
                // every knock-out of an enemy is worth its points cost ÷ 5.
                for (const event of (outcome as IRealmArenaActOutcome).events) {
                    if (event.kind === "shot") shots++;
                    if (event.kind === "downed") {
                        const fallen = game.specificGameState.fighters.find(one => one.id === event.fighter)!;
                        const by = game.specificGameState.fighters.find(one => one.id === event.by)!;
                        if (by.owner !== fallen.owner) expected[by.owner] += knockoutPoints(fallen.character);
                    }
                }
                expect(command.recordedRolls).toHaveLength((outcome as IRealmArenaActOutcome).events.filter(event => event.kind === "shot").length);
                if (game.complete) break;
                checkConsistent();
            }
            if (game.complete) break;
            expected[player] += centrePoints(battleOf(game), player, game.specificGameState.roundsPlayed + 1);
            expect((await play(game, endTurnBy(player))).outcome.validMove).toBe(true);
            if (!game.complete) checkConsistent();
        }

        expect(PLAYERS).toContain(game.winner);
        expect(game.specificGameState.scores).toEqual(expected);
        expect(game.gameState.history[0].text).toBe(`{{${game.winner}}} wins the battle`);
        // The squads met and fought: there were shots and someone went down.
        expect(shots).toBeGreaterThan(0);
        expect(game.specificGameState.fighters.some(one => !isStanding(one))).toBe(true);

        // Every roll was recorded: the same commands, replayed from the start
        // with the random-number source taken away, end in the same place.
        const replay = makeGame();
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => { throw new Error("replay rolled"); });
        try {
            for (const command of game.gameState.commandHistory) {
                const copy = Object.assign(Object.create(Object.getPrototypeOf(command)), structuredClone({ ...command }));
                expect((await play(replay, copy)).outcome.validMove).toBe(true);
            }
        } finally {
            entropy.mockRestore();
        }
        expect(replay.specificGameState).toEqual(game.specificGameState);
        expect(replay.winner).toBe(game.winner);
    });
});

describe("a battle read back from storage", () => {
    it("still plays when a fighter's empty cooldowns were minimised away", async () => {
        const game = makeGame();
        await musterBoth(game);
        for (const fighter of game.specificGameState.fighters) delete (fighter as Partial<Fighter>).cooldowns;
        const archer = own(game, "a").find(one => one.character === "archer")!;
        expect((await play(game, actBy("a", { kind: "hunker", fighter: archer.id }))).outcome.validMove).toBe(true);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters.every(one => typeof one.cooldowns === "object")).toBe(true);
    });
});
