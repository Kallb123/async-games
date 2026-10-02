import { describe, expect, it } from "vitest";
import { canDropPlayer, PlayerDropped } from "@/utils/games/playerDropout";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { CHARACTERS, POINTS_BUDGET, REALM } from "./characters";
import { gameStateToModel } from "./RealmArenaModels";
import { ACTION_POINTS, BATTLE_ROUNDS, isStanding } from "./rules";
import {
    cmd, endTurnBy, makeGame, muster, musterAll, play, playScriptedTurn, readyMadePicks, type RealmArenaTestGame,
} from "./testFixtures";

// docs/games/realm-arena.md §17.4 B2: free-for-all for three and four players
// on the 48×48 Four-Gate Fort, the budgets and battle lengths for each party
// size, and a dropout adapter, so a player who stops turning up has their
// squad leave while their score stands.

const THREE = ["a", "b", "c"];
const FOUR = ["a", "b", "c", "d"];

const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);

/** Downs every one of `player`'s characters, as a run of knock-outs would. */
function wipeOut(game: RealmArenaTestGame, player: string) {
    for (const fighter of own(game, player)) Object.assign(fighter, { hp: 0, ap: 0, banked: 0 });
}

/** Drops `player` the way the turn-timer cron does: their missed turn played out, then `PlayerDropped`. */
async function drop(game: RealmArenaTestGame, player: string) {
    return play(game, cmd(PlayerDropped, player, { resumesWith: game.currentTurn }));
}

describe("setting up a free-for-all", () => {
    it.each([[THREE, 3], [FOUR, 4]] as const)("fights %j on the Four-Gate Fort, with the budget and battle length for its size", async (seats, count) => {
        const game = makeGame([...seats]);
        expect(game.specificGameState.map).toBe("fourGateFort");
        const view = gameStateToModel(game.specificGameState, "a", null);
        expect(view).toMatchObject({ budget: POINTS_BUDGET[count], battleRounds: BATTLE_ROUNDS[count] });

        await musterAll(game);
        expect(game.specificGameState.phase).toBe("battle");
        expect(game.specificGameState.fighters.map(one => one.character)).toEqual(seats.flatMap(() => REALM.readyMade[count]));
        expect(game.currentTurn).toBe("a");
    });

    it("keeps a duel on the Ruined Fort", () => {
        expect(makeGame(["a", "b"]).specificGameState.map).toBe("ruinedFort");
    });

    it("refuses a squad over the smaller budget", async () => {
        const game = makeGame([...FOUR]);
        const [first, second, third] = readyMadePicks(game, 0).map(pick => pick.square);
        // 25 + 25 + 30 = 80: within two players' budget, over four's.
        const picks = [{ character: "knight", square: first }, { character: "cleric", square: second }, { character: "mage", square: third }] as const;
        expect((await play(game, muster("a", [...picks]))).outcome.validMove).toBe(false);
        expect((await play(game, muster("a", picks.slice(0, 2)))).outcome.validMove).toBe(true);
    });

    it("musters a timed-out seat's ready-made squad in its own corner", async () => {
        const game = makeGame([...THREE]);
        for (const player of THREE) expect(await resolveStalledTurn(game, player, player)).toBe("advanced");
        expect(game.specificGameState.phase).toBe("battle");
        expect(own(game, "c").map(one => one.square)).toEqual(readyMadePicks(game, 2).map(pick => pick.square));
    });
});

describe("the rotation", () => {
    it("goes round every seat, and a round ends with the last", async () => {
        const game = makeGame([...FOUR]);
        await musterAll(game);
        for (const player of FOUR) {
            expect(game.currentTurn).toBe(player);
            expect(game.specificGameState.roundsPlayed).toBe(0);
            await play(game, endTurnBy(player));
        }
        expect(game.specificGameState.roundsPlayed).toBe(1);
        expect(own(game, "a").every(one => one.ap === ACTION_POINTS)).toBe(true);
    });

    it("steps past a squad with nobody standing, whose score stands (§5.1)", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        game.specificGameState.scores.b = 9;
        wipeOut(game, "b");
        await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("c");
        expect(own(game, "b").every(one => one.ap === 0)).toBe(true);
        expect(game.specificGameState.scores.b).toBe(9);
        expect(game.complete).toBe(false);
    });

    it("still ends the round when the last seat has been wiped out", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        wipeOut(game, "c");
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
    });

    it("ends the battle after its last round", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        for (let turn = 0; turn < BATTLE_ROUNDS[3] * 3; turn++) {
            expect(game.complete).toBe(false);
            expect((await play(game, endTurnBy(game.currentTurn))).outcome.validMove).toBe(true);
        }
        expect(game.complete).toBe(true);
        // Nobody scored and every squad stands untouched, so the last seat wins (§5.1).
        expect(game.winner).toBe("c");
    });
});

