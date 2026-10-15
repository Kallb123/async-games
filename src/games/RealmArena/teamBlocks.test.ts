import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildInitialRealmArenaState, coopInviteOf, gameStateToModel, RealmArenaInvitationModel, settingsOf, type RealmArenaSettings } from "./RealmArenaModels";
import { enemyTurnsOf, type IRealmArenaOutcome } from "./RealmArenaLogic";
import { warbandOwner } from "./rules";
import { battleOf, endTurnBy, makeGame, musterAll, play, playScriptedTurn, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §30.14: the warbands' turns in a block after the
// players', rather than one after each player. Off unless the host chose it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

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
    vi.restoreAllMocks();
});

const HOLD_OUT = { enemy: "realm", mission: "holdOut" } as const;

async function battle(teamBlocks: boolean, players = ["a", "b"]): Promise<RealmArenaTestGame> {
    const game = makeGame(players, {}, { coop: { ...HOLD_OUT, ...(teamBlocks ? { teamBlocks: true as const } : {}) } });
    await musterAll(game);
    return game;
}

/** Ends the current player's turn straight away, and says which warbands took a turn after it. */
async function endTurn(game: RealmArenaTestGame): Promise<string[]> {
    const { outcome } = await play(game, endTurnBy(game.currentTurn));
    expect(outcome.validMove).toBe(true);
    return enemyTurnsOf((outcome as IRealmArenaOutcome).recap).map(turn => turn.owner);
}

/** Takes a squad off the field, as a wipe-out leaves it. */
function wipeOut(game: RealmArenaTestGame, owner: string): void {
    game.specificGameState.fighters = game.specificGameState.fighters.filter(fighter => fighter.owner !== owner);
}

describe("the setting", () => {
    it("is true or false on a co-op invitation, and only false is dropped", () => {
        expect(coopInviteOf({ enemy: "realm", teamBlocks: true })).toEqual({ enemy: "realm", teamBlocks: true });
        expect(coopInviteOf({ enemy: "realm", teamBlocks: false })).toEqual({ enemy: "realm" });
        for (const junk of ["yes", 1, {}, null]) expect(coopInviteOf({ enemy: "realm", teamBlocks: junk }), JSON.stringify(junk)).toBeUndefined();
        expect(new RealmArenaInvitationModel({ coop: { enemy: "realm", teamBlocks: true } }).toObject().coop).toEqual({ enemy: "realm", teamBlocks: true });
    });

    it("is kept on the battle and read back for a replay", () => {
        const game = makeGame(["a", "b"], {}, { coop: { ...HOLD_OUT, teamBlocks: true } });
        expect(game.specificGameState.coop?.teamBlocks).toBe(true);
        expect(settingsOf(game.specificGameState).coop?.teamBlocks).toBe(true);
        expect(gameStateToModel(game.specificGameState, "a", null, false).teamBlocks).toBe(true);
        expect(makeGame(["a", "b"], {}, { coop: HOLD_OUT }).specificGameState.coop).not.toHaveProperty("teamBlocks");
        expect(gameStateToModel(makeGame(["a", "b"], {}, { coop: HOLD_OUT }).specificGameState, "a", null, false)).not.toHaveProperty("teamBlocks");
    });

    it("is stripped where it means nothing: a team of one, and a free-for-all", () => {
        const solo = buildInitialRealmArenaState(["a"], {}, { coop: { enemy: "realm", teamBlocks: true } });
        expect(solo.coop).toBeDefined();
        expect(solo.coop).not.toHaveProperty("teamBlocks");
        // A free-for-all has no co-op for it to ride on, and a stray one is no co-op.
        const ffa = buildInitialRealmArenaState(["a", "b"], {}, {} as RealmArenaSettings);
        expect(ffa.coop).toBeUndefined();
        expect(coopInviteOf({ teamBlocks: true })).toBeUndefined();
    });
});

describe("the rotation", () => {
    it("alternates by default: a warband after each player, and the round turns after the last", async () => {
        const game = await battle(false);
        expect(game.specificGameState.roundsPlayed).toBe(0);
        expect(await endTurn(game)).toEqual([warbandOwner(0)]);
        expect(game.currentTurn).toBe("b");
        expect(await endTurn(game)).toEqual([warbandOwner(1)]);
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
    });

    it("takes the players in turn and then every warband in a block, for two players and two warbands", async () => {
        const game = await battle(true);
        expect(await endTurn(game)).toEqual([]);
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.roundsPlayed).toBe(0);
        expect(await endTurn(game)).toEqual([warbandOwner(0), warbandOwner(1)]);
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
        // And again: the same order every round.
        expect(await endTurn(game)).toEqual([]);
        expect(await endTurn(game)).toEqual([warbandOwner(0), warbandOwner(1)]);
        expect(game.specificGameState.roundsPlayed).toBe(2);
    });

    it("keeps every player's turn their own, and three players go in seat order", async () => {
        const game = await battle(true, ["a", "b", "c"]);
        const seen: string[] = [];
        for (let turn = 0; turn < 3; turn++) {
            seen.push(game.currentTurn);
            await endTurn(game);
        }
        expect(seen).toEqual(["a", "b", "c"]);
        expect(game.currentTurn).toBe("a");
    });

    it("skips a warband that has been wiped out", async () => {
        const game = await battle(true);
        await endTurn(game);
        wipeOut(game, warbandOwner(0));
        expect(await endTurn(game)).toEqual([warbandOwner(1)]);
    });

    it("skips a player whose squad has been wiped out", async () => {
        const game = await battle(true, ["a", "b", "c"]);
        wipeOut(game, "b");
        expect(await endTurn(game)).toEqual([]);
        expect(game.currentTurn).toBe("c");
        expect(await endTurn(game)).toEqual([warbandOwner(0), warbandOwner(1), warbandOwner(2)]);
        expect(game.currentTurn).toBe("a");
    });

    it("does not change a battle's alternating order when the setting is absent from its state", async () => {
        const game = await battle(false);
        expect(battleOf(game).fighters.length).toBeGreaterThan(0);
        expect(game.specificGameState.coop).not.toHaveProperty("teamBlocks");
    });
});

describe("recording and replay", () => {
    it("records every warband's actions in the End turn that played the block, and replays them without the planner", async () => {
        const game = await battle(true);
        for (let turn = 0; turn < 8 && !game.complete; turn++) await playScriptedTurn(game);
        const blocks = game.gameState.commandHistory.filter(command => (command as { recordedMoreEnemyActions?: unknown }).recordedMoreEnemyActions);
        expect(blocks.length).toBeGreaterThan(0);
        planner.broken = true;
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
        expect(timeline.snapshots[timeline.currentIndex].specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", lastId, game.complete));
    }, 60_000);
});
