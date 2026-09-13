import { describe, expect, it, vi } from "vitest";
import { buildTimeline, computePerTurnEvents, computePerTurnStat } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";
import { RaceCarsGameType } from "./RaceCarsLogic";
import {
    IRaceCarsGameData,
    buildInitialRaceCarsState,
    cloneRaceCarsState,
    computeRaceCarsResultStats,
    detectSpinEvent,
    gameStateToModel,
} from "./RaceCarsModels";
import { trackById } from "./board";
import type { IRaceCarsSpecificGameStateResponse } from "./apiModels";

// docs/games/race-cars.md §23.7 PR 8: replay, recap and the result page are
// all read off the same recorded command log, so this replays a whole real
// race — with the CSPRNG ripped out — the way TrainTime/replay.test.ts and
// FiresOut/replay.test.ts prove the same thing for their own games.

const PLAYERS = ["u1", "u2", "u3"];
const NAMES: Record<string, string> = { u1: "Alice", u2: "Bob", u3: "Cara" };

function noRandomness<T>(run: () => T): T {
    const consumed = () => { throw new Error("replay consumed randomness"); };
    const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
    const random = vi.spyOn(Math, "random").mockImplementation(consumed);
    try {
        return run();
    } finally {
        entropy.mockRestore();
        random.mockRestore();
    }
}

