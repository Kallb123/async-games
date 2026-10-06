import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { REALM } from "./characters";
import { computeRealmArenaResultStats, formatRealmArenaResultStats, gameStateToModel, RealmArenaInvitationModel, type IRealmArenaGameData, type RealmArenaSettings } from "./RealmArenaModels";
import { recordBattle } from "./recordBattle";
import { RealmArenaUndo } from "./RealmArenaLogic";
import { battleRounds, isWarband, warbandOwner } from "./rules";
import { actBy, cmd, endTurnBy, makeGame, muster, oneStep, play, playScriptedTurn, readyMadePicks, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §30.6: solo is co-op with a team of one — one
// player against one warband on the Ruined Fort, for a duel's 15 rounds, and
// the turn never leaves them: the muster and every End turn come straight
// back, with no hand-off to push, and the warband plays inside each End turn.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

// The planner, counted, so a replay can be shown never to ask it.
const planner = vi.hoisted(() => ({ broken: false }));
vi.mock("./ai", async importOriginal => {
    const real = await importOriginal<typeof import("./ai")>();
    return {
        ...real,
        nextAction: (...args: Parameters<typeof real.nextAction>) => {
            if (planner.broken) throw new Error("the planner ran");
            return real.nextAction(...args);
        },
    };
});

afterEach(() => {
    planner.broken = false;
});

const SOLO: RealmArenaSettings = { coop: { enemy: "realm" } };

/** A solo battle on its first turn: the player and the warband mustered. */
async function soloBattle(settings: RealmArenaSettings = SOLO): Promise<RealmArenaTestGame> {
    const game = makeGame(["a"], {}, settings);
    const { outcome } = await play(game, muster("a", readyMadePicks(game, 0)));
    if (!outcome.validMove) throw new Error("the muster was refused");
    return game;
}

describe("a solo battle's creation (§30.6)", () => {
    const createGame = RealmArenaInvitationModel.schema.methods.CreateGame as
        (this: unknown, invite: unknown, userIdList: string[]) => Promise<IRealmArenaGameData>;

    it("puts a team of one on the Ruined Fort, for a duel's 15 rounds, against one warband", async () => {
        const invite = { turnTimer: "unlimited", coop: { enemy: "realm", mission: "holdOut", difficulty: "hard" } };
        const game = await createGame.call(invite, invite, ["a"]);
        expect(game.specificGameState.map).toBe("ruinedFort");
        expect(game.specificGameState.coop).toEqual({ enemy: "realm", nextWarband: 0, mission: "holdOut", difficulty: "hard" });
        expect(game.currentTurn).toBe("a");
        expect(game.turnTimer).toBe("unlimited");
        const setup = game.gameState.history.map(entry => entry.text);
        expect(setup).toContain("Setup: Hold Out on the Ruined Fort, over 15 battle rounds");
        expect(setup).toContain(`Setup: the players fight together against ${REALM.enemyName}, a warband deployed opposite each of them`);
        expect(battleRounds(1)).toBe(battleRounds(2));
    });

    it("is no battle at all without the computer: a free-for-all needs two", () => {
        expect(() => makeGame(["a"])).toThrow();
    });
});

describe("a solo battle's turns (§30.6)", () => {
    it("keeps the turn with the player through the muster, without a hand-off to push", async () => {
        const game = makeGame(["a"], {}, SOLO);
        const { outcome } = await play(game, muster("a", readyMadePicks(game, 0)));
        expect(outcome).toMatchObject({ validMove: true, turnOver: false, timerRestarts: true });
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.phase).toBe("battle");
        // The warband mustered opposite, as in any co-op battle.
        expect(game.specificGameState.fighters.some(fighter => fighter.owner === warbandOwner(0))).toBe(true);
    });

    it("plays the warband's turn inside every End turn, and comes straight back to the player a round on", async () => {
        const game = await soloBattle();
        for (let round = 1; round <= 3; round++) {
            const { outcome } = await play(game, endTurnBy("a"));
            expect(outcome).toMatchObject({ validMove: true, turnOver: false, timerRestarts: true });
            expect(game.currentTurn).toBe("a");
            expect(game.specificGameState.roundsPlayed).toBe(round);
            // Recorded for a replay: the warband took its turn.
            const ended = game.gameState.commandHistory.at(-1) as unknown as { recordedEnemyActions?: unknown[] };
            expect(Array.isArray(ended.recordedEnemyActions)).toBe(true);
        }
        // The warband walks towards the keep: after three turns of its own, some of it has moved.
        const walked = game.specificGameState.fighters.filter(fighter => isWarband(fighter.owner))
            .some(fighter => !readyMadePicks(game, 1).some(pick => pick.square === fighter.square));
        expect(walked).toBe(true);
    });

    it("never lets an undo reach back across the warband's turn", async () => {
        const game = await soloBattle();
        const mover = () => game.specificGameState.fighters.find(fighter => fighter.owner === "a" && fighter.ap > 0)!;
        expect((await play(game, actBy("a", oneStep(game, mover())))).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(1);
        await play(game, endTurnBy("a"));
        expect(game.specificGameState.undoStack).toEqual([]);

        expect((await play(game, actBy("a", oneStep(game, mover())))).outcome.validMove).toBe(true);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        // Nothing older to restore: the snapshot from before the End turn went with it.
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
    });
});

describe("a whole solo battle (§30.6)", () => {
    const battles: [string, RealmArenaSettings][] = [["Hold the Centre", SOLO], ["Hold Out", { fog: true, coop: { enemy: "realm", mission: "holdOut" } }]];
    for (const [name, settings] of battles) {
        it(`fights ${name} to the team's ending, and replays it to the same end without asking the planner`, async () => {
            const game = await soloBattle(settings);
            for (let turn = 0; !game.complete; turn++) {
                if (turn > battleRounds(1)) throw new Error("the battle outlasted its turn limit");
                await playScriptedTurn(game);
                if (!game.complete) expect(game.currentTurn).toBe("a");
            }
            expect(["teamwin", "teamloss"]).toContain(game.endReason);

            planner.broken = true;
            const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
            for (const viewer of [null, "a"]) {
                const timeline = await buildTimeline(game, { a: "Alice" }, [], undefined, viewer);
                expect(timeline.snapshots[timeline.currentIndex].specificGameState).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, true));
            }

            // The result reads with one seat.
            const record = await recordBattle(game);
            expect(record).toBeDefined();
            expect(formatRealmArenaResultStats(computeRealmArenaResultStats(game, record), new Map([["a", "Alice"]])).length).toBeGreaterThan(0);
        }, 60_000);
    }
});
