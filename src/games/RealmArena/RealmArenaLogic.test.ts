import { describe, expect, it, onTestFinished, vi } from "vitest";
import { distance, TERRAIN } from "@/utils/games/battlefield/terrain";
import { PlayerDropped } from "@/utils/games/playerDropout";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { CHARACTERS, ITEMS, type CharacterId } from "./characters";
import { buildInitialRealmArenaState, RealmArenaGameDataModel } from "./RealmArenaModels";
import { meta } from "./meta";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { RealmArenaAct, RealmArenaMuster, type IRealmArenaOutcome } from "./RealmArenaLogic";
import {
    ACTION_POINTS, BATTLE_ROUNDS, blastedBy, centrePoints, check, isStanding, knockoutPoints,
    type Action, type Fighter,
} from "./rules";
import { actBy, battleOf, blastSpot, cmd, endTurnBy, makeGame, muster, musterAll, play, PLAYERS, readyMadePicks, type RealmArenaTestGame, responseFor, scriptedAction } from "./testFixtures";

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/**
 * A trace without the times it's stamped with: a history line carries when it
 * was written, whose hours and minutes are numbers that can be a square's.
 */
const untimed = (trace: string) => trace.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "");

const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);

describe("setting up a match", () => {
    // The setup routes bound the party by `meta` alone, but the map is what
    // can seat it: a party the map has no deployment zone for would be
    // accepted, then fail to start every time its last player accepted.
    it("starts a battle for every party size the setup routes accept", () => {
        for (let size = meta.minPlayers; size <= meta.maxPlayers; size++) {
            const seats = Array.from({ length: size }, (_, seat) => `player${seat}`);
            expect(() => buildInitialRealmArenaState(seats, {}), `${size} players`).not.toThrow();
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
        // Mustered at a minute that is one of its squares, so a time stamped
        // on what's sent is never mistaken for a square (`untimed`).
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-03T06:46:00Z"));
        onTestFinished(() => { vi.useRealTimers(); });
        const game = makeGame();
        // A squad nobody else musters, so any trace of it is unmistakable.
        const picks = readyMadePicks(game, 0).slice(0, 2).map((pick, i) => ({ ...pick, character: (["mage", "scout"] as const)[i] }));
        expect(picks.map(pick => pick.square)).toContain(46);
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
                for (const { square } of picks) expect(untimed(trace), `${viewer} sees square ${square}`).not.toMatch(new RegExp(`\\b${square}\\b`));
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
        await musterAll(game);
        expect((await play(game, actBy("b", { kind: "hunker", fighter: 5 }))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", { kind: "hunker", fighter: 5 }))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", "hunker" as never))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", { kind: "hunker", fighter: 0 }))).outcome.validMove).toBe(true);
    });

    it("records the rolls a shot used, and a replay uses them rather than rolling again", async () => {
        const game = makeGame();
        await musterAll(game);
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
        const [shot] = (outcome as IRealmArenaOutcome).events;
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
        await musterAll(game);
        const command = actBy("a", { kind: "hunker", fighter: 0, path: [1, 2, 3], junk: "x".repeat(100) } as unknown as Action);
        await play(game, command);
        expect(command.action).toEqual({ kind: "hunker", fighter: 0 });
    });

    it("puts everyone with AP enough on watch at the end of the turn, except those kept still", async () => {
        const game = makeGame();
        await musterAll(game);
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
        await musterAll(game);
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

describe("a whole battle, played by two scripted squads", () => {
    it("keeps AP, HP and scores consistent from the muster to the winner", { timeout: 30_000 }, async () => {
        const game = makeGame();
        await musterAll(game);
        const expected: Record<string, number> = { a: 0, b: 0 };
        let shots = 0, strikes = 0;

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
                for (const event of (outcome as IRealmArenaOutcome).events) {
                    if (event.kind === "shot") shots++;
                    if (event.kind === "struck") strikes++;
                    if (event.kind === "downed") {
                        const fallen = game.specificGameState.fighters.find(one => one.id === event.fighter)!;
                        const by = game.specificGameState.fighters.find(one => one.id === event.by)!;
                        if (by.owner !== fallen.owner) expected[by.owner] += knockoutPoints(fallen.character);
                    }
                }
                // Every shot and every melee strike drew a roll, and nothing else did.
                expect(command.recordedRolls ?? []).toHaveLength((outcome as IRealmArenaOutcome).events.filter(event => event.kind === "shot" || event.kind === "struck").length);
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
        expect(strikes).toBeGreaterThan(0);
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

describe("items (§21)", () => {
    /** a's ready-made squad less a Man-at-arms, with the 15 points it frees spent on three items. */
    function pickedWithItems(game: RealmArenaTestGame) {
        const [knight, manAtArms, , archer, cleric] = readyMadePicks(game, 0);
        return [{ ...knight, item: "healingDraught" as const }, { ...manAtArms, item: "thunderFlask" as const }, { ...archer, item: "smokePot" as const }, cleric];
    }

    /** Both squads mustered, a's carrying `pickedWithItems`. */
    async function battleWithItems() {
        const game = makeGame();
        expect((await play(game, muster("a", pickedWithItems(game)))).outcome.validMove).toBe(true);
        expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(true);
        return game;
    }

    it("carries each item from the muster onto the battlefield, and none for a pick without one", async () => {
        const game = await battleWithItems();
        expect(own(game, "a").map(one => one.item)).toEqual(["healingDraught", "thunderFlask", "smokePot", null]);
        expect(own(game, "b").every(one => one.item === null)).toBe(true);
    });

    it("refuses a muster whose items take it over budget", async () => {
        const game = makeGame();
        const picks = readyMadePicks(game, 0).map((pick, i) => i === 0 ? { ...pick, item: "fireFlask" as const } : pick);
        expect((await play(game, muster("a", picks))).outcome.validMove).toBe(false);
    });

    it("keeps the items sealed with the squad: its owner's to see, and nobody else's", async () => {
        const game = makeGame();
        const picks = pickedWithItems(game);
        const command = muster("a", picks);
        const { outcome } = await play(game, command);
        for (const viewer of ["b", null]) {
            const traces = [JSON.stringify(await responseFor(game, viewer)), command.myString(), JSON.stringify(outcome), game.gameState.history[0].text];
            for (const trace of traces) {
                for (const item of ["healingDraught", "thunderFlask", "smokePot", "draught", "flask", "smoke"]) {
                    expect(trace.toLowerCase(), `${viewer} sees ${item}`).not.toContain(item.toLowerCase());
                }
            }
        }
        expect((await responseFor(game, "a")).specificGameState.myMuster).toEqual(picks);
    });

    it("writes a throw and a draught to the log, naming what was used and who it hit", async () => {
        const game = await battleWithItems();
        const thrower = own(game, "a")[1];
        const enemy = own(game, "b")[0];
        const battle = battleOf(game);
        // An empty square in range, two or more from anyone else, for b's character to stand on.
        const spot = battle.field.tiles.findIndex((tile, square) => tile.terrain.standable
            && !("refused" in check(battle, "a", { kind: "throw", fighter: thrower.id, at: square }))
            && battle.fighters.every(one => distance(battle.field, one.square, square) >= 2));
        enemy.square = spot;

        expect((await play(game, actBy("a", { kind: "throw", fighter: thrower.id, at: spot }))).outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toBe("{{a}} threw a thunder flask with their Man-at-arms, hitting 1 character; {{b}}'s Knight is stunned");

        // Every action replaces the fighters, so the Knight is looked up after it.
        const knight = own(game, "a")[0];
        knight.hp = 5;
        expect((await play(game, actBy("a", { kind: "draught", fighter: knight.id, target: knight.id }))).outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toBe("{{a}} healed their Knight with its healing draught for 3");

        // A Cleric's Heal on itself needs no "with" either.
        const cleric = own(game, "a")[3];
        cleric.hp = 3;
        expect((await play(game, actBy("a", { kind: "heal", fighter: cleric.id, target: cleric.id }))).outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toBe("{{a}} healed their Cleric for 4");
    });

    it("keeps nothing of an item's action but what was checked", async () => {
        const game = await battleWithItems();
        const knight = own(game, "a")[0];
        knight.hp = 5;
        const command = actBy("a", { kind: "draught", fighter: knight.id, target: knight.id, at: 3, junk: "x" } as unknown as Action);
        await play(game, command);
        expect(command.action).toEqual({ kind: "draught", fighter: knight.id, target: knight.id });
    });
});

describe("blasting low cover (§22)", () => {
    it("keeps what a fire flask blasted, so every rule reads the ground without it", async () => {
        const game = makeGame();
        await musterAll(game);
        const thrower = own(game, "a")[0];
        const aim = blastSpot(game, thrower);
        const blasted = blastedBy(battleOf(game).field, ITEMS.fireFlask, aim);
        expect(blasted.length).toBeGreaterThan(0);

        const { outcome } = await play(game, actBy("a", { kind: "throw", fighter: thrower.id, at: aim }));
        expect(outcome.validMove).toBe(true);
        expect((outcome as IRealmArenaOutcome).events.at(-1)).toEqual({ kind: "blasted", fighter: thrower.id, squares: blasted });
        expect(game.specificGameState.blasted).toEqual(blasted);
        for (const square of blasted) expect(battleOf(game).field.tiles[square].terrain).toBe(TERRAIN["_"]);
        expect(game.gameState.history[0].text).toBe(`{{a}} threw a fire flask with their ${CHARACTERS[thrower.character].name}; blasted away ${blasted.length} square${blasted.length === 1 ? "" : "s"} of low cover`);
    });

    it("sends what was blasted to every viewer, and starts every battle with nothing blasted", async () => {
        const game = makeGame();
        await musterAll(game);
        const thrower = own(game, "a")[0];
        await play(game, actBy("a", { kind: "throw", fighter: thrower.id, at: blastSpot(game, thrower) }));
        const live = structuredClone(game.specificGameState.blasted);
        for (const viewer of ["a", "b", null]) expect((await responseFor(game, viewer)).specificGameState.blasted).toEqual(live);
        expect(buildInitialRealmArenaState(PLAYERS, {}).blasted).toEqual([]);
    });

    it("reads a battle stored before anything could be blasted as one where nothing has been", async () => {
        const game = makeGame();
        await musterAll(game);
        delete (game.specificGameState as Partial<typeof game.specificGameState>).blasted;
        expect((await responseFor(game, "a")).specificGameState.blasted).toEqual([]);
        expect(battleOf(game).field).toBe(battleOf(makeGame()).field);
        const thrower = own(game, "a")[0];
        await play(game, actBy("a", { kind: "throw", fighter: thrower.id, at: blastSpot(game, thrower) }));
        expect(game.specificGameState.blasted.length).toBeGreaterThan(0);
    });
});

describe("a battle read back from storage", () => {
    it("still plays when a fighter's empty cooldowns were minimised away", async () => {
        const game = makeGame();
        await musterAll(game);
        for (const fighter of game.specificGameState.fighters) delete (fighter as Partial<Fighter>).cooldowns;
        const archer = own(game, "a").find(one => one.character === "archer")!;
        expect((await play(game, actBy("a", { kind: "hunker", fighter: archer.id }))).outcome.validMove).toBe(true);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters.every(one => typeof one.cooldowns === "object")).toBe(true);
    });
});

describe("a turn that begins burning (§20.3)", () => {
    /** Leaves `player` one character, burning at 1 HP, set alight by `burner`'s first character. */
    function lastOneBurning(game: RealmArenaTestGame, player: string, burner: string) {
        const [last, ...rest] = own(game, player);
        for (const fighter of rest) Object.assign(fighter, { hp: 0 });
        Object.assign(last, { hp: 1, effects: { burning: 2 }, burnedBy: own(game, burner)[0].id });
        return last;
    }

    it("burns as the hand-off begins it, writing the burn to the log", async () => {
        const game = makeGame();
        await musterAll(game);
        const [knight] = own(game, "b");
        Object.assign(knight, { effects: { burning: 2 }, burnedBy: own(game, "a")[0].id });
        const { outcome } = await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("b");
        expect(own(game, "b")[0]).toMatchObject({ hp: CHARACTERS[knight.character].hp - 1, ap: ACTION_POINTS, effects: { burning: 1 } });
        expect((outcome as IRealmArenaOutcome).events).toContainEqual({ kind: "burned", fighter: knight.id, damage: 1 });
        expect(game.gameState.history[0].text).toBe(`{{b}}'s ${CHARACTERS[knight.character].name} burned for 1`);
    });

    it("ends the battle when it burns out the last of a squad, scoring for whoever set it alight", async () => {
        const game = makeGame();
        await musterAll(game);
        const last = lastOneBurning(game, "b", "a");
        const { gameOver } = await play(game, endTurnBy("a"));
        expect(gameOver).toBe(true);
        expect(game).toMatchObject({ complete: true, winner: "a", currentTurn: "" });
        expect(game.specificGameState.scores.a).toBe(knockoutPoints(last.character));
        expect(game.gameState.history.map(entry => entry.text)).toContain(`{{b}}'s ${CHARACTERS[last.character].name} burned for 1; {{b}}'s ${CHARACTERS[last.character].name} is down; {{a}} scored ${knockoutPoints(last.character)} for the knock-out`);
    });

    it("passes the turn on past a squad burned out as its turn begins, within the round", async () => {
        const game = makeGame(["a", "b", "c"]);
        await musterAll(game);
        lastOneBurning(game, "b", "a");
        const { gameOver } = await play(game, endTurnBy("a"));
        expect(gameOver).toBe(false);
        expect(game.currentTurn).toBe("c");
        expect(own(game, "c").every(one => one.ap === ACTION_POINTS)).toBe(true);
        expect(game.specificGameState.roundsPlayed).toBe(0);
    });

    it("ends the round when the last seat is burned out as its turn begins", async () => {
        const game = makeGame(["a", "b", "c"]);
        await musterAll(game);
        await play(game, endTurnBy("a"));
        lastOneBurning(game, "c", "a");
        await play(game, endTurnBy("b"));
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
    });

    it("doesn't burn once the turn limit is played out", async () => {
        const game = makeGame();
        await musterAll(game);
        await play(game, endTurnBy("a"));
        game.specificGameState.roundsPlayed = BATTLE_ROUNDS[2] - 1;
        const [knight] = own(game, "a");
        Object.assign(knight, { effects: { burning: 2 }, burnedBy: own(game, "b")[0].id });
        expect((await play(game, endTurnBy("b"))).gameOver).toBe(true);
        expect(own(game, "a")[0]).toMatchObject({ hp: knight.hp, effects: { burning: 2 } });
    });
});

describe("a turn that begins burning, off the beaten path (§20.3)", () => {
    const burnOut = (game: RealmArenaTestGame, player: string, burner: string) => {
        const [last, ...rest] = own(game, player);
        for (const fighter of rest) Object.assign(fighter, { hp: 0 });
        Object.assign(last, { hp: 1, effects: { burning: 1 }, burnedBy: own(game, burner)[0].id });
    };

    it("passes a dropped seat as well as a squad burned out", async () => {
        const game = makeGame(["a", "b", "c", "d"]);
        await musterAll(game);
        await play(game, endTurnBy("a"));
        expect((await play(game, cmd(PlayerDropped, "c", { resumesWith: game.currentTurn }))).outcome.validMove).toBe(true);
        burnOut(game, "d", "b");
        await play(game, endTurnBy("b"));
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
        expect(game.complete).toBe(false);
    });

    it("finishes the battle from a timed-out End turn that burns the last squad out", async () => {
        const game = makeGame();
        await musterAll(game);
        burnOut(game, "b", "a");
        expect(await resolveStalledTurn(game, "a", "a")).toBe("gameOver");
        expect(game).toMatchObject({ complete: true, winner: "a" });
    });
});