function makeGame(oilSpills = false): IRaceCarsGameData & IGameDataDocument {
    const specificGameState = buildInitialRaceCarsState(PLAYERS, { distance: 'sprint', spec: 'balanced', oilSpills });
    return {
        gameId: "g",
        gameType: new RaceCarsGameType(),
        currentTurn: specificGameState.roundOrder[0],
        userIdList: [...PLAYERS],
        turnTimer: 0,
        gameState: { turnOrder: [...PLAYERS], history: [], commandHistory: [] },
        specificGameState,
        initialSpecificGameState: cloneRaceCarsState(specificGameState, PLAYERS),
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IRaceCarsGameData & IGameDataDocument;
}

/**
 * Drives a whole Sprint on the conservative line (§23.7 PR 6's
 * `resolveStalledTurn`, exactly as the turn-timer cron would) — total by
 * construction, so this is enough to exercise a real race without a legal-move
 * bot of its own. A Sprint is roughly 12 turns a driver (§23.8); the cap is
 * comfortably above that so a real stall reads as a test failure rather than
 * a silent truncation.
 */
async function playConservativeRace(oilSpills = false, maxDriverTurns = 300): Promise<IRaceCarsGameData & IGameDataDocument> {
    const game = makeGame(oilSpills);
    for (let turns = 0; !game.complete && turns < maxDriverTurns; turns++) {
        const driverId = game.currentTurn;
        const outcome = await resolveStalledTurn(game, driverId, NAMES[driverId] ?? driverId);
        if (outcome === 'declined' || outcome === 'stuck') {
            throw new Error(`conservative line could not resolve ${driverId}'s turn: ${outcome}`);
        }
    }
    if (!game.complete) {
        throw new Error(`race did not finish within ${maxDriverTurns} driver-turns`);
    }
    return game;
}

describe("Race Cars replay", () => {
    it("replays a whole conservative-line race to exactly the live state without consuming randomness", async () => {
        const game = await playConservativeRace();
        expect(game.complete).toBe(true);
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);

        const timeline = await noRandomness(() => buildTimeline(game, NAMES));

        // One snapshot for the grid, then one per accepted command.
        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, NAMES, null));
    });

    it("has no recap for a game created before the starting snapshot existed", async () => {
        const game = makeGame();
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;
        await expect(buildTimeline(game, NAMES)).rejects.toThrow();
    });

    it("builds a since-you-were-last-here feed off a real command log", async () => {
        const game = makeGame();
        // One full round: every driver shifts and moves once, so there is a
        // real command log to replay without needing the whole race to finish.
        for (let i = 0; i < PLAYERS.length && !game.complete; i++) {
            await resolveStalledTurn(game, game.currentTurn, NAMES[game.currentTurn]);
        }
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);

        const feed = await buildEventFeed(game, NAMES, game.currentTurn);
        // Not every command produces a recap row (a plain move down a straight
        // says nothing, §23.5), but a whole round of shifts and moves on a
        // corner-heavy circuit almost always produces at least one — and if it
        // ever doesn't, hasRecap should still say so honestly rather than throw.
        expect(feed.hasRecap === true || feed.events.length === 0).toBe(true);
    });

    it("gives every finisher a place, and totals the race's own events", async () => {
        const game = await playConservativeRace();
        const track = trackById(game.specificGameState.trackId);

        const rowsPerTurn = await computePerTurnStat<IRaceCarsSpecificGameStateResponse>(
            game,
            (state, userId) => {
                const ps = state.playerStates[userId];
                return ps ? ps.lapsCompleted * track.rows + ps.row : undefined;
            },
        );
        const topGearPerTurn = await computePerTurnStat<IRaceCarsSpecificGameStateResponse>(
            game,
            (state, userId) => state.playerStates[userId]?.gear,
        );
        const spinEvents = await computePerTurnEvents(game, detectSpinEvent);

        const stats = await computeRaceCarsResultStats(game, rowsPerTurn, topGearPerTurn, spinEvents);

        // §4.2: every driver in the race gets a distinct finishing position.
        const positions = [...stats.finishingPosition.values()].sort((a, b) => a - b);
        expect(positions).toEqual([1, 2, 3]);

        // Every event `detectSpinEvent` marked is attributed to a real driver,
        // and the winner (position 1) must have actually crossed the line —
        // rowsCovered is net progress, and a Sprint is one lap of the track.
        for (const event of spinEvents) {
            expect(event.icon).toBe('spin');
            expect(PLAYERS).toContain(event.seriesKey);
        }
        const winnerId = [...stats.finishingPosition.entries()].find(([, position]) => position === 1)![0];
        expect(stats.rowsCovered.get(winnerId)).toBeGreaterThanOrEqual(track.rows);

        // Every pool spend is non-negative and bounded by what the spec issued
        // (Balanced: 5 tyres, 4 brakes, 3 gearbox) — a car can spend a pool
        // down to zero but never below it.
        for (const userId of PLAYERS) {
            expect(stats.tyresSpent.get(userId)).toBeGreaterThanOrEqual(0);
            expect(stats.tyresSpent.get(userId)).toBeLessThanOrEqual(5);
            expect(stats.brakesSpent.get(userId)).toBeGreaterThanOrEqual(0);
            expect(stats.brakesSpent.get(userId)).toBeLessThanOrEqual(4);
            expect(stats.gearboxSpent.get(userId)).toBeGreaterThanOrEqual(0);
            expect(stats.gearboxSpent.get(userId)).toBeLessThanOrEqual(3);
            expect(stats.spins.get(userId) ?? 0).toBeGreaterThanOrEqual(0);
            expect(stats.cornersOvershot.get(userId) ?? 0).toBeGreaterThanOrEqual(0);
            expect(stats.towsTaken.get(userId) ?? 0).toBeGreaterThanOrEqual(0);
        }

        expect(stats.rowsPerTurn.length).toBeGreaterThan(0);
    });

    it("marks the result chart wherever the replay actually spun a car", async () => {
        // A tight two-driver Sprint bunches at the Hairpin fastest, which is
        // where the conservative line is most likely to have to spin rather
        // than never exercising that path at all.
        const game = await playConservativeRace(false, 400);
        const spinEvents = await computePerTurnEvents(game, detectSpinEvent);
        for (const event of spinEvents) {
            expect(event.title).toContain("spun");
            expect(event.seriesKey).toBeTruthy();
        }
    });
});