describe("a player who stops turning up (the dropout adapter)", () => {
    it("can't be dropped from a duel, or during the muster", async () => {
        const duel = makeGame(["a", "b"]);
        await musterAll(duel);
        expect(canDropPlayer(duel, "b")).toBe(false);

        const game = makeGame([...THREE]);
        await play(game, muster("a", readyMadePicks(game, 0)));
        expect(canDropPlayer(game, "c")).toBe(false);
        await play(game, muster("b", readyMadePicks(game, 1)));
        await play(game, muster("c", readyMadePicks(game, 2)));
        expect(canDropPlayer(game, "c")).toBe(true);
    });

    it("takes their squad off the battlefield, keeps their score, and steps past their seat", async () => {
        const game = makeGame([...FOUR]);
        await musterAll(game);
        game.specificGameState.scores.c = 7;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        // The cron plays out c's missed turn first, then drops them on d's.
        expect(await resolveStalledTurn(game, "c", "c")).toBe("advanced");
        expect(game.currentTurn).toBe("d");
        const { outcome, gameOver } = await drop(game, "c");
        expect(outcome.validMove).toBe(true);
        expect(gameOver).toBe(false);

        expect(own(game, "c")).toEqual([]);
        expect(game.specificGameState.fighters).toHaveLength(REALM.readyMade[4].length * 3);
        expect(game.specificGameState.scores.c).toBe(7);
        expect(game.currentTurn).toBe("d");

        await play(game, endTurnBy("d"));
        expect(game.specificGameState.roundsPlayed).toBe(1);
        for (const player of ["a", "b", "d"]) {
            expect(game.currentTurn).toBe(player);
            await play(game, endTurnBy(player));
        }
        expect(game.specificGameState.roundsPlayed).toBe(2);
    });

    it("still ends the round when the last seat has been dropped", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        await play(game, endTurnBy("c"));
        await drop(game, "c");
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(2);
    });

    it("forgets every undo snapshot, which would put the squad back", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        await play(game, endTurnBy("a"));
        game.specificGameState.undoStack = [{ by: "b", state: structuredClone(game.specificGameState) }];
        await drop(game, "c");
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
    });

    it("ends the battle when it leaves one squad standing, and never names the dropped player the winner", async () => {
        const game = makeGame([...THREE]);
        await musterAll(game);
        game.specificGameState.scores = { a: 0, b: 2, c: 30 };
        wipeOut(game, "a");
        await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("b");
        const { gameOver } = await drop(game, "c");
        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("b");
        expect(game.gameState.history[0].text).toBe("{{b}} wins the battle");
        expect(game.gameState.history[1].text).toContain("{{c}} 30 points");
    });

    it("replays to the same state, the drop included", async () => {
        const game = makeGame([...FOUR]);
        await musterAll(game);
        await playScriptedTurn(game);
        await play(game, endTurnBy("b"));
        await drop(game, "b");
        await playScriptedTurn(game);

        const replay = makeGame([...FOUR]);
        for (const command of game.gameState.commandHistory) {
            const copy = Object.assign(Object.create(Object.getPrototypeOf(command)), structuredClone({ ...command }));
            expect((await play(replay, copy)).outcome.validMove).toBe(true);
        }
        expect(replay.specificGameState).toEqual(game.specificGameState);
        expect(replay.currentTurn).toBe(game.currentTurn);
    });
});

describe("a whole free-for-all, played by four scripted squads", () => {
    it("reaches a winner with every character's HP in bounds", { timeout: 60_000 }, async () => {
        const game = makeGame([...FOUR]);
        await musterAll(game);
        for (let turn = 0; !game.complete; turn++) {
            expect(turn, "the battle outlasted its turn limit").toBeLessThan(BATTLE_ROUNDS[4] * 4);
            await playScriptedTurn(game);
            for (const fighter of game.specificGameState.fighters) {
                expect(fighter.hp).toBeGreaterThanOrEqual(0);
                expect(fighter.hp).toBeLessThanOrEqual(CHARACTERS[fighter.character].hp);
            }
        }
        expect(FOUR).toContain(game.winner);
        expect(game.specificGameState.fighters.some(one => !isStanding(one))).toBe(true);
    });
});
